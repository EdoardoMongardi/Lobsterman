import { Rule, NormalizedEvent, SupervisorState, RedFlag } from '../core/types';

export const loopingRules: Rule[] = [
    {
        id: 'lp-repeated-tool-target',
        category: 'looping',
        name: 'Repeated Tool+Target',
        enabled: true,
        evaluate(
            event: NormalizedEvent,
            _state: SupervisorState,
            recentEvents: NormalizedEvent[]
        ): RedFlag | null {
            // Only check tool_call events with a tool and target
            if (event.type !== 'tool_call' || !event.tool || !event.target) return null;

            // Count matching (tool, target) pairs in last 25 events
            const window = [...recentEvents.slice(-24), event];
            const matchCount = window.filter(
                (e) =>
                    e.type === 'tool_call' &&
                    e.tool === event.tool &&
                    e.target === event.target
            ).length;

            // Only flag if genuinely repetitive (5+ identical calls)
            if (matchCount < 5) return null;

            const severity = matchCount >= 8 ? 'high' as const : 'medium' as const;

            return {
                id: crypto.randomUUID(),
                category: 'looping',
                ruleId: 'lp-repeated-tool-target',
                severity,
                title: 'Repeated Action Detected',
                reason: `${event.tool} has been called on ${event.target} ${matchCount} times recently.`,
                suggestedAction:
                    'The agent may be stuck. Consider reviewing its approach or redirecting.',
                triggeredAt: event.timestamp,
                relatedEventId: event.id,
            };
        },
    },

    {
        id: 'lp-error-retry-loop',
        category: 'looping',
        name: 'Error-Retry Loop',
        enabled: true,
        evaluate(
            event: NormalizedEvent,
            _state: SupervisorState,
            recentEvents: NormalizedEvent[]
        ): RedFlag | null {
            // Only check error events
            if (event.type !== 'error') return null;

            // Look at last 10 events for repeated error signatures
            const window = [...recentEvents.slice(-9), event];
            const currentErrorSig = (event.rawSnippet ?? '').slice(0, 100);
            if (!currentErrorSig) return null;

            // Count errors with the same signature (need 3+ to flag)
            const matchingErrors = window.filter(
                (e) =>
                    e.type === 'error' &&
                    (e.rawSnippet ?? '').slice(0, 100) === currentErrorSig
            );

            if (matchingErrors.length < 3) return null;

            return {
                id: crypto.randomUUID(),
                category: 'looping',
                ruleId: 'lp-error-retry-loop',
                severity: 'critical',
                title: 'Error-Retry Loop',
                reason: `Same error repeated ${matchingErrors.length} times with retries — the agent is stuck in a loop.`,
                suggestedAction:
                    'STOP recommended. The agent is retrying the same failing approach.',
                triggeredAt: event.timestamp,
                relatedEventId: event.id,
            };
        },
    },

    {
        id: 'lp-no-progress',
        category: 'looping',
        name: 'No Progress',
        enabled: true,
        evaluate(
            event: NormalizedEvent,
            state: SupervisorState,
            _recentEvents: NormalizedEvent[]
        ): RedFlag | null {
            const lastProgressSeq =
                state.progressMarkers.length > 0
                    ? Math.max(...state.progressMarkers.map((p) => p.sequence))
                    : 0;
            const eventsSinceProgress = event.sequence - lastProgressSeq;

            // Only flag after 100+ events with no progress (real sessions are verbose)
            if (eventsSinceProgress < 100) return null;

            return {
                id: crypto.randomUUID(),
                category: 'looping',
                ruleId: 'lp-no-progress',
                severity: 'medium',
                title: 'No Progress',
                reason: `No progress marker in the last ${eventsSinceProgress} events — the agent may be stalled.`,
                suggestedAction:
                    'Check if the agent is stuck. Consider redirecting or asking for a status update.',
                triggeredAt: event.timestamp,
                relatedEventId: event.id,
            };
        },
    },

    // ─── DEFERRED (TODO) ───
    // {
    //   id: 'lp-similar-actions',
    //   category: 'looping',
    //   name: 'Similar Actions Window',
    //   enabled: false,
    //   evaluate() { return null; },
    //   // Jaccard similarity on action params within sliding window
    // },
];

