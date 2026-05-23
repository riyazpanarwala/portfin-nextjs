/**
 * lib/colorResolver.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for CSS variable → hex colour mapping.
 * Recharts (and other canvas/SVG tools) cannot read CSS variables at runtime,
 * so any component that hands colours to Recharts must resolve them first.
 *
 * Previously this map existed in two places:
 *   • lib/niftyData.js   (CSS_VAR_HEX)
 *   • components/charts/Charts.js  (CSS_VAR_MAP)
 * Both are now deleted in favour of this module.
 */

export const CSS_VAR_TO_HEX = {
  'var(--accent)':  '#3b82f6',
  'var(--accent2)': '#60a5fa',
  'var(--green)':   '#10b981',
  'var(--green2)':  '#34d399',
  'var(--red)':     '#ef4444',
  'var(--red2)':    '#f87171',
  'var(--yellow)':  '#f59e0b',
  'var(--purple)':  '#8b5cf6',
  'var(--orange)':  '#f97316',
  'var(--teal)':    '#14b8a6',
  'var(--text3)':   '#5c7a9a',
  'var(--text2)':   '#94a9c4',
  'var(--text)':    '#e8eef8',
};

/**
 * resolveColor
 * Converts a CSS variable colour string to a hex string safe for Recharts.
 * Passthrough for strings that are already raw hex / rgb values.
 *
 * @param {string} color    e.g. 'var(--yellow)' or '#f59e0b'
 * @param {string} fallback hex fallback when the variable is unrecognised
 * @returns {string}
 */
export function resolveColor(color, fallback = '#3b82f6') {
  if (!color) return fallback;
  return CSS_VAR_TO_HEX[color] ?? (color.startsWith('var(') ? fallback : color);
}
