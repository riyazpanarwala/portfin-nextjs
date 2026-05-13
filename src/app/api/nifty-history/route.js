import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { withErrorHandler, badRequest } from '@/lib/apiHelpers';

export const dynamic = 'force-dynamic';

const yahooFinance = new YahooFinance();

/**
 * GET /api/nifty-history?from=YYYY-MM-DD
 *
 * Returns monthly end-of-month Nifty 50 closes from `from` to today.
 * Uses yahoo-finance2 historical() with interval '1mo'.
 *
 * Response: { history: { [month: 'YYYY-MM']: number }, lastUpdated: ISO string }
 */
export const GET = withErrorHandler('GET /api/nifty-history', async (request) => {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');

  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    return badRequest('from parameter required in YYYY-MM-DD format');
  }

  const fromDate = new Date(from);
  // Add one extra month of buffer so we get full coverage
  fromDate.setMonth(fromDate.getMonth() - 1);

  const result = await yahooFinance.historical('^NSEI', {
    period1: fromDate.toISOString().slice(0, 10),
    period2: new Date().toISOString().slice(0, 10),
    interval: '1mo',
  });

  if (!result || !result.length) {
    return NextResponse.json(
      { error: 'No data returned from Yahoo Finance for ^NSEI' },
      { status: 502 }
    );
  }

  // Convert to { 'YYYY-MM': closePrice } map
  // Yahoo returns one row per month; use the `close` (adjusted) price.
  const history = {};
  for (const row of result) {
    if (!row.date || row.close == null) continue;
    const month = new Date(row.date).toISOString().slice(0, 7);
    history[month] = Math.round(row.close);
  }

  return NextResponse.json({
    history,
    lastUpdated: new Date().toISOString(),
    source: '^NSEI via yahoo-finance2',
  });
});
