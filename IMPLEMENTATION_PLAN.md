# OpenClaw Watchtower — Detailed Implementation Plan

> Step-by-step build guide with human-in-the-loop checkpoints for Claude-assisted execution.
> Each phase has explicit stop/continue conditions and manual verification gates.
> Estimated total build time for a strong engineer: 2–3 focused days.

---

## Execution Protocol

### Autonomy Levels

| Label | Meaning |
|---|---|
| 🟢 **Claude autonomous** | Claude may complete this step without stopping |
| 🟡 **Claude pauses after** | Claude completes this step, then stops and waits for user |
| 🔴 **Human required** | User must provide input, sample, or judgment before Claude proceeds |

### General Rules

1. Claude completes all tasks within a phase, then **stops at the phase checkpoint**.
2. Claude does **not** proceed to the next phase until the user explicitly confirms.
3. If Claude encounters an unexpected error mid-phase, it should **stop and report** rather than improvise a fix.
4. Claude should **never guess** external schemas, real file formats, or runtime behaviors it cannot verify.
5. After a phase is approved, Claude should **not modify files from previously approved phases** unless the user explicitly asks for it, or a minimal fix is required for the current phase to compile/run.
6. Before stopping at a phase checkpoint, Claude should **run all local validation it can perform itself** (e.g., `npx tsc --noEmit`, `npm run build`, sanity-checking API responses with `curl`). Only browser-based and product-judgment checks are left for the user.
7. When stopping at a checkpoint, Claude must **report in this format**:
   - **Completed:** what files/features were implemented
   - **Verify:** what the user must check (with exact commands to run)
   - **Continue phrase:** the exact confirmation phrase the user should say to proceed

---

## Phase 0: Bootstrap

### Goal
Runnable Next.js 15 + TypeScript + Tailwind v4 project. Empty folder structure in place.

### Steps

#### 0.1 — Initialize project 🟢

```bash
cd /Users/edoardomongardi/Desktop/Ideas/lobsterman
npx -y create-next-app@latest ./ \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-turbopack
```

#### 0.2 — Create folder skeleton 🟢

```bash
mkdir -p src/core src/rules src/ingestion src/components src/lib data
touch src/core/types.ts
touch src/core/event-normalizer.ts
touch src/core/state-store.ts
touch src/core/state-updater.ts
touch src/core/rule-engine.ts
touch src/core/intervention.ts
touch src/core/engine.ts
touch src/rules/context-danger.ts
touch src/rules/looping.ts
touch src/rules/risky-action.ts
touch src/ingestion/source.ts
touch src/ingestion/mock-source.ts
touch src/ingestion/file-source.ts
touch src/lib/demo-scenario.ts
touch src/lib/utils.ts
echo "data/" >> .gitignore
```

#### 0.3 — Create `.env.local` 🟢

```env
WATCHTOWER_MODE=demo
WATCHTOWER_PROJECT_ROOT=/Users/example/project
```

### Done criteria
- `npm run dev` starts without errors
- All folders and empty files exist
- `.env.local` created

### 🟡 Human Checkpoint — Phase 0

**Claude stops here.** User must manually verify:

- [ ] `npm install` completed without errors
- [ ] `npm run dev` starts and serves at `localhost:3000`
- [ ] Default Next.js page loads in browser
- [ ] All folders (`src/core/`, `src/rules/`, `src/ingestion/`, `src/components/`, `src/lib/`) exist

**Claude continue condition:** User confirms local dev environment is running.

---

## Phase 1: Core Types + Mock Data + In-Memory Session Engine

### Goal
All TypeScript interfaces defined. Mock source emits events on a timer. State store receives events and updates. Throttled persistence to disk.

### Files & Specifications

---

#### 1.1 — `src/core/types.ts` 🟢

Every type used across the entire project. This file is the single source of truth.

```typescript
// ─── Event Types ───

export type EventType =
  | 'tool_call'
  | 'tool_result'
  | 'assistant_message'
  | 'user_message'
  | 'error'
  | 'system';

export type EventSource = 'mock' | 'file';

export interface NormalizedEvent {
  id: string;
  timestamp: number;
  sequence: number;
  type: EventType;
  source: EventSource;
  tool?: string;
  target?: string;
  payloadSize: number;
  summary: string;
  rawSnippet?: string;         // max 200 chars
  tags: string[];
}

// ─── Raw event from ingestion (before normalization) ───

export interface RawEvent {
  type: string;
  tool?: string;
  target?: string;
  content?: string;
  error?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

// ─── State Types ───

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type PhaseStatus = 'starting' | 'working' | 'warning' | 'critical';
export type InterventionType = 'none' | 'review' | 'pause' | 'stop';
export type RedFlagCategory = 'context_danger' | 'looping' | 'risky_action';

export interface KeyAction {
  sequence: number;
  timestamp: number;
  summary: string;
  tool?: string;
  target?: string;
}

export interface ProgressMarker {
  sequence: number;
  timestamp: number;
  description: string;
  type: 'file_created' | 'file_edited' | 'build_passed' | 'test_passed'
      | 'command_succeeded' | 'patch_applied' | 'other';
}

export interface RedFlag {
  id: string;
  category: RedFlagCategory;
  ruleId: string;
  severity: RiskLevel;
  title: string;
  reason: string;
  suggestedAction: string;
  triggeredAt: number;
  relatedEventId: string;
}

export interface SupervisorState {
  sessionId: string;
  originalTask: string;
  constraints: string[];
  currentPhase: PhaseStatus;
  recentKeyActions: KeyAction[];
  progressMarkers: ProgressMarker[];
  activeRedFlags: RedFlag[];
  riskLevel: RiskLevel;
  lastMeaningfulProgressAt: number | null;
  recommendedAction: InterventionType;
  stats: {
    totalEvents: number;
    repeatedActionCount: number;
    largeOutputCount: number;
    riskyActionCount: number;
  };
}

// ─── Rule Types ───

export interface Rule {
  id: string;
  category: RedFlagCategory;
  name: string;
  enabled: boolean;
  evaluate: (
    event: NormalizedEvent,
    state: SupervisorState,
    recentEvents: NormalizedEvent[]
  ) => RedFlag | null;
}

// ─── API Response Types ───

export interface DashboardResponse {
  state: SupervisorState;
  updatedAt: number;
}

export interface EventsResponse {
  events: NormalizedEvent[];
  total: number;
}

// ─── Ingestion Types ───

export type EventCallback = (event: NormalizedEvent) => void;

export interface EventSourceAdapter {
  start: (callback: EventCallback) => void;
  stop: () => void;
  isRunning: () => boolean;
}
```

---

#### 1.2 — `src/core/event-normalizer.ts` 🟢

Converts `RawEvent` → `NormalizedEvent`. Assigns IDs and sequence numbers.

```typescript
// Key exports:
export function normalizeEvent(
  raw: RawEvent,
  sequence: number,
  source: EventSource
): NormalizedEvent;

// Internal helpers:
function generateId(): string;              // crypto.randomUUID()
function extractTags(raw: RawEvent): string[];
function computePayloadSize(raw: RawEvent): number;
function buildSummary(raw: RawEvent): string;
function truncateSnippet(content: string | undefined, maxLen: number): string | undefined;
```

Logic:
- `id`: use `crypto.randomUUID()`
- `timestamp`: use `raw.timestamp ?? Date.now()`
- `payloadSize`: `JSON.stringify(raw.content ?? '').length`
- `summary`: `"[{type}] {tool} → {target}"` or `"[{type}] {first 80 chars of content}"`
- `rawSnippet`: first 200 chars of `raw.content`
- `tags`: split target path segments + tool name

---

