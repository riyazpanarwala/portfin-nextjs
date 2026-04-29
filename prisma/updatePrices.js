/**
 * PortFin — Price Updater
 * ─────────────────────────────────────────────────────────────────────────────
 * Updates `price` and `priceUpdatedAt` on all Instrument rows.
 *
 *  • STOCK / ETF  (exchange = NSE)  → Yahoo Finance  symbol.NS
 *  • STOCK / ETF  (exchange = BSE)  → Yahoo Finance  symbol.BO
 *  • MF           (exchange = AMFI) → AMFI NAVAll.txt (free, official)
 *
 * Usage:
 *   node prisma/updatePrices.js            # update all
 *   node prisma/updatePrices.js --stocks   # only stocks/ETFs
 *   node prisma/updatePrices.js --mf       # only mutual funds
 *
 * Dependencies (add if not already present):
 *   npm install yahoo-finance2
 */

import { PrismaClient } from "@prisma/client";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const prisma = new PrismaClient();

// ─── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ONLY_STOCK = args.includes("--stocks");
const ONLY_MF = args.includes("--mf");
const DO_STOCKS = !ONLY_MF;
const DO_MF = !ONLY_STOCK;

// ─── Config ───────────────────────────────────────────────────────────────────
const BATCH_SIZE = 20; // Yahoo requests per batch
const BATCH_DELAY_MS = 1200; // delay between batches (be polite)
const YAHOO_TIMEOUT_MS = 15000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function yahooSymbol(symbol, exchange) {
  // NSE → .NS  |  BSE → .BO
  return exchange === "BSE" ? `${symbol}.BO` : `${symbol}.NS`;
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return res;
    } catch (e) {
      if (i < retries - 1) await sleep(2000 * (i + 1));
    }
  }
  return null;
}

// ─── 1. Update Stock / ETF prices via Yahoo Finance ──────────────────────────
async function updateStockPrices() {
  console.log("\n📈 Fetching stock & ETF prices from Yahoo Finance...");

  const instruments = await prisma.instrument.findMany({
    where: { assetType: "STOCK" },
    select: { id: true, symbol: true, exchange: true, name: true },
  });

  if (instruments.length === 0) {
    console.log("  ℹ No STOCK instruments found.");
    return { ok: 0, fail: 0, skip: 0 };
  }

  console.log(`  Found ${instruments.length} stock/ETF instruments`);

  let ok = 0,
    fail = 0,
    skip = 0;
  const batches = chunk(instruments, BATCH_SIZE);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    process.stdout.write(`  Batch ${bi + 1}/${batches.length} `);

    // Build Yahoo symbol list
    const symbolMap = new Map(); // yahooSym → instrument
    for (const instr of batch) {
      symbolMap.set(yahooSymbol(instr.symbol, instr.exchange), instr);
    }

    const yahoSymbols = [...symbolMap.keys()];

    let quotes = {};
    try {
      // quoteSummary works for single; for bulk use quote()
      const results = await Promise.allSettled(
        yahoSymbols.map((ys) =>
          yahooFinance.quote(ys, {}, { timeout: YAHOO_TIMEOUT_MS }),
        ),
      );

      results.forEach((res, idx) => {
        if (res.status === "fulfilled" && res.value) {
          quotes[yahoSymbols[idx]] = res.value;
        }
      });
    } catch (e) {
      console.warn(`\n  ⚠ Yahoo batch error: ${e.message}`);
    }

    // Apply prices
    for (const [ys, instr] of symbolMap) {
      const q = quotes[ys];
      const price = q?.regularMarketPrice ?? q?.postMarketPrice ?? null;

      if (!price || price <= 0) {
        process.stdout.write("✗");
        fail++;
        continue;
      }

      try {
        await prisma.instrument.update({
          where: { id: instr.id },
          data: { price, priceUpdatedAt: new Date() },
        });
        process.stdout.write("·");
        ok++;
      } catch (e) {
        process.stdout.write("✗");
        fail++;
      }
    }

    console.log(` (${ok} ok, ${fail} failed so far)`);
    if (bi < batches.length - 1) await sleep(BATCH_DELAY_MS);
  }

  return { ok, fail, skip };
}

