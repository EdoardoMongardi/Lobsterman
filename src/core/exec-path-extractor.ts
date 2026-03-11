/**
 * Shared path extraction utility for exec-based file operations.
 *
 * OpenClaw uses exec/osascript for most file operations rather than
 * direct file tools. This module parses command strings to extract
 * file paths and classify the operation type.
 */

import * as os from 'os';

export type FileOpType = 'write' | 'delete';

export interface ExtractedFileOp {
    type: FileOpType;
    path: string; // Resolved absolute path
}

const HOME_DIR = os.homedir();

export function resolveHome(p: string): string {
    return p
        .replace(/\$HOME/g, HOME_DIR)
        .replace(/\$\{HOME\}/g, HOME_DIR)
        .replace(/^~\//g, HOME_DIR + '/');
}

/**
 * Extract a file operation from an exec command string.
 * Returns null if no operation can be reliably extracted.
 */
export function extractFileOpFromCommand(command: string): ExtractedFileOp | null {
    // ─── DELETE operations ───

    // osascript delete pattern:
    //   set varName to POSIX path of (path to home folder) & "relative/path"
    if (/osascript[\s\S]*(delete|trash)/i.test(command)) {
        // Pattern: POSIX path of (path to home folder) & "..."
        const homeMatch = command.match(
            /POSIX\s+path\s+of\s+\(path\s+to\s+home\s+folder\)\s*&\s*"([^"]+)"/i
        );
        if (homeMatch) {
            return { type: 'delete', path: HOME_DIR + '/' + homeMatch[1] };
        }

        // Pattern: POSIX path of (path to desktop folder)) & "..."
        const desktopMatch = command.match(
            /POSIX\s+path\s+of\s+\(path\s+to\s+desktop\s+folder\)\)?\s*&\s*"([^"]+)"/i
        );
        if (desktopMatch) {
            return { type: 'delete', path: HOME_DIR + '/Desktop/' + desktopMatch[1] };
        }

        // Pattern: POSIX file "absolute/path"
        const posixFileMatch = command.match(/POSIX\s+(?:path\s+)?file\s+"([^"]+)"/i);
        if (posixFileMatch) {
            const resolved = resolveHome(posixFileMatch[1]);
            if (resolved.startsWith('/')) {
                return { type: 'delete', path: resolved };
            }
        }
    }

    // Shell rm
    const rmMatch = command.match(/\brm\s+(?:-\w+\s+)*"?([^"<\n\s;|&]+)"?/);
    if (rmMatch) {
        const resolved = resolveHome(rmMatch[1].trim());
        if (resolved.startsWith('/')) {
            return { type: 'delete', path: resolved };
        }
    }

    // ─── WRITE operations ───

    // cat > "path" <<'EOF'
    const catMatch = command.match(/\bcat\s+>\s*"?([^"<\n;|&]+)"?/);
    if (catMatch) {
        const resolved = resolveHome(catMatch[1].trim());
        if (resolved.startsWith('/')) {
            return { type: 'write', path: resolved };
        }
    }

    // echo "..." > "path"  or  printf "..." > "path"
    const redirectMatch = command.match(/(?:echo|printf)\s+[^>]+>\s*"?([^"<\n;|&]+)"?/);
    if (redirectMatch) {
        const resolved = resolveHome(redirectMatch[1].trim());
        if (resolved.startsWith('/')) {
            return { type: 'write', path: resolved };
        }
    }

    // tee "path"
    const teeMatch = command.match(/\btee\s+"?([^"<\n;|&\s]+)"?/);
    if (teeMatch) {
        const resolved = resolveHome(teeMatch[1].trim());
        if (resolved.startsWith('/')) {
            return { type: 'write', path: resolved };
        }
    }

    return null;
}
