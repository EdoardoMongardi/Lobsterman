/**
 * P0 Test: Verification Lifecycle
 */

import { describe, it, beforeEach, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    processVerification,
    getVerifications,
    clearVerifications,
    registerVerificationCallback,
} from '../src/verification/verifier-engine';
import { makeEvent } from './helpers';
import type { VerificationResult } from '../src/verification/types';

const TEST_DIR = path.join(os.tmpdir(), 'lobsterman-test-' + Date.now());

describe('verification lifecycle', () => {
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
    });

    it('tool_call write queues pending verification', () => {
        const testFile = path.join(TEST_DIR, 'test-write.txt');
        processVerification(makeEvent({
            type: 'tool_call', tool: 'write_to_file', target: testFile,
        }));

        const pending = getVerifications();
        assert.strictEqual(pending.length, 1, 'Should have 1 pending');
        assert.strictEqual(pending[0].status, 'waiting_for_result');
        assert.strictEqual(pending[0].type, 'file_write');
    });

    it('tool_result matches pending → runs verification', () => {
        const testFile = path.join(TEST_DIR, 'verified-write.txt');
        fs.writeFileSync(testFile, 'hello world');

        const results: VerificationResult[] = [];
        registerVerificationCallback((result) => results.push(result));

        processVerification(makeEvent({
            type: 'tool_call', tool: 'write_to_file', target: testFile, sequence: 1,
        }));
        processVerification(makeEvent({
            type: 'tool_result', tool: 'write_to_file', target: testFile, sequence: 2,
        }));

        assert.strictEqual(results.length, 1, 'Should have 1 result');
        assert.strictEqual(results[0].status, 'verified');

        fs.unlinkSync(testFile);
        registerVerificationCallback(() => { });
    });

    it('error tool_result → unverifiable', () => {
        const testFile = path.join(TEST_DIR, 'error-test.txt');

        processVerification(makeEvent({
            type: 'tool_call', tool: 'write_to_file', target: testFile, sequence: 1,
        }));
        processVerification(makeEvent({
            type: 'error', tool: 'write_to_file', target: testFile, sequence: 2,
        }));

        const pending = getVerifications();
        const resolved = pending.find(p => p.targetPath === testFile);
        assert.ok(resolved, 'Should have the resolved entry');
        assert.strictEqual(resolved!.status, 'unverifiable');
    });

    it('outside root → skipped (not queued)', () => {
        processVerification(makeEvent({
            type: 'tool_call', tool: 'write_to_file', target: '/outside/root/file.txt',
        }));

        const pending = getVerifications();
        assert.strictEqual(pending.length, 0, 'Should not queue outside-root paths');
    });
});
