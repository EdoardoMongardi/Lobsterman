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
import { processVerification, clearVerifications } from '../verification/verifier-engine';
import { onEventReceived, resetSessionSummary, updatePeakRisk } from '../telegram/session-summary';
import { DEMO_TASK, DEMO_CONSTRAINTS } from '../lib/demo-scenario';
import type { EventSourceAdapter } from './types';

// Use process-level global to survive Next.js hot-module-reload and multi-context
// initialization in dev mode. Without this, each module re-load gets its own
// `initialized = false` and spawns a second Telegram bot → 409 Conflict.
const g = global as typeof global & { __lobstermanInitialized?: boolean };

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

export function shouldAlert(ruleId: string, target?: string): { send: boolean; repeatCount: number } {
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

export function clearAlertHistory(): void {
    alertHistory.clear();
}

// ─── Alert Composition ───
// When one event triggers multiple rules, compose into a single alert.

const SEVERITY_ORDER: Record<string, number> = {
    critical: 4, high: 3, medium: 2, low: 1, info: 0,
};

export function composeFlags(flags: RedFlag[]): RedFlag {
    if (flags.length === 1) return flags[0];

    // Sort by severity (highest first)
    const sorted = [...flags].sort(
        (a, b) => (SEVERITY_ORDER[b.severity] ?? 0) - (SEVERITY_ORDER[a.severity] ?? 0)
    );

    const primary = sorted[0];
    const qualifiers = sorted.slice(1);

    // Build composed title: "Destructive Command — Outside Project Root"
    const titleParts = [primary.title];
    for (const q of qualifiers) {
        if (!titleParts.includes(q.title)) titleParts.push(q.title);
    }

    // Build composed reason: primary reason + qualifier context
    const reasons = sorted.map(f => f.reason).filter(Boolean);
    const composedReason = reasons.join('\n');

    // Use the most urgent suggested action
    const suggestedAction = primary.suggestedAction
        ?? qualifiers.find(q => q.suggestedAction)?.suggestedAction;

    return {
        ...primary,
        title: titleParts.join(' — '),
        reason: composedReason,
        suggestedAction,
    };
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

/**
 * Extract clean task text from OpenClaw user message format.
 * Raw format: "Sender (untrusted metadata):\n```json\n{...}\n```\n\n[timestamp] actual message"
 */
function extractTaskText(raw: string): string {
    // Try to find the actual message after the metadata JSON block
    // Look for pattern: ``` followed by blank line then [timestamp] message
    const afterCodeBlock = raw.match(/```\s*\n\s*\n\s*(?:\[[\s\S]*?\]\s*)?([\s\S]+)/);
    if (afterCodeBlock) {
        const msg = afterCodeBlock[1].trim();
        return msg.length > 120 ? msg.slice(0, 120) + '...' : msg;
    }

    // Fallback: strip [user_message] prefix if present
    const stripped = raw.replace(/^\[user_message\]\s*/i, '').trim();
    return stripped.length > 120 ? stripped.slice(0, 120) + '...' : stripped;
}

function handleEvent(event: NormalizedEvent): void {
    // Track latest user message for session summary
    const preState = stateStore.getState();
    if (event.type === 'user_message' && event.rawSnippet) {
        const taskText = extractTaskText(event.rawSnippet);
        stateStore.updateState({ originalTask: taskText });

        // Fire session start callback on first user message only
        if (!warmingUp && !preState.originalTask && callbacks.onSessionStart) {
            callbacks.onSessionStart(preState.sessionId, taskText);
        }
    }

    // 1. Push event to state store (runs state updater internally)
    stateStore.pushEvent(event);

    // 2. Run rule engine
    const recentEvents = stateStore.getAllEvents().slice(-25);
    const newFlags = ruleEngine.evaluate(event, stateStore.getState(), recentEvents);

    // Debug: log rule evaluation
    if (newFlags.length > 0) {
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
    updatePeakRisk(riskLevel); // Track highest risk for session summary

    // 5. Fire callbacks for new flags — COMPOSED per event
    //    When one event triggers multiple rules (e.g., outside-root + destructive),
    //    compose into a single alert with highest severity and merged context.
    if (!warmingUp && callbacks.onRuleTriggered && newFlags.length > 0) {
        // Collect all alertable flags (pass cooldown)
        const alertableFlags: RedFlag[] = [];
        for (const flag of newFlags) {
            const { send, repeatCount } = shouldAlert(flag.ruleId, event.target);
            if (send) {
                const enriched = repeatCount > 0
                    ? { ...flag, reason: `${flag.reason} (repeated ${repeatCount + 1}× recently)` }
                    : flag;
                alertableFlags.push(enriched);
            } else {
                console.log(`[Lobsterman] Alert suppressed (cooldown): ${flag.ruleId}`);
            }
        }

        if (alertableFlags.length > 0) {
            const composed = composeFlags(alertableFlags);
            console.log(`[Lobsterman] Sending composed alert (${alertableFlags.map(f => f.ruleId).join(' + ')})`);
            callbacks.onRuleTriggered(composed, event);
        }
    } else if (!warmingUp && newFlags.length > 0) {
        console.log(`[Lobsterman] Flags produced but no onRuleTriggered callback registered!`);
    }

    // 6. Fire callback on risk level change (only if not warming up)
    if (!warmingUp && callbacks.onRiskChanged && riskLevel !== previousRiskLevel) {
        callbacks.onRiskChanged(previousRiskLevel, riskLevel, activeRedFlags);
    }

    // 6b. Run verification pipeline and idle timer (only if not warming up)
    if (!warmingUp) {
        processVerification(event);
        onEventReceived();
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
            clearVerifications(); // Clear pending verifications
            resetSessionSummary(); // Reset idle timer and summary state
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
    clearVerifications();
    resetSessionSummary();
    stateStore.reset();
    initializeSource();
    console.log('[Lobsterman] Reset complete — source restarted');
}

export function getEngine() {
    if (!g.__lobstermanInitialized) {
        g.__lobstermanInitialized = true;
        initialized = true;
        initializeRules();
        initializeSource();
        console.log('[Lobsterman] Engine initialized');
    }
    return { stateStore, reset: resetEngine, registerCallbacks };
}

// ─── Auto-start in telegram mode ───
// In telegram mode, auto-initialize on module load so the bot starts
// without needing an HTTP request or Next.js instrumentation hook.
if (process.env.LOBSTERMAN_MODE === 'telegram') {
    setTimeout(() => {
        if (!g.__lobstermanInitialized) {
            console.log('[Lobsterman] Auto-starting engine (telegram mode)...');
            getEngine();
        }
    }, 100);
}
