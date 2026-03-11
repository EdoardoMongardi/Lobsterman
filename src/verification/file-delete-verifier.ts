/**
 * FileDeleteVerifier — Phase 8A, Step 17
 *
 * Verifies that a file was actually deleted after the agent claims to have deleted it.
 * Only operates on paths inside LOBSTERMAN_PROJECT_ROOT.
 */

import * as fs from 'fs';
import { VerificationResult, VerificationType } from './types';

const PROJECT_ROOT = process.env.LOBSTERMAN_PROJECT_ROOT ?? '';

export function verifyFileDelete(targetPath: string, pendingId: string): VerificationResult {
    const id = `vr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const base: Omit<VerificationResult, 'status' | 'detail' | 'fileSize'> = {
        id,
        pendingId,
        type: 'file_delete' as VerificationType,
        targetPath,
        timestamp: Date.now(),
    };

    // Safety: ensure path is inside project root
    if (!targetPath.startsWith(PROJECT_ROOT) || !PROJECT_ROOT) {
        return { ...base, status: 'unverifiable', detail: `Path outside project root: ${targetPath}` };
    }

    try {
        if (fs.existsSync(targetPath)) {
            // File still exists → mismatch
            const stat = fs.statSync(targetPath);
            return {
                ...base,
                status: 'mismatch',
                detail: `Agent claimed deletion, but ${targetPath} still exists (${stat.size} bytes)`,
                fileSize: stat.size,
            };
        } else {
            // File gone → verified
            return { ...base, status: 'verified', detail: `Confirmed removed: ${targetPath}` };
        }
    } catch (err) {
        return { ...base, status: 'unverifiable', detail: `Cannot check path: ${err}` };
    }
}
