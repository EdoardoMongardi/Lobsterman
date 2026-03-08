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

            // Count matching (tool, target) pairs in last 15 events
            const window = [...recentEvents.slice(-14), event];
            const matchCount = window.filter(
                (e) =>
                    e.type === 'tool_call' &&
                    e.tool === event.tool &&
                    e.target === event.target
            ).length;

            if (matchCount < 3) return null;

            const severity = matchCount >= 5 ? 'high' as const : 'medium' as const;

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

            // Look at last 8 events for repeated error signatures
            const window = [...recentEvents.slice(-7), event];
            const currentErrorSig = (event.rawSnippet ?? '').slice(0, 100);
            if (!currentErrorSig) return null;

            // Count errors with the same signature
            const matchingErrors = window.filter(
                (e) =>
                    e.type === 'error' &&
                    (e.rawSnippet ?? '').slice(0, 100) === currentErrorSig
            );

            if (matchingErrors.length < 2) return null;

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

    // ─── DEFERRED RULES (TODO) ───
    // {
    //   id: 'lp-similar-actions',
    //   category: 'looping',
    //   name: 'Similar Actions Window',
    //   enabled: false,
    //   evaluate() { return null; },
    //   // Jaccard similarity on action params within sliding window
    // },
    // {
    //   id: 'lp-no-progress',
    //   category: 'looping',
    //   name: 'No Progress',
    //   enabled: false,
    //   evaluate() { return null; },
    //   // No progress marker in 20+ events
    // },
];
