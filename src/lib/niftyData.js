/**
 * lib/niftyData.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Nifty 50 approximate end-of-month close prices (Jan 2020 – Apr 2026).
 * Extracted from PortfolioVsNiftyView so the view stays lean and the data
 * is reusable by other analysis modules.
 *
 * Keys: 'YYYY-MM'  Values: index level (number)
 */

export const NIFTY_HISTORY = {
  '2020-01': 12282, '2020-02': 11633, '2020-03': 8598,  '2020-04': 9860,
  '2020-05': 9580,  '2020-06': 10302, '2020-07': 11073, '2020-08': 11388,
  '2020-09': 11248, '2020-10': 11642, '2020-11': 12968, '2020-12': 13982,
  '2021-01': 13635, '2021-02': 14529, '2021-03': 14691, '2021-04': 14631,
  '2021-05': 15582, '2021-06': 15722, '2021-07': 15763, '2021-08': 16706,
  '2021-09': 17618, '2021-10': 17671, '2021-11': 16983, '2021-12': 17354,
  '2022-01': 17340, '2022-02': 16658, '2022-03': 17465, '2022-04': 17103,
  '2022-05': 16584, '2022-06': 15780, '2022-07': 17158, '2022-08': 17759,
  '2022-09': 17094, '2022-10': 18012, '2022-11': 18758, '2022-12': 18105,
  '2023-01': 17616, '2023-02': 17554, '2023-03': 17360, '2023-04': 18065,
  '2023-05': 18534, '2023-06': 18935, '2023-07': 19754, '2023-08': 19265,
  '2023-09': 19638, '2023-10': 19047, '2023-11': 19795, '2023-12': 21731,
  '2024-01': 21725, '2024-02': 22040, '2024-03': 22326, '2024-04': 22147,
  '2024-05': 22531, '2024-06': 23440, '2024-07': 24951, '2024-08': 25235,
  '2024-09': 25811, '2024-10': 24205, '2024-11': 23911, '2024-12': 23645,
  '2025-01': 23163, '2025-02': 22125, '2025-03': 23519, '2025-04': 24039,
  '2025-05': 24857, '2025-06': 24502, '2025-07': 25412, '2025-08': 24987,
  '2025-09': 26103, '2025-10': 25678, '2025-11': 26845, '2025-12': 27210,
  '2026-01': 27502, '2026-02': 26843, '2026-03': 27920, '2026-04': 23500,
};

/**
 * getNiftyForMonth — returns the closest prior month's level when an exact
 * match is unavailable (e.g. a snapshot taken mid-month).
 *
 * @param {string} month  'YYYY-MM'
 * @returns {number|null}
 */
export function getNiftyForMonth(month) {
  if (NIFTY_HISTORY[month]) return NIFTY_HISTORY[month];
  const prior = Object.keys(NIFTY_HISTORY).sort().filter(m => m <= month).pop();
  return prior ? NIFTY_HISTORY[prior] : null;
}

/**
 * rebaseToIndex — normalises a value series so the first point = 100.
 * Each element gains an `indexed` field; all other fields are preserved.
 *
 * @param {Array<{value: number}>} series
 * @param {number}                 baseValue  value at time-zero
 * @returns {Array<{value: number, indexed: number}>}
 */
export function rebaseToIndex(series, baseValue) {
  return series.map(d => ({
    ...d,
    indexed: baseValue > 0 ? (d.value / baseValue) * 100 : 100,
  }));
}
