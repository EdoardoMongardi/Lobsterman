'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SupervisorState, NormalizedEvent, DashboardResponse, EventsResponse, LobstermanMode, RiskLevel } from '@/core/types';
import { riskLevelToNumber } from '@/lib/utils';
import { Dashboard } from '@/components/Dashboard';

function notifyRiskEscalation(level: RiskLevel, topReason?: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'denied') return;

  const requestAndNotify = async () => {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission !== 'granted') return;

    const title = `Lobsterman — Risk: ${level.toUpperCase()}`;
    const body = topReason
      ? topReason.slice(0, 100) + (topReason.length > 100 ? '…' : '')
      : 'Check the dashboard for details.';
    new Notification(title, { body });
  };

  requestAndNotify();
}

export default function Home() {
  const [state, setState] = useState<SupervisorState | null>(null);
  const [events, setEvents] = useState<NormalizedEvent[]>([]);
  const [updatedAt, setUpdatedAt] = useState(0);
  const [mode, setMode] = useState<LobstermanMode>('demo');
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [resetting, setResetting] = useState(false);

  // Use a ref to track the last sequence so the polling callback never goes stale
  const lastSequenceRef = useRef(0);
  const previousRiskRef = useRef<RiskLevel>('low');

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

  // Browser notification on risk escalation
  useEffect(() => {
    if (!state || state.stats.totalEvents === 0) return;
    const current = state.riskLevel;
    const prev = previousRiskRef.current;
    if (riskLevelToNumber(current) > riskLevelToNumber(prev)) {
      const topFlag = state.activeRedFlags[0];
      notifyRiskEscalation(current, topFlag?.reason);
      previousRiskRef.current = current;
    } else if (current !== prev) {
      previousRiskRef.current = current;
    }
  }, [state]);

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

  const handleReset = useCallback(async () => {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) {
        lastSequenceRef.current = 0;
        setEvents([]);
        setState(null);
        setStartTime(Date.now());
        setElapsed(0);
        previousRiskRef.current = 'low';
        await poll();
      }
    } finally {
      setResetting(false);
    }
  }, [resetting, poll]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0a0a0f] text-gray-300">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-white tracking-tight">
            Lobsterman
          </h1>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${mode === 'file'
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
              className={`h-2 w-2 rounded-full ${state.stats.totalEvents > 0
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-gray-700'
                }`}
            />
          )}
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="text-xs px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {resetting ? 'Resetting…' : 'Reset'}
          </button>
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
              <p className="text-sm text-gray-500">Initializing Lobsterman...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
