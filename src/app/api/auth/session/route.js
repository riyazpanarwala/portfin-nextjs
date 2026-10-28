import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiHelpers';
import { publicUser, touchSession } from '@/lib/auth';

export const GET = withErrorHandler('GET /api/auth/session', async (_request, { session }) => touchSession(session, NextResponse.json({ user: publicUser(session) })));
