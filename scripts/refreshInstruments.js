import { getInstrumentCatalogue } from '../src/lib/instrumentCatalogue.js';

try {
  const catalogue = await getInstrumentCatalogue({ force: true });
  if (catalogue.stale) throw new Error('Refresh failed; the previous catalogue remains available.');
  console.log(`Upstox catalogue: ${catalogue.data.length} instruments, updated ${new Date(catalogue.updatedAt).toISOString()}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
