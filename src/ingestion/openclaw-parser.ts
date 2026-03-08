/**
 * OpenClaw JSONL Parser
 *
 * Adapts real OpenClaw session JSONL lines into RawEvent[] objects
 * that the existing normalizer can process.
 *
 * A single JSONL line may produce 0..N RawEvents because assistant
 * messages can contain multiple content items (thinking + toolCall + text).
 */

import { RawEvent } from '../core/types';

// ─── OpenClaw JSONL type definitions (not exported — internal to parser) ───

interface OpenClawLine {
    type: string;
    id: string;
    parentId: string | null;
    timestamp: string;
    // session-specific
    cwd?: string;
    version?: number;
    // model_change-specific
    provider?: string;
    modelId?: string;
    // thinking_level_change-specific
    thinkingLevel?: string;
    // custom-specific
    customType?: string;
    data?: Record<string, unknown>;
    // message-specific
    message?: OpenClawMessage;
}

interface OpenClawMessage {
    role: string;
    content: OpenClawContentItem[];
    timestamp?: number;
    // toolResult-specific fields
    toolCallId?: string;
    toolName?: string;
    details?: {
        status?: string;
        exitCode?: number;
        durationMs?: number;
        aggregated?: string;
    };
    isError?: boolean;
}

interface OpenClawContentItem {
    type: string;
    text?: string;
    thinking?: string;
    thinkingSignature?: string;
    // toolCall-specific
    id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
}

// ─── Target extraction ───

const COMMAND_TOOLS = new Set([
    'exec', 'Bash', 'bash', 'run_command', 'Shell',
]);

const FILE_TOOLS = new Set([
    'Read', 'read', 'read_file', 'view_file',
    'Write', 'write', 'write_file', 'write_to_file', 'create_file',
    'Edit', 'edit', 'StrReplace', 'replace_file_content', 'multi_replace_file_content',
    'Glob', 'glob', 'Grep', 'grep', 'grep_search',
    'ListDir', 'list_directory', 'ReadDir',
    'Delete', 'delete_file',
]);

function extractTarget(toolName: string, args: Record<string, unknown> | undefined): string | undefined {
    if (!args) return undefined;

    if (COMMAND_TOOLS.has(toolName)) {
        const cmd = args.command ?? args.cmd;
        return typeof cmd === 'string' ? cmd : undefined;
    }

    if (FILE_TOOLS.has(toolName)) {
        const path = args.file_path ?? args.path ?? args.filePath ?? args.target;
        return typeof path === 'string' ? path : undefined;
    }

    // Fallback: try common keys in priority order
    for (const key of ['command', 'file_path', 'path', 'filePath', 'target', 'url']) {
        const val = args[key];
        if (typeof val === 'string' && val.length > 0) return val;
    }

    // Last resort: first string-valued argument
    for (const val of Object.values(args)) {
        if (typeof val === 'string' && val.length > 0) return val;
    }

    return undefined;
}

// ─── Timestamp helpers ───

function parseTimestamp(line: OpenClawLine): number {
    if (line.message?.timestamp && typeof line.message.timestamp === 'number') {
        return line.message.timestamp;
    }
    if (line.timestamp) {
        const ms = new Date(line.timestamp).getTime();
        if (!isNaN(ms)) return ms;
    }
    return Date.now();
}

// ─── Main parser ───

export function parseOpenClawLine(raw: unknown): RawEvent[] {
    if (!raw || typeof raw !== 'object') return [];

    const line = raw as OpenClawLine;

    switch (line.type) {
        case 'session':
            return parseSession(line);
        case 'model_change':
            return parseModelChange(line);
        case 'message':
            return parseMessage(line);
        case 'thinking_level_change':
        case 'custom':
            return [];
        default:
            return [];
    }
}

function parseSession(line: OpenClawLine): RawEvent[] {
    return [{
        type: 'system',
        content: `Session started: ${line.cwd ?? 'unknown directory'}`,
        timestamp: parseTimestamp(line),
        metadata: { sessionId: line.id, version: line.version, cwd: line.cwd },
    }];
}

function parseModelChange(line: OpenClawLine): RawEvent[] {
    return [{
        type: 'system',
        content: `Model: ${line.modelId ?? 'unknown'} (${line.provider ?? 'unknown'})`,
        timestamp: parseTimestamp(line),
        metadata: { provider: line.provider, modelId: line.modelId },
    }];
}

function parseMessage(line: OpenClawLine): RawEvent[] {
    const msg = line.message;
    if (!msg) return [];

    switch (msg.role) {
        case 'user':
            return parseUserMessage(line, msg);
        case 'assistant':
            return parseAssistantMessage(line, msg);
        case 'toolResult':
            return parseToolResult(line, msg);
        default:
            return [];
    }
}

function parseUserMessage(line: OpenClawLine, msg: OpenClawMessage): RawEvent[] {
    const texts = msg.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text!)
        .join('\n');

    if (!texts) return [];

    return [{
        type: 'user_message',
        content: texts,
        timestamp: parseTimestamp(line),
    }];
}

function parseAssistantMessage(line: OpenClawLine, msg: OpenClawMessage): RawEvent[] {
    const events: RawEvent[] = [];
    const ts = parseTimestamp(line);

    for (const item of msg.content) {
        switch (item.type) {
            case 'thinking':
                // Skip thinking blocks — internal reasoning, no watchdog value
                break;

            case 'text':
                if (item.text && item.text.trim().length > 0) {
                    events.push({
                        type: 'assistant_message',
                        content: item.text,
                        timestamp: ts,
                    });
                }
                break;

            case 'toolCall':
                if (item.name) {
                    const target = extractTarget(item.name, item.arguments);
                    events.push({
                        type: 'tool_call',
                        tool: item.name,
                        target,
                        content: item.arguments ? JSON.stringify(item.arguments) : undefined,
                        timestamp: ts,
                        metadata: { toolCallId: item.id },
                    });
                }
                break;
        }
    }

    return events;
}

function parseToolResult(line: OpenClawLine, msg: OpenClawMessage): RawEvent[] {
    const contentText = msg.content
        .filter((c) => c.type === 'text' && c.text)
        .map((c) => c.text!)
        .join('\n');

    const toolName = msg.toolName ?? 'unknown';
    const isError = msg.isError === true;

    // Try to extract target from details or from the content itself
    let target: string | undefined;
    if (msg.details?.aggregated) {
        // For exec commands, the aggregated field sometimes contains the command
        target = undefined; // We can't reliably extract from aggregated
    }

    return [{
        type: isError ? 'error' : 'tool_result',
        tool: toolName,
        target,
        content: contentText,
        error: isError ? contentText : undefined,
        timestamp: parseTimestamp(line),
        metadata: {
            toolCallId: msg.toolCallId,
            exitCode: msg.details?.exitCode,
            durationMs: msg.details?.durationMs,
            status: msg.details?.status,
        },
    }];
}
