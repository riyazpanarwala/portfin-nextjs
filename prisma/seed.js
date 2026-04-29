/**
 * PortFin Seed Script
 * --------------------
 * 1. Loads BSE equity list from local bse_equity.csv
 * 2. Loads NSE equity list from local nse_equity.csv
 * 3. Loads ETF list from local ETF_list.csv
 * 4. Loads MF NAV list from portal.amfiindia.com/spages/NAVAll.txt
 * 5. Upserts instruments into DB
 * 6. Creates default user + portfolio
 * 7. Seeds all trades from portfolio.xlsx data
 */

import { PrismaClient } from "@prisma/client";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse } from "csv-parse/sync";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// ─── Symbol normalization map (portfolio display name → canonical symbol) ─────
// Keys are exactly as they appear in portfolio.xlsx stocks sheet
const SYMBOL_MAP = {
  "Coal India": "COALINDIA",
  "Enbee Trade": "ENBEETRADE",
  "MO Defence": "MODEFENCE",
  "Tata SilverETF": "TATSILV",
  "Nipp Nifty 50": "NIFTYBEES",
  "UTI Nifty Next 50 ETF": "NEXT50BETA",
  "Uttam Value": "UTTAMVALUE",
  Vedanta: "VEDL",
  Suzlon: "SUZLON",
  YESBANK: "YESBANK",
};

// ─── Stocks that live on BSE (not NSE) ───────────────────────────────────────
// These will be created with exchange = 'BSE'
const BSE_ONLY_SYMBOLS = new Set(["ENBEETRADE", "UTTAMVALUE"]);

// ─── Manual fallback metadata for instruments not found in any CSV ────────────
// Used when a symbol is missing from both NSE and BSE CSVs (e.g. delisted / OTC)
const MANUAL_INSTRUMENT_META = {
  ENBEETRADE: {
    name: "Enbee Trade & Finance Ltd",
    isin: "INE993I01029",
    sector: "Finance",
    exchange: "BSE",
  },
  UTTAMVALUE: {
    name: "Uttam Value Steels Ltd",
    isin: null,
    sector: "Metals & Mining",
    exchange: "BSE",
  },
};

// ─── Sector map (symbol → sector) ─────────────────────────────────────────────
const SECTOR_MAP = {
  BPCL: "Energy",
  BEL: "Defence",
  COALINDIA: "Mining",
  IRFC: "Finance",
  ITC: "FMCG",
  JPPOWER: "Power",
  MAZDOCK: "Defence",
  NBCC: "Construction",
  NHPC: "Power",
  ONGC: "Energy",
  RPOWER: "Power",
  SUZLON: "Renewable Energy",
  VEDL: "Metals & Mining",
  ENBEETRADE: "Finance",
  YESBANK: "Banking",
  UTTAMVALUE: "Metals & Mining",
  // ETFs
  MODEFENCE: "Defence ETF",
  TATSILV: "Commodities ETF",
  NIFTYBEES: "Index ETF",
  NEXT50BETA: "Index ETF",
};

const MF_CATEGORY_MAP = {
  "Aditya Birla Sun Life Value Fund Direct Plan Growth": "INF209K01WQ7",
  "Axis Large Cap Fund Direct Plan Growth": "INF846K01DP8",
  "Axis Small Cap Fund Direct Growth": "INF846K01K35",
  "DSP ELSS Tax Saver Fund Regular Plan Growth": "INF740K01185",
  "HSBC Small Cap Fund Fund Direct Growth": "INF917K01QA1",
  "Kotak Flexicap Fund Direct Growth": "INF174K01LS2",
  "Kotak Midcap Fund Direct Growth": "INF174K01LT0",
  "Nippon India Small Cap Fund - Growth": "INF204K01HY3",
  "Parag Parikh Flexi Cap Direct Growth": "INF879O01027",
  "SBI Flexicap Fund Direct Growth": "INF200K01UG1",
  "SBI Large Cap Fund Direct Growth": "INF200K01QX4",
  "SBI Large Cap Fund Regular Growth": "INF200K01180",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeSymbol(raw) {
  const trimmed = String(raw || "").trim();
  return SYMBOL_MAP[trimmed] ?? trimmed.toUpperCase().replace(/\s+/g, "");
}

function parseDateStr(v) {
  if (!v) return null;
  if (typeof v === "number") {
    // Excel serial date
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + v * 86400000);
    return d.toISOString().split("T")[0];
  }
  if (v instanceof Date) return v.toISOString().split("T")[0];
  if (typeof v === "string") {
    // DD-MM-YYYY
    const m1 = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  }
  return null;
}

