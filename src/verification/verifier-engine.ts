/**
 * Verifier Engine — Phase 8A, Step 19
 *
 * Orchestrates the verification workflow:
 * 1. On tool_call with write/delete pattern → enqueue PendingVerification
 * 2. On tool_result → match to pending → run verifier → emit result
 * 3. Expire stale pending entries (30s timeout)
 *
 * Scope: ALL detected file paths (inside and outside project root).
 * Scoping decisions are left to the rule engine (ra-path-outside-root).
 */

import { NormalizedEvent } from '../core/types';
import { extractFileOpFromCommand } from '../core/exec-path-extractor';
import {
    PendingVerification,
    VerificationResult,
    VerificationType,
    OnVerificationResult,
} from './types';
import { verifyFileDelete } from './file-delete-verifier';
import { verifyFileWrite } from './file-write-verifier';

const EXPIRATION_MS = 30_000; // 30 seconds

// ─── Direct file tool sets ───

const WRITE_TOOL_NAMES = new Set([
    'Write', 'write', 'write_file', 'write_to_file', 'create_file',
    'Edit', 'edit', 'StrReplace', 'replace_file_content', 'multi_replace_file_content',
]);

const DELETE_TOOL_NAMES = new Set([
    'Delete', 'delete_file',
]);

const EXEC_TOOLS = new Set(['exec', 'Bash', 'bash', 'run_command', 'Shell']);
function getProjectRoot(): string {
    return process.env.LOBSTERMAN_PROJECT_ROOT ?? '';
}

// ─── Detection ───

function isInsideProjectRoot(path: string): boolean {
    const root = getProjectRoot();
    return root !== '' && path.startsWith(root);
}

function detectVerificationType(event: NormalizedEvent): { type: VerificationType; path: string } | null {
    if (event.type !== 'tool_call') return null;

    const toolName = event.tool ?? '';
    const target = event.target ?? '';
    let detected: { type: VerificationType; path: string } | null = null;

    // Direct file tool detection (path is the target directly)
    if (WRITE_TOOL_NAMES.has(toolName) && target.startsWith('/')) {
        detected = { type: 'file_write', path: target };
    } else if (DELETE_TOOL_NAMES.has(toolName) && target.startsWith('/')) {
        detected = { type: 'file_delete', path: target };
    } else if (EXEC_TOOLS.has(toolName) && target) {
        // Exec command detection — parse command string for file operations
        const op = extractFileOpFromCommand(target);
        if (op) {
            detected = {
                type: op.type === 'write' ? 'file_write' : 'file_delete',
                path: op.path,
            };
        }
    }

    if (!detected) return null;

    // Phase 8A boundary: only verify inside LOBSTERMAN_PROJECT_ROOT
    if (!isInsideProjectRoot(detected.path)) {
        console.log(`[Verifier] verification_skipped_out_of_scope: ${detected.type} for ${detected.path}`);
        return null;
    }

    return detected;
}

// ─── Verifier Engine ───

// Process-global state — survives Next.js module reloads
const g = global as typeof global & {
    __lobstermanPendingVerifications?: PendingVerification[];
    __lobstermanVerificationCallback?: OnVerificationResult | null;
    __lobstermanVerificationIdCounter?: number;
};
if (!g.__lobstermanPendingVerifications) g.__lobstermanPendingVerifications = [];
if (g.__lobstermanVerificationCallback === undefined) g.__lobstermanVerificationCallback = null;
if (g.__lobstermanVerificationIdCounter === undefined) g.__lobstermanVerificationIdCounter = 0;

const getPending = () => g.__lobstermanPendingVerifications!;
const setPending = (v: PendingVerification[]) => { g.__lobstermanPendingVerifications = v; };
const getCallback = () => g.__lobstermanVerificationCallback!;
const nextId = () => ++g.__lobstermanVerificationIdCounter!;

export function registerVerificationCallback(cb: OnVerificationResult): void {
    g.__lobstermanVerificationCallback = cb;
}

export function processVerification(event: NormalizedEvent): void {
    // 1. Check for new verifiable tool_calls
    const detection = detectVerificationType(event);
    if (detection) {
        const pv: PendingVerification = {
            id: `pv-${Date.now()}-${nextId()}`,
            type: detection.type,
            targetPath: detection.path,
            toolName: event.tool ?? 'unknown',
            status: 'waiting_for_result',
            createdAt: Date.now(),
        };
        getPending().push(pv);
        console.log(`[Verifier] Queued ${pv.type} for: ${pv.targetPath}`);
    }

    // 2. Check if this is a tool_result that matches a pending entry
    if (event.type === 'tool_result' || event.type === 'error') {
        const toolName = event.tool ?? '';
        const match = findMatchingPending(toolName);

        if (match) {
            if (event.type === 'error') {
                match.status = 'unverifiable';
                match.resolvedAt = Date.now();
                console.log(`[Verifier] Tool error for ${match.targetPath} — marking unverifiable`);
            } else {
                match.status = 'ready_to_verify';
                runVerification(match);
            }
        }
    }

    // 3. Expire stale entries
    expireStale();
}

function findMatchingPending(toolName: string): PendingVerification | null {
    for (const pv of getPending()) {
        if (pv.status !== 'waiting_for_result') continue;
        if (isToolMatch(pv.toolName, toolName)) return pv;
    }
    return null;
}

function isToolMatch(callTool: string, resultTool: string): boolean {
    if (callTool === resultTool) return true;

    const aliases: Record<string, string[]> = {
        exec: ['exec', 'Bash', 'bash', 'run_command', 'Shell'],
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
    const result: VerificationResult = pv.type === 'file_delete'
        ? verifyFileDelete(pv.targetPath, pv.id)
        : verifyFileWrite(pv.targetPath, pv.id);

    pv.status = result.status;
    pv.resolvedAt = Date.now();
    pv.result = result;

    console.log(`[Verifier] ${result.status}: ${result.detail}`);

    const cb = getCallback();
    if (cb) cb(result);
}

function expireStale(): void {
    const now = Date.now();
    for (const pv of getPending()) {
        if (pv.status === 'waiting_for_result' && now - pv.createdAt > EXPIRATION_MS) {
            pv.status = 'expired';
            pv.resolvedAt = now;
            console.log(`[Verifier] Expired: ${pv.type} for ${pv.targetPath}`);
        }
    }
    setPending(getPending().filter(
        (pv: PendingVerification) => pv.status === 'waiting_for_result' || (pv.resolvedAt && now - pv.resolvedAt < 300_000)
    ));
}

export function getVerifications(): PendingVerification[] {
    return [...getPending()];
}

export function clearVerifications(): void {
    setPending([]);
    g.__lobstermanVerificationIdCounter = 0;
}