#### 1.3 — `src/ingestion/source.ts` 🟢

Re-export the `EventSourceAdapter` interface (already in types). This file exists for clarity and to attach JSDoc describing the adapter contract.

---

#### 1.4 — `src/lib/demo-scenario.ts` 🟢

Pre-scripted array of 40 `RawEvent` objects telling the demo story.

```typescript
export const DEMO_TASK = "Refactor the authentication module to use JWT tokens instead of session cookies. Do not modify test files.";

export const DEMO_CONSTRAINTS = [
  "Do not modify test files",
  "Keep backward compatibility with existing API",
  "Use the project's existing JWT library"
];

export const DEMO_EVENTS: RawEvent[] = [
  // Events 1–15: Normal progress
  // Event 1: Read task, plan approach
  // Event 2: List files in auth/ directory
  // Event 3: Read auth/session.ts
  // Event 4: Create auth/jwt-provider.ts ← progress marker
  // Event 5: Edit auth/middleware.ts ← progress marker
  // ...etc, mix of tool_call, tool_result, assistant_message
  // Include some file_created / file_edited events to trigger progress markers

  // Events 16–22: Context danger zone
  // Event 16: tool_result with 8KB output (large file dump)
  // Event 17: tool_result with 6KB output (another large read)
  // Event 18: tool_result with 10KB output (grep with huge results)
  // ...3+ large outputs in sliding window triggers context danger

  // Events 23–30: Looping zone
  // Event 23: tool_call run_command "npm run build" → error
  // Event 24: tool_call run_command "npm run build" → same error
  // Event 25: tool_call run_command "npm run build" → same error
  // ...same tool+target repeated, same error signature

  // Events 31–35: Risky action zone
  // Event 31: tool_call edit_file target="/Users/example/OTHER-PROJECT/config.ts"
  // Event 32: tool_call edit_file target=".env"
  // Event 33: tool_call run_command "rm -rf dist/"
  // ...paths outside root, sensitive files

  // Events 36–40: Continued warnings, risk escalation
  // Events that keep the warnings active while new events arrive
];
```

