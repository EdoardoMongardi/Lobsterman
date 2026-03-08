import { RiskLevel, RedFlag } from '../core/types';
import { getRiskColors } from './RiskBadge';

export function RiskHero({
    riskLevel,
    topFlag,
    totalFlags,
}: {
    riskLevel: RiskLevel;
    topFlag: RedFlag | null;
    totalFlags: number;
}) {
    const colors = getRiskColors(riskLevel);

    return (
        <div
            className={`rounded-xl border ${colors.border} ${colors.bg} p-6 ${colors.glow}`}
        >
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium uppercase tracking-widest text-gray-500">
                    Risk Level
                </span>
                {totalFlags > 0 && (
                    <span className="text-xs text-gray-500">
                        {totalFlags} active {totalFlags === 1 ? 'warning' : 'warnings'}
                    </span>
                )}
            </div>

            <div className={`text-5xl font-black uppercase tracking-tight ${colors.text} mb-2`}>
                {riskLevel}
            </div>

            {topFlag ? (
                <div className="mt-3 space-y-1">
                    <p className={`text-sm font-semibold ${colors.text}`}>
                        {topFlag.title}
                    </p>
                    <p className="text-sm text-gray-400 leading-snug">
                        {topFlag.reason}
                    </p>
                </div>
            ) : (
                <p className="text-sm text-gray-500 mt-2">
                    {riskLevel === 'low' ? 'All clear — monitoring session.' : 'Monitoring...'}
                </p>
            )}
        </div>
    );
}
