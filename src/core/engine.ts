import { NormalizedEvent, RedFlag, RiskLevel, EngineCallbacks } from './types';
import { stateStore } from './state-store';
import { ruleEngine } from './rule-engine';
import { computeIntervention, computeRiskLevel } from './intervention';
import { contextDangerRules } from '../rules/context-danger';
import { loopingRules } from '../rules/looping';
import { riskyActionRules } from '../rules/risky-action';
import { MockEventSource } from '../ingestion/mock-source';
import { FileEventSource } from '../ingestion/file-source';
import { findLatestSession, SessionWatcher } from '../ingestion/session-watcher';
import { initTelegramBot, stopTelegramBot } from '../telegram/telegram-bot';
import { DEMO_TASK, DEMO_CONSTRAINTS } from '../lib/demo-scenario';
import type { EventSourceAdapter } from './types';

let initialized = false;
let currentSource: EventSourceAdapter | null = null;
let sessionWatcher: SessionWatcher | null = null;
let warmingUp = false; // Suppress callbacks during initial file load

// ─── Alert Cooldown ───
// Prevent flooding: each ruleId can only fire a callback once per COOLDOWN_MS
const COOLDOWN_MS = 60_000; // 60 seconds
const lastAlertTime = new Map<string, number>();

function isOnCooldown(ruleId: string): boolean {
    const last = lastAlertTime.get(ruleId);
    if (!last) return false;
    return Date.now() - last < COOLDOWN_MS;
}

function markAlerted(ruleId: string): void {
    lastAlertTime.set(ruleId, Date.now());
}

// ─── Engine Callbacks ───
const callbacks: EngineCallbacks = {};

export function registerCallbacks(cb: Partial<EngineCallbacks>): void {
    if (cb.onRuleTriggered) callbacks.onRuleTriggered = cb.onRuleTriggered;
    if (cb.onRiskChanged) callbacks.onRiskChanged = cb.onRiskChanged;
    if (cb.onSessionStart) callbacks.onSessionStart = cb.onSessionStart;
    if (cb.onSessionEnd) callbacks.onSessionEnd = cb.onSessionEnd;
}

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

        // Fire session start callback (only if not warming up)
        if (!warmingUp && callbacks.onSessionStart) {
            callbacks.onSessionStart(preState.sessionId, taskText);
        }
    }

    // 1. Push event to state store (runs state updater internally)
    stateStore.pushEvent(event);

    // 2. Run rule engine
    const recentEvents = stateStore.getAllEvents().slice(-25);
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
    const previousRiskLevel = currentState.riskLevel;

    // 5. Fire callbacks for new flags (with cooldown to prevent flooding)
    if (!warmingUp && callbacks.onRuleTriggered) {
        for (const flag of newFlags) {
            if (!isOnCooldown(flag.ruleId)) {
                markAlerted(flag.ruleId);
                callbacks.onRuleTriggered(flag, event);
            }
        }
    }

    // 6. Fire callback on risk level change (only if not warming up)
    if (!warmingUp && callbacks.onRiskChanged && riskLevel !== previousRiskLevel) {
        callbacks.onRiskChanged(previousRiskLevel, riskLevel, activeRedFlags);
    }

    // 7. Update phase based on risk
    let currentPhase = currentState.currentPhase;
    if (riskLevel === 'critical') {
        currentPhase = 'critical';
    } else if (activeRedFlags.length > 0) {
        currentPhase = 'warning';
    }

    // 8. Update stats
    const stats = { ...currentState.stats };
    if (newFlags.some((f) => f.ruleId === 'cd-large-output' || f.ruleId === 'cd-repeated-large')) {
        stats.largeOutputCount++;
    }
    if (newFlags.some((f) => f.ruleId === 'lp-repeated-tool-target' || f.ruleId === 'lp-error-retry-loop' || f.ruleId === 'lp-no-progress')) {
        stats.repeatedActionCount++;
    }
    if (newFlags.some((f) => f.ruleId === 'ra-path-outside-root' || f.ruleId === 'ra-sensitive-destructive')) {
        stats.riskyActionCount++;
    }

    // 9. Apply all updates
    stateStore.updateState({
        activeRedFlags,
        riskLevel,
        recommendedAction,
        currentPhase,
        stats,
    });

}

function startFileSource(filePath: string, skipExisting: boolean = false): void {
    const source = new FileEventSource(filePath, 1000, skipExisting);
    currentSource = source;

    // Suppress callbacks during initial file load (builds state silently)
    warmingUp = true;
    source.start(handleEvent);
    warmingUp = false;

    console.log(`[Lobsterman] File mode started — tailing ${filePath}${skipExisting ? ' (recent + new events)' : ''}`);
    console.log(`[Lobsterman] State built from history. Now monitoring for new events only.`);
}

function initializeSource(): void {
    const mode = process.env.LOBSTERMAN_MODE ?? 'demo';

    if (mode === 'demo') {
        stateStore.updateState({
            originalTask: DEMO_TASK,
            constraints: DEMO_CONSTRAINTS,
        });

        const source = new MockEventSource();
        currentSource = source;
        source.start(handleEvent);
        console.log('[Lobsterman] Demo mode started — emitting events every 1.5s');

    } else if (mode === 'file') {
        const sourceFile = process.env.LOBSTERMAN_SOURCE_FILE;
        if (!sourceFile) {
            console.error('[Lobsterman] LOBSTERMAN_SOURCE_FILE not set — cannot start file mode');
            return;
        }
        startFileSource(sourceFile);

    } else if (mode === 'telegram') {
        // Telegram mode: start bot + session watcher for auto-detection
        console.log('[Lobsterman] Telegram mode — starting bot and session watcher');

        // Initialize Telegram bot and register its callbacks
        const telegramCallbacks = initTelegramBot();
        if (telegramCallbacks) {
            registerCallbacks(telegramCallbacks);
        }

        // Start session watcher for auto-detection
        sessionWatcher = new SessionWatcher();
        sessionWatcher.start((session) => {
            // Stop current source if switching sessions
            if (currentSource) {
                currentSource.stop();
                currentSource = null;
            }
            stateStore.reset();
            startFileSource(session.sessionFile, true);
        });
    }
}

/** Stop source, clear state and events, then restart the current mode. */
export function resetEngine(): void {
    if (currentSource) {
        currentSource.stop();
        currentSource = null;
    }
    if (sessionWatcher) {
        sessionWatcher.stop();
        sessionWatcher = null;
    }
    stopTelegramBot();
    stateStore.reset();
    initializeSource();
    console.log('[Lobsterman] Reset complete — source restarted');
}

export function getEngine() {
    if (!initialized) {
        initializeRules();
        initializeSource();
        initialized = true;
        console.log('[Lobsterman] Engine initialized');
    }
    return { stateStore, reset: resetEngine, registerCallbacks };
}

// ─── Auto-start in telegram mode ───
// In telegram mode, auto-initialize on module load so the bot starts
// without needing an HTTP request or Next.js instrumentation hook.
if (process.env.LOBSTERMAN_MODE === 'telegram') {
    setTimeout(() => {
        if (!initialized) {
            console.log('[Lobsterman] Auto-starting engine (telegram mode)...');
            getEngine();
        }
    }, 100);
}
