import { NextResponse } from 'next/server';
import { getRecentDecisions } from '@/telegram/operator-intent';

export const dynamic = 'force-dynamic';

export async function GET() {
    const decisions = getRecentDecisions(20);
    return NextResponse.json({ decisions });
}
