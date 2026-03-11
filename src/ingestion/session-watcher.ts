/**
 * Session Watcher — auto-detects new/active OpenClaw sessions.
 *
 * Discovers all agent session directories under OPENCLAW_STATE_DIR
 * (default: ~/.openclaw). Uses sessions.json as the metadata/registry
 * source and *.jsonl files as event transcript sources.
 *
 * Supports multi-agent setups (discovers all agents under agents/ directory).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface SessionInfo {
    sessionId: string;
    agentId: string;
    sessionFile: string;
    updatedAt: number;
    lastChannel: string;
}

/**
 * Resolves the OpenClaw state directory from env or default.
 */
function getStateDir(): string {
    const envDir = process.env.OPENCLAW_STATE_DIR;
    if (envDir) {
        return envDir.startsWith('~')
            ? path.join(os.homedir(), envDir.slice(1))
            : envDir;
    }
    return path.join(os.homedir(), '.openclaw');
}

/**
 * Discover all agent IDs by listing agents/<agentId>/sessions/ dirs.
 */
function discoverAgents(stateDir: string): string[] {
    const agentsDir = path.join(stateDir, 'agents');
    if (!fs.existsSync(agentsDir)) return [];

    return fs.readdirSync(agentsDir).filter((name) => {
        const sessionsDir = path.join(agentsDir, name, 'sessions');
        return fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory();
    });
}

/**
 * Read sessions.json for a given agent to get session metadata.
 */
function readSessionsRegistry(stateDir: string, agentId: string): Map<string, SessionInfo> {
    const sessionsJsonPath = path.join(stateDir, 'agents', agentId, 'sessions', 'sessions.json');
    const sessions = new Map<string, SessionInfo>();

    if (!fs.existsSync(sessionsJsonPath)) return sessions;

    try {
        const raw = fs.readFileSync(sessionsJsonPath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, {
            sessionId: string;
            updatedAt: number;
            sessionFile?: string;
            lastChannel?: string;
        }>;

        for (const [key, entry] of Object.entries(parsed)) {
            if (!entry.sessionId) continue;

            // Derive session file path if not explicitly set
            const sessionFile = entry.sessionFile
                ?? path.join(stateDir, 'agents', agentId, 'sessions', `${entry.sessionId}.jsonl`);

            sessions.set(key, {
                sessionId: entry.sessionId,
                agentId,
                sessionFile,
                updatedAt: entry.updatedAt ?? 0,
                lastChannel: entry.lastChannel ?? 'unknown',
            });
        }
    } catch (err) {
        console.warn(`[Lobsterman] Failed to read sessions.json for agent "${agentId}":`, err);
    }

    return sessions;
}

/**
 * Find the most recently updated session across all agents.
 */
export function findLatestSession(): SessionInfo | null {
    const stateDir = getStateDir();
    const agentIds = discoverAgents(stateDir);

    if (agentIds.length === 0) {
        console.warn(`[Lobsterman] No agents found in ${stateDir}/agents/`);
        return null;
    }

    let latest: SessionInfo | null = null;

    for (const agentId of agentIds) {
        const sessions = readSessionsRegistry(stateDir, agentId);
        for (const session of sessions.values()) {
            // Only consider sessions that have a transcript file on disk
            if (!fs.existsSync(session.sessionFile)) continue;

            if (!latest || session.updatedAt > latest.updatedAt) {
                latest = session;
            }
        }
    }

    if (!latest) {
        console.warn(`[Lobsterman] No sessions with transcript files found`);
    }

    return latest;
}

/**
 * SessionWatcher — polls for new sessions and notifies via callback.
 */
export class SessionWatcher {
    private stateDir: string;
    private pollInterval: ReturnType<typeof setInterval> | null = null;
    private currentSessionId: string | null = null;
    private onNewSession: ((session: SessionInfo) => void) | null = null;

    constructor() {
        this.stateDir = getStateDir();
    }

    /**
     * Start watching for new sessions. Calls onNewSession when a new
     * or different session becomes the latest.
     */
    start(
        onNewSession: (session: SessionInfo) => void,
        pollMs: number = 3000,
    ): void {
        this.onNewSession = onNewSession;

        // Initial check
        const initial = findLatestSession();
        if (initial) {
            console.log(`[Lobsterman] Session watcher found initial session: ${initial.sessionId} → ${initial.sessionFile}`);
            this.currentSessionId = initial.sessionId;
            this.onNewSession(initial);
        } else {
            console.warn(`[Lobsterman] Session watcher: no initial session found (stateDir: ${this.stateDir})`);
        }

        // Poll for changes
        this.pollInterval = setInterval(() => {
            const latest = findLatestSession();
            if (!latest) return;

            if (latest.sessionId !== this.currentSessionId) {
                console.log(`[Lobsterman] New session detected: ${latest.sessionId} (was: ${this.currentSessionId ?? 'none'})`);
                this.currentSessionId = latest.sessionId;
                this.onNewSession!(latest);
            }
        }, pollMs);
    }

    stop(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    getCurrentSessionId(): string | null {
        return this.currentSessionId;
    }
}
