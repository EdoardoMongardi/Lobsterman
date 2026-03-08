import { RedFlag, RedFlagCategory } from '../core/types';
import { RiskBadge, CategoryLabel } from './RiskBadge';

export function RedFlagsPanel({ flags }: { flags: RedFlag[] }) {
    if (flags.length === 0) {
        return (
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-3">
                <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">
                    Active Warnings
                </h3>
                <p className="text-xs text-gray-600">No active warnings.</p>
            </div>
        );
    }

    // Group by category
    const grouped = flags.reduce(
        (acc, flag) => {
            if (!acc[flag.category]) acc[flag.category] = [];
            acc[flag.category].push(flag);
            return acc;
        },
        {} as Record<RedFlagCategory, RedFlag[]>
    );

    const categoryOrder: RedFlagCategory[] = ['context_danger', 'looping', 'risky_action'];

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-5 py-3">
            <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-2">
                Active Warnings ({flags.length})
            </h3>
            <div className="max-h-[240px] overflow-y-auto space-y-2">
                {categoryOrder.map((category) => {
                    const categoryFlags = grouped[category];
                    if (!categoryFlags || categoryFlags.length === 0) return null;
                    return (
                        <div key={category}>
                            <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                <CategoryLabel category={category} />
                            </h4>
                            {categoryFlags.map((flag) => (
                                <div
                                    key={flag.id}
                                    className="flex items-start gap-2 py-1.5 px-2 rounded bg-gray-800/40 mb-1"
                                >
                                    <RiskBadge level={flag.severity} size="sm" />
                                    <div className="flex-1 min-w-0">
                                        <span className="text-xs font-medium text-gray-200">
                                            {flag.title}
                                        </span>
                                        <span className="text-[10px] text-gray-500 ml-1.5">
                                            {flag.reason}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
