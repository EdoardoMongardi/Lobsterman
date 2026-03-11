/**
 * Operator Intent Layer — captures user decisions from Telegram inline buttons.
 *
 * Records decisions in-memory and persists them. Does NOT send commands
 * to OpenClaw (that's Phase 7C, after API verification).
 */

import { OperatorDecision, OperatorDecisionType } from '../core/types';

const decisions: OperatorDecision[] = [];

let idCounter = 0;

/**
 * Record an operator decision from a Telegram inline button press.
 */
export function recordDecision(
    decision: OperatorDecisionType,
    ruleId?: string,
    flagId?: string,
    userId?: string,
): OperatorDecision {
    const entry: OperatorDecision = {
        id: `op-${Date.now()}-${++idCounter}`,
        timestamp: Date.now(),
        decision,
        ruleId,
        flagId,
        userId,
    };
    decisions.push(entry);

    console.log(`[Lobsterman] Operator decision: ${decision}${ruleId ? ` (rule: ${ruleId})` : ''}`);
    return entry;
}

/**
 * Get all recorded operator decisions.
 */
export function getDecisions(): OperatorDecision[] {
    return [...decisions];
}

/**
 * Get recent decisions (last N).
 */
export function getRecentDecisions(count: number = 10): OperatorDecision[] {
    return decisions.slice(-count);
}

/**
 * Clear all stored decisions (used on engine reset).
 */
export function clearDecisions(): void {
    decisions.length = 0;
    idCounter = 0;
}
