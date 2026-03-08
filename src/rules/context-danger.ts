import { Rule, NormalizedEvent, SupervisorState, RedFlag } from '../core/types';

const LARGE_OUTPUT_THRESHOLD = 16384; // 16KB — calibrated against real agent usage where normal file reads are 3-15KB

export const contextDangerRules: Rule[] = [
    {
        id: 'cd-large-output',
        category: 'context_danger',
        name: 'Single Large Output',
        enabled: true,
        evaluate(
            event: NormalizedEvent,
            _state: SupervisorState,
            _recentEvents: NormalizedEvent[]
        ): RedFlag | null {
            if (event.type !== 'tool_result' || event.payloadSize <= LARGE_OUTPUT_THRESHOLD) {
                return null;
            }

            const sizeKB = Math.round(event.payloadSize / 1024);
            return {
                id: crypto.randomUUID(),
                category: 'context_danger',
                ruleId: 'cd-large-output',
                severity: 'medium',
                title: 'Large Output Detected',
                reason: `Tool output was ${sizeKB}KB — large outputs consume context and risk losing earlier information.`,
                suggestedAction:
                    'Consider pausing to review if the agent is reading unnecessarily large files.',
                triggeredAt: event.timestamp,
                relatedEventId: event.id,
            };
        },
    },

    {
        id: 'cd-repeated-large',
        category: 'context_danger',
        name: 'Repeated Large Outputs',
        enabled: true,
        evaluate(
            event: NormalizedEvent,
            _state: SupervisorState,
            recentEvents: NormalizedEvent[]
        ): RedFlag | null {
            // Only check on tool_result events
            if (event.type !== 'tool_result') return null;

            // Count large outputs in the last 10 events (including current)
            const window = [...recentEvents.slice(-9), event];
            const largeCount = window.filter(
                (e) => e.type === 'tool_result' && e.payloadSize > LARGE_OUTPUT_THRESHOLD
            ).length;

            if (largeCount < 3) return null;

            return {
                id: crypto.randomUUID(),
                category: 'context_danger',
                ruleId: 'cd-repeated-large',
                severity: 'high',
                title: 'Repeated Large Outputs',
                reason: `${largeCount} large outputs in the last 10 events — context is filling with noise.`,
                suggestedAction:
                    'Context is at risk. Consider pausing and asking the agent to summarize its current state.',
                triggeredAt: event.timestamp,
                relatedEventId: event.id,
            };
        },
    },

    // ─── DEFERRED RULES (TODO) ───
    // {
    //   id: 'cd-long-run-no-summary',
    //   category: 'context_danger',
    //   name: 'Long Run Without Summary',
    //   enabled: false,
    //   evaluate() { return null; },
    //   // 50+ events without a state summary or compression step
    // },
    // {
    //   id: 'cd-task-drift',
    //   category: 'context_danger',
    //   name: 'Task Focus Drift',
    //   enabled: false,
    //   evaluate() { return null; },
    //   // Task focus score declining — requires keyword/embedding comparison
    // },
];
