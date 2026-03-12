/**
 * Operator Intent Layer — captures user decisions from Telegram inline buttons.
 *
 * Persists decisions durably to data/decisions.jsonl and loads them on init.
 * Does NOT control flag active/inactive state — that's determined by the rule
 * engine (system state). Operator decisions are audit metadata only.
 *
 * Does NOT send commands to OpenClaw (that's Phase 7C, if API exists).
 */

import * as fs from 'fs';
import * as path from 'path';
import { OperatorDecision, OperatorDecisionType } from '../core/types';
import { stateStore } from '../core/state-store';

const DATA_DIR = path.join(process.cwd(), 'data');
const DECISIONS_FILE = path.join(DATA_DIR, 'decisions.jsonl');

// Process-global state — survives Next.js module reloads
const g = global as typeof global & {
    __lobstermanDecisions?: OperatorDecision[];
    __lobstermanDecisionIdCounter?: number;
};
if (!g.__lobstermanDecisions) g.__lobstermanDecisions = [];
if (g.__lobstermanDecisionIdCounter === undefined) g.__lobstermanDecisionIdCounter = 0;

const getDecisionsArr = () => g.__lobstermanDecisions!;
const setDecisionsArr = (v: OperatorDecision[]) => { g.__lobstermanDecisions = v; };

/**
 * Load persisted decisions from disk on startup.
 */
export function loadDecisions(): void {
    if (!fs.existsSync(DECISIONS_FILE)) return;

    try {
        const raw = fs.readFileSync(DECISIONS_FILE, 'utf-8');
        const lines = raw.split('\n').filter((l) => l.trim());
        setDecisionsArr([]);
        for (const line of lines) {
            try {
                const d = JSON.parse(line) as OperatorDecision;
                getDecisionsArr().push(d);
                g.__lobstermanDecisionIdCounter!++;
            } catch {
                // Skip malformed lines
            }
        }
        // Sync loaded decisions into supervisor state
        stateStore.updateState({ operatorDecisions: [...getDecisionsArr()] });
        console.log(`[Lobsterman] Loaded ${getDecisionsArr().length} operator decisions from disk`);
    } catch (err) {
        console.warn('[Lobsterman] Failed to load decisions file:', err);
    }
}

/**
 * Record an operator decision from a Telegram inline button press.
 *
 * Important: This does NOT clear the active flag. The flag remains active
 * until the rule engine determines it should be resolved (rule no longer
 * true, session ends, or display-aging TTL).
 */
export function recordDecision(
    decision: OperatorDecisionType,
    ruleId?: string,
    flagId?: string,
    userId?: string,
): OperatorDecision {
    const entry: OperatorDecision = {
        id: `op-${Date.now()}-${++g.__lobstermanDecisionIdCounter!}`,
        timestamp: Date.now(),
        decision,
        ruleId,
        flagId,
        userId,
    };
    getDecisionsArr().push(entry);

    // Persist to disk (append)
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        fs.appendFileSync(DECISIONS_FILE, JSON.stringify(entry) + '\n');
    } catch (err) {
        console.warn('[Lobsterman] Failed to persist decision:', err);
    }

    // Update supervisor state so dashboard reflects decisions
    stateStore.updateState({ operatorDecisions: [...getDecisionsArr()] });

    console.log(`[Lobsterman] Operator decision: ${decision}${ruleId ? ` (rule: ${ruleId})` : ''}`);
    return entry;
}

/**
 * Get all recorded operator decisions.
 */
export function getDecisions(): OperatorDecision[] {
    return [...getDecisionsArr()];
}

/**
 * Get recent decisions (last N).
 */
export function getRecentDecisions(count: number = 10): OperatorDecision[] {
    return getDecisionsArr().slice(-count);
}

/**
 * Clear all stored decisions (used on engine reset).
 * Also deletes the persisted file.
 */
export function clearDecisions(): void {
    setDecisionsArr([]);
    g.__lobstermanDecisionIdCounter = 0;
    try {
        if (fs.existsSync(DECISIONS_FILE)) {
            fs.unlinkSync(DECISIONS_FILE);
        }
    } catch {
        // Ignore cleanup errors
    }
    stateStore.updateState({ operatorDecisions: [] });
}
