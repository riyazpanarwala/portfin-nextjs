import { Decimal as PrismaDecimal } from '@prisma/client/runtime/index-browser';

// Reuse Prisma's browser-safe decimal implementation without changing its global config.
// 40 significant digits exceed the precision of ledger and snapshot columns, even after
// multiplication. Round half up only at explicit display/storage boundaries.
export const FinancialDecimal = PrismaDecimal.clone({ precision: 40, rounding: PrismaDecimal.ROUND_HALF_UP });
export const decimal = value => new FinancialDecimal(value == null ? 0 : String(value));
export const decimalField = (record, key) => decimal(record.exact?.[key] ?? record[key]);
export const sumDecimal = (rows, value) => rows.reduce((sum, row) => sum.plus(value(row)), decimal(0));

export function lotCost(lot, { tax = false } = {}) {
  const key = tax ? 'taxCostBasis' : 'costBasis';
  return lot[key] == null ? decimalField(lot, 'qty').times(decimalField(lot, tax && lot.taxPrice != null ? 'taxPrice' : 'price')) : decimalField(lot, key);
}

export function lotGain(lot, price) {
  return decimalField(lot, 'qty').times(price).minus(lotCost(lot));
}

/** Keep numeric UI contracts while retaining exact strings for downstream calculations. */
export function financialResult(value) {
  if (Array.isArray(value)) return value.map(financialResult);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  const result = {}, exact = { ...value.exact };
  for (const [key, item] of Object.entries(value)) {
    if (key === 'exact') continue;
    if (FinancialDecimal.isDecimal(item)) {
      if (!item.isFinite()) throw new Error(`Non-finite financial value: ${key}`);
      result[key] = item.toNumber();
      if (!Number.isFinite(result[key])) throw new Error(`Financial value exceeds the numeric UI range: ${key}`);
      exact[key] = item.toFixed();
    } else result[key] = financialResult(item);
  }
  if (Object.keys(exact).length) result.exact = exact;
  return result;
}
