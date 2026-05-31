import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withErrorHandler, badRequest } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 *
 * Simple credential check against the User table.
 * Passwords are stored as plain-text in this app (no external auth server).
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
        { error: "Invalid email or password1" },
        { status: 401 },
      );
    }

    // Plain-text comparison (no hashing — internal personal finance tool)
    if (user.password !== password) {
      return NextResponse.json(
        { error: "Invalid email or password2" },
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