function toTradeDate(dateStr) {
  return new Date(dateStr + "T12:00:00.000Z");
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return res;
      console.warn(`  ⚠ HTTP ${res.status} for ${url}`);
    } catch (e) {
      console.warn(`  ⚠ Attempt ${i + 1} failed: ${e.message}`);
      if (i < retries - 1)
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  return null;
}

// ─── Load CSV helper (latin1 safe) ────────────────────────────────────────────
function loadCsv(filePath) {
  const raw = fs.readFileSync(filePath);
  // Try UTF-8 first, fall back to latin1
  let text;
  try {
    text = raw.toString("utf8");
    // If replacement chars appear, use latin1
    if (text.includes("\uFFFD")) throw new Error("latin1");
  } catch {
    text = raw.toString("latin1");
  }
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true, // BSE CSV has 5 trailing empty commas per data row
  });
}

// ─── Step 1: Load BSE equity list ────────────────────────────────────────────
function loadBSEEquities() {
  console.log("\n📂 Loading BSE equity list from bse_equity.csv...");
  const filePath = path.join(__dirname, "bse_equity.csv");
  if (!fs.existsSync(filePath)) {
    console.warn("  ⚠ bse_equity.csv not found — skipping BSE load");
    return new Map();
  }
  const rows = loadCsv(filePath);
  const map = new Map();
  for (const row of rows) {
    const secId = (row["Security Id"] || "").trim().toUpperCase();
    const name = (row["Security Name"] || row["Issuer Name"] || secId).trim();
    const isin = (row["ISIN No"] || "").trim() || null;
    if (secId) map.set(secId, { symbol: secId, name, isin, exchange: "BSE" });
  }
  console.log(`  ✅ Loaded ${map.size} BSE symbols`);
  return map;
}

// ─── Step 2: Load NSE equity list ────────────────────────────────────────────
function loadNSEEquities() {
  console.log("\n📂 Loading NSE equity list from nse_equity.csv...");
  const filePath = path.join(__dirname, "nse_equity.csv");
  if (!fs.existsSync(filePath)) {
    console.warn("  ⚠ nse_equity.csv not found — skipping NSE load");
    return new Map();
  }
  const rows = loadCsv(filePath);
  const map = new Map();
  for (const row of rows) {
    // Column names may have leading/trailing spaces
    const symbol = Object.entries(row)
      .find(([k]) => k.trim() === "SYMBOL")?.[1]
      ?.trim()
      ?.toUpperCase();
    const name = Object.entries(row)
      .find(([k]) => k.trim() === "NAME OF COMPANY")?.[1]
      ?.trim();
    const isin =
      Object.entries(row)
        .find(([k]) => k.trim() === "ISIN NUMBER")?.[1]
        ?.trim() || null;
    if (symbol)
      map.set(symbol, { symbol, name: name || symbol, isin, exchange: "NSE" });
  }
  console.log(`  ✅ Loaded ${map.size} NSE symbols`);
  return map;
}

// ─── Step 3: Load ETF list ────────────────────────────────────────────────────
function loadETFList() {
  console.log("\n📂 Loading ETF list from ETF_list.csv...");
  const filePath = path.join(__dirname, "ETF_list.csv");
  if (!fs.existsSync(filePath)) {
    console.warn("  ⚠ ETF_list.csv not found — skipping ETF load");
    return new Map();
  }
  const rows = loadCsv(filePath);
  const map = new Map();
  for (const row of rows) {
    const symbol = (row["Symbol"] || "").trim().toUpperCase();
    const name = (row["SecurityName"] || symbol).trim();
    const isin = (row["ISINNumber"] || "").trim() || null;
    if (symbol)
      map.set(symbol, {
        symbol,
        name,
        isin,
        exchange: "NSE",
        assetType: "STOCK",
      });
  }
  console.log(`  ✅ Loaded ${map.size} ETF symbols`);
  return map;
}