// ─── 2. Update MF prices via AMFI NAVAll.txt ─────────────────────────────────
async function updateMFPrices() {
  console.log("\n📊 Fetching MF NAVs from AMFI...");

  const instruments = await prisma.instrument.findMany({
    where: { assetType: "MF" },
    select: { id: true, symbol: true, name: true, isin: true },
  });

  if (instruments.length === 0) {
    console.log("  ℹ No MF instruments found.");
    return { ok: 0, fail: 0 };
  }

  console.log(`  Found ${instruments.length} MF instruments`);

  // Fetch AMFI NAV file
  const res = await fetchWithRetry(
    "https://portal.amfiindia.com/spages/NAVAll.txt",
  );
  if (!res) {
    console.warn("  ⚠ AMFI NAV file unavailable — skipping MF price update");
    return { ok: 0, fail: instruments.length };
  }

  const text = await res.text();
  const lines = text.trim().split("\n");

  // Build lookup maps: isin → nav  AND  lowercased name → nav
  const isinNavMap = new Map();
  const nameNavMap = new Map();

  for (const line of lines) {
    const parts = line.split(";");
    if (parts.length < 5) continue;
    const isinGrowth = parts[1].trim();
    const isinDiv = parts[2].trim();
    const name = parts[3].trim();
    const nav = parseFloat(parts[4]);
    if (isNaN(nav) || nav <= 0) continue;
    if (isinGrowth) isinNavMap.set(isinGrowth, nav);
    if (isinDiv) isinNavMap.set(isinDiv, nav);
    if (name) nameNavMap.set(name.toLowerCase(), nav);
  }

  console.log(
    `  ✅ AMFI: ${isinNavMap.size} ISINs, ${nameNavMap.size} fund names loaded`,
  );

  let ok = 0,
    fail = 0;

  for (const instr of instruments) {
    // Match priority: ISIN → name
    let nav = null;
    if (instr.isin) nav = isinNavMap.get(instr.isin) ?? null;
    if (!nav) nav = nameNavMap.get(instr.name.toLowerCase()) ?? null;

    // Fuzzy fallback: word overlap
    if (!nav) {
      const words = instr.name
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      let best = null,
        bestScore = 0;
      for (const [k, v] of nameNavMap) {
        const score = words.filter((w) => k.includes(w)).length;
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      }
      if (bestScore >= 3) nav = best;
    }

    if (!nav) {
      process.stdout.write("✗");
      fail++;
      continue;
    }

    try {
      await prisma.instrument.update({
        where: { id: instr.id },
        data: { price: nav, priceUpdatedAt: new Date() },
      });
      process.stdout.write("·");
      ok++;
    } catch (e) {
      process.stdout.write("✗");
      fail++;
    }
  }

  console.log(`\n  ✅ ${ok} MF prices updated, ${fail} not matched`);
  return { ok, fail };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const start = Date.now();
  console.log("🔄 PortFin Price Updater\n");

  let stockResult = { ok: 0, fail: 0 };
  let mfResult = { ok: 0, fail: 0 };

  if (DO_STOCKS) stockResult = await updateStockPrices();
  if (DO_MF) mfResult = await updateMFPrices();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Price update complete!");
  if (DO_STOCKS)
    console.log(
      `   Stocks/ETFs : ${stockResult.ok} updated, ${stockResult.fail} failed`,
    );
  if (DO_MF)
    console.log(
      `   Mutual Funds: ${mfResult.ok} updated, ${mfResult.fail} not matched`,
    );
  console.log(`   Time elapsed: ${elapsed}s`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error("\n❌ Price update failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
