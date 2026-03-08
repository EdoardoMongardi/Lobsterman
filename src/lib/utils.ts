import { RiskLevel } from '../core/types';

export function formatTimestamp(ts: number): string {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

export function formatRelativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

export function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + '…';
}

export function riskLevelToNumber(level: RiskLevel): number {
    const map: Record<RiskLevel, number> = {
        low: 0,
        medium: 1,
        high: 2,
        critical: 3,
    };
    return map[level];
}

export function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel {
    return riskLevelToNumber(a) >= riskLevelToNumber(b) ? a : b;
}
