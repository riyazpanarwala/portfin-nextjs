import { prisma } from '../src/lib/prisma.js';
import { collectInstrumentPrices } from '../src/lib/priceService.js';
import { isDelistedStock } from '../src/lib/marketDataPolicy.js';

// Use the same exact-identity parser, provider dates and failure behavior as the API.
const args = process.argv.slice(2);
const stocks = !args.includes('--mf');
const funds = !args.includes('--stocks');
let updated = 0, failed = 0;
try {
  const instruments = await prisma.instrument.findMany({ where: { assetType: { in: [...(stocks ? ['STOCK'] : []), ...(funds ? ['MF'] : [])] } } });
  const eligible = instruments.filter(instrument => !isDelistedStock(instrument));
  const groups = [eligible.filter(i => i.assetType === 'MF')];
  const equities = eligible.filter(i => i.assetType === 'STOCK');
  for (let offset = 0; offset < equities.length; offset += 20) groups.push(equities.slice(offset, offset + 20));
  for (const group of groups.filter(g => g.length)) {
    const { meta } = await collectInstrumentPrices(group, { force: true });
    for (const instrument of group) {
      const record = meta[instrument.id];
      if (['yahoo', 'amfi'].includes(record?.source) && !record.stale) updated++;
      else { failed++; console.warn('No current verified quote:', instrument.symbol, instrument.exchange); }
    }
    if (group[0].assetType === 'STOCK') await new Promise(resolve => setTimeout(resolve, 1200));
  }
  console.log({ updated, failed, skipped: instruments.length - eligible.length });
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error('Price update failed:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
