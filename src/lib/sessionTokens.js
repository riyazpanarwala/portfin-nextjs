import { randomBytes, createHash } from 'node:crypto';

export const SESSION_COOKIE = 'portfin_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const SESSION_REFRESH_INTERVAL_SECONDS = 60 * 60 * 24;
export const newSessionToken = () => randomBytes(32).toString('base64url');
export const hashSessionToken = token => createHash('sha256').update(token).digest('hex');

export async function findSession(token, db, now = new Date()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: { user: true } });
  return session && session.expiresAt > now ? session : null;
}

export function isAdministrator(email, allowedEmails = process.env.PORTFIN_ADMIN_EMAILS || '') {
  return allowedEmails.split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}
