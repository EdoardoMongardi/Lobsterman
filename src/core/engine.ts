import { NormalizedEvent, RedFlag, RiskLevel, EngineCallbacks } from './types';
import { resetSequence } from './event-normalizer';
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
import { loadDecisions, clearDecisions } from '../telegram/operator-intent';
import { DEMO_TASK, DEMO_CONSTRAINTS } from '../lib/demo-scenario';
import type { EventSourceAdapter } from './types';

let initialized = false;
let currentSource: EventSourceAdapter | null = null;
let sessionWatcher: SessionWatcher | null = null;
let warmingUp = false; // Suppress callbacks during initial file load

// ─── Alert Aggregation ───
// Target-aware dedup: same ruleId + target within cooldown → aggregate, not spam.
// Risk-level-change alerts always pass through (handled separately).
const COOLDOWN_MS = 60_000; // 60 seconds

interface AlertEntry {
    lastAlertedAt: number;
    suppressedCount: number;
}

const alertHistory = new Map<string, AlertEntry>();

function alertKey(ruleId: string, target?: string): string {
    return `${ruleId}::${target ?? '_'}`;
}

function shouldAlert(ruleId: string, target?: string): { send: boolean; repeatCount: number } {
    const key = alertKey(ruleId, target);
    const entry = alertHistory.get(key);
    const now = Date.now();

    if (!entry || now - entry.lastAlertedAt >= COOLDOWN_MS) {
        // Cooldown expired or first time — send alert, report any suppressed count
        const repeatCount = entry?.suppressedCount ?? 0;
        alertHistory.set(key, { lastAlertedAt: now, suppressedCount: 0 });
        return { send: true, repeatCount };
    }

    // Still in cooldown — suppress and count
    entry.suppressedCount++;
    return { send: false, repeatCount: 0 };
}

function clearAlertHistory(): void {
    alertHistory.clear();
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

    // Debug: log rule evaluation
    if (!warmingUp && newFlags.length > 0) {
        console.log(`[Lobsterman] Rules fired ${newFlags.length} flag(s) for event #${event.sequence}: ${newFlags.map(f => f.ruleId).join(', ')}`);
    }

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

    // 5. Fire callbacks for new flags (with target-aware aggregation)
    if (!warmingUp && callbacks.onRuleTriggered) {
        for (const flag of newFlags) {
            const { send, repeatCount } = shouldAlert(flag.ruleId, event.target);
            if (send) {
                console.log(`[Lobsterman] Sending alert: ${flag.ruleId} (target: ${event.target ?? 'none'}, repeat: ${repeatCount})`);
                // Enrich flag reason with repeat count if suppressed hits occurred
                const enrichedFlag = repeatCount > 0
                    ? { ...flag, reason: `${flag.reason} (repeated ${repeatCount + 1}× recently)` }
                    : flag;
                callbacks.onRuleTriggered(enrichedFlag, event);
            } else {
                console.log(`[Lobsterman] Alert suppressed (cooldown): ${flag.ruleId} (target: ${event.target ?? 'none'})`);
            }
        }
    } else if (!warmingUp && newFlags.length > 0) {
        console.log(`[Lobsterman] Flags produced but no onRuleTriggered callback registered!`);
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

    // Only suppress callbacks during initial startup load (large historical file).
    // For newly-detected sessions (skipExisting=true), process events live —
    // those events are current, and cooldown/aggregation prevents flooding.
    if (!skipExisting) {
        warmingUp = true;
    }
    source.start(handleEvent);
    warmingUp = false;

    console.log(`[Lobsterman] File mode started — tailing ${filePath}${skipExisting ? ' (live events)' : ' (warmed up from history)'}`);
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

        // Load persisted operator decisions from disk
        loadDecisions();

        // Start session watcher for auto-detection
        let isFirstSession = true;
        sessionWatcher = new SessionWatcher();
        sessionWatcher.start((session) => {
            // Stop current source if switching sessions
            if (currentSource) {
                currentSource.stop();
                currentSource = null;
            }
            stateStore.reset();
            clearAlertHistory(); // Fresh session = fresh alert state
            resetSequence();     // Event numbers restart from 1

            if (isFirstSession) {
                // First session on startup: suppress alerts (historical data)
                console.log(`[Lobsterman] Initial session — warming up (suppressing stale alerts)`);
                startFileSource(session.sessionFile, false); // warmup = true internally
                isFirstSession = false;
            } else {
                // New session detected while running: process live
                console.log(`[Lobsterman] New session — processing live`);
                startFileSource(session.sessionFile, true); // no warmup
            }
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
    clearDecisions();
    clearAlertHistory();
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
