import { Rule, NormalizedEvent, SupervisorState, RedFlag } from '../core/types';

const SENSITIVE_FILE_PATTERNS = [
    /\.env($|\.)/i,
    /\.pem$/i,
    /\.key$/i,
    /secrets?\./i,
    /credentials/i,
    /\.ssh\//i,
    /id_rsa/i,
    /\.aws\//i,
    /\.Trash/i,
];

const DESTRUCTIVE_COMMAND_PATTERNS = [
    /rm\s+(-rf?|--recursive)/i,
    /rm\s+/i,
    /mv\s+.*\.Trash/i,
    /mv\s+.*\/tmp/i,
    /DROP\s+(TABLE|DATABASE)/i,
    /DELETE\s+FROM/i,
    /truncate\s+table/i,
    /mkfs\./i,
    />\s*\/dev\//i,
    /chmod\s+777/i,
    /unlink\s/i,
    /shred\s/i,
    // macOS-specific: osascript-based trash or Finder delete
    /osascript[\s\S]*delete/i,
    /osascript[\s\S]*trash/i,
    /osascript[\s\S]*Finder/i,
    /trash\s+/i,
    /move[\s\S]*to\s+trash/i,
];

const PROJECT_ROOT = process.env.LOBSTERMAN_PROJECT_ROOT ?? '/Users/example/project';

export const riskyActionRules: Rule[] = [
    {
        id: 'ra-path-outside-root',
        category: 'risky_action',
        name: 'Path Outside Project Root',
        enabled: true,
        evaluate(
            event: NormalizedEvent,
            _state: SupervisorState,
            _recentEvents: NormalizedEvent[]
        ): RedFlag | null {
            // Only check events with a target path
            if (!event.target) return null;

            // Only check absolute paths
            if (!event.target.startsWith('/')) return null;

            // Check if path is outside project root
            if (event.target.startsWith(PROJECT_ROOT)) return null;

            return {
                id: crypto.randomUUID(),
                category: 'risky_action',
                ruleId: 'ra-path-outside-root',
                severity: 'critical',
                title: 'Path Outside Project Root',
                reason: `Action targets ${event.target} which is outside the project root ${PROJECT_ROOT}.`,
                suggestedAction:
                    'STOP immediately. The agent is modifying files outside the project.',
                triggeredAt: event.timestamp,
                relatedEventId: event.id,
            };
        },
    },

    {
        id: 'ra-sensitive-destructive',
        category: 'risky_action',
        name: 'Sensitive File or Destructive Command',
        enabled: true,
        evaluate(
            event: NormalizedEvent,
            _state: SupervisorState,
            _recentEvents: NormalizedEvent[]
        ): RedFlag | null {
            // Only check tool_call events — tool_result is just confirmation output
            if (event.type !== 'tool_call') return null;

            const target = event.target ?? '';
            const snippet = event.rawSnippet ?? '';

            // Check for sensitive file patterns
            const sensitiveMatch = SENSITIVE_FILE_PATTERNS.some((pattern) =>
                pattern.test(target)
            );

            // Check for destructive command patterns
            const destructiveMatch = DESTRUCTIVE_COMMAND_PATTERNS.some(
                (pattern) => pattern.test(target) || pattern.test(snippet)
            );

            if (!sensitiveMatch && !destructiveMatch) return null;

            const truncatedTarget = target.length > 80 ? target.slice(0, 80) + '...' : target;
            const reason = sensitiveMatch
                ? `Agent is touching sensitive file: ${truncatedTarget}`
                : `Destructive command detected: ${truncatedTarget || snippet.slice(0, 80)}`;

            return {
                id: crypto.randomUUID(),
                category: 'risky_action',
                ruleId: 'ra-sensitive-destructive',
                severity: 'high',
                title: sensitiveMatch ? 'Sensitive File Access' : 'Destructive Command',
                reason,
                suggestedAction:
                    'Review this action before allowing the agent to continue.',
                triggeredAt: event.timestamp,
                relatedEventId: event.id,
            };
        },
    },

    // ─── DEFERRED RULES (TODO) ───
    // {
    //   id: 'ra-unexpected-domain',
    //   category: 'risky_action',
    //   name: 'Unexpected Domain Navigation',
    //   enabled: false,
    //   evaluate() { return null; },
    //   // Browser navigation to domain not in allowlist
    // },
    // {
    //   id: 'ra-action-task-mismatch',
    //   category: 'risky_action',
    //   name: 'Action-Task Mismatch',
    //   enabled: false,
    //   evaluate() { return null; },
    //   // Compare action target keywords vs. original task keywords
    // },
];
