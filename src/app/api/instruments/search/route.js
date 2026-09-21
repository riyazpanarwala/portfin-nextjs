import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withErrorHandler } from '@/lib/apiHelpers';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { getInstrumentCatalogue } from '@/lib/instrumentCatalogue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let _amfiCache = null;
const AMFI_PATH = join(process.cwd(), 'public', 'amfi_data.json');

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
 * 2. Merges with the daily Upstox catalogue (for stocks) or AMFI static data (for mutual funds)
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
  let catalogueStatus;

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
    // 2b. Automatically refreshed Upstox catalogue (stocks & ETFs) ──────────────────────────────────
    let staticData = [];
    try {
      const catalogue = await getInstrumentCatalogue();
      staticData = catalogue.data;
      catalogueStatus = { source: 'upstox', updatedAt: new Date(catalogue.updatedAt).toISOString(), stale: catalogue.stale };
    } catch {
      catalogueStatus = { source: 'upstox', unavailable: true };
      if (!dbResults.length) {
        return NextResponse.json(
          { instruments: [], error: 'Instrument search is temporarily unavailable. Please retry shortly.', catalogue: catalogueStatus },
          { status: 503 },
        );
      }
    }
    staticMatches = staticData
      .filter(item => {
        if (exchange && item.e !== exchange) return false;
        if (dbKeys.has(`${item.s}:${item.e}`)) return false;
        return item.s.includes(qUp) || item.n.toUpperCase().includes(qUp) || item.i.includes(qUp);
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

  return NextResponse.json({ instruments: combined, ...(catalogueStatus && { catalogue: catalogueStatus }) });
});
