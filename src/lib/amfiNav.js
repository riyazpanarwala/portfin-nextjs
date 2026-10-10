// Scheme identity comes only from an exact ISIN; plan/option names are never merged.
export function parseAmfiNav(text) {
  const lines = text.split(/\r?\n/);
  const header = lines.find(line => line.includes('Scheme Code') && line.includes('Net Asset Value'));
  if (!header) throw new Error('AMFI header missing');
  const columns = header.split(';').map(s => s.trim().toLowerCase());
  const navIndex = columns.findIndex(s => s.includes('net asset value'));
  const dateIndex = columns.findIndex(s => s === 'date');
  const isinIndexes = columns.map((s, i) => s.includes('isin') ? i : -1).filter(i => i >= 0);
  if (navIndex < 0 || dateIndex < 0 || !isinIndexes.length) throw new Error('AMFI columns missing');
  const byIsin = new Map();
  for (const line of lines) {
    const fields = line.split(';');
    const rawNav = fields[navIndex]?.trim();
    if (!/^\d+(\.\d+)?$/.test(rawNav || '')) continue;
    const price = Number(rawNav);
    const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(fields[dateIndex]?.trim() || '');
    const month = match ? ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[2].toLowerCase()) : -1;
    if (!Number.isFinite(price) || price <= 0 || month < 0) continue;
    const date = new Date(Date.UTC(Number(match[3]), month, Number(match[1])));
    if (date.getUTCFullYear() !== Number(match[3]) || date.getUTCMonth() !== month || date.getUTCDate() !== Number(match[1])) continue;
    const asOf = date.toISOString().slice(0, 10);
    for (const index of isinIndexes) {
      const isin = fields[index]?.trim().toUpperCase();
      if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(isin || '')) continue;
      const entry = { price, asOf, schemeCode: fields[0].trim() };
      const previous = byIsin.get(isin);
      if (previous && (previous.schemeCode !== entry.schemeCode || previous.price !== price || previous.asOf !== asOf)) throw new Error('Conflicting NAV records for an ISIN');
      byIsin.set(isin, entry);
    }
  }
  if (!byIsin.size) throw new Error('AMFI NAV data unavailable');
  return byIsin;
}
