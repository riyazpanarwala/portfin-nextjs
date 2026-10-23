import { computeHoldings } from './store.js';
import { decimal, decimalField, sumDecimal } from './financialDecimal.js';
import { isDelistedStock } from './marketDataPolicy.js';

export const CHANGE_PERIODS = ['1D', '1W', '1M', '3M', '1Y'];
const DAY = 86400000;
const shiftDays = (date, days) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);

export function periodStart(asOf, period) {
  if (period === '1D' || period === '1W') return shiftDays(asOf, period === '1D' ? -1 : -7);
  const date = new Date(asOf);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - ({ '1M': 1, '3M': 3, '1Y': 12 }[period]));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString().slice(0, 10);
}

function priceAt(history, date) {
  return Object.values(history || {}).filter(p => p.asOf <= date && p.price > 0 && Number.isFinite(Number(p.price)))
    .sort((a, b) => b.asOf.localeCompare(a.asOf))[0];
}

function fresh(record, date) {
  return record && record.asOf <= date && Date.parse(date) - Date.parse(record.asOf) <= 7 * DAY;
}

function aggregate(rows) {
  const excluded = rows.filter(row => row.excluded).length;
  rows = rows.filter(row => !row.excluded);
  const available = rows.filter(row => row.gain != null);
  // Never present partial coverage as a complete portfolio gain.
  if (available.length !== rows.length || !rows.length) return { gain: null, percent: null, covered: available.length, count: rows.length, excluded };
  const gain = sumDecimal(rows, row => row.exactGain);
  const capital = sumDecimal(rows, row => row.exactCapital);
  return { gain: gain.toNumber(), percent: capital.gt(0) ? gain.div(capital).times(100).toNumber() : null, covered: rows.length, count: rows.length, excluded };
}

/** Read-only, cash-flow-adjusted period performance, including positions sold in the period. */
export function buildPortfolioChanges({ trades, corporateActions = [], histories, prices, meta, asOf }) {
  const groups = Object.groupBy(trades.filter(t => t.tradeDate <= asOf), t => t.instrumentId);
  const periods = {};
  for (const period of CHANGE_PERIODS) {
    const rows = [];
    for (const [id, ledger] of Object.entries(groups)) {
      const instrument = ledger[0];
      const current = { price: prices[id], asOf: meta[id]?.asOf };
      const previous = priceAt(histories[id], shiftDays(current.asOf || asOf, -1));
      const start = period === '1D' ? previous?.asOf || periodStart(asOf, period) : periodStart(asOf, period);
      const baseline = period === '1D' ? previous : priceAt(histories[id], start);
      const options = { corporateActions };
      const before = computeHoldings(ledger, baseline ? { [id]: baseline.price } : {}, { ...options, asOf: start })[0];
      const after = computeHoldings(ledger, prices, { ...options, asOf })[0];
      const flows = ledger.filter(t => t.tradeDate > start);
      if (!(before?.qty > 0) && !(after?.qty > 0) && !flows.length) continue;
      const row = { instrumentId: id, symbol: instrument.symbol, name: instrument.name || instrument.symbol, assetType: instrument.assetType,
        start, baselinePriceDate: baseline?.asOf || null, priceDate: current.asOf || null, gain: null, percent: null };
      if (isDelistedStock(instrument)) {
        rows.push({ ...row, excluded: true, reason: 'Delisted stock — excluded from portfolio changes' });
        continue;
      }
      let reason;
      if (before?.hasDataError || after?.hasDataError) reason = 'Trade history needs reconciliation';
      else if (before?.qty > 0 && (!fresh(baseline, start) || (period === '1D' && !fresh(baseline, current.asOf || asOf)))) reason = 'Historical price unavailable or stale';
      else if (before?.qty > 0 && corporateActions.some(a => a.instrumentId === id && new Date(a.exDate).toISOString().slice(0, 10) > baseline.asOf && new Date(a.exDate).toISOString().slice(0, 10) <= start)) reason = 'Historical price predates a corporate action';
      else if (after?.qty > 0 && (!(current.price > 0) || !fresh(current, asOf))) reason = 'Current price unavailable or stale';
      else if (period === '1D' && !previous && before?.qty > 0) reason = 'Previous trading price unavailable';
      else if (after?.qty > 0 && (flows.some(t => t.tradeDate > current.asOf) || corporateActions.some(a => a.instrumentId === id && new Date(a.exDate).toISOString().slice(0, 10) > current.asOf && new Date(a.exDate).toISOString().slice(0, 10) <= asOf))) reason = 'Awaiting a price after the latest trade or corporate action';
      if (reason) { rows.push({ ...row, reason }); continue; }
      const gain = decimalField(after || {}, 'totalGain').minus(decimalField(before || {}, 'totalGain'));
      let capital = decimalField(before || {}, 'marketValue');
      const duration = Math.max(1, (Date.parse(asOf) - Date.parse(start)) / DAY);
      for (const trade of flows) {
        const gross = decimal(trade.quantity).times(trade.price);
        const flow = trade.tradeType === 'BUY' ? gross.plus(trade.brokerage || 0) : gross.minus(trade.brokerage || 0).negated();
        // Date-only ledger: use the midpoint of the trade day (Modified Dietz).
        const weight = Math.max(0, Math.min(1, ((Date.parse(asOf) - Date.parse(trade.tradeDate)) / DAY + 0.5) / duration));
        capital = capital.plus(flow.times(weight));
      }
      rows.push({ ...row, gain: gain.toNumber(), percent: capital.gt(0) ? gain.div(capital).times(100).toNumber() : null,
        exactGain: gain.toFixed(), exactCapital: capital.toFixed() });
    }
    periods[period] = { rows, overall: aggregate(rows), mf: aggregate(rows.filter(r => r.assetType === 'MF')), stocks: aggregate(rows.filter(r => r.assetType === 'STOCK')) };
  }
  return { asOf, periods };
}
