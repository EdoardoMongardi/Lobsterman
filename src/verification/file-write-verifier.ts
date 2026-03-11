/**
 * FileWriteVerifier — Phase 8A, Step 18
 *
 * Verifies that a file was actually written after the agent claims to have written it.
 * Checks: exists AND non-empty.
 * Only operates on paths inside LOBSTERMAN_PROJECT_ROOT.
 */

import * as fs from 'fs';
import { VerificationResult, VerificationType } from './types';

function getProjectRoot(): string {
    return process.env.LOBSTERMAN_PROJECT_ROOT ?? '';
}

export function verifyFileWrite(targetPath: string, pendingId: string): VerificationResult {
    const id = `vr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const base: Omit<VerificationResult, 'status' | 'detail' | 'fileSize'> = {
        id,
        pendingId,
        type: 'file_write' as VerificationType,
        targetPath,
        timestamp: Date.now(),
    };

    // Safety: only verify inside project root
    if (!targetPath.startsWith(getProjectRoot()) || !getProjectRoot()) {
        return { ...base, status: 'unverifiable', detail: `Path outside project root: ${targetPath}` };
    }

    try {
        if (!fs.existsSync(targetPath)) {
            // File missing → mismatch
            return { ...base, status: 'mismatch', detail: `Agent claimed write, but ${targetPath} does not exist` };
        }

        const stat = fs.statSync(targetPath);
        if (stat.size === 0) {
            // File exists but empty → mismatch
            return { ...base, status: 'mismatch', detail: `Agent claimed write, but ${targetPath} is empty (0 bytes)` };
        }

        // File exists and non-empty → verified
        return {
            ...base,
            status: 'verified',
            detail: `Confirmed write: ${targetPath} (${stat.size} bytes)`,
            fileSize: stat.size,
        };
    } catch (err) {
        return { ...base, status: 'unverifiable', detail: `Cannot check path: ${err}` };
    }
}
