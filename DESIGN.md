# OpenClaw Watchtower — MVP Design & Implementation Plan

> A narrow runtime watchdog for long-running OpenClaw workflows.

---

## PART 1 — Focused PRD

### Problem Statement

Long-running OpenClaw workflows (30+ min, 100+ tool calls) suffer from **runtime failures that cannot be prevented by prompt engineering or skill.md alone**:

1. **Context overload** — the agent silently loses track of original goals as context fills with noisy tool output, compaction drops critical state, and task drift accumulates.
2. **Looping** — the agent repeats similar actions without meaningful progress, burning tokens and time while the operator has no visibility.
3. **Risky actions** — the agent touches wrong files, navigates unexpected URLs, or executes dangerous commands that mismatch the stated task.

These are **runtime problems**. They happen *during execution*, after the prompt is locked and the skill.md is loaded. No amount of prompt improvement eliminates them because they arise from emergent execution dynamics: context window pressure, stochastic tool-use patterns, and unbounded action spaces.

### Why skill.md Does NOT Solve This

| Capability | skill.md | Watchtower |
|---|---|---|
| Improves agent behavior before run | ✅ | ❌ |
| Structures task decomposition | ✅ | ❌ |
| Detects runtime context overflow | ❌ | ✅ |
| Detects execution loops mid-run | ❌ | ✅ |
| Flags risky actions in real-time | ❌ | ✅ |
| Provides operator visibility | ❌ | ✅ |
| Recommends mid-run interventions | ❌ | ✅ |

skill.md is a **compile-time** improvement. Watchtower is a **runtime** supervisor.

### Target Users

- Solo developers running long OpenClaw sessions (refactors, migrations, multi-file features)
- Engineers who leave OpenClaw running while doing other work
- Power users who want confidence that their agent hasn't gone off the rails

### Target Scenarios

1. 2-hour refactoring session where OpenClaw gradually loses track of the original constraint ("don't modify tests")
2. Migration task where OpenClaw loops on a build error, retrying the same approach 8 times
3. Feature build where OpenClaw starts editing files in a sibling project directory

### Pains Addressed

- "I came back and it had been looping for 40 minutes"
- "It forgot the main constraint halfway through"
- "It started editing the wrong project and I didn't notice"
- "I have no idea what it's been doing for the last hour"

### Operator Story

The user is **not** staring at the dashboard full-time. The real usage loop is:

1. Start a long OpenClaw task
2. Open Watchtower in a side panel or second tab
3. Work on something else
4. **Only glance at Watchtower when risk escalates or an intervention is recommended**
5. Quickly decide: keep going, pause, or redirect the agent

This means the UI must be:
- **Glanceable** — current risk level visible in < 1 second
- **Anomaly-driven** — quiet when things are fine, loud when they aren't
- **Not a log explorer** — the timeline is supplementary, the risk summary is the hero

### Product Scope

| In Scope | Out of Scope |
|---|---|
| Local single-user watchdog | Multi-user / team |
| 3 red-flag classes (6 rules) | Broad observability |
| Advisory recommendations | Autonomous remediation |
| File-based ingestion | Cloud streaming |
| Demo mode | Production deployment |
| Rule-based detection | Heavy LLM analysis |

### Non-Goals

- Replace OpenClaw's own planning
- Provide a second autonomous agent
- Build enterprise auth, billing, RBAC
- Distributed infra (Kafka, Redis, microservices)
- Full replay system
- Security compliance platform
- Semantic drift detection (deferred to post-MVP)

### Main User Flow

```
1. User starts OpenClaw on a long task
2. Watchtower begins tailing the runtime log (or runs in demo mode)
3. Dashboard shows live risk level — green/quiet when fine
4. As events arrive, rule engine evaluates for red flags
5. If a red flag triggers → warning appears with severity + explanation + recommended action
6. User glances at dashboard, sees "LOOPING WARNING" → decides to intervene
7. Session continues or user pauses/redirects OpenClaw
```

### Red Flag Definitions (MVP — 6 Rules)

Only the hardest, most reliable rules ship in v1. Remaining rules are deferred as TODOs.

