import { PhaseStatus, SupervisorState } from '../core/types';
import { truncate } from '../lib/utils';

const phaseColors: Record<PhaseStatus, string> = {
    starting: 'bg-blue-600',
    working: 'bg-emerald-600',
    warning: 'bg-amber-600',
    critical: 'bg-red-600',
};

export function SessionSummary({
    originalTask,
    constraints,
    currentPhase,
    stats,
}: {
    originalTask: string;
    constraints: string[];
    currentPhase: PhaseStatus;
    stats: SupervisorState['stats'];
}) {
    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-3">
                Session
            </h3>

            {/* Task */}
            <p className="text-sm text-gray-300 leading-snug mb-3">
                {truncate(originalTask || 'Waiting for session...', 200)}
            </p>

            {/* Constraints */}
            {constraints.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {constraints.map((c, i) => (
                        <span
                            key={i}
                            className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700"
                        >
                            {truncate(c, 50)}
                        </span>
                    ))}
                </div>
            )}

            {/* Phase badge + stats */}
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-800">
                <span
                    className={`text-xs px-2 py-0.5 rounded-full text-white font-medium ${phaseColors[currentPhase]}`}
                >
                    {currentPhase}
                </span>
                <div className="flex gap-3 text-xs text-gray-500">
                    <span>{stats.totalEvents} events</span>
                    {stats.largeOutputCount > 0 && (
                        <span className="text-amber-500">{stats.largeOutputCount} large</span>
                    )}
                    {stats.repeatedActionCount > 0 && (
                        <span className="text-orange-500">{stats.repeatedActionCount} loops</span>
                    )}
                    {stats.riskyActionCount > 0 && (
                        <span className="text-red-500">{stats.riskyActionCount} risky</span>
                    )}
                </div>
            </div>
        </div>
    );
}
