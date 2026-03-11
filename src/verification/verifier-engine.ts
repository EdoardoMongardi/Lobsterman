/**
 * Verifier Engine — Phase 8A, Step 19
 *
 * Orchestrates the verification workflow:
 * 1. On tool_call with write/delete pattern → enqueue PendingVerification
 * 2. On tool_result → match to pending → run verifier → emit result
 * 3. Expire stale pending entries (30s timeout)
 *
 * Scope: ONLY paths inside LOBSTERMAN_PROJECT_ROOT.
 */

import { NormalizedEvent } from '../core/types';
import {
    PendingVerification,
    VerificationResult,
    VerificationType,
    OnVerificationResult,
} from './types';
import { verifyFileDelete } from './file-delete-verifier';
import { verifyFileWrite } from './file-write-verifier';

const PROJECT_ROOT = process.env.LOBSTERMAN_PROJECT_ROOT ?? '';
const EXPIRATION_MS = 30_000; // 30 seconds

// ─── Pattern detection ───

const WRITE_TOOL_NAMES = new Set([
    'Write', 'write', 'write_file', 'write_to_file', 'create_file',
    'Edit', 'edit', 'StrReplace', 'replace_file_content', 'multi_replace_file_content',
]);

const DELETE_TOOL_NAMES = new Set([
    'Delete', 'delete_file',
]);

// For exec commands, check the command string for write/delete intent
const EXEC_WRITE_PATTERNS = [
    />\s+\S+/,           // redirect to file
    /tee\s+/,            // tee to file
    /cp\s+/,             // copy
    /echo\s+.*>\s*/,     // echo to file
];

const EXEC_DELETE_PATTERNS = [
    /rm\s+/i,
    /unlink\s+/i,
    /trash\s+/i,
    /osascript[\s\S]*delete/i,
    /osascript[\s\S]*trash/i,
];

function detectVerificationType(event: NormalizedEvent): { type: VerificationType; path: string } | null {
    if (event.type !== 'tool_call') return null;

    const toolName = event.tool ?? '';
    const target = event.target ?? '';

    // Direct file tool detection
    if (WRITE_TOOL_NAMES.has(toolName) && target) {
        if (!target.startsWith('/') || !target.startsWith(PROJECT_ROOT)) {
            // Only verify absolute paths inside project root
            if (target.startsWith(PROJECT_ROOT)) {
                return { type: 'file_write', path: target };
            }
            return null;
        }
        return { type: 'file_write', path: target };
    }

    if (DELETE_TOOL_NAMES.has(toolName) && target) {
        if (target.startsWith(PROJECT_ROOT)) {
            return { type: 'file_delete', path: target };
        }
        return null;
    }

    // Exec command detection — check target (command string) for patterns
    if (toolName === 'exec' || toolName === 'Bash' || toolName === 'bash' || toolName === 'run_command') {
        for (const pattern of EXEC_DELETE_PATTERNS) {
            if (pattern.test(target)) {
                // We can't reliably extract the exact file path from exec commands
                // so we skip verification for exec-based operations
                return null;
            }
        }
    }

    return null;
}

// ─── Verifier Engine ───

let pending: PendingVerification[] = [];
let callback: OnVerificationResult | null = null;
let idCounter = 0;

export function registerVerificationCallback(cb: OnVerificationResult): void {
    callback = cb;
}

/**
 * Process an event through the verification pipeline.
 * Called from handleEvent in engine.ts.
 */
export function processVerification(event: NormalizedEvent): void {
    // 1. Check for new verifiable tool_calls
    const detection = detectVerificationType(event);
    if (detection) {
        const pv: PendingVerification = {
            id: `pv-${Date.now()}-${++idCounter}`,
            type: detection.type,
            targetPath: detection.path,
            toolCallId: event.tags?.find(t => t.startsWith('tc_')) ?? undefined,
            toolName: event.tool ?? 'unknown',
            status: 'waiting_for_result',
            createdAt: Date.now(),
        };
        pending.push(pv);
        console.log(`[Verifier] Queued ${pv.type} verification for: ${pv.targetPath}`);
    }

    // 2. Check if this is a tool_result that matches a pending entry
    if (event.type === 'tool_result' || event.type === 'error') {
        const toolName = event.tool ?? '';
        // Find the nearest unmatched pending entry for the same tool family
        const match = findMatchingPending(toolName, event);

        if (match) {
            if (event.type === 'error') {
                // Tool errored — mark as unverifiable
                match.status = 'unverifiable';
                match.resolvedAt = Date.now();
                console.log(`[Verifier] Tool error for ${match.targetPath} — marking unverifiable`);
            } else {
                // Tool succeeded — run verification
                match.status = 'ready_to_verify';
                runVerification(match);
            }
        }
    }

    // 3. Expire stale entries
    expireStale();
}

function findMatchingPending(toolName: string, event: NormalizedEvent): PendingVerification | null {
    // Find the oldest 'waiting_for_result' entry whose tool name matches
    for (const pv of pending) {
        if (pv.status !== 'waiting_for_result') continue;

        // Match by tool family: if the result tool matches the call tool
        if (isToolMatch(pv.toolName, toolName)) {
            return pv;
        }
    }
    return null;
}

function isToolMatch(callTool: string, resultTool: string): boolean {
    // Exact match
    if (callTool === resultTool) return true;

    // Common aliases
    const aliases: Record<string, string[]> = {
        write_to_file: ['write_to_file', 'Write', 'write', 'write_file', 'create_file'],
        replace_file_content: ['replace_file_content', 'Edit', 'edit', 'StrReplace', 'multi_replace_file_content'],
        delete_file: ['delete_file', 'Delete'],
    };

    for (const group of Object.values(aliases)) {
        if (group.includes(callTool) && group.includes(resultTool)) return true;
    }

    return false;
}

function runVerification(pv: PendingVerification): void {
    let result: VerificationResult;

    if (pv.type === 'file_delete') {
        result = verifyFileDelete(pv.targetPath, pv.id);
    } else {
        result = verifyFileWrite(pv.targetPath, pv.id);
    }

    pv.status = result.status;
    pv.resolvedAt = Date.now();
    pv.result = result;

    console.log(`[Verifier] ${result.status}: ${result.detail}`);

    // Fire callback
    if (callback) {
        callback(result);
    }
}

function expireStale(): void {
    const now = Date.now();
    for (const pv of pending) {
        if (pv.status === 'waiting_for_result' && now - pv.createdAt > EXPIRATION_MS) {
            pv.status = 'expired';
            pv.resolvedAt = now;
            console.log(`[Verifier] Expired: ${pv.type} for ${pv.targetPath} (no tool_result within ${EXPIRATION_MS / 1000}s)`);
        }
    }
    // Cleanup: remove resolved entries older than 5 minutes
    pending = pending.filter(
        (pv) => pv.status === 'waiting_for_result' || (pv.resolvedAt && now - pv.resolvedAt < 300_000)
    );
}

/**
 * Get all pending and recent verification entries (for dashboard).
 */
export function getVerifications(): PendingVerification[] {
    return [...pending];
}

/**
 * Clear all verification state (on session switch / reset).
 */
export function clearVerifications(): void {
    pending = [];
    idCounter = 0;
}
