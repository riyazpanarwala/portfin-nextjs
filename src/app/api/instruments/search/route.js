import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

// ── XLSX-based static instrument loader ────────────────────────────────────
// Reads public/instruments_data.xlsx (NSE_Equity, BSE_Equity, NSE_ETF sheets)
// Falls back to legacy instruments_data.json if xlsx not found.
// Cache is invalidated when the file's mtime changes so a hot-swap takes effect
// on the next search without restarting the server.

let _cache = null;           // { data: Array, mtime: number }
const XLSX_PATH = join(process.cwd(), 'public', 'instruments_data.xlsx');
const JSON_PATH = join(process.cwd(), 'public', 'instruments_data.json');

function getStaticData() {
  // ── Try XLSX first ──────────────────────────────────────────────────────
  if (existsSync(XLSX_PATH)) {
    const mtime = statSync(XLSX_PATH).mtimeMs;
    if (_cache && _cache.mtime === mtime) return _cache.data;

    try {
      // Dynamic require so Next.js build doesn't choke on the xlsx package
      // when the file isn't present.  xlsx is already in package.json.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const XLSX = require('xlsx');
      const wb   = XLSX.readFile(XLSX_PATH, { cellDates: false, sheetRows: 0 });

      const SHEET_CFG = [
        // [sheetName, exchangeOverride, sectorOverride]
        ['NSE_Equity', 'NSE', null],
        ['BSE_Equity', 'BSE', null],
        ['NSE_ETF',    'NSE', 'Index ETF'],
      ];

      const instruments = [];
      const seen = new Set();

      for (const [sheetName, defaultExchange, defaultSector] of SHEET_CFG) {
        if (!wb.SheetNames.includes(sheetName)) continue;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

        for (const row of rows) {
          const symbol   = String(row['Symbol']       || '').trim().toUpperCase();
          const name     = String(row['Company Name'] || '').trim();
          const isin     = String(row['ISIN']         || '').trim() || null;
          const exchange = String(row['Exchange']     || defaultExchange).trim() || defaultExchange;
          const assetType= String(row['AssetType']    || 'STOCK').trim();
          const sector   = defaultSector
            || String(row['Sector'] || '').trim()
            || null;

          if (!symbol) continue;
          const key = `${symbol}:${exchange}`;
          if (seen.has(key)) continue;
          seen.add(key);

          instruments.push({ s: symbol, n: name || symbol, i: isin, e: exchange, t: assetType, c: sector || '' });
        }
      }

      _cache = { data: instruments, mtime };
      console.log(`[instruments/search] Loaded ${instruments.length} instruments from XLSX (mtime ${mtime})`);
      return instruments;
    } catch (err) {
      console.error('[instruments/search] Failed to read XLSX:', err.message);
      // fall through to JSON fallback
    }
  }

  // ── JSON fallback (legacy) ──────────────────────────────────────────────
  if (_cache) return _cache.data;
  try {
    const raw = JSON.parse(readFileSync(JSON_PATH, 'utf-8'));
    _cache = { data: raw, mtime: 0 };
    return raw;
  } catch {
    _cache = { data: [], mtime: 0 };
    return [];
  }
}

// ── Sector lookup from Yahoo Finance (best-effort, 8s timeout) ─────────────
async function fetchYahooSector(symbol, exchange) {
  try {
    const yahooSym = exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooSym}?modules=summaryProfile,quoteType`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const profile = json?.quoteSummary?.result?.[0];
    const sector   = profile?.summaryProfile?.sector   || null;
    const industry = profile?.summaryProfile?.industry || null;
    const longName = profile?.quoteType?.longName      || null;
    return { sector, industry, longName };
  } catch {
    return null;
  }
}

/**
 * GET /api/instruments/search?q=INFY&exchange=NSE&enrich=true
 *
 * 1. Searches DB instruments (symbol + name prefix/contains)
 * 2. Merges with XLSX static data for any symbols not yet in DB
 * 3. If enrich=true and a single exact symbol match: hits Yahoo Finance for sector/industry
 *
 * Returns: { instruments: [...] }
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const q        = searchParams.get('q')?.trim() || '';
    const exchange = searchParams.get('exchange') || '';
    const enrich   = searchParams.get('enrich') === 'true';
    const limit    = Math.min(15, parseInt(searchParams.get('limit') || '10'));

    if (q.length < 1) return NextResponse.json({ instruments: [] });

    const qUp = q.toUpperCase();

    // 1. DB results ──────────────────────────────────────────────────────────
    const dbResults = await prisma.instrument.findMany({
      where: {
        ...(exchange && { exchange }),
        OR: [
          { symbol: { contains: qUp } },
          { name: { contains: q, mode: 'insensitive' } },
          ...(q.length >= 8 ? [{ isin: { contains: qUp } }] : []),
        ],
      },
      orderBy: [{ symbol: 'asc' }],
      take: limit,
      select: {
        id: true, symbol: true, name: true, isin: true,
        exchange: true, assetType: true, sector: true,
        price: true, priceUpdatedAt: true,
      },
    });

    const dbKeys = new Set(dbResults.map(r => `${r.symbol}:${r.exchange}`));

    // 2. XLSX static data — fill remaining slots ─────────────────────────────
    const staticData = getStaticData();
    const staticMatches = staticData
      .filter(item => {
        if (exchange && item.e !== exchange) return false;
        if (dbKeys.has(`${item.s}:${item.e}`)) return false;
        return item.s.includes(qUp) || item.n.toUpperCase().includes(qUp);
      })
      .slice(0, Math.max(0, limit - dbResults.length))
      .map(item => ({
        symbol:    item.s,
        name:      item.n,
        isin:      item.i || null,
        exchange:  item.e,
        assetType: item.t,
        sector:    item.c || null,
        price:     null,
        inDb:      false,
      }));

    // 3. Combine ──────────────────────────────────────────────────────────────
    const combined = [
      ...dbResults.map(r => ({
        id:             r.id,
        symbol:         r.symbol,
        name:           r.name,
        isin:           r.isin,
        exchange:       r.exchange,
        assetType:      r.assetType,
        sector:         r.sector,
        price:          r.price ? parseFloat(r.price) : null,
        priceUpdatedAt: r.priceUpdatedAt,
        inDb:           true,
      })),
      ...staticMatches,
    ].slice(0, limit);

    // 4. Yahoo enrichment on exact single-symbol match ───────────────────────
    if (enrich && combined.length > 0) {
      const exact = combined.find(r =>
        r.symbol.toUpperCase() === qUp &&
        (r.exchange === 'NSE' || r.exchange === 'BSE')
      );
      if (exact && !exact.sector) {
        const yInfo = await fetchYahooSector(exact.symbol, exact.exchange);
        if (yInfo) {
          exact.sector   = yInfo.sector   || exact.sector;
          exact.industry = yInfo.industry || null;
          if (yInfo.longName && (!exact.name || exact.name === exact.symbol)) {
            exact.name = yInfo.longName;
          }
          exact._enriched = true;
        }
      }
    }

    return NextResponse.json({ instruments: combined });
  } catch (e) {
    console.error('GET /api/instruments/search:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
