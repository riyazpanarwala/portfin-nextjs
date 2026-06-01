/**
 * proxy.js
 *
 * Blocks direct browser access and requests that do not originate
 * from an allowed application origin.
 *
 * Note:
 * This is an additional filter. Private APIs must still validate
 * the logged-in user and verify resource ownership.
 */

import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Build allowed origins once at module load
// ---------------------------------------------------------------------------

function buildAllowedOrigins() {
  const candidates = [
    ...(process.env.API_ALLOWED_ORIGINS?.split(',') ?? []),
  ]

  const origins = new Set()

  for (const raw of candidates) {
    if (!raw) continue

    try {
      origins.add(new URL(raw.trim()).origin.toLowerCase())
    } catch {
      // Ignore malformed environment values.
    }
  }

  // Local development fallback.
  if (origins.size === 0 && process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000')
  }

  return origins
}

const ALLOWED_ORIGINS = buildAllowedOrigins()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractOrigin(value) {
  if (!value) return null

  try {
    return new URL(value).origin.toLowerCase()
  } catch {
    return null
  }
}

function forbidden(message = 'Direct API access is not permitted.') {
  return NextResponse.json(
    {
      error: 'Forbidden',
      message,
    },
    {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  )
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

export function proxy(request) {
  const originHeader = request.headers.get('origin')

  // Browser fetch or XHR request.
  if (originHeader) {
    const origin = extractOrigin(originHeader)

    if (origin && ALLOWED_ORIGINS.has(origin)) {
      return NextResponse.next()
    }

    return forbidden('The request origin is not allowed.')
  }

  const refererHeader = request.headers.get('referer')

  // Optional fallback for legitimate page-driven requests.
  if (refererHeader) {
    const refererOrigin = extractOrigin(refererHeader)

    if (refererOrigin && ALLOWED_ORIGINS.has(refererOrigin)) {
      return NextResponse.next()
    }

    return forbidden('The request referer is not allowed.')
  }

  // Direct URL-bar access, default curl and default Postman requests.
  return forbidden()
}

// ---------------------------------------------------------------------------
// Apply only to API routes
// ---------------------------------------------------------------------------

export const config = {
  matcher: ['/api/:path*'],
}