import { NextResponse } from 'next/server';
import { getVerifications } from '@/verification/verifier-engine';

export const dynamic = 'force-dynamic';

export async function GET() {
    const verifications = getVerifications();
    const verified = verifications.filter(v => v.status === 'verified' || (v.result && v.result.status === 'verified')).length;
    const mismatches = verifications.filter(v => v.status === 'mismatch' || (v.result && v.result.status === 'mismatch')).length;
    const pending = verifications.filter(v => v.status === 'waiting_for_result' || v.status === 'ready_to_verify').length;
    const unverifiable = verifications.filter(v => v.status === 'unverifiable' || (v.result && v.result.status === 'unverifiable')).length;

    return NextResponse.json({
        verifications: verifications.map(v => ({
            id: v.id,
            type: v.type,
            targetPath: v.targetPath,
            status: v.result?.status ?? v.status,
            detail: v.result?.detail ?? '',
            fileSize: v.result?.fileSize,
            createdAt: v.createdAt,
            resolvedAt: v.resolvedAt,
        })),
        summary: { verified, mismatches, pending, unverifiable, total: verifications.length },
    });
}
