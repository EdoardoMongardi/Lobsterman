'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SupervisorState, NormalizedEvent, DashboardResponse, EventsResponse, WatchtowerMode } from '@/core/types';
import { Dashboard } from '@/components/Dashboard';

export default function Home() {
  const [state, setState] = useState<SupervisorState | null>(null);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [mode, setMode] = useState<WatchtowerMode>('demo');
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Use a ref to track the last sequence so the polling callback never goes stale
  const lastSequenceRef = useRef(0);

  const poll = useCallback(async () => {
    try {
      // Fetch dashboard state
      const dashRes = await fetch('/api/dashboard');
      if (dashRes.ok) {
        const data: DashboardResponse = await dashRes.json();
        setState(data.state);
        setUpdatedAt(data.updatedAt);
        setMode(data.mode);
      }

      // Fetch events incrementally using the ref (never stale)
      const eventsRes = await fetch(`/api/events?since=${lastSequenceRef.current}`);
      if (eventsRes.ok) {
        const data: EventsResponse = await eventsRes.json();
        if (data.events.length > 0) {
          // Update the ref to the latest sequence
          const maxSeq = data.events[data.events.length - 1].sequence;
          lastSequenceRef.current = maxSeq;

          setEvents((prev) => [...prev, ...data.events]);
        }
      }
    } catch {
      // Silently fail — will retry on next poll
    }
  }, []);

  // Poll every 2 seconds
  useEffect(() => {
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [poll]);

  // Elapsed timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0a0a0f] text-gray-300">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white tracking-tight">
            Watchtower
          </h1>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
            mode === 'file'
              ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-500/30'
              : 'bg-blue-900/50 text-blue-400 border border-blue-500/30'
          }`}>
            {mode === 'file' ? 'Live Mode' : 'Demo Mode'}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 font-mono">
            {formatElapsed(elapsed)}
          </span>
          {state && (
            <span
              className={`h-2 w-2 rounded-full ${
                state.stats.totalEvents > 0
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-gray-700'
              }`}
            />
          )}
        </div>
      </header>

      {/* Dashboard */}
      <main className="flex-1 min-h-0 p-4 lg:p-6">
        {state ? (
          <Dashboard state={state} events={events} updatedAt={updatedAt} />
        ) : (
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-gray-600 border-t-blue-400 rounded-full mx-auto mb-4" />
              <p className="text-sm text-gray-500">Initializing Watchtower...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
