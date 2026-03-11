/**
 * P0 Test: Alert Composition — composeFlags()
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { composeFlags } from '../src/core/engine';
import { makeFlag } from './helpers';

describe('composeFlags', () => {
    it('single flag passthrough', () => {
        const flag = makeFlag({ title: 'Single', severity: 'high' });
        const result = composeFlags([flag]);
        assert.strictEqual(result, flag, 'Single flag should be returned as-is');
    });

    it('two flags → merged title, highest severity wins', () => {
        const f1 = makeFlag({ ruleId: 'ra-sensitive-destructive', title: 'Destructive Command', severity: 'high' });
        const f2 = makeFlag({ ruleId: 'ra-path-outside-root', title: 'Outside Project Root', severity: 'critical' });

        const result = composeFlags([f1, f2]);
        assert.strictEqual(result.severity, 'critical', 'Should use highest severity');
        assert.ok(result.title.includes('Outside Project Root'), 'Title should include highest severity flag');
        assert.ok(result.title.includes('Destructive Command'), 'Title should include second flag');
    });

    it('three flags → correct severity ordering', () => {
        const f1 = makeFlag({ severity: 'low', title: 'Low' });
        const f2 = makeFlag({ severity: 'critical', title: 'Critical' });
        const f3 = makeFlag({ severity: 'medium', title: 'Medium' });

        const result = composeFlags([f1, f2, f3]);
        assert.strictEqual(result.severity, 'critical');
        assert.ok(result.title.startsWith('Critical'), `Title should start with highest severity: ${result.title}`);
    });

    it('composed reason joins all reasons', () => {
        const f1 = makeFlag({ reason: 'Reason A', severity: 'high' });
        const f2 = makeFlag({ reason: 'Reason B', severity: 'medium' });

        const result = composeFlags([f1, f2]);
        assert.ok(result.reason.includes('Reason A'));
        assert.ok(result.reason.includes('Reason B'));
    });

    it('suggestedAction uses most urgent (highest severity)', () => {
        const f1 = makeFlag({ severity: 'medium', suggestedAction: 'Check it' });
        const f2 = makeFlag({ severity: 'critical', suggestedAction: 'Stop immediately' });

        const result = composeFlags([f1, f2]);
        assert.strictEqual(result.suggestedAction, 'Stop immediately');
    });
});
