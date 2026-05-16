import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';
import { BENCHMARKS } from '@/lib/niftyData';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance();

// ─── Upstox instrument keys for Indian indices ────────────────────────────────
// Only Nifty 50 works on the no-auth endpoint; others need a Bearer token.
// We attempt Upstox first for Nifty 50 only and fall through to Yahoo for all.
const UPSTOX_NIFTY50_KEY = 'NSE_INDEX%7CNifty%2050';

/**
 * Fetch monthly closes from Upstox V3 — only valid for Nifty 50 index.
 * Returns { 'YYYY-MM': number } or throws.
 */
async function fetchFromUpstox(fromStr, toStr) {
  const url =
    `https://api.upstox.com/v3/historical-candle/` +
    `${UPSTOX_NIFTY50_KEY}/months/1/${toStr}/${fromStr}`;

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (process.env.UPSTOX_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`;
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`Upstox ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (data.status !== 'success' || !Array.isArray(data.data?.candles)) {
    throw new Error('Unexpected Upstox response shape');
  }

  const history = {};
  for (const candle of data.data.candles) {
    if (!candle[0] || candle[4] == null) continue;
    const month = candle[0].slice(0, 7);
    history[month] = Math.round(candle[4]);
  }

  if (Object.keys(history).length === 0) {
    throw new Error('Upstox returned empty candles array');
  }

  return history;
}

/**
 * Fetch monthly closes from Yahoo Finance for any supported ticker.
 * Returns { 'YYYY-MM': number } or throws.
 */
async function fetchFromYahoo(yahooTicker, fromStr) {
  const result = await yahooFinance.historical(yahooTicker, {
    period1: fromStr,
    period2: new Date().toISOString().slice(0, 10),
    interval: '1mo',
  });

  if (!result?.length) throw new Error(`Yahoo returned no data for ${yahooTicker}`);

  const history = {};
  for (const row of result) {
    if (!row.date || row.close == null) continue;
    const month = new Date(row.date).toISOString().slice(0, 7);
    history[month] = Math.round(row.close);
  }

  if (Object.keys(history).length === 0) {
    throw new Error(`Yahoo: no valid rows for ${yahooTicker}`);
  }

  return history;
}

/**
 * GET /api/nifty-history?from=YYYY-MM-DD&benchmark=nifty50
 *
 * `benchmark` must be one of the keys in BENCHMARKS (lib/niftyData.js).
 * Defaults to 'nifty50' for backward compatibility.
 *
 * Strategy:
 *   - nifty50  → try Upstox first, fall back to Yahoo ^NSEI
 *   - all others → Yahoo directly (Upstox no-auth only covers Nifty 50)
 *
 * Response:
 * {
 *   history:     { [month: 'YYYY-MM']: number },
 *   source:      'upstox' | 'yahoo',
 *   benchmark:   string,
 *   lastUpdated: ISO string,
 *   warning?:    string
 * }
 */
export const GET = withErrorHandler('GET /api/nifty-history', async (request) => {
  const { searchParams } = new URL(request.url);
  const from      = searchParams.get('from');
  const benchKey  = searchParams.get('benchmark') || 'nifty50';

  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return badRequest('from parameter required in YYYY-MM-DD format');
  }

  const bench = BENCHMARKS[benchKey];
  if (!bench) {
    return badRequest(
      `Unknown benchmark "${benchKey}". Valid: ${Object.keys(BENCHMARKS).join(', ')}`
    );
  }

  // Pull one extra month before `from` so the chart baseline is always present
  const bufferDate = new Date(from);
  bufferDate.setMonth(bufferDate.getMonth() - 1);
  const fromStr = bufferDate.toISOString().slice(0, 10);
  const toStr   = new Date().toISOString().slice(0, 10);

  let history = null;
  let source  = null;
  let warning = null;

  // For Nifty 50: try Upstox first (better Indian market data)
  if (benchKey === 'nifty50') {
    try {
      history = await fetchFromUpstox(fromStr, toStr);
      source  = 'upstox';
    } catch (upstoxErr) {
      console.warn('[nifty-history] Upstox failed:', upstoxErr.message);
      warning = `Upstox unavailable (${upstoxErr.message}), fell back to Yahoo Finance`;
    }
  }

  // Yahoo — try primary ticker, then optional alt ticker.
  // Midcap 100 uses ^CRSMID as primary and NIFTY_MIDCAP_100.NS as alt
  // because the caret symbol sometimes has shorter history on Yahoo.
  if (!history) {
    const tickersToTry = [
      bench.yahooTicker,
      bench.yahooTickerAlt ?? null,
    ].filter(Boolean);

    let lastYahooErr = null;

    for (const ticker of tickersToTry) {
      try {
        history = await fetchFromYahoo(ticker, fromStr);
        source  = 'yahoo';
        if (ticker !== bench.yahooTicker) {
          const altWarning = `Primary ticker ${bench.yahooTicker} returned no data; used ${ticker} instead`;
          warning = warning ? `${warning}; ${altWarning}` : altWarning;
        }
        break;
      } catch (err) {
        console.warn(`[nifty-history] Yahoo ticker ${ticker} failed:`, err.message);
        lastYahooErr = err;
      }
    }

    if (!history) {
      console.error('[nifty-history] All Yahoo tickers failed for', benchKey);
      return NextResponse.json(
        {
          error: `Failed to fetch ${bench.label} data. Tried: ${tickersToTry.join(', ')}.`,
          yahooError: lastYahooErr?.message,
          ...(warning && { upstoxWarning: warning }),
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    history,
    source,
    benchmark: benchKey,
    lastUpdated: new Date().toISOString(),
    ...(warning && { warning }),
  });
});