#### A. Context Danger (2 rules)

| Rule | Detection | Severity |
|---|---|---|
| Single tool output too large (>5KB) | Size check on event payload | `medium` |
| Repeated large outputs (3+ in last 10 events) | Sliding window counter | `high` |

*Deferred:* step count without state compression, task focus score / keyword overlap (too noisy for MVP, semantic drift is hard to do well without false positives).

#### B. Looping / Stalled Work (2 rules)

| Rule | Detection | Severity |
|---|---|---|
| Same tool called 3+ times on same target | Action dedup with (tool, target) tuples | `medium` |
| Error → retry → same error pattern | Error signature matching | `critical` |

*Deferred:* Jaccard similarity on action params, milestone progress gap (requires reliable milestone extraction).

#### C. Risky Action (2 rules)

| Rule | Detection | Severity |
|---|---|---|
| Path outside project root | Path prefix check | `critical` |
| Sensitive file touch OR destructive command | Filename pattern + command regex | `high` |

*Deferred:* unexpected domain navigation, action-task mismatch scoring.

### Acceptance Criteria

1. Demo mode runs without external dependencies
2. Dashboard loads and shows live-updating risk state
3. All 3 red-flag categories trigger correctly in demo scenario
4. State updates incrementally from events
5. Each warning shows severity, explanation, recommended action
6. Risk level is the most prominent element in the UI
7. Total setup time < 3 minutes (`npm install && npm run dev`)

### Demo Scenario

A simulated 40-event session:
- Events 1–15: Normal progress, progress markers completing
- Events 16–22: Large tool outputs start appearing (context danger triggers)
- Events 23–30: Agent retries same failing build command (looping triggers)
- Events 31–35: Agent starts editing files in wrong directory (risky action triggers)
- Events 36–40: Multiple warnings active, intervention panel recommends PAUSE

---

## PART 2 — Architecture

### High-Level Module Diagram

```
┌─────────────────────────────────────────────────────┐
│                    Dashboard (Next.js)               │
│  ┌───────────────────┬──────────────────────────────┐│
│  │  HERO: Risk +     │  Timeline (scrollable,       ││
│  │  Flags + Action   │  secondary)                  ││
│  │                   │                              ││
│  │  Session Summary  │  Watchdog State              ││
│  └───────────────────┴──────────────────────────────┘│
│                         ▲                            │
│                    API Routes                        │
│                   /api/dashboard                     │
│                   /api/events                        │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                  Core Engine                         │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │  Ingestion │→ │  Supervisor  │→ │ Rule Engine  │ │
│  │  Pipeline  │  │  State Store │  │  (6 rules)   │ │
│  └─────┬──────┘  └──────────────┘  └──────────────┘ │
│        │                                             │
│  ┌─────▼──────┐                                      │
│  │  Event     │                                      │
│  │  Normalizer│                                      │
│  └────────────┘                                      │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Data Sources                            │
│  ┌────────────┐  ┌────────────────┐                  │
│  │  Mock/Demo │  │  File Watcher  │                  │
│  │  Source    │  │  (JSONL tail)  │                  │
│  └────────────┘  └────────────────┘                  │
└─────────────────────────────────────────────────────┘
```

### Event Ingestion Flow

```
Source File (JSONL) → File Watcher (poll/tail)
                          ↓
                    Raw Event Object
                          ↓
                    Event Normalizer
                          ↓
                    NormalizedEvent
                          ↓
               ┌──────────┴──────────┐
               ↓                     ↓
        State Updater          Rule Engine
               ↓                     ↓
        SupervisorState         RedFlag[]
               ↓                     ↓
          Merged into session store → API → Dashboard
```

### Internal Event Model

```typescript
interface NormalizedEvent {
  id: string;
  timestamp: number;
  sequence: number;
  type: 'tool_call' | 'tool_result' | 'assistant_message' | 'user_message' | 'error' | 'system';
  source: 'mock' | 'file';          // which adapter produced this
  tool?: string;
  target?: string;                   // file path, URL, command
  payloadSize: number;               // bytes
  summary: string;                   // human-readable 1-liner
  rawSnippet?: string;               // first 200 chars of raw content (never shown in main timeline)
  tags: string[];                    // extracted keywords
}
```

