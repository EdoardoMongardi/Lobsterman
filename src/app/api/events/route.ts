import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/core/engine';
import { EventsResponse } from '@/core/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { stateStore } = getEngine();
    const since = Number(request.nextUrl.searchParams.get('since') ?? 0);
    const events = stateStore.getEvents(since);
    const response: EventsResponse = {
        events,
        total: stateStore.getAllEvents().length,
    };
    return NextResponse.json(response);
}
