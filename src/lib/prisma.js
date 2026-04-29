// NOTE: @prisma/client is generated at runtime via `npx prisma generate`
// This module lazily creates the client so Next.js build doesn't try to
// instantiate it during static page collection.

let _client = null;

function getClient() {
  if (_client) return _client;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('@prisma/client');
  _client = globalThis.__prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  if (process.env.NODE_ENV !== 'production') globalThis.__prisma = _client;
  return _client;
}

// Proxy: property access triggers lazy init only when an API route actually runs
export const prisma = new Proxy({}, {
  get(_, prop) {
    return getClient()[prop];
  },
});
