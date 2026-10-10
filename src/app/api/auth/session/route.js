import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiHelpers';
import { publicUser } from '@/lib/auth';

export const GET = withErrorHandler('GET /api/auth/session', async (_request, { session }) => NextResponse.json({ user: publicUser(session) }));
