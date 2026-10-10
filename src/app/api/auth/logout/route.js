import { NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/apiHelpers';
import { destroySession } from '@/lib/auth';

export const POST = withErrorHandler('POST /api/auth/logout', async request => destroySession(request, NextResponse.json({ success: true })), { public: true });
