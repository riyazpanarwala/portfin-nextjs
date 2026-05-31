import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, badRequest } from "@/lib/apiHelpers";
import { verifyPassword } from "@/lib/passwordHash";

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

    if (!email || !password) {
      return badRequest("Email and password are required");
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName || user.email,
      },
    });
  },
);
