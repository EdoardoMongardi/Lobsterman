/**
 * P0 Test: Exec Path Extractor — extractFileOpFromCommand()
 *
 * Tests path extraction from exec-based commands (osascript, rm, cat >, etc).
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import * as os from 'os';
import { extractFileOpFromCommand } from '../src/core/exec-path-extractor';

const HOME = os.homedir();

describe('extractFileOpFromCommand', () => {
    // ─── DELETE ───

    it('osascript delete with home folder path', () => {
        const cmd = `osascript <<'APPLESCRIPT'\nset poemPath to POSIX path of (path to home folder) & "Desktop/Ideas/NYUBuddy/poem.txt"\ntell application "Finder" to delete (POSIX file poemPath as alias)\nend`;
        const result = extractFileOpFromCommand(cmd);
        assert.ok(result, 'Should detect delete op');
        assert.strictEqual(result!.type, 'delete');
        assert.strictEqual(result!.path, `${HOME}/Desktop/Ideas/NYUBuddy/poem.txt`);
    });

    it('osascript delete with desktop folder path', () => {
        const cmd = `osascript <<'APPLESCRIPT'\nset f to POSIX path of (path to desktop folder) & "test/file.txt"\ntell application "Finder" to move (POSIX file f as alias) to trash\nend`;
        const result = extractFileOpFromCommand(cmd);
        assert.ok(result);
        assert.strictEqual(result!.type, 'delete');
        assert.strictEqual(result!.path, `${HOME}/Desktop/test/file.txt`);
    });

    it('rm command with absolute path', () => {
        const cmd = 'rm -f /tmp/test/file.txt';
        const result = extractFileOpFromCommand(cmd);
        assert.ok(result);
        assert.strictEqual(result!.type, 'delete');
        assert.strictEqual(result!.path, '/tmp/test/file.txt');
    });

    it('rm with $HOME variable', () => {
        const cmd = 'rm $HOME/Desktop/old-file.txt';
        const result = extractFileOpFromCommand(cmd);
        assert.ok(result);
        assert.strictEqual(result!.type, 'delete');
        assert.strictEqual(result!.path, `${HOME}/Desktop/old-file.txt`);
    });

    // ─── WRITE ───

    it('cat > with absolute path', () => {
        const cmd = `cat > /Users/test/project/file.txt <<'EOF'\nHello\nEOF`;
        const result = extractFileOpFromCommand(cmd);
        assert.ok(result);
        assert.strictEqual(result!.type, 'write');
        assert.strictEqual(result!.path, '/Users/test/project/file.txt');
    });

    it('echo > with path', () => {
        const cmd = 'echo "hello" > /tmp/output.txt';
        const result = extractFileOpFromCommand(cmd);
        assert.ok(result);
        assert.strictEqual(result!.type, 'write');
        assert.strictEqual(result!.path, '/tmp/output.txt');
    });

    it('tee with path', () => {
        const cmd = 'echo "data" | tee /tmp/log.txt';
        const result = extractFileOpFromCommand(cmd);
        assert.ok(result);
        assert.strictEqual(result!.type, 'write');
        assert.strictEqual(result!.path, '/tmp/log.txt');
    });

    // ─── NO MATCH ───

    it('ls command → null', () => {
        const result = extractFileOpFromCommand('ls -la /tmp');
        assert.strictEqual(result, null);
    });

    it('git command → null', () => {
        const result = extractFileOpFromCommand('git status');
        assert.strictEqual(result, null);
    });

    it('empty string → null', () => {
        const result = extractFileOpFromCommand('');
        assert.strictEqual(result, null);
    });
});
