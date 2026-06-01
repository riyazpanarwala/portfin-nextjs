/**
 * proxy.js  — place at project root, next to package.json
 * ─────────────────────────────────────────────────────────────────────────────
 * Next.js 16+ API guard. Blocks all /api/* requests that do not originate
 * from an allowed origin.
 *
 * SETUP (.env.local):
 *   NEXT_PUBLIC_APP_URL=http://localhost:3000
 *   NEXT_PUBLIC_SITE_URL=https://yourapp.com        ← optional alias
 *   API_ALLOWED_ORIGINS=https://other.example.com   ← optional extras, comma-separated
 */

import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Build allowed origins once at module load — not on every request
// ---------------------------------------------------------------------------

function buildAllowedOrigins() {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    ...(process.env.API_ALLOWED_ORIGINS?.split(',') ?? []),
  ]

  const origins = new Set()

  for (const raw of candidates) {
    if (!raw) continue
    try {
      origins.add(new URL(raw.trim()).origin.toLowerCase())
    } catch {
      // skip malformed entries
    }
  }

  // Dev fallback so the app works without any env vars configured
  if (origins.size === 0 && process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000')
  }

  return origins
}

const ALLOWED_ORIGINS = buildAllowedOrigins()

function extractOrigin(value) {
  if (!value) return null
  try {
    return new URL(value).origin.toLowerCase()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// proxy — Next.js 16 entry point
// ---------------------------------------------------------------------------

export function proxy(request) {
  // 1. Check Origin header — set by browsers on every fetch/XHR call
  const originHeader = request.headers.get('origin')
  if (originHeader) {
    const origin = extractOrigin(originHeader)
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      return NextResponse.next()
    }
    // Origin present but not in allow-list
    return forbidden(`Origin "${originHeader}" is not allowed.`)
  }

  // 2. Fall back to Referer — used by Next.js internal server-side calls
  //    (Server Components, Route Handlers calling other routes).
  //    Only the origin portion is extracted and compared; path is ignored.
  const refererHeader = request.headers.get('referer')
  if (refererHeader) {
    const refererOrigin = extractOrigin(refererHeader)
    if (refererOrigin && ALLOWED_ORIGINS.has(refererOrigin)) {
      return NextResponse.next()
    }
    // Referer present but origin portion doesn't match
    return forbidden(`Referer origin "${refererOrigin}" is not allowed.`)
  }

  // 3. Neither header — direct browser URL bar, curl, Postman default
  return forbidden('Direct access is not permitted.')
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function forbidden(message) {
  return NextResponse.json(
    { error: 'Forbidden', message },
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
// Matcher — runs only on /api/* routes
// ---------------------------------------------------------------------------

export const config = {
  matcher: ['/api/:path*'],
}
