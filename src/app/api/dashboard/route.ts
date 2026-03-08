import { NextResponse } from 'next/server';
import { getEngine } from '@/core/engine';
import { DashboardResponse, WatchtowerMode } from '@/core/types';

export const dynamic = 'force-dynamic';

export async function GET() {
    const { stateStore } = getEngine();
    const mode = (process.env.WATCHTOWER_MODE ?? 'demo') as WatchtowerMode;
    const response: DashboardResponse = {
        state: stateStore.getState(),
        updatedAt: Date.now(),
        mode,
    };
    return NextResponse.json(response);
}
