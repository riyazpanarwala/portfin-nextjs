import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { readFileSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

// ── Load static CSV-derived lookup (built from bse_equity, nse_equity, ETF_list CSVs)
// Falls back to empty array if file doesn't exist yet
let STATIC_DATA = null;
function getStaticData() {
  if (STATIC_DATA !== null) return STATIC_DATA;
  try {
    const filePath = join(process.cwd(), 'public', 'instruments_data.json');
    STATIC_DATA = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    STATIC_DATA = [];
  }
  return STATIC_DATA;
}

// ── Sector lookup from Yahoo Finance (with 8s timeout, best-effort)
async function fetchYahooSector(symbol, exchange) {
  try {
    const yahooSym = exchange === 'BSE' ? `${symbol}.BO` : `${symbol}.NS`;
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${yahooSym}?modules=summaryProfile,quoteType`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const profile = json?.quoteSummary?.result?.[0];
    const sector   = profile?.summaryProfile?.sector || null;
    const industry = profile?.summaryProfile?.industry || null;
    const longName = profile?.quoteType?.longName || null;
    return { sector, industry, longName };
  } catch {
    return null;
  }
}

/**
 * GET /api/instruments/search?q=INFY&exchange=NSE&enrich=true
 *
 * 1. Searches DB instruments (symbol + name prefix/contains)
 * 2. Merges with CSV static data for any symbols not yet in DB
 * 3. If enrich=true and a single exact symbol match: hits Yahoo Finance for sector/industry
 *
 * Returns: { instruments: [{ symbol, name, isin, exchange, assetType, sector, industry, price, inDb }] }
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

    // 1. DB results
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
      select: { id: true, symbol: true, name: true, isin: true, exchange: true, assetType: true, sector: true, price: true, priceUpdatedAt: true },
    });

    const dbSymbolExchangeKeys = new Set(dbResults.map(r => `${r.symbol}:${r.exchange}`));

    // 2. Static CSV data — merge missing ones
    const staticData = getStaticData();
    const staticMatches = staticData
      .filter(item => {
        if (exchange && item.e !== exchange) return false;
        const key = `${item.s}:${item.e}`;
        if (dbSymbolExchangeKeys.has(key)) return false; // already in DB
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

    // 3. Combine DB + static
    const combined = [
      ...dbResults.map(r => ({
        id:        r.id,
        symbol:    r.symbol,
        name:      r.name,
        isin:      r.isin,
        exchange:  r.exchange,
        assetType: r.assetType,
        sector:    r.sector,
        price:     r.price ? parseFloat(r.price) : null,
        priceUpdatedAt: r.priceUpdatedAt,
        inDb:      true,
      })),
      ...staticMatches,
    ].slice(0, limit);

    // 4. Enrich: exact match + enrich=true → hit Yahoo for sector/industry
    if (enrich && combined.length > 0) {
      const exact = combined.find(r =>
        r.symbol.toUpperCase() === qUp && (r.exchange === 'NSE' || r.exchange === 'BSE')
      );
      if (exact && !exact.sector) {
        const yInfo = await fetchYahooSector(exact.symbol, exact.exchange);
        if (yInfo) {
          exact.sector   = yInfo.sector || exact.sector;
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
