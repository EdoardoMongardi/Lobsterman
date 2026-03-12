import { SupervisorState, NormalizedEvent } from '../core/types';
import { RiskHero } from './RiskHero';
import { RedFlagsPanel } from './RedFlagsPanel';
import { InterventionPanel } from './InterventionPanel';
import { SessionSummary } from './SessionSummary';
import { Timeline } from './Timeline';
import { WatchdogState } from './WatchdogState';
import { VerificationsPanel } from './VerificationsPanel';
import { DecisionsPanel } from './DecisionsPanel';

export function Dashboard({
    state,
    events,
}: {
    state: SupervisorState;
    events: NormalizedEvent[];
    updatedAt: number;
}) {
    const topFlag =
        state.activeRedFlags.length > 0 ? state.activeRedFlags[state.activeRedFlags.length - 1] : null;

    // Build set of flagged event IDs for timeline highlighting
    const flaggedEventIds = new Set(state.activeRedFlags.map((f) => f.relatedEventId));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full overflow-hidden">
            {/* Left column — hero panels (40% = 2/5) */}
            <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto min-h-0">
                <RiskHero
                    riskLevel={state.riskLevel}
                    topFlag={topFlag}
                    totalFlags={state.activeRedFlags.length}
                />
                <RedFlagsPanel flags={state.activeRedFlags} />
                <InterventionPanel
                    recommendedAction={state.recommendedAction}
                    activeFlags={state.activeRedFlags}
                />
                <VerificationsPanel />
                <DecisionsPanel />
                <SessionSummary
                    originalTask={state.originalTask}
                    constraints={state.constraints}
                    currentPhase={state.currentPhase}
                    stats={state.stats}
                />
            </div>

            {/* Right column — timeline + state (60% = 3/5) */}
            <div className="lg:col-span-3 flex flex-col gap-4 min-h-0 overflow-hidden">
                <div className="flex-1 min-h-0">
                    <Timeline events={events} flaggedEventIds={flaggedEventIds} />
                </div>
                <WatchdogState
                    progressMarkers={state.progressMarkers}
                    recentKeyActions={state.recentKeyActions}
                    lastMeaningfulProgressAt={state.lastMeaningfulProgressAt}
                />
            </div>
        </div>
    );
}
