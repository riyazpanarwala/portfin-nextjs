import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHelpers';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

// ── XLSX-based static instrument loader ────────────────────────────────────
// Reads public/instruments_data.xlsx (NSE_Equity, BSE_Equity, NSE_ETF sheets)
// Falls back to legacy instruments_data.json if xlsx not found.
// Cache is invalidated when the file's mtime changes so a hot-swap takes effect
// on the next search without restarting the server.

let _cache = null;           // { data: Array, mtime: number }
let _amfiCache = null;       // { data: Array, mtime: number }
const XLSX_PATH = join(process.cwd(), 'public', 'instruments_data.xlsx');
const JSON_PATH = join(process.cwd(), 'public', 'instruments_data.json');
const AMFI_PATH = join(process.cwd(), 'public', 'amfi_data.json');

// FIX (medium): replaced require('xlsx') — a CommonJS call inside an ES module
// — with a proper dynamic import().  The old approach worked via Webpack shim
// but was fragile and would break in edge runtime or stricter bundler configs.
async function loadXlsx() {
  // dynamic import returns the ES module namespace; xlsx exports default
  const mod = await import('xlsx');
  return mod.default ?? mod;
}

async function getStaticData() {
  // ── Try XLSX first ──────────────────────────────────────────────────────
  if (existsSync(XLSX_PATH)) {
    const mtime = statSync(XLSX_PATH).mtimeMs;
    if (_cache && _cache.mtime === mtime) return _cache.data;

    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.readFile(XLSX_PATH, { cellDates: false, sheetRows: 0 });

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
          const symbol    = String(row['Symbol']       || '').trim().toUpperCase();
          const name      = String(row['Company Name'] || '').trim();
          const isin      = String(row['ISIN']         || '').trim() || null;
          const exchange  = String(row['Exchange']     || defaultExchange).trim() || defaultExchange;
          const assetType = String(row['AssetType']    || 'STOCK').trim();
          const sector    = defaultSector
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

async function getAmfiData() {
  if (existsSync(AMFI_PATH)) {
    const mtime = statSync(AMFI_PATH).mtimeMs;
    if (_amfiCache && _amfiCache.mtime === mtime) return _amfiCache.data;

    try {
      const raw = JSON.parse(readFileSync(AMFI_PATH, 'utf-8'));
      _amfiCache = { data: raw, mtime };
      return raw;
    } catch (err) {
      console.error('[instruments/search] Failed to read AMFI JSON:', err.message);
    }
  }

  if (_amfiCache) return _amfiCache.data;
  return [];
}

function mfSymbol(name) {
  return name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w[0].toUpperCase())
    .join('')
    .slice(0, 20);
}

// ── Sector lookup from Yahoo Finance (best-effort, 8s timeout) ─────────────
async function fetchYahooSector(symbol, exchange) {
  try {
    const yahooSym = exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooSym}?modules=summaryProfile,quoteType`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const profile  = json?.quoteSummary?.result?.[0];
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
 * 2. Merges with XLSX static data (for stocks) or AMFI static data (for mutual funds)
 * 3. If enrich=true and a single exact symbol match: hits Yahoo Finance for sector/industry
 *
 * Returns: { instruments: [...] }
 */
export const GET = withErrorHandler('GET /api/instruments/search', async (request) => {
  const { searchParams } = new URL(request.url);
  const q         = searchParams.get('q')?.trim() || '';
  const exchange  = searchParams.get('exchange')  || '';
  const assetType = searchParams.get('assetType') || '';
  const enrich    = searchParams.get('enrich') === 'true';
  const limit     = Math.min(15, parseInt(searchParams.get('limit') || '10'));

  if (q.length < 1) return NextResponse.json({ instruments: [] });

  const qUp = q.toUpperCase();
  const isMF = assetType === 'MF' || exchange === 'AMFI';

  // 1. DB results ──────────────────────────────────────────────────────────
  const dbResults = await prisma.instrument.findMany({
    where: {
      ...(isMF
        ? { assetType: 'MF' }
        : {
            ...(exchange && { exchange }),
            ...(assetType && { assetType }),
          }),
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
  const dbIsins = new Set(dbResults.map(r => r.isin).filter(Boolean));

  let staticMatches = [];

  if (isMF) {
    // 2a. AMFI mutual funds static data ────────────────────────────────────
    const amfiData = await getAmfiData();
    staticMatches = amfiData
      .filter(item => {
        if (dbKeys.has(`${item.s}:${item.e || 'AMFI'}`)) return false;
        if (item.i && dbIsins.has(item.i)) return false;
        return (
          item.s.includes(qUp) ||
          item.n.toUpperCase().includes(qUp) ||
          (item.i && item.i.toUpperCase().includes(qUp)) ||
          (item.code && String(item.code) === q)
        );
      })
      .slice(0, Math.max(0, limit - dbResults.length))
      .map(item => ({
        symbol:    item.s,
        name:      item.n,
        isin:      item.i || null,
        exchange:  item.e || 'AMFI',
        assetType: item.t || 'MF',
        sector:    item.c || 'Mutual Fund',
        price:     item.p || null,
        inDb:      false,
      }));

    // Fallback to mfapi.in if no local matches found and query is sufficiently specific
    if (dbResults.length === 0 && staticMatches.length === 0 && q.length >= 3) {
      try {
        const mfRes = await fetch(
          `https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (mfRes.ok) {
          const list = await mfRes.json();
          if (Array.isArray(list)) {
            staticMatches = list.slice(0, limit).map(item => ({
              symbol:    mfSymbol(item.schemeName) || `MF${item.schemeCode}`,
              name:      item.schemeName,
              isin:      null,
              exchange:  'AMFI',
              assetType: 'MF',
              sector:    'Mutual Fund',
              price:     null,
              inDb:      false,
            }));
          }
        }
      } catch {
        /* ignore network fallback errors */
      }
    }
  } else {
    // 2b. XLSX static data (stocks & ETFs) ──────────────────────────────────
    const staticData = await getStaticData();
    staticMatches = staticData
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
  }

  // 3. Combine ──────────────────────────────────────────────────────────────
  const combined = [
    ...dbResults.map(r => ({
      id:           r.id,
      symbol:       r.symbol,
      name:         r.name,
      isin:         r.isin,
      exchange:     r.exchange,
      assetType:    r.assetType,
      sector:       r.sector,
      price:        r.price ? parseFloat(r.price) : null,
      priceUpdatedAt: r.priceUpdatedAt,
      inDb:         true,
    })),
    ...staticMatches,
  ].slice(0, limit);

  // 4. Yahoo enrichment on exact single-symbol match (stocks only) ─────────
  if (!isMF && enrich && combined.length > 0) {
    const exact = combined.find(r =>
      r.symbol.toUpperCase() === qUp &&
      (r.exchange === 'NSE' || r.exchange === 'BSE')
    );
    if (exact && !exact.sector && exact.inDb && exact.isin) {
      const yInfo = await fetchYahooSector(exact.symbol, exact.exchange);
      if (yInfo) {
        exact.sector = yInfo.sector || exact.sector;
        exact.industry = yInfo.industry || null;
        if (yInfo.longName && (!exact.name || exact.name === exact.symbol)) {
          exact.name = yInfo.longName;
        }
        exact._enriched = true;
      }
    }
  }

  return NextResponse.json({ instruments: combined });
});
