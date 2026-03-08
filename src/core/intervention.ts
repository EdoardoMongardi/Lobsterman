import { RedFlag, InterventionType, RiskLevel } from './types';
import { riskLevelToNumber } from '../lib/utils';

/**
 * Maps current active flags → recommended operator action.
 */
export function computeIntervention(flags: RedFlag[]): InterventionType {
    if (flags.length === 0) return 'none';

    const hasCritical = flags.some((f) => f.severity === 'critical');
    if (hasCritical) return 'stop';

    const highFlags = flags.filter((f) => f.severity === 'high');
    if (highFlags.length >= 2) return 'pause';
    if (highFlags.length >= 1) return 'review';

    const hasMedium = flags.some((f) => f.severity === 'medium');
    if (hasMedium) return 'review';

    return 'none';
}

/**
 * Returns the maximum severity across all active flags.
 */
export function computeRiskLevel(flags: RedFlag[]): RiskLevel {
    if (flags.length === 0) return 'low';

    let maxLevel: RiskLevel = 'low';
    for (const flag of flags) {
        if (riskLevelToNumber(flag.severity) > riskLevelToNumber(maxLevel)) {
            maxLevel = flag.severity;
        }
    }
    return maxLevel;
}
