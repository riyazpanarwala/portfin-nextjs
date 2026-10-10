import { prisma } from './prisma.js';
import { SESSION_COOKIE, SESSION_TTL_SECONDS, newSessionToken, hashSessionToken, findSession, isAdministrator } from './sessionTokens.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function cookieToken(request) {
  if (request) {
    const entry = (request.headers.get('cookie') || '').split(';').find(s => s.trim().startsWith(`${SESSION_COOKIE}=`));
    return entry?.trim().slice(SESSION_COOKIE.length + 1);
  }
  const { cookies } = await import('next/headers.js');
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function requireSession(request, db = prisma) {
  const session = await findSession(await cookieToken(request), db);
  if (!session) throw new HttpError(401, 'Please sign in.');
  return { userId: session.userId, user: session.user, isAdmin: isAdministrator(session.user.email) };
}

export function requireAdmin(session) {
  if (!session.isAdmin) throw new HttpError(403, 'Administrator access required.');
}

export async function requireOwnedPortfolio(portfolioId, session, db = prisma) {
  if (typeof portfolioId !== 'string' || !portfolioId) throw new HttpError(400, 'portfolioId required');
  const portfolio = await db.portfolio.findFirst({ where: { id: portfolioId, userId: session.userId }, select: { id: true } });
  if (!portfolio) throw new HttpError(404, 'Portfolio not found');
  return portfolio;
}

export async function createSession(userId, response, db = prisma) {
  const token = newSessionToken();
  await db.session.create({ data: { userId, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) } });
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_TTL_SECONDS });
  return response;
}

export async function destroySession(request, response, db = prisma) {
  const token = await cookieToken(request);
  if (token) await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}

export function publicUser(session) {
  const user = session.user;
  return { id: user.id, email: user.email, displayName: user.displayName || user.email, isAdmin: session.isAdmin };
}
