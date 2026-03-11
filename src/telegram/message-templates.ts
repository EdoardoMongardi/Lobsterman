/**
 * Message Templates — pre-built Telegram warning messages for each rule.
 *
 * Standardized format: every alert is self-contained so the operator
 * understands the situation without opening the dashboard.
 */

import { RedFlag, RiskLevel, NormalizedEvent, SupervisorState } from '../core/types';
import { VerificationResult } from '../verification/types';

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

const SUGGESTED_ACTIONS: Record<string, string> = {
    context_danger: 'Check if outputs are unexpectedly large',
    looping: 'Consider if the agent is stuck in a loop',
    risky_action: 'Review the action before it causes damage',
};

// ─── Escape Telegram MarkdownV2 special chars ───

function escMd(text: string): string {
    return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ─── Rule-triggered warning (standardized format) ───

export function formatRuleWarning(flag: RedFlag, event: NormalizedEvent): string {
    const emoji = CATEGORY_EMOJI[flag.category] ?? '⚠️';
    const severity = RISK_EMOJI[flag.severity];
    const action = flag.suggestedAction ?? SUGGESTED_ACTIONS[flag.category] ?? 'Review the situation';

    // Truncate target for display (multi-line commands become unreadable)
    const displayTarget = event.target
        ? event.target.replace(/\n/g, ' ').slice(0, 60) + (event.target.length > 60 ? '...' : '')
        : undefined;
    // Truncate reason (may be multi-line from composed alerts)
    let displayReason: string | undefined;
    if (flag.reason) {
        const reasonLines = flag.reason.split('\n').filter(Boolean);
        if (reasonLines.length > 1) {
            // Composed: show first reason + count
            const first = reasonLines[0].slice(0, 100) + (reasonLines[0].length > 100 ? '...' : '');
            displayReason = `${first} (+${reasonLines.length - 1} more)`;
        } else {
            displayReason = flag.reason.slice(0, 120) + (flag.reason.length > 120 ? '...' : '');
        }
    }

    const lines = [
        `${emoji} *${escMd(flag.title)}* ${severity}`,
        ``,
        `Event \\#${event.sequence}: \\[${escMd(event.type)}\\]${event.tool ? ` ${escMd(event.tool)}` : ''}${displayTarget ? ` → ${escMd(displayTarget)}` : ''}`,
    ];

    if (displayReason) {
        lines.push(`Reason: _${escMd(displayReason)}_`);
    }

    lines.push(`Recommended: ${escMd(action)}`);

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

// ─── Verification result ───

export function formatVerificationResult(result: VerificationResult): string {
    const shortPath = result.targetPath.split('/').slice(-2).join('/');
    const typeLabel = result.type === 'file_write' ? 'Write' : 'Delete';

    if (result.status === 'verified') {
        const sizeInfo = result.fileSize ? ` (${result.fileSize} bytes)` : '';
        return [
            `✅ *Verified ${escMd(typeLabel)}*`,
            ``,
            `${escMd(shortPath)}${escMd(sizeInfo)}`,
        ].join('\n');
    }

    if (result.status === 'mismatch') {
        const detail = result.detail.length > 120
            ? result.detail.slice(0, 120) + '...'
            : result.detail;
        return [
            `⚠️ *Verification Mismatch*`,
            ``,
            `Type: ${escMd(typeLabel)}`,
            `Path: ${escMd(shortPath)}`,
            `_${escMd(detail)}_`,
        ].join('\n');
    }

    // unverifiable — log only, no Telegram message
    return '';
}
