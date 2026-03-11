/**
 * P0 Test: Root Boundary — ra-path-outside-root rule
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { riskyActionRules } from '../src/rules/risky-action';
import { makeEvent, makeState } from './helpers';

const outsideRootRule = riskyActionRules.find(r => r.id === 'ra-path-outside-root');

describe('root boundary', () => {
    const originalRoot = process.env.LOBSTERMAN_PROJECT_ROOT;

    before(() => {
        process.env.LOBSTERMAN_PROJECT_ROOT = '/Users/test/project';
    });

    after(() => {
        if (originalRoot !== undefined) {
            process.env.LOBSTERMAN_PROJECT_ROOT = originalRoot;
        } else {
            delete process.env.LOBSTERMAN_PROJECT_ROOT;
        }
    });

    it('ra-path-outside-root rule exists', () => {
        assert.ok(outsideRootRule, 'ra-path-outside-root rule should exist');
    });

    it('path inside root → rule does not fire', () => {
        const event = makeEvent({
            tool: 'exec',
            target: 'rm /Users/test/project/file.txt',
            rawSnippet: 'rm /Users/test/project/file.txt',
        });
        const state = makeState();
        const flag = outsideRootRule!.evaluate(event, state, []);
        assert.strictEqual(flag, null, 'Should not fire for inside-root path');
    });

    it('path outside root → rule fires', () => {
        const event = makeEvent({
            tool: 'exec',
            target: 'rm /Users/other/file.txt',
            rawSnippet: 'rm /Users/other/file.txt',
        });
        const state = makeState();
        const flag = outsideRootRule!.evaluate(event, state, []);
        assert.ok(flag, 'Should fire for outside-root path');
        assert.strictEqual(flag!.severity, 'critical');
    });

    it('write tool outside root → rule fires', () => {
        const event = makeEvent({
            tool: 'write_to_file',
            target: '/Users/other/outside.txt',
            rawSnippet: 'writing file',
        });
        const state = makeState();
        const flag = outsideRootRule!.evaluate(event, state, []);
        assert.ok(flag, 'Should fire for write outside root');
    });
});
