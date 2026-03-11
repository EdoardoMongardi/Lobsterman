/**
 * Message Templates — pre-built Telegram warning messages for each rule.
 *
 * Templates are fast, zero-cost, zero-latency. LLM is only used for
 * session report cards (Phase 7B).
 */

import { RedFlag, RiskLevel, NormalizedEvent, SupervisorState } from '../core/types';

// ─── Emoji helpers ───

const RISK_EMOJI: Record<RiskLevel, string> = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
};

const CATEGORY_EMOJI: Record<string, string> = {
    context_danger: '⚠️',
    looping: '🔄',
    risky_action: '🚨',
};

// ─── Escape Telegram MarkdownV2 special chars ───

function escMd(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ─── Rule-triggered warning ───

export function formatRuleWarning(flag: RedFlag, event: NormalizedEvent): string {
    const emoji = CATEGORY_EMOJI[flag.category] ?? '⚠️';
    const severity = RISK_EMOJI[flag.severity];

    const lines = [
        `${emoji} *${escMd(flag.title)}* ${severity}`,
        ``,
        `Event \\#${event.sequence}: ${escMd(event.summary)}`,
    ];

    if (event.tool) {
        lines.push(`Tool: \`${escMd(event.tool)}\``);
    }
    if (event.target) {
        lines.push(`Target: \`${escMd(event.target)}\``);
    }
    if (flag.reason) {
        lines.push(``, `_${escMd(flag.reason)}_`);
    }

    return lines.join('\n');
}

// ─── Risk level change ───

export function formatRiskChange(
    oldLevel: RiskLevel,
    newLevel: RiskLevel,
    flags: RedFlag[],
): string {
    const oldEmoji = RISK_EMOJI[oldLevel];
    const newEmoji = RISK_EMOJI[newLevel];

    const lines = [
        `📊 *Risk Level Changed*`,
        ``,
        `${oldEmoji} ${escMd(oldLevel.toUpperCase())} → ${newEmoji} ${escMd(newLevel.toUpperCase())}`,
    ];

    if (flags.length > 0) {
        lines.push(``, `Active warnings: ${flags.length}`);
        for (const f of flags.slice(0, 3)) {
            const cat = CATEGORY_EMOJI[f.category] ?? '⚠️';
            lines.push(`  ${cat} ${escMd(f.title)}`);
        }
        if (flags.length > 3) {
            lines.push(`  \\.\\.\\. and ${flags.length - 3} more`);
        }
    }

    return lines.join('\n');
}

// ─── Session start ───

export function formatSessionStart(sessionId: string, task: string): string {
    const shortId = sessionId.slice(0, 8);
    const taskPreview = task.length > 100 ? task.slice(0, 100) + '...' : task;

    return [
        `🦞 *New Session Detected*`,
        ``,
        `📋 Task: _${escMd(taskPreview)}_`,
        `🔑 Session: \`${escMd(shortId)}\``,
        ``,
        `Monitoring started\\.`,
    ].join('\n');
}

// ─── Session end / idle ───

export function formatSessionEnd(
    sessionId: string,
    stats: SupervisorState['stats'],
    riskLevel: RiskLevel,
    duration?: string,
): string {
    const shortId = sessionId.slice(0, 8);
    const risk = RISK_EMOJI[riskLevel];

    return [
        `✅ *Session Complete*`,
        ``,
        `🔑 Session: \`${escMd(shortId)}\``,
        duration ? `⏱ Duration: ${escMd(duration)}` : '',
        `📊 Events: ${stats.totalEvents} \\| Risk: ${risk} ${escMd(riskLevel.toUpperCase())}`,
        `⚠️ Warnings: ${stats.largeOutputCount + stats.repeatedActionCount + stats.riskyActionCount}`,
    ].filter(Boolean).join('\n');
}
