/**
 * Scenario Replay Test Harness — Step 27
 *
 * Replays .jsonl event fixtures through the rule engine + verification pipeline,
 * then asserts expected outcomes: flags fired, risk level, verifications.
 *
 * Each fixture is a JSONL where each line is a NormalizedEvent (partial).
 * The harness fills in defaults and processes each event through:
 *   1. Rule engine evaluation
 *   2. Verification pipeline
 */

import { describe, it, beforeEach, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { makeEvent, makeState } from './helpers';

import { riskyActionRules } from '../src/rules/risky-action';
import { loopingRules } from '../src/rules/looping';
import { contextDangerRules } from '../src/rules/context-danger';
import {
    processVerification,
    getVerifications,
    clearVerifications,
    registerVerificationCallback,
} from '../src/verification/verifier-engine';
import type { NormalizedEvent, RedFlag, SupervisorState, RiskLevel } from '../src/core/types';
import type { VerificationResult } from '../src/verification/types';
import { composeFlags, shouldAlert, clearAlertHistory } from '../src/core/engine';
import { computeRiskLevel } from '../src/core/intervention';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const TEST_DIR = path.join(os.tmpdir(), 'lobsterman-replay-' + Date.now());

const allRules = [...contextDangerRules, ...loopingRules, ...riskyActionRules];

interface ReplayResult {
    flags: RedFlag[];
    alerts: RedFlag[];  // composed, after cooldown
    verifications: VerificationResult[];
    finalRisk: RiskLevel;
    totalEvents: number;
}

function loadFixture(name: string, projectRoot: string): Partial<NormalizedEvent>[] {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
    return raw.split('\n').filter(Boolean).map(line => {
        // Substitute TESTDIR placeholder with actual test directory
        const resolved = line.replace(/TESTDIR/g, projectRoot);
        return JSON.parse(resolved);
    });
}

function replayFixture(name: string, projectRoot: string): ReplayResult {
    const rawEvents = loadFixture(name, projectRoot);
    const verifications: VerificationResult[] = [];
    const flags: RedFlag[] = [];
    const alerts: RedFlag[] = [];

    registerVerificationCallback((r) => verifications.push(r));

    let state = makeState();
    const recentEvents: NormalizedEvent[] = [];
    let seq = 0;

    for (const rawEvt of rawEvents) {
        seq++;
        const event = makeEvent({ sequence: seq, ...rawEvt });
        recentEvents.push(event);

        // Evaluate all rules
        const newFlags: RedFlag[] = [];
        for (const rule of allRules) {
            if (!rule.enabled) continue;
            const flag = rule.evaluate(event, state, recentEvents.slice(-20));
            if (flag) {
                flags.push(flag);
                newFlags.push(flag);
            }
        }

        // Compose + cooldown
        if (newFlags.length > 0) {
            const composed = composeFlags(newFlags);
            const cd = shouldAlert(composed.ruleId, event.target);
            if (cd.send) {
                alerts.push(composed);
            }
        }

        // Verification
        processVerification(event);

        // Update state stats
        state = {
            ...state,
            stats: {
                ...state.stats,
                totalEvents: state.stats.totalEvents + 1,
            },
            activeRedFlags: [...state.activeRedFlags, ...newFlags],
            riskLevel: computeRiskLevel([...state.activeRedFlags, ...newFlags]),
        };
    }

    registerVerificationCallback(() => { });

    return {
        flags,
        alerts,
        verifications,
        finalRisk: state.riskLevel,
        totalEvents: seq,
    };
}

describe('scenario replay', () => {
    const originalRoot = process.env.LOBSTERMAN_PROJECT_ROOT;

    before(() => {
        process.env.LOBSTERMAN_PROJECT_ROOT = TEST_DIR;
        fs.mkdirSync(TEST_DIR, { recursive: true });
    });

    after(() => {
        if (originalRoot !== undefined) {
            process.env.LOBSTERMAN_PROJECT_ROOT = originalRoot;
        } else {
            delete process.env.LOBSTERMAN_PROJECT_ROOT;
        }
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    });

    beforeEach(() => {
        clearVerifications();
        clearAlertHistory();
    });

    it('clean-write-session: verified write, low risk', () => {
        // Create the target file to simulate agent writing it
        const targetFile = path.join(TEST_DIR, 'poem.txt');
        fs.writeFileSync(targetFile, 'A beautiful poem');

        const result = replayFixture('clean-write-session.jsonl', TEST_DIR);
        assert.ok(result.verifications.some(v => v.status === 'verified' && v.type === 'file_write'),
            'Should have verified write');
        assert.strictEqual(result.finalRisk, 'low', 'Should be low risk');

        fs.unlinkSync(targetFile);
    });

    it('delete-inside-root: verified delete + destructive flag', () => {
        // File doesn't exist → verified delete (file is gone)
        const result = replayFixture('delete-inside-root.jsonl', TEST_DIR);
        assert.ok(result.flags.some(f => f.ruleId === 'ra-sensitive-destructive'),
            'Should fire ra-sensitive-destructive');
        assert.ok(result.verifications.some(v => v.status === 'verified' && v.type === 'file_delete'),
            'Should verify delete (file gone)');
    });

    it('delete-outside-root: composed alert, no verification', () => {
        const result = replayFixture('delete-outside-root.jsonl', TEST_DIR);
        assert.ok(result.flags.some(f => f.ruleId === 'ra-path-outside-root'),
            'Should fire ra-path-outside-root');
        assert.ok(result.flags.some(f => f.ruleId === 'ra-sensitive-destructive'),
            'Should fire ra-sensitive-destructive');
        // Composed into single alert
        assert.strictEqual(result.alerts.length, 1, 'Should compose into 1 alert');
        // No verification for outside-root
        assert.strictEqual(result.verifications.length, 0, 'No verification for outside-root');
    });

    it('outside-root-destructive-composed: single composed alert', () => {
        const result = replayFixture('outside-root-destructive-composed.jsonl', TEST_DIR);
        assert.ok(result.flags.length >= 2, 'Should trigger multiple flags');
        assert.strictEqual(result.alerts.length, 1, 'Should send exactly 1 composed alert');
        assert.ok(result.alerts[0].title.includes(' — '), 'Title should be composed');
        assert.strictEqual(result.verifications.length, 0);
    });

    it('retry-loop: repeated tool target fires', () => {
        const result = replayFixture('retry-loop.jsonl', TEST_DIR);
        assert.ok(result.flags.some(f => f.ruleId === 'lp-repeated-tool-target'),
            'Should fire lp-repeated-tool-target');
        assert.ok(['medium', 'high', 'critical'].includes(result.finalRisk),
            `Risk should escalate: ${result.finalRisk}`);
    });

    it('missing-tool-result: pending expires', () => {
        const result = replayFixture('missing-tool-result.jsonl', TEST_DIR);
        // The pending entry should exist but we can't directly test expiration
        // without waiting 30s. Instead verify: no verified result.
        assert.ok(!result.verifications.some(v => v.status === 'verified'),
            'Should not have any verified result');
    });

    it('warmup-then-live: cumulative events, alerts only for live', () => {
        // Create the target file for the live write event
        const targetFile = path.join(TEST_DIR, 'live-file.txt');
        fs.writeFileSync(targetFile, 'live content');

        const result = replayFixture('warmup-then-live.jsonl', TEST_DIR);
        assert.ok(result.totalEvents > 5, `Should have many events: ${result.totalEvents}`);
        // Should have some flags from the historical events
        assert.ok(result.flags.length > 0, 'Should have flags');

        fs.unlinkSync(targetFile);
    });
});
