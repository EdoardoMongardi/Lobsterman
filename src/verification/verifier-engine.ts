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

import * as os from 'os';
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
const HOME_DIR = os.homedir();
const EXPIRATION_MS = 30_000; // 30 seconds

// ─── Pattern detection ───

const WRITE_TOOL_NAMES = new Set([
    'Write', 'write', 'write_file', 'write_to_file', 'create_file',
    'Edit', 'edit', 'StrReplace', 'replace_file_content', 'multi_replace_file_content',
]);

const DELETE_TOOL_NAMES = new Set([
    'Delete', 'delete_file',
]);

const EXEC_TOOLS = new Set(['exec', 'Bash', 'bash', 'run_command', 'Shell']);

// ─── Path resolution helpers ───

function resolveHome(p: string): string {
    return p
        .replace(/\$HOME/g, HOME_DIR)
        .replace(/~/g, HOME_DIR);
}

/**
 * Extract file path from exec commands. Returns resolved absolute path or null.
 */
function extractPathFromExec(command: string): { type: VerificationType; path: string } | null {
    // 1. Detect osascript-based delete operations
    //    Pattern: osascript with "delete" + POSIX path extraction
    if (/osascript[\s\S]*delete/i.test(command) || /osascript[\s\S]*trash/i.test(command)) {
        // Try to extract path from: set varName to POSIX path of (path to home folder) & "relative/path"
        const posixMatch = command.match(
            /POSIX\s+path\s+of\s+\(path\s+to\s+home\s+folder\)\s*&\s*"([^"]+)"/i
        );
        if (posixMatch) {
            const resolved = HOME_DIR + '/' + posixMatch[1];
            if (resolved.startsWith(PROJECT_ROOT)) {
                return { type: 'file_delete', path: resolved };
            }
        }

        // Try: set varName to POSIX file "absolute/path"
        const posixFileMatch = command.match(/POSIX\s+file\s+"([^"]+)"/i);
        if (posixFileMatch) {
            const resolved = resolveHome(posixFileMatch[1]);
            if (resolved.startsWith(PROJECT_ROOT)) {
                return { type: 'file_delete', path: resolved };
            }
        }

        // Try: (POSIX path of (path to desktop folder)) & "relative/"
        const desktopMatch = command.match(
            /POSIX\s+path\s+of\s+\(path\s+to\s+desktop\s+folder\)\)\s*&\s*"([^"]+)"/i
        );
        if (desktopMatch) {
            const resolved = HOME_DIR + '/Desktop/' + desktopMatch[1];
            if (resolved.startsWith(PROJECT_ROOT)) {
                return { type: 'file_delete', path: resolved };
            }
        }

        return null; // osascript but can't extract path, skip verification
    }

    // 2. Detect shell-based write operations
    //    Pattern: cat > "path" or echo ... > path or tee path

    // cat > "$HOME/path/file" <<'EOF'  or  cat > /absolute/path
    const catRedirect = command.match(/cat\s+>\s*"?([^"<\n]+)"?\s*/);
    if (catRedirect) {
        const resolved = resolveHome(catRedirect[1].trim());
        if (resolved.startsWith(PROJECT_ROOT)) {
            return { type: 'file_write', path: resolved };
        }
    }

    // echo "..." > "path"
    const echoRedirect = command.match(/echo\s+.*>\s*"?([^"<\n]+)"?\s*$/m);
    if (echoRedirect) {
        const resolved = resolveHome(echoRedirect[1].trim());
        if (resolved.startsWith(PROJECT_ROOT)) {
            return { type: 'file_write', path: resolved };
        }
    }

    // printf "..." > "path"
    const printfRedirect = command.match(/printf\s+.*>\s*"?([^"<\n]+)"?\s*$/m);
    if (printfRedirect) {
        const resolved = resolveHome(printfRedirect[1].trim());
        if (resolved.startsWith(PROJECT_ROOT)) {
            return { type: 'file_write', path: resolved };
        }
    }

    // 3. Detect rm-based delete
    const rmMatch = command.match(/rm\s+(?:-\w+\s+)*"?([^"<\n\s]+)"?\s*/);
    if (rmMatch) {
        const resolved = resolveHome(rmMatch[1].trim());
        if (resolved.startsWith(PROJECT_ROOT)) {
            return { type: 'file_delete', path: resolved };
        }
    }

    return null;
}

function detectVerificationType(event: NormalizedEvent): { type: VerificationType; path: string } | null {
    if (event.type !== 'tool_call') return null;

    const toolName = event.tool ?? '';
    const target = event.target ?? '';

    // Direct file tool detection
    if (WRITE_TOOL_NAMES.has(toolName) && target && target.startsWith(PROJECT_ROOT)) {
        return { type: 'file_write', path: target };
    }

    if (DELETE_TOOL_NAMES.has(toolName) && target && target.startsWith(PROJECT_ROOT)) {
        return { type: 'file_delete', path: target };
    }

    // Exec command detection — parse command string for file operations
    if (EXEC_TOOLS.has(toolName) && target) {
        return extractPathFromExec(target);
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
    for (const pv of pending) {
        if (pv.status !== 'waiting_for_result') continue;
        if (isToolMatch(pv.toolName, toolName)) {
            return pv;
        }
    }
    return null;
}

function isToolMatch(callTool: string, resultTool: string): boolean {
    if (callTool === resultTool) return true;

    const aliases: Record<string, string[]> = {
        write_to_file: ['write_to_file', 'Write', 'write', 'write_file', 'create_file'],
        replace_file_content: ['replace_file_content', 'Edit', 'edit', 'StrReplace', 'multi_replace_file_content'],
        delete_file: ['delete_file', 'Delete'],
        exec: ['exec', 'Bash', 'bash', 'run_command', 'Shell'],
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
    pending = pending.filter(
        (pv) => pv.status === 'waiting_for_result' || (pv.resolvedAt && now - pv.resolvedAt < 300_000)
    );
}

export function getVerifications(): PendingVerification[] {
    return [...pending];
}

export function clearVerifications(): void {
    pending = [];
    idCounter = 0;
}
