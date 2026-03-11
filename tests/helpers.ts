/**
 * Shared test helpers — factories for NormalizedEvent, RedFlag, SupervisorState
 */

import type { NormalizedEvent, RedFlag, SupervisorState, EventType, EventSource } from '../src/core/types';

export function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
    return {
        id: `evt-${Math.random().toString(36).slice(2, 6)}`,
        type: 'tool_call' as EventType,
        source: 'file' as EventSource,
        tool: 'exec',
        target: '',
        payloadSize: 0,
        rawSnippet: '',
        summary: 'test event',
        sequence: 1,
        timestamp: Date.now(),
        tags: [],
        ...overrides,
    };
}

export function makeFlag(overrides: Partial<RedFlag> = {}): RedFlag {
    return {
        id: `flag-${Math.random().toString(36).slice(2, 6)}`,
        ruleId: 'test-rule',
        title: 'Test Flag',
        category: 'risky_action',
        severity: 'medium',
        reason: 'Test reason',
        suggestedAction: 'Review',
        triggeredAt: Date.now(),
        relatedEventId: 'evt-test',
        ...overrides,
    };
}

export function makeState(overrides: Partial<SupervisorState> = {}): SupervisorState {
    return {
        sessionId: 'test-session',
        originalTask: 'test task',
        constraints: [],
        currentPhase: 'working',
        recentKeyActions: [],
        progressMarkers: [],
        activeRedFlags: [],
        riskLevel: 'low',
        lastMeaningfulProgressAt: null,
        recommendedAction: 'none',
        stats: { totalEvents: 10, repeatedActionCount: 0, largeOutputCount: 0, riskyActionCount: 0 },
        operatorDecisions: [],
        ...overrides,
    };
}