### Supervisor State Model (Lean MVP)

```typescript
interface SupervisorState {
  sessionId: string;
  originalTask: string;
  constraints: string[];
  currentPhase: 'starting' | 'working' | 'warning' | 'critical';
  recentKeyActions: KeyAction[];       // last 10, capped
  progressMarkers: ProgressMarker[];   // observable progress events, capped at 20
  activeRedFlags: RedFlag[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  lastMeaningfulProgressAt: number | null;
  recommendedAction: 'none' | 'review' | 'pause' | 'stop';
  stats: {
    totalEvents: number;
    repeatedActionCount: number;
    largeOutputCount: number;
    riskyActionCount: number;
  };
}
```

**Progress markers** replace abstract milestones. Instead of trying to decompose the task into milestones (which requires a hard extraction problem), we simply record observable signs of forward progress:
- Created a file
- Edited a target file
- Build passed
- Test passed
- Patch applied
- Command succeeded after previous failures

This is more honest and more reliable for MVP.

### Rule Engine Design

The rule engine is a **deterministic pipeline** — no LLM calls in the hot path.

```
NormalizedEvent → Rule[] → RedFlag[]

Each Rule:
  - id: string
  - category: 'context_danger' | 'looping' | 'risky_action'
  - evaluate(event, state, recentEvents) → RedFlag | null
  - pure function, no side effects
  - returns null if rule does not trigger
```

**MVP ships 6 rules.** Additional rules are stubbed as disabled/TODO in the rule files for future activation.

### Storage Approach

- **In-memory** for MVP — all state lives in a singleton store
- `events.jsonl` — append on each event (cheap, always useful)
- `session.json` — **throttled write**: every 5 events or every 2 seconds, whichever comes first (not on every single update)
- No database required

### API Design (2 Routes)

| Route | Returns |
|---|---|
| `GET /api/dashboard` | Combined payload: session summary, supervisor state, active flags, recommended action |
| `GET /api/events?since=N` | Events since sequence number N (for incremental timeline updates) |

Single `/api/dashboard` call gives the frontend everything it needs for all panels except the timeline. This avoids multi-endpoint time sync issues and simplifies polling.

### UI Architecture

Next.js App Router with:
- Client components polling `/api/dashboard` every 2 seconds
- `/api/events` polled separately for timeline append
- **Layout priority**: Risk level + flags + intervention recommendation are the hero (top/left). Timeline and watchdog state are secondary (below/right).
- No WebSocket complexity for MVP — polling is sufficient

### Demo Mode Architecture

```
MockEventSource → emits events on a timer (1 event/second)
                → pre-scripted scenario covering all 3 red flag classes
                → events stored same as real events
                → rule engine and state store operate identically
```

Demo mode activated by env var `WATCHTOWER_MODE=demo` or default when no source file configured.

### Future Extension Points

1. **More rules** — activate disabled rules in each category, add new ones
2. **Ingestion adapters** — swap `MockEventSource` for `FileWatcherSource`, `WebSocketSource`, etc.
3. **Semantic drift** — once progress markers are solid, add keyword/embedding-based drift scoring
4. **Real milestones** — extract milestones from task description via LLM (post-MVP)
5. **Active intervention** — if OpenClaw exposes a control API, send pause/inject commands
6. **Persistent storage** — swap in-memory store for SQLite
7. **Multi-session** — extend state store to handle concurrent sessions

---

## PART 3 — Repository Structure

