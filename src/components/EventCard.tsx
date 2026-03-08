import { NormalizedEvent, EventType } from '../core/types';
import { formatTimestamp } from '../lib/utils';

const typeBadgeColors: Record<EventType, string> = {
    tool_call: 'bg-blue-900/50 text-blue-400',
    tool_result: 'bg-cyan-900/50 text-cyan-400',
    assistant_message: 'bg-purple-900/50 text-purple-400',
    user_message: 'bg-green-900/50 text-green-400',
    error: 'bg-red-900/50 text-red-400',
    system: 'bg-gray-700 text-gray-400',
};

export function EventCard({
    event,
    isFlagged = false,
}: {
    event: NormalizedEvent;
    isFlagged?: boolean;
}) {
    return (
        <div
            className={`flex items-start gap-2 py-2 px-3 rounded-lg text-sm transition-colors ${isFlagged
                    ? 'border-l-2 border-l-red-500 bg-red-900/10'
                    : 'hover:bg-gray-800/50'
                }`}
            title={event.rawSnippet ?? undefined}
        >
            {/* Sequence number */}
            <span className="text-xs text-gray-600 font-mono min-w-[32px] pt-0.5">
                #{event.sequence}
            </span>

            {/* Timestamp */}
            <span className="text-xs text-gray-500 font-mono min-w-[65px] pt-0.5">
                {formatTimestamp(event.timestamp)}
            </span>

            {/* Type badge */}
            <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium min-w-[72px] text-center ${typeBadgeColors[event.type]
                    }`}
            >
                {event.type.replace('_', ' ')}
            </span>

            {/* Summary */}
            <span className="text-gray-300 flex-1 truncate">
                {event.summary}
            </span>
        </div>
    );
}
