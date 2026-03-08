import {
    NormalizedEvent,
    SupervisorState,
    KeyAction,
    ProgressMarker,
} from './types';

/**
 * Pure function: given an event and current state, returns partial state updates.
 */
export function updateStateFromEvent(
    event: NormalizedEvent,
    currentState: SupervisorState
): Partial<SupervisorState> {
    const updates: Partial<SupervisorState> = {};

    // 1. Increment stats
    const stats = { ...currentState.stats };
    stats.totalEvents = currentState.stats.totalEvents + 1;
    updates.stats = stats;

    // 2. Append to recentKeyActions (cap at 10)
    const keyAction: KeyAction = {
        sequence: event.sequence,
        timestamp: event.timestamp,
        summary: event.summary,
        tool: event.tool,
        target: event.target,
    };
    const recentKeyActions = [...currentState.recentKeyActions, keyAction].slice(-10);
    updates.recentKeyActions = recentKeyActions;

    // 3. Detect progress markers
    const progressMarker = detectProgressMarker(event, currentState);
    if (progressMarker) {
        const progressMarkers = [
            ...currentState.progressMarkers,
            progressMarker,
        ].slice(-20);
        updates.progressMarkers = progressMarkers;
        updates.lastMeaningfulProgressAt = event.timestamp;
    }

    // 4. Set currentPhase based on event count
    if (stats.totalEvents < 3) {
        updates.currentPhase = 'starting';
    } else if (currentState.activeRedFlags.length === 0) {
        updates.currentPhase = 'working';
    }
    // Phase is further updated by the engine after rule evaluation

    return updates;
}

const FILE_CREATE_TOOLS = new Set([
    'write_to_file', 'Write', 'write', 'write_file', 'create_file',
]);

const FILE_EDIT_TOOLS = new Set([
    'replace_file_content', 'multi_replace_file_content',
    'Edit', 'edit', 'StrReplace',
]);

const COMMAND_TOOLS = new Set([
    'run_command', 'exec', 'Bash', 'bash', 'Shell',
]);

function detectProgressMarker(
    event: NormalizedEvent,
    currentState: SupervisorState
): ProgressMarker | null {
    const tool = event.tool ?? '';

    // File created
    if (event.type === 'tool_call' && FILE_CREATE_TOOLS.has(tool)) {
        return {
            sequence: event.sequence,
            timestamp: event.timestamp,
            description: `Created ${event.target ?? 'file'}`,
            type: 'file_created',
        };
    }

    // File edited
    if (event.type === 'tool_call' && FILE_EDIT_TOOLS.has(tool)) {
        return {
            sequence: event.sequence,
            timestamp: event.timestamp,
            description: `Edited ${event.target ?? 'file'}`,
            type: 'file_edited',
        };
    }

    // Command succeeded — check tool_result from command tools
    if (event.type === 'tool_result' && COMMAND_TOOLS.has(tool)) {
        const snippet = event.rawSnippet ?? '';
        const exitCodeTag = event.tags.includes('exitCode:0');
        const successPattern = /completed successfully|no errors|passed|exit code: 0/i.test(snippet);

        if (exitCodeTag || successPattern) {
            const isBuild = event.target?.includes('build');
            const isTest = event.target?.includes('test');
            return {
                sequence: event.sequence,
                timestamp: event.timestamp,
                description: `${isBuild ? 'Build' : isTest ? 'Tests' : 'Command'} passed`,
                type: isBuild ? 'build_passed' : isTest ? 'test_passed' : 'command_succeeded',
            };
        }
    }

    return null;
}