```
openclaw-watchtower/
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.local                    # WATCHTOWER_MODE=demo
│
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Dashboard
│   │   ├── globals.css
│   │   └── api/
│   │       ├── dashboard/route.ts  # GET combined state
│   │       └── events/route.ts     # GET events timeline
│   │
│   ├── core/                     # Engine (framework-agnostic)
│   │   ├── types.ts              # All TypeScript interfaces
│   │   ├── event-normalizer.ts   # Raw → NormalizedEvent
│   │   ├── state-store.ts        # SupervisorState management
│   │   ├── state-updater.ts      # Event → state mutation logic
│   │   ├── rule-engine.ts        # Rule runner
│   │   └── intervention.ts       # Intervention recommender
│   │
│   ├── rules/                    # Individual rule implementations
│   │   ├── context-danger.ts     # 2 active + TODOs
│   │   ├── looping.ts            # 2 active + TODOs
│   │   └── risky-action.ts       # 2 active + TODOs
│   │
│   ├── ingestion/                # Data source adapters
│   │   ├── source.ts             # Abstract source interface
│   │   ├── mock-source.ts        # Demo event emitter
│   │   └── file-source.ts        # JSONL file watcher (stub)
│   │
│   ├── components/               # React UI components
│   │   ├── Dashboard.tsx         # Main layout
│   │   ├── SessionSummary.tsx
│   │   ├── RiskHero.tsx          # Big risk level + current warning
│   │   ├── RedFlagsPanel.tsx
│   │   ├── InterventionPanel.tsx
│   │   ├── Timeline.tsx
│   │   ├── WatchdogState.tsx
│   │   ├── RiskBadge.tsx
│   │   └── EventCard.tsx
│   │
│   └── lib/                      # Shared utilities
│       ├── demo-scenario.ts      # Pre-scripted demo events
│       └── utils.ts              # Helpers
│
├── data/                         # Runtime data (gitignored)
│   ├── session.json
│   └── events.jsonl
│
└── public/
    └── favicon.ico
```

---

## PART 4 — Implementation Plan

### Phase 0: Bootstrap
**Goal:** Runnable Next.js project with Tailwind, TypeScript, clean folder structure.

| Task | File(s) |
|---|---|
| Init Next.js with TypeScript + Tailwind | `package.json`, `tsconfig.json`, `tailwind.config.ts` |
| Create folder structure | `src/core/`, `src/rules/`, `src/ingestion/`, `src/components/` |
| Verify `npm run dev` works | — |

**Risk:** None.
**Done:** `npm run dev` shows default page.

---

### Phase 1: Core Types + Mock Data + In-Memory Session Engine
**Goal:** All TypeScript interfaces defined. Mock source emitting normalized events. State store updating from events.

| Task | File(s) |
|---|---|
| Define all core types | `src/core/types.ts` |
| Build event normalizer | `src/core/event-normalizer.ts` |
| Create source interface | `src/ingestion/source.ts` |
| Build mock source with timer | `src/ingestion/mock-source.ts` |
| Write demo scenario data | `src/lib/demo-scenario.ts` |
| Build state store (singleton, in-memory) | `src/core/state-store.ts` |
| Build state updater (event → mutation) | `src/core/state-updater.ts` |
| Throttled file persistence | integrated in `state-store.ts` |

**Risk:** Over-designing the event model. Keep it minimal.
**Done:** Mock source emits typed events; state store updates; events.jsonl appends; session.json writes throttled.

---

### Phase 2: Rule Engine + 6 Rules
**Goal:** Deterministic rule engine evaluating events against 6 hard rules (2 per category).

| Task | File(s) |
|---|---|
| Build rule runner | `src/core/rule-engine.ts` |
| Context danger: large output + repeated large outputs | `src/rules/context-danger.ts` |
| Looping: repeated tool+target + error-retry loop | `src/rules/looping.ts` |
| Risky action: path outside root + sensitive/destructive | `src/rules/risky-action.ts` |
| Build intervention recommender | `src/core/intervention.ts` |
| Add TODO stubs for deferred rules | all rule files |

**Risk:** Rules too sensitive or too loose. Tune thresholds from demo run.
**Done:** Demo scenario triggers all 3 categories at correct moments.

---

### Phase 3: API Routes
**Goal:** Two API endpoints serving combined dashboard state and events.

| Task | File(s) |
|---|---|
| `GET /api/dashboard` — combined state payload | `src/app/api/dashboard/route.ts` |
| `GET /api/events?since=N` — incremental events | `src/app/api/events/route.ts` |
| Wire engine startup (init mock source on first request) | `src/core/engine.ts` or inline |

