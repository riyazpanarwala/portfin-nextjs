import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance();

// Upstox instrument key for Nifty 50 index
// NSE_INDEX|Nifty 50  →  URL-encoded:  NSE_INDEX%7CNifty%2050
const NIFTY_INSTRUMENT_KEY = 'NSE_INDEX%7CNifty%2050';

/**
 * Fetch monthly Nifty 50 closes from Upstox V3 historical candle API.
 * Returns { 'YYYY-MM': closePrice } or throws on failure.
 *
 * UPSTOX_ACCESS_TOKEN in .env is optional — include it for better rate limits,
 * but the index historical endpoint works without auth too.
 *
 * Docs: https://upstox.com/developer/api-documentation/v3/get-historical-candle-data
 */
async function fetchFromUpstox(fromStr, toStr) {
  const url =
    `https://api.upstox.com/v3/historical-candle/` +
    `${NIFTY_INSTRUMENT_KEY}/months/1/${toStr}/${fromStr}`;

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

  // Each candle: [timestamp, open, high, low, close, volume, oi]
  const history = {};
  for (const candle of data.data.candles) {
    if (!candle[0] || candle[4] == null) continue;
    // Timestamp is IST ISO string: "2025-01-01T00:00:00+05:30"
    const month = candle[0].slice(0, 7); // 'YYYY-MM'
    history[month] = Math.round(candle[4]);
  }

  if (Object.keys(history).length === 0) {
    throw new Error('Upstox returned empty candles array');
  }

  return history;
}

/**
 * Fetch monthly Nifty 50 closes from Yahoo Finance (^NSEI).
 * Returns { 'YYYY-MM': closePrice } or throws on failure.
 */
async function fetchFromYahoo(fromStr) {
  const result = await yahooFinance.historical('^NSEI', {
    period1: fromStr,
    period2: new Date().toISOString().slice(0, 10),
    interval: '1mo',
  });

  if (!result?.length) throw new Error('Yahoo returned no data');

  const history = {};
  for (const row of result) {
    if (!row.date || row.close == null) continue;
    const month = new Date(row.date).toISOString().slice(0, 7);
    history[month] = Math.round(row.close);
  }

  if (Object.keys(history).length === 0) throw new Error('Yahoo: no valid rows');
  return history;
}

/**
 * GET /api/nifty-history?from=YYYY-MM-DD
 *
 * Returns monthly end-of-month Nifty 50 closes from `from` to today.
 * Primary: Upstox V3 (better Indian market data, back to 2000, no limit)
 * Fallback: Yahoo Finance (^NSEI)
 *
 * Response shape:
 * {
 *   history:     { [month: 'YYYY-MM']: number },
 *   source:      'upstox' | 'yahoo',
 *   lastUpdated: ISO string,
 *   warning?:    string   // present only when fallback was used
 * }
 */
export const GET = withErrorHandler('GET /api/nifty-history', async (request) => {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');

  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return badRequest('from parameter required in YYYY-MM-DD format');
  }

  // Pull one extra month before `from` so the chart baseline is always present
  const bufferDate = new Date(from);
  bufferDate.setMonth(bufferDate.getMonth() - 1);
  const fromStr = bufferDate.toISOString().slice(0, 10);
  const toStr   = new Date().toISOString().slice(0, 10);

  let history = null;
  let source  = null;
  let warning = null;

  // 1. Try Upstox first
  try {
    history = await fetchFromUpstox(fromStr, toStr);
    source  = 'upstox';
  } catch (upstoxErr) {
    console.warn('[nifty-history] Upstox failed:', upstoxErr.message);
    warning = `Upstox unavailable (${upstoxErr.message}), fell back to Yahoo Finance`;

    // 2. Fall back to Yahoo Finance
    try {
      history = await fetchFromYahoo(fromStr);
      source  = 'yahoo';
    } catch (yahooErr) {
      console.error('[nifty-history] Yahoo also failed:', yahooErr.message);
      return NextResponse.json(
        {
          error: 'Both Upstox and Yahoo Finance failed to return Nifty 50 data.',
          upstoxError: upstoxErr.message,
          yahooError:  yahooErr.message,
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    history,
    source,
    lastUpdated: new Date().toISOString(),
    ...(warning && { warning }),
  });
});
