import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');
let nextCleanupAt = 0;

export function loginBuckets(email, request, trustedHeader = process.env.PORTFIN_TRUSTED_IP_HEADER || '') {
  // Only trust a header that the deployment's proxy overwrites, never arbitrary X-Forwarded-For.
  const allowed = ['cf-connecting-ip', 'x-real-ip', 'x-vercel-forwarded-for'];
  const header = trustedHeader.toLowerCase();
  const candidate = allowed.includes(header) ? request.headers.get(header)?.trim() : null;
  const ip = candidate && isIP(candidate) ? candidate.toLowerCase() : null;
  const normalizedEmail = email.trim().toLowerCase();

  const buckets = ip
    ? [
        { key: digest(`account-ip:${ip}:${normalizedEmail}`), limit: 5 },
        { key: digest(`ip:${ip}`), limit: 30 },
      ]
    : [
        { key: digest(`account:${normalizedEmail}`), limit: 5 },
      ];

  return buckets.sort((a, b) => a.key.localeCompare(b.key));
}

export async function consumeLoginBuckets(buckets, db = prisma, now = new Date()) {
  const expiresAt = new Date(now.getTime() + LOGIN_WINDOW_MS);
  // Atomic UPSERTs reserve attempts before password work, across all server instances.
  const values = buckets.map(bucket => Prisma.sql`(${bucket.key}, 1, ${expiresAt})`);
  const rows = await db.$queryRaw(Prisma.sql`
    INSERT INTO "login_rate_limits" ("key", "attempts", "expires_at")
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "login_rate_limits"."expires_at" <= ${now} THEN 1 ELSE LEAST("login_rate_limits"."attempts" + 1, 1000000) END,
      "expires_at" = CASE WHEN "login_rate_limits"."expires_at" <= ${now} THEN EXCLUDED."expires_at" ELSE "login_rate_limits"."expires_at" END
    RETURNING "key", "attempts", "expires_at" AS "expiresAt"
  `);
  const blocked = rows.filter(row => row.attempts > buckets.find(bucket => bucket.key === row.key).limit);
  const retryAfter = blocked.length ? Math.max(...blocked.map(row => Math.max(1, Math.ceil((new Date(row.expiresAt).getTime() - now.getTime()) / 1000)))) : 0;
  return { allowed: !blocked.length, retryAfter };
}

export async function consumeLoginAttempt(email, request, db = prisma) {
  const now = new Date();
  const result = await consumeLoginBuckets(loginBuckets(email, request), db, now);
  if (result.allowed && now.getTime() >= nextCleanupAt) {
    nextCleanupAt = now.getTime() + LOGIN_WINDOW_MS;
    // Cleanup is best effort; authorization still depends on the atomic reservation above.
    try { await db.loginRateLimit.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 86400000) } } }); }
    catch { console.warn('[login] Expired rate-limit cleanup failed'); }
  }
  return result;
}
