/**
 * lib/apiHelpers.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shared utilities for Next.js API route handlers.
 * Eliminates the repeated try/catch + NextResponse.json boilerplate
 * that appeared in every route file.
 */

import { NextResponse } from 'next/server';

/**
 * withErrorHandler
 * Wraps an async route handler so unhandled errors always return a
 * well-formed JSON 500 response instead of crashing the route silently.
 *
 * Usage:
 *   export const GET = withErrorHandler('GET /api/trades', async (req) => {
 *     // ...your logic...
 *     return NextResponse.json({ ok: true });
 *   });
 *
 * @param {string}   label    — identifies the route in console.error output
 * @param {Function} handler  — async (request, context) => NextResponse
 * @returns {Function}
 */
export function withErrorHandler(label, handler) {
  return async function (request, context) {
    try {
      return await handler(request, context);
    } catch (e) {
      console.error(`${label}:`, e);
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  };
}

/**
 * badRequest — shorthand for 400 responses.
 * @param {string} msg
 */
export function badRequest(msg) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

/**
 * conflict — shorthand for 409 responses.
 * @param {string} msg
 */
export function conflict(msg) {
  return NextResponse.json({ error: msg }, { status: 409 });
}

/**
 * parseFloatOrNull — safely parses a value to float, returning null when falsy.
 * Replaces the scattered `brokerage ? parseFloat(brokerage) : null` pattern.
 *
 * @param {*} v
 * @returns {number|null}
 */
export function parseFloatOrNull(v) {
  return v != null && v !== '' ? parseFloat(v) : null;
}

/**
 * parseIntOrNull — safely parses to int, returning null when falsy.
 * @param {*} v
 * @returns {number|null}
 */
export function parseIntOrNull(v) {
  return v != null && v !== '' ? parseInt(v, 10) : null;
}

/**
 * flattenTrade — converts a Prisma trade+instrument record into the
 * flat shape the frontend expects.  Used by both the GET list and POST create
 * routes to avoid duplicating the mapping.
 *
 * @param {Object} t  Prisma Trade with `instrument` included
 * @returns {Object}
 */
export function flattenTrade(t) {
  return {
    id:           t.id,
    portfolioId:  t.portfolioId,
    instrumentId: t.instrumentId,
    symbol:       t.instrument.symbol,
    name:         t.instrument.name,
    assetType:    t.instrument.assetType,
    exchange:     t.instrument.exchange,
    sector:       t.instrument.sector || null,
    tradeType:    t.tradeType,
    quantity:     t.quantity.toString(),
    price:        t.price.toString(),
    brokerage:    t.brokerage ? t.brokerage.toString() : null,
    tradeDate:    t.tradeDate.toISOString().slice(0, 10),
    createdAt:    t.createdAt.toISOString(),
  };
}
