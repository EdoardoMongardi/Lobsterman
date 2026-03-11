import { RawEvent, NormalizedEvent, EventSource, EventType } from './types';

let sequenceCounter = 0;

export function resetSequence(): void {
    sequenceCounter = 0;
}

export function normalizeEvent(
    raw: RawEvent,
    source: EventSource
): NormalizedEvent {
    const sequence = ++sequenceCounter;
    const type = mapEventType(raw.type);
    const payloadSize = computePayloadSize(raw);

    // User messages need more space (metadata wrapper takes ~150 chars)
    const snippetLimit = type === 'user_message' ? 500 : 200;

    return {
        id: crypto.randomUUID(),
        timestamp: raw.timestamp ?? Date.now(),
        sequence,
        type,
        source,
        tool: raw.tool,
        target: raw.target,
        payloadSize,
        summary: buildSummary(raw, type),
        rawSnippet: truncateSnippet(raw.content ?? raw.error, snippetLimit),
        tags: extractTags(raw),
    };
}

function mapEventType(rawType: string): EventType {
    const typeMap: Record<string, EventType> = {
        tool_call: 'tool_call',
        tool_result: 'tool_result',
        assistant_message: 'assistant_message',
        user_message: 'user_message',
        error: 'error',
        system: 'system',
    };
    return typeMap[rawType] ?? 'system';
}

function computePayloadSize(raw: RawEvent): number {
    const content = raw.content ?? raw.error ?? '';
    return new TextEncoder().encode(content).length;
}

function buildSummary(raw: RawEvent, type: EventType): string {
    if (raw.tool && raw.target) {
        return `[${type}] ${raw.tool} → ${raw.target}`;
    }
    if (raw.tool) {
        return `[${type}] ${raw.tool}`;
    }
    if (raw.error) {
        const preview = raw.error.slice(0, 80);
        return `[error] ${preview}`;
    }
    if (raw.content) {
        const preview = raw.content.slice(0, 80);
        return `[${type}] ${preview}`;
    }
    return `[${type}]`;
}

function truncateSnippet(
    content: string | undefined,
    maxLen: number
): string | undefined {
    if (!content) return undefined;
    if (content.length <= maxLen) return content;
    return content.slice(0, maxLen - 1) + '…';
}

function extractTags(raw: RawEvent): string[] {
    const tags: string[] = [];
    if (raw.tool) tags.push(raw.tool);
    if (raw.target) {
        // Extract path segments as tags
        const segments = raw.target.split('/').filter(Boolean);
        // Take last 2 path segments as most useful
        tags.push(...segments.slice(-2));
    }
    if (raw.type) tags.push(raw.type);
    return tags;
}