// ─── Step 4: Load AMFI MF list ───────────────────────────────────────────────
async function loadAMFIFunds() {
  console.log("\n🌐 Fetching AMFI NAV list from portal.amfiindia.com...");
  const res = await fetchWithRetry(
    "https://portal.amfiindia.com/spages/NAVAll.txt",
  );
  if (!res) {
    console.warn(
      "  ⚠ AMFI NAV file unavailable — MF instruments will be created without live NAV",
    );
    return new Map();
  }
  const text = await res.text();
  const lines = text.trim().split("\n");
  const nameMap = new Map(); // lowercased name → { schemeCode, name, isin, nav }
  const isinMap = new Map(); // ISIN          → { schemeCode, name, isin, nav }
  for (const line of lines) {
    const parts = line.split(";");
    if (parts.length < 5) continue;
    const schemeCode = parts[0].trim();
    // NAVAll.txt format: SchemeCode;ISINGrowth;ISINDiv;SchemeName;NAV;Date
    const isinGrowth = parts[1].trim() || null;
    const isinDiv    = parts[2].trim() || null;
    const name       = parts[3].trim();
    const nav        = parseFloat(parts[4]);
    if (!name || !schemeCode || isNaN(nav)) continue;
    const isin = isinGrowth || isinDiv || null;
    const entry = { schemeCode, name, isin, nav };
    nameMap.set(name.toLowerCase(), entry);
    if (isinGrowth) isinMap.set(isinGrowth, entry);
    if (isinDiv)    isinMap.set(isinDiv,    entry);
  }
  console.log(`  ✅ Loaded ${nameMap.size} AMFI fund schemes (${isinMap.size} ISINs indexed)`);
  return { nameMap, isinMap };
}

