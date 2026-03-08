import { NextResponse } from 'next/server';
import { getEngine } from '@/core/engine';

export const dynamic = 'force-dynamic';

export async function POST() {
    const { reset } = getEngine();
    reset();
    return new NextResponse(null, { status: 204 });
}
