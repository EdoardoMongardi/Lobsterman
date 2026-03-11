import { NextResponse } from 'next/server';
import { getEngine } from '@/core/engine';
import { DashboardResponse, LobstermanMode } from '@/core/types';

export const dynamic = 'force-dynamic';

export async function GET() {
    const { stateStore } = getEngine();
    const mode = (process.env.LOBSTERMAN_MODE ?? 'demo') as LobstermanMode;
    const response: DashboardResponse = {
        state: stateStore.getState(),
        updatedAt: Date.now(),
        mode,
    };
    return NextResponse.json(response);
}