// ─── MF match: ISIN-first via MF_CATEGORY_MAP, then name, then fuzzy ─────────
// MF_CATEGORY_MAP values are ISINs — use them to hit amfiIsinMap directly,
// which is unambiguous even when fund names differ slightly from AMFI's version.
function findMFMatch(searchName, nameMap, isinMap) {
  // 1. ISIN lookup via MF_CATEGORY_MAP — most accurate, zero ambiguity
  const knownIsin = MF_CATEGORY_MAP[searchName];
  if (knownIsin) {
    const hit = isinMap.get(knownIsin);
    if (hit) return { ...hit, matchedBy: 'ISIN' };
  }

  // 2. Exact lowercased name match against AMFI
  const key = searchName.toLowerCase().trim();
  if (nameMap.has(key)) return { ...nameMap.get(key), matchedBy: 'exact-name' };

  // 3. Word-overlap fuzzy fallback (words > 3 chars, score threshold >= 3)
  const words = key.split(/\s+/).filter((w) => w.length > 3);
  let best = null, bestScore = 0;
  for (const [k, v] of nameMap) {
    const score = words.filter((w) => k.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return bestScore >= 3 ? { ...best, matchedBy: 'fuzzy' } : null;
}

// ─── Derive MF category from name ────────────────────────────────────────────
// For funds in MF_CATEGORY_MAP we derive sector from the AMFI-resolved name
// (passed as resolvedName). Falls back to keyword scan on the raw name.
function mfCategory(rawName, resolvedName) {
  const n = (resolvedName || rawName).toLowerCase();
  if (n.includes("elss") || n.includes("tax saver")) return "ELSS";
  if (n.includes("small cap"))                        return "Small Cap";
  if (n.includes("mid cap") || n.includes("midcap")) return "Mid Cap";
  if (n.includes("large cap") || n.includes("largecap")) return "Large Cap";
  if (n.includes("flexi") || n.includes("flexicap")) return "Flexi Cap";
  if (n.includes("value"))                            return "Value";
  if (n.includes("index") || n.includes("nifty"))    return "Index";
  return "Diversified";
}

// ─── Derive MF symbol from name (deterministic, max 20 chars) ────────────────
function mfSymbol(name) {
  // Take initials of each meaningful word, upper-cased
  return name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 20);
}

// ─── Load portfolio.xlsx ─────────────────────────────────────────────────────
function loadPortfolioXlsx() {
  const xlsxPath = path.join(__dirname, "portfolio.xlsx");
  if (!fs.existsSync(xlsxPath))
    throw new Error("portfolio.xlsx not found in project root");
  const workbook = xlsx.readFile(xlsxPath);

  function parseSheet(sheetName, isStock) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.warn(`  ⚠ Sheet "${sheetName}" not found in portfolio.xlsx`);
      return [];
    }
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
    return rows
      .slice(1)
      .map((row) => ({
        key: String(row[0] || "").trim(),
        qty: parseFloat(row[1]),
        price: parseFloat(row[2]),
        date: parseDateStr(row[3]),
      }))
      .filter((t) => t.key && !isNaN(t.qty) && !isNaN(t.price) && t.date);
  }

  const stockTrades = parseSheet("stocks", true);
  const mfTrades = parseSheet("mf", false);
  return { stockTrades, mfTrades };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 PortFin Seed Starting...\n");

  // ── Load portfolio Excel ────────────────────────────────────────────────────
  console.log("📖 Reading portfolio.xlsx...");
  const { stockTrades, mfTrades } = loadPortfolioXlsx();
  console.log(
    `  ✅ ${stockTrades.length} stock trades, ${mfTrades.length} MF trades`,
  );

  // ── Load instrument reference data ──────────────────────────────────────────
  const bseMap = loadBSEEquities();
  const nseMap = loadNSEEquities();
  const etfMap = loadETFList();
  const { nameMap: amfiMap, isinMap: amfiIsinMap } = await loadAMFIFunds();

  // ── Upsert stock/ETF instruments ────────────────────────────────────────────
  console.log("\n📦 Upserting stock & ETF instruments...");
  const allSymbols = [
    ...new Set(stockTrades.map((t) => normalizeSymbol(t.key))),
  ];
  const stockInstrumentMap = new Map(); // canonicalSymbol → instrumentId

  for (const symbol of allSymbols) {
    // Resolution priority: NSE → BSE → ETF list → manual fallback
    const etfData = etfMap.get(symbol);
    const nseData = nseMap.get(symbol);
    const bseData = bseMap.get(symbol);
    const manualData = MANUAL_INSTRUMENT_META[symbol];

    const isEtf = !!etfData;
    const isBseOnly = BSE_ONLY_SYMBOLS.has(symbol);

    const exchange = isBseOnly
      ? "BSE"
      : (nseData?.exchange ?? (isEtf ? "NSE" : (bseData?.exchange ?? "NSE")));

    const name =
      nseData?.name ??
      etfData?.name ??
      bseData?.name ??
      manualData?.name ??
      symbol;

    const isin =
      nseData?.isin ??
      etfData?.isin ??
      bseData?.isin ??
      manualData?.isin ??
      null;

    const sector = SECTOR_MAP[symbol] ?? null;

    try {
      const instr = await prisma.instrument.upsert({
        where: { symbol_exchange: { symbol, exchange } },
        update: { name, sector, ...(isin ? { isin } : {}) },
        create: { symbol, name, isin, sector, exchange, assetType: "STOCK" },
      });
      stockInstrumentMap.set(symbol, instr.id);
      process.stdout.write(".");
    } catch (e) {
      console.warn(
        `\n  ⚠ Failed to upsert ${symbol} (${exchange}): ${e.message}`,
      );
    }
  }
  console.log(
    `\n  ✅ ${stockInstrumentMap.size}/${allSymbols.length} stock instruments upserted`,
  );

  // ── Upsert MF instruments ───────────────────────────────────────────────────
  console.log("\n📦 Upserting MF instruments...");
  const uniqueMFNames = [...new Set(mfTrades.map((t) => t.key))];
  const mfInstrumentMap = new Map(); // mfName → instrumentId

  for (const mfName of uniqueMFNames) {
    const match = findMFMatch(mfName, amfiMap, amfiIsinMap);
    const isin = match?.isin ?? null;
    const nav = match?.nav ?? null;
    const resolvedName = match?.name ?? mfName;
    const symbol = mfSymbol(mfName); // short deterministic key
    const sector = mfCategory(mfName, resolvedName);

    const baseData = {
      symbol,
      name: resolvedName,
      isin,
      sector,
      exchange: "AMFI",
      assetType: "MF",
      ...(nav ? { price: nav, priceUpdatedAt: new Date() } : {}),
    };

    try {
      const instr = await prisma.instrument.upsert({
        where: { symbol_exchange: { symbol, exchange: "AMFI" } },
        update: {
          name: resolvedName,
          sector,
          ...(nav ? { price: nav, priceUpdatedAt: new Date() } : {}),
          ...(isin ? { isin } : {}),
        },
        create: baseData,
      });
      mfInstrumentMap.set(mfName, instr.id);
      const tag = match?.matchedBy ?? 'none';
      process.stdout.write(tag === 'ISIN' ? '✓' : tag === 'exact-name' ? '·' : '~');
    } catch (e) {
      // Symbol collision (two fund names produce same initials): append index
      try {
        const altSymbol =
          symbol + String(uniqueMFNames.indexOf(mfName) + 1).padStart(2, "0");
        const instr = await prisma.instrument.upsert({
          where: { symbol_exchange: { symbol: altSymbol, exchange: "AMFI" } },
          update: { name: resolvedName, sector },
          create: { ...baseData, symbol: altSymbol },
        });
        mfInstrumentMap.set(mfName, instr.id);
        process.stdout.write(".");
      } catch (e2) {
        console.warn(`\n  ⚠ MF upsert failed for "${mfName}": ${e2.message}`);
      }
    }
  }
  console.log(
    `\n  ✅ ${mfInstrumentMap.size}/${uniqueMFNames.length} MF instruments upserted`,
  );

  // ── Create default user + portfolio ─────────────────────────────────────────
  console.log("\n👤 Creating user and portfolio...");
  const USER_ID = "user-default-001";
  const USER_EMAIL = "riyaz@portfin.app";

  await prisma.user.upsert({
    where: { id: USER_ID },
    update: {},
    create: { id: USER_ID, email: USER_EMAIL, displayName: "Riyaz" },
  });

  let portfolio = await prisma.portfolio.findFirst({
    where: { userId: USER_ID },
  });
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: { userId: USER_ID, name: "My Portfolio" },
    });
  }
  const portfolioId = portfolio.id;
  console.log(`  ✅ Portfolio ready: ${portfolioId}`);

  // ── Clear existing trades (idempotent re-seed) ───────────────────────────────
  const existing = await prisma.trade.count({ where: { portfolioId } });
  if (existing > 0) {
    console.log(`\n🗑  Clearing ${existing} existing trades for re-seed...`);
    await prisma.trade.deleteMany({ where: { portfolioId } });
  }

  // ── Seed stock trades ────────────────────────────────────────────────────────
  console.log("\n📝 Seeding stock trades...");
  let stockOk = 0,
    stockFail = 0;
  for (const t of stockTrades) {
    const symbol = normalizeSymbol(t.key);
    const instrId = stockInstrumentMap.get(symbol);
    if (!instrId) {
      console.warn(
        `  ⚠ No instrument found for symbol "${symbol}" (raw: "${t.key}") — skipping`,
      );
      stockFail++;
      continue;
    }
    try {
      await prisma.trade.create({
        data: {
          portfolioId,
          instrumentId: instrId,
          tradeType: "BUY",
          quantity: t.qty,
          price: t.price,
          tradeDate: toTradeDate(t.date),
        },
      });
      stockOk++;
    } catch (e) {
      stockFail++;
      console.warn(
        `  ⚠ Trade insert failed [${symbol} ${t.date}]: ${e.message}`,
      );
    }
  }
  console.log(`  ✅ ${stockOk} stock trades seeded, ${stockFail} failed`);

  // ── Seed MF trades ───────────────────────────────────────────────────────────
  console.log("\n📝 Seeding MF trades...");
  let mfOk = 0,
    mfFail = 0;
  for (const t of mfTrades) {
    const instrId = mfInstrumentMap.get(t.key);
    if (!instrId) {
      console.warn(`  ⚠ No instrument found for MF "${t.key}" — skipping`);
      mfFail++;
      continue;
    }
    try {
      await prisma.trade.create({
        data: {
          portfolioId,
          instrumentId: instrId,
          tradeType: "BUY",
          quantity: t.qty,
          price: t.price,
          tradeDate: toTradeDate(t.date),
        },
      });
      mfOk++;
    } catch (e) {
      mfFail++;
      console.warn(`  ⚠ Trade insert failed [${t.key}]: ${e.message}`);
    }
  }
  console.log(`  ✅ ${mfOk} MF trades seeded, ${mfFail} failed`);

  // ── Summary ──────────────────────────────────────────────────────────────────
  const totalTrades = await prisma.trade.count({ where: { portfolioId } });
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Seed complete!");
  console.log(`   Stock instruments : ${stockInstrumentMap.size}`);
  console.log(`   MF instruments    : ${mfInstrumentMap.size}`);
  console.log(`   Total trades in DB: ${totalTrades}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
