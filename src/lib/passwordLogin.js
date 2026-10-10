import { prisma } from './prisma.js';
import { verifyPassword, DUMMY_PASSWORD_HASH } from './passwordHash.js';
import { consumeLoginAttempt } from './loginRateLimit.js';

export async function authenticatePassword(request, email, password, { db = prisma, consumeAttempt = consumeLoginAttempt, verify = verifyPassword } = {}) {
  const normalizedEmail = email.trim().toLowerCase();
  const limit = await consumeAttempt(normalizedEmail, request, db);
  if (!limit.allowed) return { user: null, retryAfter: limit.retryAfter };
  const user = await db.user.findUnique({ where: { email: normalizedEmail } });
  const verified = await verify(password, user?.passwordHash || DUMMY_PASSWORD_HASH);
  return { user: user?.passwordHash && verified ? user : null, retryAfter: 0 };
}