**Risk:** Ensuring engine is initialized before first API call. Use lazy singleton.
**Done:** `curl /api/dashboard` returns valid JSON with updating state.

---

### Phase 4: Dashboard UI
**Goal:** Working dashboard with risk-first layout, all panels rendering live data.

| Task | File(s) |
|---|---|
| Build Dashboard layout (risk hero top) | `src/components/Dashboard.tsx` |
| Build RiskHero (big risk level + current warning) | `src/components/RiskHero.tsx` |
| Build RedFlagsPanel | `src/components/RedFlagsPanel.tsx` |
| Build InterventionPanel | `src/components/InterventionPanel.tsx` |
| Build SessionSummary | `src/components/SessionSummary.tsx` |
| Build Timeline | `src/components/Timeline.tsx` |
| Build WatchdogState | `src/components/WatchdogState.tsx` |
| Build shared components | `src/components/RiskBadge.tsx`, `EventCard.tsx` |
| Wire polling (2s interval) | in `Dashboard.tsx` / page.tsx |
| Tailwind styling — glanceable, anomaly-driven | `globals.css` + components |

**Risk:** Polling causing flicker. Use optimistic state merging.
**Done:** Dashboard shows risk hero prominently, flags appear when triggered, timeline populates.

---

### Phase 5: Demo Polish + Verification
**Goal:** One-command demo that tells a compelling 60-second story. Everything verified.

| Task | File(s) |
|---|---|
| Tune demo scenario timing (60–90s) | `src/lib/demo-scenario.ts` |
| Polish intervention recommendations | `src/core/intervention.ts` |
| Responsive layout pass | `Dashboard.tsx`, `globals.css` |
| Error boundary / empty states | all components |
| Write README with setup + demo instructions | `README.md` |
| Manual test all 3 flag categories | — |
| Verify cold start < 3 min | — |

**Risk:** Demo too fast or too slow. Target 60–90 seconds for full scenario.
**Done:** `npm run dev` → open browser → watch risk escalate and flags trigger in real-time.

---

### Phase 6: File Ingestion Adapter (Post-Demo)
**Goal:** Read real JSONL from an OpenClaw session.

| Task | File(s) |
|---|---|
| Implement file watcher (poll-based) | `src/ingestion/file-source.ts` |
| Map raw OpenClaw log format to NormalizedEvent | `src/core/event-normalizer.ts` |
| Config: `WATCHTOWER_SOURCE_FILE` env var | `.env.local` |
| Test with a real (or realistic) JSONL file | — |

**Risk:** OpenClaw log format may vary. Start with one known format and document assumptions.
**Done:** Watchtower tails a real JSONL file and dashboard updates live.

---

## Verification Plan

### Automated / Scripted Verification
1. **Type check**: `npx tsc --noEmit` — zero errors
2. **Build check**: `npm run build` — successful production build
3. **Dev server**: `npm run dev` — loads at localhost:3000

### Manual Verification (Browser)
1. Open `http://localhost:3000`
2. Verify risk hero shows "LOW" risk with green state
3. Watch timeline populate with events
4. After ~16 events, verify "Context Danger" appears in red flags
5. After ~23 events, verify "Looping" warning appears
6. After ~31 events, verify "Risky Action" appears
7. Verify intervention panel updates to recommend PAUSE
8. Verify risk level escalates: low → medium → high → critical
9. Verify the *first thing you see* is risk state, not a log

---

## PART 7 — Next Build Priorities (After Scaffold)

After the scaffold is running and demo mode works, build in this order:

1. **Tune rule thresholds** — run demo 5 times, adjust sensitivity
2. **Add "reset/restart" button** — let operator restart demo or clear state
3. **File ingestion adapter** — tail a real JSONL
4. **2 more rules per category** — activate the deferred TODO rules
5. **Sound/notification on risk escalation** — browser notification or beep
6. **Session history** — save completed sessions, let operator review past runs
7. **Semantic drift detection** — keyword overlap or embedding-based
8. **Active intervention hooks** — if OpenClaw exposes pause/inject API
