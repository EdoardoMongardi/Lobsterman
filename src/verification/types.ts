/**
 * Verification Types — Phase 8A
 *
 * Independent execution verification for file operations.
 * Scope: ONLY files inside LOBSTERMAN_PROJECT_ROOT.
 */

// ─── Verification Status ───

export type VerificationStatus =
    | 'waiting_for_result'  // tool_call seen, waiting for tool_result
    | 'ready_to_verify'     // tool_result received, ready to check filesystem
    | 'verified'            // filesystem confirms the claimed action
    | 'mismatch'            // filesystem contradicts the claimed action
    | 'unverifiable'        // cannot verify (ambiguous match, path unresolvable, etc.)
    | 'expired';            // no tool_result within timeout

export type VerificationType = 'file_write' | 'file_delete';

// ─── Pending Verification ───

export interface PendingVerification {
    id: string;
    type: VerificationType;
    targetPath: string;          // Absolute path inside project root
    toolCallId?: string;         // For pairing with tool_result
    toolName: string;
    status: VerificationStatus;
    createdAt: number;
    resolvedAt?: number;
    result?: VerificationResult;
}

// ─── Verification Result ───

export interface VerificationResult {
    id: string;
    pendingId: string;
    type: VerificationType;
    targetPath: string;
    status: 'verified' | 'mismatch' | 'unverifiable';
    detail: string;              // Human-readable explanation
    fileSize?: number;           // For write verifications
    timestamp: number;
}

// ─── Verifier Interface ───

export interface Verifier {
    type: VerificationType;
    verify(targetPath: string): VerificationResult;
}

// ─── Callback type ───

export type OnVerificationResult = (result: VerificationResult) => void;
