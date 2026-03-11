/**
 * Session Summary — Phase 7B-lite, Step 23
 *
 * Sends a template-based session report card when:
 * - Session goes idle for 60s (interim summary)
 * - Session reaches terminal state (final summary)
 *
 * No LLM required — all data comes from SupervisorState + event history.
 */

import { stateStore } from '../core/state-store';
import { RiskLevel } from '../core/types';

const IDLE_TIMEOUT_MS = 60_000; // 60 seconds

const RISK_ORDER: Record<string, number> = {
    info: 0, low: 1, medium: 2, high: 3, critical: 4,
};

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lastEventTimestamp: number = 0;
let sessionStartedAt: number = 0;
let sentIdleSummary = false;
let sentFinalSummary = false;
let sendFn: ((text: string) => Promise<void>) | null = null;

// Cumulative session counters (survive across idle periods)
let cumulativeVerified = 0;
let cumulativeMismatches = 0;
let peakRisk: RiskLevel = 'low';

/**
 * Initialize the session summary module with a send function.
 */
export function initSessionSummary(send: (text: string) => Promise<void>): void {
    sendFn = send;
}

/**
 * Reset summary state on session switch.
 */
export function resetSessionSummary(): void {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    lastEventTimestamp = 0;
    sessionStartedAt = 0;
    sentIdleSummary = false;
    sentFinalSummary = false;
    cumulativeVerified = 0;
    cumulativeMismatches = 0;
    peakRisk = 'low';
}

/**
 * Record a verification result (called from the verification callback).
 */
export function recordVerificationForSummary(status: string): void {
    if (status === 'verified') cumulativeVerified++;
    else if (status === 'mismatch') cumulativeMismatches++;
}

/**
 * Update peak risk if new risk is higher.
 */
export function updatePeakRisk(risk: RiskLevel): void {
    if ((RISK_ORDER[risk] ?? 0) > (RISK_ORDER[peakRisk] ?? 0)) {
        peakRisk = risk;
    }
}

/**
 * Called on every event to reset the idle timer.
 */
export function onEventReceived(): void {
    const now = Date.now();
    lastEventTimestamp = now;

    // First event sets session start
    if (sessionStartedAt === 0) sessionStartedAt = now;

    // Reset idle tracking if session resumed after an idle summary
    if (sentIdleSummary) sentIdleSummary = false;

    // Reset and restart idle timer
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => handleIdleTimeout(), IDLE_TIMEOUT_MS);
}

function handleIdleTimeout(): void {
    if (sentIdleSummary || sentFinalSummary) return;

    sentIdleSummary = true;
    const summary = buildSummary('interim');
    if (sendFn && summary) {
        sendFn(summary).catch(err =>
            console.error('[SessionSummary] Failed to send idle summary:', err)
        );
    }
}

/**
 * Called to send a final summary (terminal session state).
 */
export function sendFinalSummary(): void {
    if (sentFinalSummary) return;

    sentFinalSummary = true;
    if (idleTimer) clearTimeout(idleTimer);

    const summary = buildSummary('final');
    if (sendFn && summary) {
        sendFn(summary).catch(err =>
            console.error('[SessionSummary] Failed to send final summary:', err)
        );
    }
}

// ─── Report Card Builder ───

function escMd(text: string): string {
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function formatDuration(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min === 0) return `${sec}s`;
    return `${min}m ${sec}s`;
}

function buildSummary(type: 'interim' | 'final'): string | null {
    const state = stateStore.getState();
    const allEvents = stateStore.getAllEvents();

    if (allEvents.length === 0) return null;

    const label = type === 'final' ? 'final' : 'interim';
    const duration = lastEventTimestamp > sessionStartedAt
        ? formatDuration(lastEventTimestamp - sessionStartedAt)
        : 'unknown';

    const shortSessionId = state.sessionId
        ? state.sessionId.slice(0, 8)
        : 'unknown';

    // Latest user request
    const latestRequest = state.originalTask
        ? state.originalTask.slice(0, 80) + (state.originalTask.length > 80 ? '...' : '')
        : 'No user request detected';

    // Tool breakdown: count by tool name
    const toolCounts: Record<string, number> = {};
    for (const e of allEvents) {
        if (e.tool) {
            toolCounts[e.tool] = (toolCounts[e.tool] ?? 0) + 1;
        }
    }
    const toolBreakdown = Object.entries(toolCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => `${name} (${count})`)
        .join(', ');

    // Warnings
    const totalWarnings = state.stats.largeOutputCount
        + state.stats.repeatedActionCount
        + state.stats.riskyActionCount;

    // Risk level
    const RISK_EMOJI: Record<string, string> = {
        critical: '🔴', high: '🟠', medium: '🟡', low: '🟢',
    };
    const riskEmoji = RISK_EMOJI[peakRisk] ?? '⚪';

    // Decisions
    const acked = state.operatorDecisions.filter(d => d.decision === 'acknowledged').length;
    const flagged = state.operatorDecisions.filter(d => d.decision === 'flagged_for_review').length;

    const lines = [
        `🦞 *Session Report Card \\(${escMd(label)}\\)*`,
        ``,
        `🔑 Session: \`${escMd(shortSessionId)}\``,
        `💬 Latest: "${escMd(latestRequest)}"`,
        ``,
        `_Cumulative session stats:_`,
        `⏱ Duration: ${escMd(duration)}`,
        `📊 Events: ${state.stats.totalEvents} total`,
        toolBreakdown ? `🛠 Tools: ${escMd(toolBreakdown)}` : '',
        `⚠️ Warnings: ${totalWarnings} triggered`,
        `${riskEmoji} Peak Risk: ${escMd(peakRisk.toUpperCase())}`,
    ];

    if (acked + flagged > 0) {
        lines.push(`✅ Decisions: ${acked} acknowledged, ${flagged} flagged`);
    }
    if (cumulativeVerified + cumulativeMismatches > 0) {
        lines.push(`🔍 Verifications: ${cumulativeVerified} verified, ${cumulativeMismatches} mismatches`);
    }

    return lines.filter(Boolean).join('\n');
}
