import { Rule, NormalizedEvent, SupervisorState, RedFlag } from './types';

export class RuleEngine {
    private rules: Rule[] = [];

    registerRule(rule: Rule): void {
        this.rules.push(rule);
    }

    registerRules(rules: Rule[]): void {
        this.rules.push(...rules);
    }

    evaluate(
        event: NormalizedEvent,
        state: SupervisorState,
        recentEvents: NormalizedEvent[]
    ): RedFlag[] {
        const flags: RedFlag[] = [];

        for (const rule of this.rules) {
            if (!rule.enabled) continue;

            const flag = rule.evaluate(event, state, recentEvents);
            if (flag) {
                flags.push(flag);
            }
        }

        return flags;
    }

    getRules(): Rule[] {
        return [...this.rules];
    }
}

// Singleton
export const ruleEngine = new RuleEngine();
