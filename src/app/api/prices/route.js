import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/prices   { symbols: string[], assetTypes?: Record<string,string> }
 * 1. For MF instruments: search AMFI NAVAll.txt via schemeCode stored in instrument
 * 2. For STOCK: return latest price stored in instruments.price
 * 3. Fallback: last recorded trade price from DB
 */
export async function POST(request) {
  try {
    const { symbols } = await request.json();
    if (!Array.isArray(symbols) || !symbols.length) return NextResponse.json({ prices: {} });

    const prices = {};

    // Load all instruments for these symbols
    const instruments = await prisma.instrument.findMany({
      where: { symbol: { in: symbols.map(s => s.toUpperCase()) } },
    });

    // Separate MF vs stock
    const mfInstrs = instruments.filter(i => i.assetType === 'MF');
    const stockInstrs = instruments.filter(i => i.assetType === 'STOCK');

    // For stocks/ETFs: use stored price first
    for (const inst of stockInstrs) {
      if (inst.price) prices[inst.symbol] = parseFloat(inst.price);
    }

    // For MFs: fetch live NAV from AMFI
    if (mfInstrs.length > 0) {
      try {
        const res = await fetch('https://portal.amfiindia.com/spages/NAVAll.txt', {
          signal: AbortSignal.timeout(15000),
          cache: 'no-store',
        });
        if (res.ok) {
          const text = await res.text();
          // Build a map of schemeName.lower -> nav
          const navMap = new Map();
          for (const line of text.split('\n')) {
            const p = line.split(';');
            if (p.length < 5) continue;
            const schemeName = p[3].trim().toLowerCase();
            const nav = parseFloat(p[4]);
            if (schemeName && !isNaN(nav) && nav > 0) navMap.set(schemeName, nav);
          }

          for (const inst of mfInstrs) {
            const key = inst.name.toLowerCase();
            let nav = navMap.get(key);
            if (!nav) {
              // Fuzzy: match on most words
              const words = key.split(' ').filter(w => w.length > 3);
              let best = null, bestScore = 0;
              for (const [k, v] of navMap) {
                const score = words.filter(w => k.includes(w)).length;
                if (score > bestScore) { bestScore = score; best = v; }
              }
              if (bestScore >= 3) nav = best;
            }
            if (nav) {
              prices[inst.symbol] = nav;
              // Persist the refreshed price
              await prisma.instrument.update({
                where: { id: inst.id },
                data: { price: nav, priceUpdatedAt: new Date() },
              }).catch(() => { });
            }
          }
        }
      } catch (e) {
        console.warn('AMFI fetch failed:', e.message);
      }
    }

    // Fallback: last trade price for anything still missing
    const missing = symbols.filter(s => !prices[s.toUpperCase()] && !prices[s]);
    for (const sym of missing) {
      const lastTrade = await prisma.trade.findFirst({
        where: { instrument: { symbol: sym.toUpperCase() } },
        orderBy: { tradeDate: 'desc' },
        select: { price: true },
      });
      if (lastTrade) prices[sym] = parseFloat(lastTrade.price);
    }

    return NextResponse.json({ prices });
  } catch (e) {
    console.error('POST /api/prices:', e);
    return NextResponse.json({ prices: {} });
  }
}

/**
 * PATCH /api/prices  { symbol, price }  — manual CMP override
 */
export async function PATCH(request) {
  try {
    const { symbol, price } = await request.json();
    if (!symbol || price == null) return NextResponse.json({ error: 'symbol and price required' }, { status: 400 });

    const updated = await prisma.instrument.updateMany({
      where: { symbol: symbol.toUpperCase() },
      data: { price: parseFloat(price), priceUpdatedAt: new Date() },
    });

    return NextResponse.json({ success: true, updated: updated.count });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
