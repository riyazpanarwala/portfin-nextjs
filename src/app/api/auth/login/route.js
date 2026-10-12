import { NextResponse } from "next/server";
import { withErrorHandler, badRequest } from "@/lib/apiHelpers";
import { authenticatePassword } from '@/lib/passwordLogin';
import { createSession } from '@/lib/auth';
import { isAdministrator } from '@/lib/sessionTokens';

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 *
 * Credential check against the User table.
 * Passwords are stored as salted hashes.
 * Returns { user: { id, email, displayName } } on success.
 *
 */
export const POST = withErrorHandler(
  "POST /api/auth/login",
  async (request) => {
    const { email, password } = await request.json();

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || email.length > 254 || password.length > 1024) {
      return badRequest("Email and password are required");
    }

    const { user, retryAfter } = await authenticatePassword(request, email, password);
    if (retryAfter) return NextResponse.json(
      { error: 'Too many sign-in attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    return createSession(user.id, NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName || user.email,
        isAdmin: isAdministrator(user.email),
      },
    }));
  },
  { public: true },
);
