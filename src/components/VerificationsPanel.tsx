'use client';

import { useState, useEffect, useCallback } from 'react';

interface VerificationEntry {
    id: string;
    type: string;
    targetPath: string;
    status: string;
    detail: string;
    fileSize?: number;
    createdAt: number;
    resolvedAt?: number;
}

interface VerificationSummary {
    verified: number;
    mismatches: number;
    pending: number;
    unverifiable: number;
    total: number;
}

export function VerificationsPanel() {
    const [entries, setEntries] = useState<VerificationEntry[]>([]);
    const [summary, setSummary] = useState<VerificationSummary>({ verified: 0, mismatches: 0, pending: 0, unverifiable: 0, total: 0 });

    const poll = useCallback(async () => {
        try {
            const res = await fetch('/api/verifications');
            if (res.ok) {
                const data = await res.json();
                setEntries(data.verifications);
                setSummary(data.summary);
            }
        } catch { /* retry next poll */ }
    }, []);

    useEffect(() => {
        poll();
        const interval = setInterval(poll, 3000);
        return () => clearInterval(interval);
    }, [poll]);

    const statusIcon = (status: string) => {
        switch (status) {
            case 'verified': return '✅';
            case 'mismatch': return '❌';
            case 'unverifiable': return '⚠️';
            case 'waiting_for_result': return '⏳';
            default: return '•';
        }
    };

    const statusColor = (status: string) => {
        switch (status) {
            case 'verified': return 'text-emerald-400';
            case 'mismatch': return 'text-red-400';
            case 'unverifiable': return 'text-yellow-400';
            default: return 'text-gray-400';
        }
    };

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Verification Results
            </h3>

            {/* Summary counters */}
            <div className="flex gap-4 mb-3 text-xs">
                <span className="text-emerald-400">✅ {summary.verified}</span>
                <span className="text-red-400">❌ {summary.mismatches}</span>
                {summary.pending > 0 && <span className="text-blue-400">⏳ {summary.pending}</span>}
                {summary.unverifiable > 0 && <span className="text-yellow-400">⚠️ {summary.unverifiable}</span>}
            </div>

            {/* Recent entries */}
            {entries.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No verifications yet.</p>
            ) : (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {entries.slice(-8).reverse().map((entry) => {
                        const shortPath = entry.targetPath.split('/').slice(-2).join('/');
                        return (
                            <div key={entry.id} className="flex items-center gap-2 text-xs">
                                <span>{statusIcon(entry.status)}</span>
                                <span className={statusColor(entry.status)}>
                                    {entry.type === 'file_write' ? 'Write' : 'Delete'}
                                </span>
                                <span className="text-gray-500 truncate flex-1" title={entry.targetPath}>
                                    {shortPath}
                                </span>
                                {entry.fileSize !== undefined && (
                                    <span className="text-gray-600">{entry.fileSize}B</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
