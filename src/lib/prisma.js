/**
 * lib/prisma.js
 * Lazy singleton Prisma client — prevents instantiation during Next.js
 * static build and avoids multiple client instances in development HMR.
 */

let _client = null;

function getClient() {
  if (_client) return _client;
  const { PrismaClient } = require('@prisma/client'); // eslint-disable-line
  _client = globalThis.__prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  if (process.env.NODE_ENV !== 'production') globalThis.__prisma = _client;
  return _client;
}

// Proxy so property access triggers lazy init only when a route actually runs
export const prisma = new Proxy({}, {
  get(_, prop) { return getClient()[prop]; },
});
