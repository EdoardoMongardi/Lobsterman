import { NormalizedEvent, RedFlag } from './types';
import { stateStore } from './state-store';
import { ruleEngine } from './rule-engine';
import { computeIntervention, computeRiskLevel } from './intervention';
import { contextDangerRules } from '../rules/context-danger';
import { loopingRules } from '../rules/looping';
import { riskyActionRules } from '../rules/risky-action';
import { MockEventSource } from '../ingestion/mock-source';
import { FileEventSource } from '../ingestion/file-source';
import { DEMO_TASK, DEMO_CONSTRAINTS } from '../lib/demo-scenario';

let initialized = false;

function initializeRules(): void {
    ruleEngine.registerRules([
        ...contextDangerRules,
        ...loopingRules,
        ...riskyActionRules,
    ]);
}

function handleEvent(event: NormalizedEvent): void {
    // Auto-extract task from first user message (used in file mode)
    const preState = stateStore.getState();
    if (!preState.originalTask && event.type === 'user_message' && event.rawSnippet) {
        const taskText = event.rawSnippet.length >= 200
            ? event.summary
            : event.rawSnippet;
        stateStore.updateState({ originalTask: taskText });
    }

    // 1. Push event to state store (runs state updater internally)
    stateStore.pushEvent(event);

    // 2. Run rule engine
    const recentEvents = stateStore.getAllEvents().slice(-15);
    const newFlags = ruleEngine.evaluate(event, stateStore.getState(), recentEvents);

    // 3. Merge new flags into active flags (deduplicate by ruleId, keep latest)
    const currentState = stateStore.getState();
    const existingFlags = currentState.activeRedFlags.filter(
        (existing) => !newFlags.some((nf) => nf.ruleId === existing.ruleId)
    );
    const activeRedFlags: RedFlag[] = [...existingFlags, ...newFlags];

    // 4. Compute risk level and intervention
    const riskLevel = computeRiskLevel(activeRedFlags);
    const recommendedAction = computeIntervention(activeRedFlags);

    // 5. Update phase based on risk
    let currentPhase = currentState.currentPhase;
    if (riskLevel === 'critical') {
        currentPhase = 'critical';
    } else if (activeRedFlags.length > 0) {
        currentPhase = 'warning';
    }

    // 6. Update stats
    const stats = { ...currentState.stats };
    if (newFlags.some((f) => f.ruleId === 'cd-large-output' || f.ruleId === 'cd-repeated-large')) {
        stats.largeOutputCount++;
    }
    if (newFlags.some((f) => f.ruleId === 'lp-repeated-tool-target' || f.ruleId === 'lp-error-retry-loop')) {
        stats.repeatedActionCount++;
    }
    if (newFlags.some((f) => f.ruleId === 'ra-path-outside-root' || f.ruleId === 'ra-sensitive-destructive')) {
        stats.riskyActionCount++;
    }

    // 7. Apply all updates
    stateStore.updateState({
        activeRedFlags,
        riskLevel,
        recommendedAction,
        currentPhase,
        stats,
    });

}

function initializeSource(): void {
    const mode = process.env.WATCHTOWER_MODE ?? 'demo';

    if (mode === 'demo') {
        stateStore.updateState({
            originalTask: DEMO_TASK,
            constraints: DEMO_CONSTRAINTS,
        });

        const source = new MockEventSource();
        source.start(handleEvent);
        console.log('[Watchtower] Demo mode started — emitting events every 1.5s');
    } else if (mode === 'file') {
        const sourceFile = process.env.WATCHTOWER_SOURCE_FILE;
        if (!sourceFile) {
            console.error('[Watchtower] WATCHTOWER_SOURCE_FILE not set — cannot start file mode');
            return;
        }

        const source = new FileEventSource(sourceFile);
        source.start(handleEvent);
        console.log(`[Watchtower] File mode started — tailing ${sourceFile}`);
    }
}

export function getEngine() {
    if (!initialized) {
        initializeRules();
        initializeSource();
        initialized = true;
        console.log('[Watchtower] Engine initialized');
    }
    return { stateStore };
}
