/**
 * P0 Test: Cooldown / Alert Dedup — shouldAlert()
 *
 * Tests that rapid-fire events with same ruleId+target are suppressed
 * within the cooldown window, and fire again once the window expires.
 */

import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { shouldAlert, clearAlertHistory } from '../src/core/engine';

describe('shouldAlert cooldown', () => {
    beforeEach(() => {
        clearAlertHistory();
    });

    it('first call always sends', () => {
        const result = shouldAlert('ra-sensitive-destructive', '/some/path');
        assert.strictEqual(result.send, true);
        assert.strictEqual(result.repeatCount, 0);
    });

    it('second call within cooldown is suppressed', () => {
        shouldAlert('ra-sensitive-destructive', '/some/path');
        const result = shouldAlert('ra-sensitive-destructive', '/some/path');
        assert.strictEqual(result.send, false);
    });

    it('different targets fire independently', () => {
        const r1 = shouldAlert('ra-sensitive-destructive', '/path/a');
        const r2 = shouldAlert('ra-sensitive-destructive', '/path/b');
        assert.strictEqual(r1.send, true);
        assert.strictEqual(r2.send, true, 'Different targets should not be suppressed');
    });

    it('different rules on same target fire independently', () => {
        const r1 = shouldAlert('ra-sensitive-destructive', '/path/a');
        const r2 = shouldAlert('ra-path-outside-root', '/path/a');
        assert.strictEqual(r1.send, true);
        assert.strictEqual(r2.send, true, 'Different rules should not be suppressed');
    });

    it('undefined target uses default grouping', () => {
        const r1 = shouldAlert('lp-no-progress');
        assert.strictEqual(r1.send, true);
        const r2 = shouldAlert('lp-no-progress');
        assert.strictEqual(r2.send, false, 'Same rule with undefined target should be suppressed');
    });

    it('suppressedCount tracks suppressed alerts', () => {
        shouldAlert('test-rule', '/path');
        shouldAlert('test-rule', '/path'); // suppressed
        shouldAlert('test-rule', '/path'); // suppressed

        // Clear to simulate cooldown expiry
        clearAlertHistory();
        const result = shouldAlert('test-rule', '/path');
        assert.strictEqual(result.send, true);
        // After clear, no suppressed count
        assert.strictEqual(result.repeatCount, 0);
    });
});
