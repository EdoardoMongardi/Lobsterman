import { NormalizedEvent, SupervisorState } from './types';
import { updateStateFromEvent } from './state-updater';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function createInitialState(): SupervisorState {
    return {
        sessionId: crypto.randomUUID(),
        originalTask: '',
        constraints: [],
        currentPhase: 'starting',
        recentKeyActions: [],
        progressMarkers: [],
        activeRedFlags: [],
        riskLevel: 'low',
        lastMeaningfulProgressAt: null,
        recommendedAction: 'none',
        stats: {
            totalEvents: 0,
            repeatedActionCount: 0,
            largeOutputCount: 0,
            riskyActionCount: 0,
        },
    };
}

class StateStore {
    private state: SupervisorState;
    private events: NormalizedEvent[] = [];
    private eventsSinceLastWrite: number = 0;
    private lastWriteTime: number = 0;

    constructor() {
        this.state = createInitialState();
        ensureDataDir();
    }

    getState(): SupervisorState {
        return { ...this.state };
    }

    getEvents(since?: number): NormalizedEvent[] {
        if (since === undefined || since === 0) {
            return [...this.events];
        }
        return this.events.filter((e) => e.sequence > since);
    }

    getAllEvents(): NormalizedEvent[] {
        return [...this.events];
    }

    pushEvent(event: NormalizedEvent): void {
        this.events.push(event);

        // Run state updater
        const updates = updateStateFromEvent(event, this.state);
        this.state = { ...this.state, ...updates };

        // Persist
        this.appendEvent(event);
        this.eventsSinceLastWrite++;
        this.persistThrottled();
    }

    updateState(partial: Partial<SupervisorState>): void {
        this.state = { ...this.state, ...partial };
    }

    reset(): void {
        this.state = createInitialState();
        this.events = [];
        this.eventsSinceLastWrite = 0;
        this.lastWriteTime = 0;
    }

    private appendEvent(event: NormalizedEvent): void {
        try {
            fs.appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n');
        } catch {
            // Silently fail file writes — in-memory state is the source of truth
        }
    }

    private persistThrottled(): void {
        const now = Date.now();
        const shouldWrite =
            this.eventsSinceLastWrite >= 5 || now - this.lastWriteTime >= 2000;

        if (shouldWrite) {
            try {
                fs.writeFileSync(SESSION_FILE, JSON.stringify(this.state, null, 2));
            } catch {
                // Silently fail
            }
            this.eventsSinceLastWrite = 0;
            this.lastWriteTime = now;
        }
    }
}

// Singleton
export const stateStore = new StateStore();