Each event should be a realistic-looking object. Include realistic file paths, tool names (matching OpenClaw's actual tool names like `view_file`, `replace_file_content`, `run_command`, `grep_search`), and outputs.

---

#### 1.5 — `src/ingestion/mock-source.ts` 🟢

Emits demo events on a 1.5-second timer.

```typescript
export class MockEventSource implements EventSourceAdapter {
  private intervalId: NodeJS.Timeout | null = null;
  private currentIndex: number = 0;
  private running: boolean = false;

  start(callback: EventCallback): void;
    // Set interval at 1500ms
    // On each tick: normalize DEMO_EVENTS[currentIndex], call callback, increment
    // When all events emitted, stop

  stop(): void;
    // Clear interval, set running = false

  isRunning(): boolean;
    // Return this.running
}
```

---

#### 1.6 — `src/core/state-store.ts` 🟢

Singleton in-memory store for `SupervisorState` and event history.

```typescript
class StateStore {
  private state: SupervisorState;
  private events: NormalizedEvent[] = [];
  private eventsSinceLastWrite: number = 0;
  private lastWriteTime: number = 0;

  constructor();
    // Initialize with default empty state

  getState(): SupervisorState;
  getEvents(since?: number): NormalizedEvent[];
  getAllEvents(): NormalizedEvent[];

  pushEvent(event: NormalizedEvent): void;
    // Append to events array
    // Trigger state update via stateUpdater
    // Trigger throttled persist

  updateState(partial: Partial<SupervisorState>): void;

  private persistThrottled(): void;
    // Write session.json if 5+ events since last write OR 2+ seconds elapsed
    // Always append event to events.jsonl

  reset(): void;
    // Reset to initial state, clear events
}

// Export singleton
export const stateStore: StateStore;
```

Initial state shape:
```typescript
{
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
  stats: { totalEvents: 0, repeatedActionCount: 0, largeOutputCount: 0, riskyActionCount: 0 }
}
```

---

#### 1.7 — `src/core/state-updater.ts` 🟢

Pure function that computes state mutations from an incoming event.

```typescript
export function updateStateFromEvent(
  event: NormalizedEvent,
  currentState: SupervisorState
): Partial<SupervisorState>;
```

Logic:
1. Increment `stats.totalEvents`
2. Append to `recentKeyActions` (cap at 10, drop oldest)
3. Detect progress markers:
   - If event is `tool_call` with tool `write_to_file` or type includes "create" → `file_created`
   - If tool is `replace_file_content` or `multi_replace_file_content` → `file_edited`
   - If tool is `run_command` AND previous event was an error AND this is success → `command_succeeded`
   - Append to `progressMarkers` (cap at 20), update `lastMeaningfulProgressAt`
4. Set `currentPhase` based on event count: < 3 = `'starting'`, else `'working'`
5. If there are active red flags → phase = `'warning'` or `'critical'`

---

#### 1.8 — `src/lib/utils.ts` 🟢

```typescript
export function formatTimestamp(ts: number): string;
export function truncate(str: string, maxLen: number): string;
export function riskLevelToNumber(level: RiskLevel): number;
  // low=0, medium=1, high=2, critical=3
export function maxRiskLevel(a: RiskLevel, b: RiskLevel): RiskLevel;
```

### Done criteria
- `types.ts` compiles clean
- MockEventSource emits 40 events on a timer and stops
- StateStore updates from events, recentKeyActions cap works, progress markers detected
- `session.json` written throttled (not every event)
- `events.jsonl` appended per event

### 🟡 Human Checkpoint — Phase 1

**Claude stops here.** Claude should have completed all files 1.1–1.8 and verified they compile (`npx tsc --noEmit`).

**User must manually verify:**

- [ ] `npx tsc --noEmit` passes (Claude should have run this already, but user confirms)
- [ ] Start a quick test: temporarily wire `MockEventSource` to log events to console, run `npm run dev`, confirm events emit every ~1.5s
- [ ] Confirm events stop after 40 emissions (no runaway intervals)
- [ ] Check `data/events.jsonl` — lines are being appended
- [ ] Check `data/session.json` — file exists and is not written on every single event (throttled)
- [ ] Inspect the `SupervisorState` shape in `session.json` — looks correct, recentKeyActions capped at 10
- [ ] No duplicate timers or race conditions visible in console output

**Claude continue condition:** User confirms "Phase 1 verified, continue to Phase 2."

---

## Phase 2: Rule Engine + 6 Rules

### Goal
Deterministic rule engine runs all 6 rules on each event. Red flags are added to state. Intervention recommender maps flags → action.

### Files & Specifications

---

#### 2.1 — `src/core/rule-engine.ts` 🟢

```typescript
import { Rule, NormalizedEvent, SupervisorState, RedFlag } from './types';

export class RuleEngine {
  private rules: Rule[] = [];

  registerRule(rule: Rule): void;
  registerRules(rules: Rule[]): void;

  evaluate(
    event: NormalizedEvent,
    state: SupervisorState,
    recentEvents: NormalizedEvent[]
  ): RedFlag[];
    // Run each enabled rule
    // Collect non-null results
    // Return array of new RedFlag objects

  getRules(): Rule[];
}

export const ruleEngine: RuleEngine;  // singleton
```

---

#### 2.2 — `src/rules/context-danger.ts` 🟢

```typescript
export const contextDangerRules: Rule[] = [
  {
    id: 'cd-large-output',
    category: 'context_danger',
    name: 'Single Large Output',
    enabled: true,
    evaluate(event, state, recentEvents): RedFlag | null {
      // Trigger if: event.type === 'tool_result' && event.payloadSize > 5120
      // Severity: 'medium'
      // Reason: "Tool output was {size}KB — large outputs consume context and risk losing earlier information"
      // Suggested action: "Consider pausing to review if the agent is reading unnecessarily large files"
    }
  },

  {
    id: 'cd-repeated-large',
    category: 'context_danger',
    name: 'Repeated Large Outputs',
    enabled: true,
    evaluate(event, state, recentEvents): RedFlag | null {
      // Count events in last 10 where payloadSize > 5120
      // Trigger if count >= 3
      // Severity: 'high'
      // Reason: "{count} large outputs in the last 10 events — context is filling with noise"
      // Suggested action: "Context is at risk. Consider pausing and asking the agent to summarize its current state"
    }
  },

  // ─── DEFERRED RULES (TODO) ───
  // {
  //   id: 'cd-long-run-no-summary',
  //   enabled: false,
  //   // 50+ events without a state summary or compression step
  // },
  // {
  //   id: 'cd-task-drift',
  //   enabled: false,
  //   // Task focus score declining — requires keyword/embedding comparison
  // },
];
```

---

#### 2.3 — `src/rules/looping.ts` 🟢

```typescript
export const loopingRules: Rule[] = [
  {
    id: 'lp-repeated-tool-target',
    category: 'looping',
    name: 'Repeated Tool+Target',
    enabled: true,
    evaluate(event, state, recentEvents): RedFlag | null {
      // Count recent events (last 15) where tool === event.tool AND target === event.target
      // Trigger if count >= 3 (including current event)
      // Severity: 'medium' (3 repeats), 'high' (5+)
      // Reason: "{tool} has been called on {target} {count} times recently"
      // Suggested action: "The agent may be stuck. Consider reviewing its approach or redirecting."
    }
  },

  {
    id: 'lp-error-retry-loop',
    category: 'looping',
    name: 'Error-Retry Loop',
    enabled: true,
    evaluate(event, state, recentEvents): RedFlag | null {
      // Look at last 6 events for pattern: error, tool_call, error, tool_call, error
      // Check if error messages share same signature (first 100 chars match)
      // Trigger if 2+ identical errors with retries between them
      // Severity: 'critical'
      // Reason: "Same error repeated {count} times with retries — the agent is stuck in a loop"
      // Suggested action: "STOP recommended. The agent is retrying the same failing approach."
    }
  },

  // ─── DEFERRED RULES (TODO) ───
  // {
  //   id: 'lp-similar-actions',
  //   enabled: false,
  //   // Jaccard similarity on action params within sliding window
  // },
  // {
  //   id: 'lp-no-progress',
  //   enabled: false,
  //   // No progress marker in 20+ events
  // },
];
```

---

#### 2.4 — `src/rules/risky-action.ts` 🟢

```typescript
// Constants
const SENSITIVE_FILE_PATTERNS = [
  /\.env($|\.)/i,
  /\.pem$/i,
  /\.key$/i,
  /secrets?\./i,
  /credentials/i,
  /\.ssh\//i,
  /id_rsa/i,
  /\.aws\//i,
  /config\.json$/i,
  /docker-compose/i,
];

const DESTRUCTIVE_COMMAND_PATTERNS = [
  /rm\s+(-rf?|--recursive)/i,
  /DROP\s+(TABLE|DATABASE)/i,
  /DELETE\s+FROM/i,
  /truncate\s+table/i,
  /format\s+/i,
  /mkfs\./i,
  />\s*\/dev\//i,
  /chmod\s+777/i,
];

export const riskyActionRules: Rule[] = [
  {
    id: 'ra-path-outside-root',
    category: 'risky_action',
    name: 'Path Outside Project Root',
    enabled: true,
    evaluate(event, state, recentEvents): RedFlag | null {
      // Check event.target
      // If target is an absolute path and does NOT start with projectRoot
      // Trigger
      // Severity: 'critical'
      // Reason: "Action targets {target} which is outside the project root {projectRoot}"
      // Suggested action: "STOP immediately. The agent is modifying files outside the project."
      // Get projectRoot from env or state config
    }
  },

  {
    id: 'ra-sensitive-destructive',
    category: 'risky_action',
    name: 'Sensitive File or Destructive Command',
    enabled: true,
    evaluate(event, state, recentEvents): RedFlag | null {
      // Check event.target against SENSITIVE_FILE_PATTERNS
      // Check event.rawSnippet or event.target against DESTRUCTIVE_COMMAND_PATTERNS
      // Trigger if either matches
      // Severity: 'high'
      // Reason: "Agent is touching sensitive file {target}" or "Destructive command detected: {snippet}"
      // Suggested action: "Review this action before allowing the agent to continue."
    }
  },

  // ─── DEFERRED RULES (TODO) ───
  // {
  //   id: 'ra-unexpected-domain',
  //   enabled: false,
  //   // Browser navigation to domain not in allowlist
  // },
  // {
  //   id: 'ra-action-task-mismatch',
  //   enabled: false,
  //   // Compare action target keywords vs. original task keywords
  // },
];
```

---

#### 2.5 — `src/core/intervention.ts` 🟢

Maps current flag state → recommended action.

```typescript
export function computeIntervention(flags: RedFlag[]): InterventionType {
  // If any flag severity is 'critical' → 'stop'
  // If 2+ flags are 'high' → 'pause'
  // If any flag is 'high' → 'review'
  // If any flag is 'medium' → 'review'
  // Otherwise → 'none'
}

export function computeRiskLevel(flags: RedFlag[]): RiskLevel {
  // Return the maximum severity across all active flags
  // If no flags → 'low'
}
```

---

#### 2.6 — `src/core/engine.ts` — Wire rules into engine 🟢

```typescript
import { ruleEngine } from './rule-engine';
import { contextDangerRules } from '../rules/context-danger';
import { loopingRules } from '../rules/looping';
import { riskyActionRules } from '../rules/risky-action';

export function initializeEngine(): void {
  ruleEngine.registerRules([
    ...contextDangerRules,
    ...loopingRules,
    ...riskyActionRules,
  ]);
}
```

### Done criteria
- All 6 rules compile and are registered
- Feeding the 40 demo events through the engine produces:
  - Context danger flags around events 16–22
  - Looping flags around events 23–30
  - Risky action flags around events 31–35
- Intervention recommender returns 'stop' when critical flags are present
- Deferred rules exist as disabled stubs in each file

### 🟡 Human Checkpoint — Phase 2

**Claude stops here.** Claude should have completed all rule files, verified they compile (`npx tsc --noEmit`), and confirmed the build passes (`npm run build`).

Claude should **log the rule evaluation results to console** during the demo run so the user can inspect timing. Example:
```typescript
console.log(`[Rule Triggered] event #${event.sequence}: ${flag.title}`);
```

**User must manually verify:**

- [ ] Run `npm run dev`, watch console output as demo events emit
- [ ] **Context danger** rules trigger around events 16–22 (not earlier, not much later)
- [ ] **Looping** rules trigger around events 23–30
- [ ] **Risky action** rules trigger around events 31–35
- [ ] Warnings do NOT trigger during the normal progress phase (events 1–15)
- [ ] Warning reasons read clearly — would a human understand them?
- [ ] Suggested actions make intuitive sense
- [ ] Risk level escalates: low → medium → high → critical
- [ ] No false positives in the normal phase
- [ ] Intervention recommender outputs match: review → pause → stop as severity escalates
- [ ] Thresholds feel right — not too sensitive, not too weak

**If thresholds feel wrong:** User tells Claude which rules are too sensitive or too weak, and Claude adjusts constants (e.g., payload size threshold, repeat count, sliding window size).

**Claude continue condition:** User confirms "Rule behavior verified, thresholds OK, continue to Phase 3."

---

## Phase 3: API Routes + Engine Wiring

### Goal
Two API endpoints serve dashboard state and events. Engine initializes lazily on first request.

### Files & Specifications

---

#### 3.1 — `src/core/engine.ts` (expand from 2.6) 🟢

Full engine orchestrator — lazy singleton.

```typescript
let initialized = false;

export function getEngine(): { stateStore: StateStore } {
  if (!initialized) {
    initializeEngine();          // register rules
    initializeSource();          // start mock or file source
    initialized = true;
  }
  return { stateStore };
}

function initializeSource(): void {
  const mode = process.env.WATCHTOWER_MODE ?? 'demo';

  if (mode === 'demo') {
    const source = new MockEventSource();
    source.start((event) => {
      // 1. Push event to stateStore
      // 2. Run rule engine
      // 3. Update flags + risk level + intervention in state
    });
  }
  // Future: else if (mode === 'file') { ... }
}
```

The callback wired to the source should:
1. `stateStore.pushEvent(event)` — stores event, runs state updater
2. `ruleEngine.evaluate(event, stateStore.getState(), stateStore.getEvents().slice(-15))` — get new flags
3. Merge new flags into `activeRedFlags` (deduplicate by `ruleId`, keep latest)
4. `computeRiskLevel(activeRedFlags)` → update `riskLevel`
5. `computeIntervention(activeRedFlags)` → update `recommendedAction`
6. Update `currentPhase` if `riskLevel >= high` → `'critical'`, if any flag → `'warning'`

---

#### 3.2 — `src/app/api/dashboard/route.ts` 🟢

```typescript
import { NextResponse } from 'next/server';
import { getEngine } from '@/core/engine';

export const dynamic = 'force-dynamic';  // disable caching

export async function GET() {
  const { stateStore } = getEngine();
  const response: DashboardResponse = {
    state: stateStore.getState(),
    updatedAt: Date.now(),
  };
  return NextResponse.json(response);
}
```

---

#### 3.3 — `src/app/api/events/route.ts` 🟢

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/core/engine';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { stateStore } = getEngine();
  const since = Number(request.nextUrl.searchParams.get('since') ?? 0);
  const events = stateStore.getEvents(since);
  const response: EventsResponse = {
    events,
    total: stateStore.getAllEvents().length,
  };
  return NextResponse.json(response);
}
```

### Done criteria
- `curl http://localhost:3000/api/dashboard` returns valid `DashboardResponse` JSON
- Repeated calls show `stats.totalEvents` incrementing
- `curl http://localhost:3000/api/events?since=0` returns growing event list
- `curl http://localhost:3000/api/events?since=10` returns only events after sequence 10
- Red flags appear in the dashboard response at the correct event numbers

### 🟡 Human Checkpoint — Phase 3

**Claude stops here.** Claude should have verified both endpoints respond with `curl`.

**User must manually verify:**

- [ ] Run `npm run dev`
- [ ] `curl http://localhost:3000/api/dashboard | jq .` — returns valid JSON
- [ ] Call `/api/dashboard` twice, 3 seconds apart — `stats.totalEvents` has incremented
- [ ] `curl "http://localhost:3000/api/events?since=0"` — returns events array
- [ ] `curl "http://localhost:3000/api/events?since=10"` — returns only events with sequence > 10
- [ ] Red flags appear in dashboard response around the expected event numbers
- [ ] Engine does NOT initialize multiple times (no duplicate timers — check console for repeated "engine started" logs)
- [ ] State and events feel synchronized — no obvious data mismatch between the two endpoints

**Claude continue condition:** User confirms "API endpoints verified, data is consistent, continue to Phase 4."

---

## Phase 4: Dashboard UI

### Goal
5-panel dashboard. Risk is the hero. Polls every 2 seconds. Tailwind-styled, glanceable, dark theme.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: "Watchtower" + session status pill                 │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│  ┌── RiskHero ────────┐  │  ┌── Timeline ────────────────┐  │
│  │ BIG risk level     │  │  │ Scrollable event list      │  │
│  │ Current top warning│  │  │ EventCard per event        │  │
│  └────────────────────┘  │  │ Auto-scrolls to bottom     │  │
│                          │  │                            │  │
│  ┌── RedFlagsPanel ───┐  │  │                            │  │
│  │ Grouped by category│  │  │                            │  │
│  │ severity + reason  │  │  │                            │  │
│  └────────────────────┘  │  │                            │  │
│                          │  │                            │  │
│  ┌── InterventionPanel┐  │  └────────────────────────────┘  │
│  │ Recommended action │  │                                  │
│  └────────────────────┘  │  ┌── WatchdogState ───────────┐  │
│                          │  │ Progress markers, stats    │  │
│  ┌── SessionSummary ──┐  │  └────────────────────────────┘  │
│  │ Task + constraints │  │                                  │
│  └────────────────────┘  │                                  │
├──────────────────────────┴──────────────────────────────────┤
```

Left column (hero): ~40% width. Right column (detail): ~60% width.

### Files & Specifications

---

#### 4.1 — `src/app/page.tsx` 🟢

The root page. Client component that polls and renders Dashboard.

```tsx
'use client';
// Polls /api/dashboard every 2s and /api/events every 2s
// Passes data to <Dashboard />
// Uses useState + useEffect for polling
// Handles loading state (show skeleton on first load)
```

---

#### 4.2 — `src/components/Dashboard.tsx` 🟢

Layout wrapper. Receives `DashboardResponse` and `NormalizedEvent[]` as props.

```tsx
interface DashboardProps {
  state: SupervisorState;
  events: NormalizedEvent[];
  updatedAt: number;
}

// Renders the 2-column layout
// Left: RiskHero → RedFlagsPanel → InterventionPanel → SessionSummary
// Right: Timeline → WatchdogState
```

---

#### 4.3 — `src/components/RiskHero.tsx` 🟢

The most important component. Must be readable from 3 feet away.

```tsx
interface RiskHeroProps {
  riskLevel: RiskLevel;
  topFlag: RedFlag | null;
  totalFlags: number;
}

// Renders:
// - Giant risk level text with color-coded background
//   low → green/dark, medium → amber, high → orange, critical → red
// - If topFlag: show its title and reason in 1-2 lines
// - If no flags: "All clear" or "Monitoring..."
// - Subtle pulse animation when critical
```

Color mapping:
| Level | BG | Text |
|---|---|---|
| low | `bg-emerald-900/30` | `text-emerald-400` |
| medium | `bg-amber-900/30` | `text-amber-400` |
| high | `bg-orange-900/30` | `text-orange-400` |
| critical | `bg-red-900/30` | `text-red-400` + pulse |

---

#### 4.4 — `src/components/RedFlagsPanel.tsx` 🟢

```tsx
interface RedFlagsPanelProps {
  flags: RedFlag[];
}

// Group flags by category
// For each flag: severity badge + title + reason + suggested action
// If no flags: "No active warnings"
// Categories shown as section headers: "Context Danger", "Looping", "Risky Action"
```

---

#### 4.5 — `src/components/InterventionPanel.tsx` 🟢

```tsx
interface InterventionPanelProps {
  recommendedAction: InterventionType;
  activeFlags: RedFlag[];
}

// Show recommended action as a prominent card
// 'none' → muted "No intervention needed"
// 'review' → yellow card: "Human review recommended"
// 'pause' → orange card: "Consider pausing the agent"
// 'stop' → red card: "Stop the agent immediately"
// Include top reason from activeFlags
```

---

#### 4.6 — `src/components/SessionSummary.tsx` 🟢

```tsx
interface SessionSummaryProps {
  originalTask: string;
  constraints: string[];
  currentPhase: PhaseStatus;
  stats: SupervisorState['stats'];
}

// Compact card showing:
// - Task (truncated to 2 lines)
// - Constraints as pills/chips
// - Phase badge
// - Key stats: total events, large outputs, repeated actions, risky actions
```

---

#### 4.7 — `src/components/Timeline.tsx` 🟢

```tsx
interface TimelineProps {
  events: NormalizedEvent[];
}

// Scrollable vertical list, auto-scrolls to bottom on new events
// Each event rendered as <EventCard />
// Show sequence number, timestamp (relative), summary, severity badge if flagged
// Max height with overflow-y-auto
```

---

#### 4.8 — `src/components/EventCard.tsx` 🟢

```tsx
interface EventCardProps {
  event: NormalizedEvent;
  isFlagged?: boolean;
}

// Compact horizontal card:
// [#seq] [HH:MM:SS] [type badge] summary
// If flagged: red left border
// Hover: show rawSnippet in tooltip (if present)
```

---

#### 4.9 — `src/components/WatchdogState.tsx` 🟢

```tsx
interface WatchdogStateProps {
  progressMarkers: ProgressMarker[];
  recentKeyActions: KeyAction[];
  lastMeaningfulProgressAt: number | null;
}

// Two sub-sections:
// 1. Progress markers: list of accomplished items with checkmarks
// 2. Recent actions: last 5 key actions shown
// 3. "Last progress: X minutes ago" — turns red if > 5 minutes
```

---

#### 4.10 — `src/components/RiskBadge.tsx` 🟢

```tsx
interface RiskBadgeProps {
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
}

// Pill badge rendered with appropriate color
// Reused in RiskHero, EventCard, RedFlagsPanel
```

---

#### 4.11 — `src/app/globals.css` 🟢

Tailwind base + dark theme defaults:
- `body` background: `#0a0a0f` or similar very dark
- Default text: `text-gray-300`
- Font: Inter or system sans
- Custom animation: `@keyframes pulse-critical` for red glow

### Done criteria
- Dashboard loads at `localhost:3000`
- Risk hero is the first and largest visual element
- Events appear in timeline every ~1.5s
- Context danger warning appears around event 16
- Looping warning appears around event 23
- Risky action warning appears around event 31
- Risk level escalates visually (color changes)
- Intervention panel shows escalating recommendations
- No layout flicker on poll

### 🔴 Human Checkpoint — Phase 4 (Product Judgment Required)

**Claude stops here.** This is the most important human checkpoint. The UI must pass **product judgment**, not just technical correctness. Before stopping, Claude should have run `npx tsc --noEmit` and `npm run build` successfully.

**User must manually verify:**

- [ ] **First focus test:** Open the page fresh. Is the RISK LEVEL the first thing your eye goes to? If the timeline or event list dominates, the layout is wrong.
- [ ] **Glanceability test:** Can you understand the current state of the session in < 3 seconds?
- [ ] **Anomaly-driven test:** During the normal phase (events 1–15), does the dashboard feel *quiet*? It should not feel busy or noisy when nothing is wrong.
- [ ] **Warning visibility test:** When warnings trigger, are they immediately obvious without scrolling?
- [ ] **Intervention clarity test:** Is the recommended action (review / pause / stop) clearly understandable? Would a non-technical person understand what to do?
- [ ] **Timeline role test:** The timeline should feel supplementary — useful if you want to dig in, but not the main thing. Does it?
- [ ] **Polling smoothness test:** Does the page feel smooth, or does it visibly flicker/jump every 2 seconds?
- [ ] **Color escalation test:** Does the color progression (green → amber → orange → red) feel natural and increasing in urgency?

**If layout or hierarchy feels wrong:** User tells Claude specifically what to change (e.g., "make risk hero taller", "move timeline below the fold", "reduce timeline font size"). **Qualitative feedback is valid and expected** — e.g., "too noisy", "risk hero not dominant enough", "timeline is stealing attention". Claude should translate such feedback into concrete CSS/layout adjustments without asking for exact pixel values.

**Claude continue condition:** User confirms "UI hierarchy and product feel are correct, continue to Phase 5."

---

## Phase 5: Demo Polish + Verification

### Goal
Smooth demo experience. README written. All acceptance criteria verified.

### Tasks

| # | Task | Autonomy |
|---|---|---|
| 5.1 | Tune demo timing (60–90s total) | 🟢 |
| 5.2 | Empty states ("Waiting for events..." before first event) | 🟢 |
| 5.3 | Responsive check (test at 1280px and 1920px) | 🟢 |
| 5.4 | Header bar ("Watchtower" + "DEMO MODE" badge + elapsed timer) | 🟢 |
| 5.5 | README (setup instructions, demo walkthrough) | 🟢 |
| 5.6 | Type check (`npx tsc --noEmit`) | 🟢 |
| 5.7 | Build check (`npm run build`) | 🟢 |
| 5.8 | Remove console.log debug output from Phase 2 | 🟢 |

### README Structure

```markdown
# OpenClaw Watchtower

Runtime watchdog for long-running OpenClaw workflows.

## Quick Start
npm install
npm run dev
# Open http://localhost:3000 — demo mode starts automatically

## What You'll See
1. Events appear in the timeline (1 per second)
2. ~15s in: Context Danger warning (large outputs detected)
3. ~23s in: Looping warning (repeated failed builds)
4. ~31s in: Risky Action warning (files outside project root)
5. Risk level escalates: low → medium → high → critical
6. Intervention panel recommends PAUSE then STOP

## Architecture
[link to DESIGN.md]

## Status
MVP / Demo — not production-ready
```

### Done criteria
- All 7 acceptance criteria from PRD pass
- README is written and accurate
- `npm install && npm run dev` works from cold start
- Demo tells a coherent story in ~60–90 seconds

### 🟡 Human Checkpoint — Phase 5

**Claude stops here.** Claude should have completed all polish tasks and verified `npx tsc --noEmit` and `npm run build` both pass.

**User must manually verify the full demo experience end-to-end:**

- [ ] Close everything. Run `npm run dev` from cold.
- [ ] Open `localhost:3000` in browser.
- [ ] **Watch the full demo from start to finish** (~60–90 seconds).
- [ ] Does it tell a coherent story? (Normal progress → context warning → looping → risky action → critical state)
- [ ] Does the pacing feel right? (Not too fast to read, not too slow to be boring)
- [ ] Does the warning escalation feel natural?
- [ ] Is the product value obvious within 30 seconds?
- [ ] Read the README — do the instructions match reality?
- [ ] Try `npm run build` — does it pass?

**If demo pacing feels wrong:** User tells Claude to adjust timing (e.g., "speed up early events to 1s", "slow down warning events to 2.5s", "add a 3s pause before the first warning"). **Qualitative feedback is valid and expected** — e.g., "demo pacing feels off", "the critical phase doesn't feel urgent enough", "warnings appear too abruptly". Claude should translate such feedback into concrete timing/styling adjustments.

**Claude continue condition:** User confirms "Demo experience is good, Phase 5 complete."

---

## Phase 6: File Ingestion Adapter (Post-Demo)

### Goal
Tail a real JSONL file and feed events into the engine.

### 🔴 Human Action Required — Before Phase 6 Starts

**Claude must NOT begin this phase until the user provides:**

1. A real or representative JSONL sample file from an actual OpenClaw session
2. OR explicit guidance on the expected JSONL schema

**Claude must NOT guess the OpenClaw runtime artifact format.** The mock events Claude wrote for the demo used a simplified schema. The real format may differ significantly.

**User should provide:** A file (or paste) of 10–20 lines of real OpenClaw output, e.g.:
```jsonl
{"type":"tool_call","tool":"view_file","target":"/path/to/file.ts","timestamp":1709750400000, ...}
```

**Claude continue condition:** User provides a sample file or schema and says "proceed with file ingestion."

### Files & Specifications

#### 6.1 — `src/ingestion/file-source.ts` 🟢 (after sample received)

```typescript
export class FileEventSource implements EventSourceAdapter {
  private filePath: string;
  private pollInterval: number = 1000;  // 1 second
  private lastReadPosition: number = 0;
  private intervalId: NodeJS.Timeout | null = null;
  private running: boolean = false;

  constructor(filePath: string);

  start(callback: EventCallback): void;
    // Read file from lastReadPosition
    // Parse new lines as JSON
    // Normalize each → callback
    // Update lastReadPosition

  stop(): void;
  isRunning(): boolean;
}
```

#### 6.2 — Engine config 🟢

In `engine.ts`, check env:
```typescript
const mode = process.env.WATCHTOWER_MODE ?? 'demo';
const sourceFile = process.env.WATCHTOWER_SOURCE_FILE;

if (mode === 'file' && sourceFile) {
  const source = new FileEventSource(sourceFile);
  source.start(eventCallback);
} else {
  const source = new MockEventSource();
  source.start(eventCallback);
}
```

#### 6.3 — Event normalizer mapping 🟡

Claude maps the user-provided JSONL fields to `NormalizedEvent`, then **stops for user to verify the mapping is correct** before testing with a full file.

### Done criteria
- Create a test JSONL file with ~20 lines
- Set `WATCHTOWER_MODE=file` and `WATCHTOWER_SOURCE_FILE=./test-events.jsonl`
- Dashboard displays events from the file
- Appending new lines to the file while running → new events appear

### 🟡 Human Checkpoint — Phase 6

**Claude stops here.**

**User must manually verify:**

- [ ] Set `WATCHTOWER_MODE=file` and `WATCHTOWER_SOURCE_FILE` in `.env.local`
- [ ] Run `npm run dev` and confirm dashboard populates from the JSONL file
- [ ] Append new lines to the JSONL file while the app is running — do they appear?
- [ ] Do the events look correct? (tool names, targets, summaries make sense)
- [ ] Do rules still trigger appropriately on real data? (may need threshold tuning)

**Claude continue condition:** User confirms "File ingestion works, Phase 6 complete."

---

## Dependency Graph

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
  🟡 STOP     🟡 STOP     🟡 STOP     🟡 STOP    🔴 STOP     🟡 STOP
                                                                │
                                                           Phase 6
                                                          🔴 HUMAN INPUT
                                                            🟡 STOP
                                                                │
                                                        Phase 7 (A→B→C)
                                                          🔴 HUMAN INPUT
                                                            🟡 STOP
                                                                │
                                                           Phase 8
                                                       (Execution Verification)
                                                            🟡 STOP
```

All phases are strictly sequential. Claude stops at every phase boundary. No phase begins without explicit user confirmation from the previous checkpoint.

---

## Phase 7: Telegram Bot Integration

> **Branding cleanup**: This phase also renames all existing `WATCHTOWER_*` env vars and `[Watchtower]` console logs to `LOBSTERMAN_*` / `[Lobsterman]`.

### Goal

Make Lobsterman a Telegram-first monitoring companion that sends real-time warnings, captures operator decisions, and delivers session report cards. Direct runtime control of OpenClaw is **optional** and only enabled after the underlying control API is verified.

### Product Layering

| Surface | Role | Priority |
|---|---|---|
| Telegram DM | **Operator surface** — alerts, decisions, daily use | Primary |
| Web dashboard | **Investigation surface** — deep-dive, timeline, details | Complementary |

Role separation:
- **OpenClaw** = actor (executes tasks)
- **Lobsterman** = supervisor (monitors, warns, reports)
- **Telegram DM** = human control surface (receives alerts, makes decisions)

### Architecture

```
┌─────────────┐     JSONL      ┌─────────────┐    Templated     ┌──────────────┐
│  OpenClaw   │ ──────────▶    │  Lobsterman  │ ─────────────▶  │ Telegram Bot │
│  (Gateway)  │   sessions/    │   Engine     │    warnings      │  (DM to user)│
└─────────────┘                └──────┬───────┘                  └──────┬───────┘
       ▲                              │                                 │
       │                              │ on session end                  │ inline buttons
       │                              ▼                                 ▼
       │                       ┌─────────────┐                  ┌──────────────┐
       │                       │ OpenAI LLM  │                  │ Operator     │
       │                       │ (report gen)│                  │ Intent Layer │
       │                       └──────┬──────┘                  └──────┬───────┘
       │                              │                                │
       │                              ▼                                ▼
       │                       Session Report                   Decision logged
       │                       (sent to Telegram)               + shown on dashboard
       │                                                               │
       └── [Phase 7C only, after API verification] ────────────────────┘
```

### Design Decisions

1. **Separate DM chat** — Lobsterman bot DMs the user directly, does NOT join the OpenClaw chat
2. **Templated warnings** — Pre-built templates for each rule (fast, zero cost, zero latency). LLM used only for session report cards
3. **Operator Intent Layer** — Inline buttons (`[Pause] [Continue] [Stop]`) capture the user's **decision** and log it. Real OpenClaw control is deferred to Phase 7C, after the Gateway WS control API is verified
4. **Web dashboard as complementary** — Kept as an investigation/deep-dive view

### Prerequisites (User Action Required)

- [ ] Create a Telegram bot via [@BotFather](https://t.me/BotFather), get the bot token
- [ ] Get your Telegram chat ID (message the bot, then retrieve via API)
- [ ] Provide token + chat ID as env vars

---

### Phase 7A — Telegram Notifications MVP

**This sub-phase is the core deliverable.** It's already demo-ready and provides real product value.

#### What it does

- Session start/end notifications in Telegram DM
- Templated rule-triggered warnings with event context
- Risk escalation alerts
- Inline buttons as **operator intent capture** (log decision + confirm, no real control yet)
- Dashboard link button

#### New files

**`src/ingestion/session-watcher.ts`** — Generic session auto-detection

- Reads `OPENCLAW_STATE_DIR` (default `~/.openclaw`)
- Discovers all agent session directories: `agents/*/sessions/`
- Uses `sessions.json` as the **session registry/metadata source** (not just FS timestamps)
- Uses `*.jsonl` files as the **event transcript source**
- Detects new/active sessions by `updatedAt` in `sessions.json`
- Auto-switches the file source when a new session starts
- Supports multi-agent setups, not hardcoded to `main`

**`src/telegram/telegram-bot.ts`** — Bot core

- Uses `node-telegram-bot-api` (long-polling, no webhooks)
- Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Sends structured DM messages
- Handles inline keyboard callbacks

**`src/telegram/message-templates.ts`** — Pre-built warning templates

| Rule | Template |
|---|---|
| `cd-large-output` | `⚠️ Large Output — Event #12: Tool Read returned 24KB` |
| `lp-repeated-tool-target` | `🔄 Possible Loop — Edit → src/app.tsx called 4× in a row` |
| `lp-error-retry-loop` | `🔄 Error Retry Loop — 3 consecutive errors, may be stuck` |
| `ra-path-outside-root` | `🚨 File Outside Project — accessed /etc/hosts` |
| `ra-sensitive-destructive` | `🚨 Risky Command — ran: rm -rf node_modules` |
| Risk escalation | `📊 Risk Changed — 🟡 medium → 🔴 critical` |
| Session start | `🦞 New Session — Task: "Summarize the project"` |
| Session end | `✅ Session Complete — 19 events, 0 warnings` |

Inline buttons on each warning (operator intent, not real control):
```
[👀 Acknowledged] [⚠️ Flag for Review] [🔍 Dashboard]
```

**`src/telegram/operator-intent.ts`** — Decision capture layer

- Records user button presses: `{ timestamp, decision, ruleId, userId }`
- Stores decisions in state (in-memory + persisted)
- Exposes decisions via dashboard API for the web UI
- Does NOT send commands to OpenClaw (that's Phase 7C)

#### Modified files

| File | Changes |
|---|---|
| `src/core/engine.ts` | Add callback hooks: `onRuleTriggered`, `onRiskChanged`, `onSessionStart`, `onSessionEnd` |
| `src/core/types.ts` | Rename `WatchtowerMode` → `LobstermanMode`, add `'telegram'` option, add `OperatorDecision` type |
| `.env.local` | New vars: `LOBSTERMAN_MODE=telegram`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `OPENCLAW_STATE_DIR` |
| `package.json` | Add: `node-telegram-bot-api`, `@types/node-telegram-bot-api` |

#### Branding cleanup (also in this sub-phase)

Rename across the entire codebase:
- `WATCHTOWER_MODE` → `LOBSTERMAN_MODE`
- `WATCHTOWER_SOURCE_FILE` → `LOBSTERMAN_SOURCE_FILE`
- `WATCHTOWER_PROJECT_ROOT` → `LOBSTERMAN_PROJECT_ROOT`
- `[Watchtower]` console logs → `[Lobsterman]`

#### Checkpoint

**Claude continue condition:** User confirms "Telegram notifications work, Phase 7A complete."

---

### Phase 7B — Session Report Card (LLM)

**Upgrades Lobsterman from "alert tool" to "monitoring assistant".**

#### What it does

- Detects session idle (no new events for 30s) or session end (via `sessions.json` status)
- Generates a concise report card via OpenAI (`gpt-4o-mini`)
- Sends report to Telegram DM as a formatted summary

#### New files

**`src/telegram/session-reporter.ts`**

- Collects session data: task, duration, event count, tools used, files touched, warnings triggered, risk level
- Calls OpenAI with structured prompt for a concise report card
- Formats output as Telegram MarkdownV2
- Example output:
  ```
  🦞 Session Report Card

  📋 Task: "Summarize NYUBuddy project"
  ⏱ Duration: 2m 34s
  📊 Events: 19 | Tools: Read(5), Write(2), Edit(3)
  ⚠️ Warnings: 0 | Risk: 🟢 LOW
  📁 Files touched: 4
  
  ✅ Assessment: Clean session, no issues detected.
  ```

#### Modified files

| File | Changes |
|---|---|
| `package.json` | Add: `openai` |
| `.env.local` | Add: `OPENAI_API_KEY` (if not already set) |

#### Checkpoint

**Claude continue condition:** User confirms "Session reports work, Phase 7B complete."

---

### Phase 7C — Real Gateway Intervention (Research Required)

**Only proceed after verifying the OpenClaw Gateway WS control API.**

#### Research first

Before writing any code:
1. Investigate OpenClaw Gateway WS protocol documentation
2. Check if `pause`, `resume`, `stop` (or equivalent) operations exist as API calls
3. Test with `openclaw gateway --help`, `openclaw agent --help`, and inspect the WS protocol
4. Document findings: exact method names, parameters, auth requirements

#### If control API exists

- Upgrade inline buttons from intent capture to real control:
  ```
  [⏸ Pause OpenClaw] [▶️ Resume] [🛑 Stop Session]
  ```
- New file: `src/telegram/openclaw-client.ts`
  - Connects to Gateway WS
  - Reads auth token from `~/.openclaw/openclaw.json`
  - Implements verified control methods
- Update `operator-intent.ts` to forward decisions to the real API

#### If control API doesn't exist (or is unstable)

- Keep the Operator Intent Layer as-is
- Add a "control API not available" note in the dashboard
- Consider filing a feature request with OpenClaw if the API gap is clear

#### Checkpoint

**Claude continue condition:** User confirms "Phase 7C research complete" OR "Phase 7C control wiring works."

### Implementation Workflow (Step-by-Step)

> **Workflow rules:**
> - 🤖 = Claude does this autonomously
> - 🔴 = Human action required — Claude MUST stop and wait
> - 🟡 = Checkpoint — Claude runs self-validation, then stops for human confirmation
> - Claude must NOT proceed past any 🔴 or 🟡 step without explicit user confirmation

---

#### Phase 7A — Telegram Notifications MVP

**Step 1** 🤖 Branding cleanup
- Rename all `WATCHTOWER_*` → `LOBSTERMAN_*` across codebase
- Rename all `[Watchtower]` console logs → `[Lobsterman]`
- Run `npx tsc --noEmit` to verify no breakage

**Step 2** 🤖 Session watcher
- Create `src/ingestion/session-watcher.ts`
- Generic multi-agent support (`agents/*/sessions/`)
- Use `sessions.json` as metadata + `*.jsonl` as transcripts
- Wire into engine

**Step 3** 🤖 Engine callback hooks
- Add `onRuleTriggered`, `onRiskChanged`, `onSessionStart`, `onSessionEnd` to engine
- Add `OperatorDecision` type to types.ts
- Run `npx tsc --noEmit`

**🟡 STOP — Checkpoint A1**
Claude runs: `npx tsc --noEmit` + `npm run build`
Claude reports: results, files changed, any issues
**Claude continue condition:** User confirms "Steps 1-3 look good, continue."

---

**Step 4** 🔴 HUMAN — Create Telegram bot
User must:
1. Open Telegram → message [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Name: `Lobsterman` (or similar)
4. Username: `lobsterman_watch_bot` (or similar)
5. Copy the bot token
6. Message the bot (send any message like "hi") to initialize the chat
7. Provide bot token to Claude

**Claude MUST stop here and wait for the user to provide the bot token.**

---

**Step 5** 🤖 Get user's Telegram chat ID
- Use the bot token to call `getUpdates` API and extract the chat ID
- Confirm chat ID with user

**Step 6** 🔴 HUMAN — Set environment variables
User must update `.env.local` with:
```
LOBSTERMAN_MODE=telegram
TELEGRAM_BOT_TOKEN=<token from step 4>
TELEGRAM_CHAT_ID=<id from step 5>
OPENCLAW_STATE_DIR=~/.openclaw
LOBSTERMAN_PROJECT_ROOT=<project path>
```
(Claude can pre-fill the file, but user must verify sensitive values)

---

**Step 7** 🤖 Install dependencies
- `npm install node-telegram-bot-api`
- `npm install -D @types/node-telegram-bot-api`

**Step 8** 🤖 Telegram bot core
- Create `src/telegram/telegram-bot.ts`
- Create `src/telegram/message-templates.ts`
- Create `src/telegram/operator-intent.ts`
- Wire engine callbacks → Telegram notifications

**Step 9** 🤖 Self-validation
- Run `npx tsc --noEmit`
- Run `npm run build`

**🟡 STOP — Checkpoint A2**
Claude reports: build results, files created, ready for live test
**Claude continue condition:** User confirms "Build passes, ready to test."

---

**Step 10** 🔴 HUMAN — Live integration test
User must:
1. Restart dev server (`npm run dev`)
2. Start OpenClaw gateway + TUI
3. Give OpenClaw a task
4. Verify in Telegram DM:
   - [ ] Session start message received
   - [ ] Warning messages appear when rules trigger
   - [ ] Inline buttons work (log acknowledgement)
   - [ ] Dashboard link opens web UI
5. Report results to Claude

**Claude MUST stop here and wait for user test results.**

---

**🟡 STOP — Phase 7A Complete**
**Claude continue condition:** User confirms "Phase 7A works, move to 7B."

---

#### Phase 7B — Session Report Card (LLM)

**Step 11** 🤖 Install OpenAI SDK
- `npm install openai`

**Step 12** 🤖 Session reporter
- Create `src/telegram/session-reporter.ts`
- Implement idle/end detection (30s no events or `sessions.json` status)
- LLM call with structured prompt → formatted Telegram report

**Step 13** 🤖 Self-validation
- Run `npx tsc --noEmit` + `npm run build`

**🟡 STOP — Checkpoint B1**
Claude reports: build results, example report prompt
**Claude continue condition:** User confirms "Build passes, ready to test."

---

**Step 14** 🔴 HUMAN — Live report test
User must:
1. Restart dev server
2. Run an OpenClaw task, let it complete
3. Wait 30s after last event
4. Verify in Telegram DM:
   - [ ] Session report card received
   - [ ] Content is accurate (task, duration, tools, warnings)
   - [ ] Formatting looks good
5. Report results to Claude

**Claude MUST stop here and wait for user test results.**

---

**🟡 STOP — Phase 7B Complete**
**Claude continue condition:** User confirms "Phase 7B works, move to 7C."

---

#### Phase 7C — Real Gateway Intervention (Research)

**Step 15** 🤖 Research OpenClaw Gateway WS control API
- Run `openclaw gateway --help`, `openclaw agent --help`
- Search OpenClaw docs for pause/resume/stop methods
- Inspect WS protocol if accessible
- Document findings

**🟡 STOP — Checkpoint C1**
Claude reports: API findings, recommendation (proceed or defer)
**Claude continue condition:** User decides whether to proceed with real control or stay with intent layer.

---

**Step 16** 🤖 (conditional) Wire real control if API exists
- Only if Step 15 found a usable API
- Create `src/telegram/openclaw-client.ts`
- Upgrade inline buttons to real Pause/Resume/Stop

**Step 17** 🔴 HUMAN — (conditional) Live intervention test
- Only if Step 16 was implemented
- User runs OpenClaw task, presses Pause → verifies OpenClaw actually pauses

**🟡 STOP — Phase 7C Complete**

---

## Phase 8: Execution Verification Layer (Future)

> **Research basis**: Agents of Chaos (Harvard/MIT, 2026), PayPal "Proxy State-Based Evaluation", execution hallucination literature, NCSC LLM guidance.

### Why This Phase Exists

Lobsterman currently operates at **Trust Level 2** (gateway JSONL transcripts) — far stronger than agent self-reports (Level 1), but not yet at **Trust Level 3** (verified outcomes). The research makes a clear case:

| Trust Level | Source | What It Tells You | Lobsterman |
|---|---|---|---|
| 1. Self-report | Agent text summary | "I did it" | ❌ Not used |
| 2. Gateway transcript | JSONL tool calls/results | "The system recorded the attempt" | ✅ Current |
| 3. Verified outcome | Independent checks | "We confirmed the world changed" | 🔲 Phase 8 |

The gap: JSONL tells us what was **attempted**, not what **actually happened**. An agent can call `Write("src/auth.ts")` → `result: success`, but the content written could be garbage, or a build could silently break.

### Goal

Move Lobsterman from "we read what happened" to "we verify what happened" — closing the execution hallucination gap with cheap, deterministic checks.

### Verification Checks (Scoped to What's Cheap)

| Check | Trigger | How | Difficulty |
|---|---|---|---|
| **File existence** | Agent says "wrote file X" | `fs.existsSync(X)` after write event | Easy |
| **File size delta** | Agent edited a file | Compare pre/post sizes via `fs.statSync` | Easy |
| **Git diff verification** | Agent claims code changes | `git diff --stat` in project root | Easy |
| **Command exit code** | Agent ran build/test | Verify exit code from tool result | Easy |
| **Build artifact check** | Agent ran `npm run build` | Check for expected output dir/files | Medium |
| **Session integrity** | Ongoing monitoring | Detect 1-line JSONL, stale transcripts | Medium |
| **Silent failure** | Agent active but no progress | No meaningful state change for N minutes | Medium |

### Architecture Addition

```
┌─────────────┐     JSONL     ┌─────────────┐     Alerts     ┌──────────────┐
│  OpenClaw   │ ──────────▶   │  Lobsterman  │ ───────────▶  │ Telegram Bot │
│  (Gateway)  │   sessions/   │   Engine     │               │  (DM to user)│
└─────────────┘               └──────┬───────┘               └──────────────┘
                                     │
                                     │ after tool_call events
                                     ▼
                              ┌─────────────┐
                              │ Verification │  ← NEW
                              │   Layer      │
                              └──────┬──────┘
                                     │
                                     ▼
                              File system / git / process checks
                              Produces: VerifiedOutcome | Mismatch alert
```

### New Types

```typescript
type VerificationStatus = 'verified' | 'mismatch' | 'unverifiable';

interface VerifiedOutcome {
  eventId: number;
  claimed: string;        // "wrote src/auth.ts"
  observed: string;       // "file exists, 2.4KB, modified at ..."
  status: VerificationStatus;
  checkedAt: number;
}
```

### New Rules (Phase 8)

| Rule ID | What | Severity |
|---|---|---|
| `ev-file-not-found` | Agent claimed write, but file doesn't exist | Critical |
| `ev-build-failed` | Agent claimed build success, but exit code ≠ 0 | High |
| `ev-silent-failure` | No meaningful events for 5+ minutes | Medium |
| `ev-transcript-stale` | JSONL file hasn't grown in 10+ minutes during active session | Medium |
| `ev-git-no-changes` | Agent claimed edits, but `git status` shows clean | High |

### OpenClaw Posture Checks (Bonus)

Leverage OpenClaw's own diagnostic tools as alert sources:
- `openclaw doctor` → parse output for known issues
- `openclaw security audit` → surface findings as Telegram alerts
- Version checks → warn if running a version with known CVEs

### What This Phase Does NOT Do

- ❌ Does not fix OpenClaw vulnerabilities (that's upstream)
- ❌ Does not prevent prompt injection (NCSC says this may not be "fixable")
- ❌ Does not vet ClawHub skills (platform-scale problem)
- ❌ Does not replace minimum-privilege design (user responsibility)

### Prerequisites

- Phase 7A complete (Telegram alerts working)
- Filesystem access to the project root being monitored
- Git available in the project (for git-based checks)

### Checkpoint

**Claude continue condition:** User confirms "Phase 8 scoping complete, ready to implement."

---

## Product Positioning

> Updated based on Agents of Chaos research (Harvard/MIT 2026), OpenClaw security advisories, NCSC LLM guidance, and PayPal state-based evaluation work.

### What Lobsterman Is

**Lobsterman — AI Agent Runtime Safety & Audit Layer**

- Runtime monitoring of agent sessions
- Deterministic guardrails (rules, not LLM-in-the-loop)
- Human-in-the-loop intervention surface
- Evidence-backed reporting (gateway transcripts, not self-reports)
- Post-incident audit trail

### What Lobsterman Is NOT

- ❌ Not an AI assistant or productivity tool
- ❌ Not a replacement for OpenClaw's security patches
- ❌ Not a prompt injection "solution" (NCSC says this is unsolved)
- ❌ Not a substitute for minimum-privilege architecture

### The Trust Model

```
Agent says "I did it"          → Don't trust (execution hallucination risk)
Gateway logs show it happened  → Trust but verify (Lobsterman Level 2)
Independent check confirms it  → Verified (Lobsterman Level 3, Phase 8)
```
