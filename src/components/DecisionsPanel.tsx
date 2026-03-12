'use client';

import { useState, useEffect, useCallback } from 'react';

interface OperatorDecision {
    id: string;
    flagId: string;
    ruleId: string;
    type: string;
    reason: string;
    timestamp: number;
}

export function DecisionsPanel() {
    const [decisions, setDecisions] = useState<OperatorDecision[]>([]);

    const poll = useCallback(async () => {
        try {
            const res = await fetch('/api/decisions');
            if (res.ok) {
                const data = await res.json();
                setDecisions(data.decisions);
            }
        } catch { /* retry next poll */ }
    }, []);

    useEffect(() => {
        poll();
        const interval = setInterval(poll, 3000);
        return () => clearInterval(interval);
    }, [poll]);

    const acked = decisions.filter(d => d.type === 'acknowledged').length;
    const flagged = decisions.filter(d => d.type === 'flagged').length;

    const typeIcon = (type: string) => type === 'acknowledged' ? '✅' : '🚩';
    const typeColor = (type: string) => type === 'acknowledged' ? 'text-emerald-400' : 'text-amber-400';

    return (
        <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Operator Decisions
            </h3>

            {/* Summary */}
            <div className="flex gap-4 mb-3 text-xs">
                <span className="text-emerald-400">✅ {acked} ack</span>
                <span className="text-amber-400">🚩 {flagged} flagged</span>
            </div>

            {/* Recent decisions */}
            {decisions.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No operator decisions yet.</p>
            ) : (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {decisions.slice(-8).reverse().map((d) => (
                        <div key={d.id} className="flex items-center gap-2 text-xs">
                            <span>{typeIcon(d.type)}</span>
                            <span className={typeColor(d.type)}>
                                {d.type === 'acknowledged' ? 'Ack' : 'Flag'}
                            </span>
                            <span className="text-gray-500 truncate flex-1">
                                {d.ruleId}
                            </span>
                            <span className="text-gray-600 text-[10px]">
                                {new Date(d.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
