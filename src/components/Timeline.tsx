'use client';

import { useRef, useEffect } from 'react';
import { NormalizedEvent } from '../core/types';
import { EventCard } from './EventCard';

export function Timeline({
    events,
    flaggedEventIds,
}: {
    events: NormalizedEvent[];
    flaggedEventIds: Set<string>;
}) {
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new events arrive
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [events.length]);

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
                <h3 className="text-xs font-medium uppercase tracking-widest text-gray-500">
                    Event Timeline
                </h3>
                <span className="text-xs text-gray-600">{events.length} events</span>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-0.5">
                {events.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-gray-600">Waiting for events...</p>
                    </div>
                ) : (
                    <>
                        {events.map((event) => (
                            <EventCard
                                key={event.id}
                                event={event}
                                isFlagged={flaggedEventIds.has(event.id)}
                            />
                        ))}
                        <div ref={bottomRef} />
                    </>
                )}
            </div>
        </div>
    );
}
