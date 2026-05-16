import { NextResponse } from 'next/server';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';
import { BENCHMARKS } from '@/lib/niftyData';

export const dynamic = 'force-dynamic';

// ─── Upstox instrument keys ───────────────────────────────────────────────────
// These are the URL-encoded instrument keys for the Upstox V3 candle API.
// Format: https://api.upstox.com/v3/historical-candle/{key}/{interval}/{to}/{from}
const UPSTOX_KEYS = {
  nifty50:       'NSE_INDEX%7CNifty%2050',
  sensex:        'BSE_INDEX%7CSENSEX',
  niftymidcap:   'NSE_INDEX%7CNIFTY%20MIDCAP%20100',
  niftysmallcap: 'NSE_INDEX%7CNIFTY%20SMLCAP%20100',
};

/**
 * fetchFromUpstox
 * Fetches monthly OHLCV candles from the Upstox V3 historical candle API.
 * Uses daily candles aggregated to monthly close points to avoid separate
 * monthly endpoint quirks.
 *
 * @param {string} instrumentKey  URL-encoded Upstox instrument key
 * @param {string} fromStr        'YYYY-MM-DD' start date
 * @param {string} toStr          'YYYY-MM-DD' end date
 * @returns {Promise<Record<string, number>>}  { 'YYYY-MM': closePrice }
 */
async function fetchFromUpstox(instrumentKey, fromStr, toStr) {
  // Use monthly interval endpoint for cleaner data
  const url =
    `https://api.upstox.com/v3/historical-candle/` +
    `${instrumentKey}/months/1/${toStr}/${fromStr}`;

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (process.env.UPSTOX_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`;
  }

  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15000),
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
    // Candle format: [timestamp, open, high, low, close, volume, oi]
    if (!candle[0] || candle[4] == null) continue;
    const month = candle[0].slice(0, 7); // 'YYYY-MM'
    history[month] = Math.round(candle[4]);
  }

  if (Object.keys(history).length === 0) {
    throw new Error('Upstox returned empty candles array');
  }

  return history;
}

/**
 * GET /api/nifty-history?from=YYYY-MM-DD&benchmark=nifty50
 *
 * `benchmark` must be one of the keys in BENCHMARKS (lib/niftyData.js).
 * Defaults to 'nifty50' for backward compatibility.
 *
 * All benchmarks use Upstox V3 API:
 *   nifty50       → NSE_INDEX|Nifty 50
 *   sensex        → BSE_INDEX|SENSEX
 *   niftymidcap   → NSE_INDEX|NIFTY MIDCAP 100
 *   niftysmallcap → NSE_INDEX|NIFTY SMLCAP 100
 *
 * Response:
 * {
 *   history:     { [month: 'YYYY-MM']: number },
 *   source:      'upstox',
 *   benchmark:   string,
 *   lastUpdated: ISO string,
 *   warning?:    string
 * }
 */
export const GET = withErrorHandler('GET /api/nifty-history', async (request) => {
  const { searchParams } = new URL(request.url);
  const from     = searchParams.get('from');
  const benchKey = searchParams.get('benchmark') || 'nifty50';

  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return badRequest('from parameter required in YYYY-MM-DD format');
  }

  const bench = BENCHMARKS[benchKey];
  if (!bench) {
    return badRequest(
      `Unknown benchmark "${benchKey}". Valid: ${Object.keys(BENCHMARKS).join(', ')}`
    );
  }

  // FD is synthetic — no live fetch needed
  if (benchKey === 'fd') {
    return NextResponse.json({
      history:     {},
      source:      'synthetic',
      benchmark:   benchKey,
      lastUpdated: new Date().toISOString(),
    });
  }

  const upstoxKey = UPSTOX_KEYS[benchKey];
  if (!upstoxKey) {
    return NextResponse.json(
      { error: `No Upstox instrument key configured for benchmark "${benchKey}"` },
      { status: 502 }
    );
  }

  // Pull one extra month before `from` so the chart baseline is always present
  const bufferDate = new Date(from);
  bufferDate.setMonth(bufferDate.getMonth() - 1);
  const fromStr = bufferDate.toISOString().slice(0, 10);
  const toStr   = new Date().toISOString().slice(0, 10);

  try {
    const history = await fetchFromUpstox(upstoxKey, fromStr, toStr);

    return NextResponse.json({
      history,
      source:      'upstox',
      benchmark:   benchKey,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[nifty-history] Upstox fetch failed for ${benchKey}:`, err.message);

    return NextResponse.json(
      {
        error:        `Failed to fetch ${bench.label} data from Upstox.`,
        upstoxError:  err.message,
        benchmark:    benchKey,
      },
      { status: 502 }
    );
  }
});
