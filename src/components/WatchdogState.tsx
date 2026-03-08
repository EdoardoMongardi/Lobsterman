import { ProgressMarker, KeyAction } from '../core/types';
import { formatRelativeTime } from '../lib/utils';

export function WatchdogState({
    progressMarkers,
    recentKeyActions,
    lastMeaningfulProgressAt,
}: {
    progressMarkers: ProgressMarker[];
    recentKeyActions: KeyAction[];
    lastMeaningfulProgressAt: number | null;
}) {
    const lastProgressAgo = lastMeaningfulProgressAt
        ? (Date.now() - lastMeaningfulProgressAt) / 1000
        : null;

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
            <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-3">
                Watchdog State
            </h3>

            {/* Last progress indicator */}
            {lastProgressAgo !== null && (
                <div className="mb-4">
                    <span
                        className={`text-xs ${lastProgressAgo > 300 ? 'text-red-400' : 'text-gray-400'
                            }`}
                    >
                        Last progress:{' '}
                        {lastMeaningfulProgressAt
                            ? formatRelativeTime(lastMeaningfulProgressAt)
                            : 'Never'}
                    </span>
                </div>
            )}

            {/* Progress markers */}
            {progressMarkers.length > 0 && (
                <div className="mb-4">
                    <h4 className="text-xs text-gray-500 mb-2 font-medium">
                        Progress ({progressMarkers.length})
                    </h4>
                    <div className="space-y-1 max-h-[180px] overflow-y-auto">
                        {progressMarkers.slice(-8).map((marker, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="text-emerald-500">✓</span>
                                <span className="text-gray-400">{marker.description}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent key actions */}
            {recentKeyActions.length > 0 && (
                <div>
                    <h4 className="text-xs text-gray-500 mb-2 font-medium">
                        Recent Actions
                    </h4>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto">
                        {recentKeyActions.slice(-5).map((action, i) => (
                            <div key={i} className="text-xs text-gray-500 truncate">
                                #{action.sequence} {action.summary}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {progressMarkers.length === 0 && recentKeyActions.length === 0 && (
                <p className="text-xs text-gray-600">No progress recorded yet.</p>
            )}
        </div>
    );
}
