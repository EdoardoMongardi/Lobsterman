# Lobsterman v1 — Revised Implementation Plan

> Runtime safety and audit layer for AI agent sessions.
> Telegram-first monitoring with independent execution verification.

---

## Current Status

| Milestone | Status |
|---|---|
| Phases 0–6 (Core MVP: types, rules, dashboard, file ingestion) | ✅ Complete |
| Phase 7A (Telegram notifications, session watcher, alert pipeline) | ✅ Complete |
| Phase 7A.5 (Stabilize operator loop) | 🔲 Next |
| Phase 8A (Minimal execution verification) | 🔲 Planned |
| Phase 7B-lite (Deterministic session summary) | 🔲 Planned |
| Phase 7C (Optional gateway control — research gate) | 🔲 Deferred |
| Phase 8B (Extended verification) | 🔲 Future |

**Active roadmap**: 7A.5 → 8A → 7B-lite → optional 7C → future 8B

### v1 Success Criteria

- Detect and alert on risky behavior in real OpenClaw sessions
- Capture operator acknowledgement / review intent with durable audit trail
- Verify selected in-project file writes/deletes independently (Level 2)
- Deliver an end-to-end real-session demo without manual patching

### v1 Non-Goals

- No universal execution verification engine
- No browser automation or database/API side-effect verification
- No real agent control required for v1 (7C is a research gate)
- No LLM dependency in the core safety pipeline
- No cross-session or cross-agent correlation

---

## Product Narrative

**Lobsterman v1** — A Telegram-first runtime watchdog for OpenClaw that:

- Automatically detects active sessions
- Monitors live JSONL transcripts
- Alerts on risky or anomalous behavior
- Records human acknowledgement/flag decisions (with audit trail)
- Independently verifies selected high-risk file actions

### Trust Model

```
Level 0:  Agent says "I did it"          → Don't trust (execution hallucination risk)
Level 1:  Gateway logs show it happened  → Trust but verify (Lobsterman today)
Level 2:  Independent check confirms it  → Verified (Phase 8A target)
```

---

## Execution Protocol

### Autonomy Levels

| Label | Meaning |
|---|---|
| 🟢 **Autonomous** | May complete without stopping |
| 🟡 **Pause after** | Complete step, then stop and wait for user |
| 🔴 **Human required** | User must provide input or judgment |

### General Rules

1. Complete all tasks within a phase, then **stop at the phase checkpoint**.
2. Do **not** proceed to the next phase until the user explicitly confirms.
3. On unexpected errors mid-phase: **stop and report** rather than improvise.
4. Before stopping at a checkpoint, **run all local validation** (`npx tsc --noEmit`, `npm run build`).
5. When stopping, report: **Completed** (what was done), **Verify** (what user must check), **Continue phrase**.

---

# Part A — Completed Milestones

> These phases are finished. Kept as a summary reference only.

## Phase 0: Bootstrap ✅

Next.js 16 + TypeScript + Tailwind v4 project. Folder skeleton created.

**Key files**: project root, `src/core/`, `src/rules/`, `src/ingestion/`, `src/components/`, `src/lib/`, `.env.local`

## Phase 1: Core Types + Mock Data + In-Memory Session Engine ✅

All TypeScript interfaces defined. MockEventSource emits 40 scripted events on a timer. StateStore receives events and updates. Throttled persistence to `data/session.json` and `data/events.jsonl`.

**Key files**: `src/core/types.ts`, `src/core/event-normalizer.ts`, `src/core/state-store.ts`, `src/core/state-updater.ts`, `src/ingestion/mock-source.ts`, `src/lib/demo-scenario.ts`, `src/lib/utils.ts`

## Phase 2: Rule Engine + Deterministic Rules ✅

Deterministic rule engine evaluates all rules on each event. Six rules implemented across three categories:

| Category | Rules |
|---|---|
| Context Danger | `cd-large-output`, `cd-repeated-large` |
| Looping | `lp-repeated-tool-target`, `lp-error-retry-loop`, `lp-no-progress` |
| Risky Action | `ra-path-outside-root`, `ra-sensitive-destructive` |

Intervention recommender maps flags → `none` / `review` / `pause` / `stop`.

**Key files**: `src/core/rule-engine.ts`, `src/core/intervention.ts`, `src/rules/context-danger.ts`, `src/rules/looping.ts`, `src/rules/risky-action.ts`

## Phase 3: API Routes + Engine Wiring ✅

Two API endpoints: `/api/dashboard` (state) and `/api/events` (event list with `?since=N`). Engine initializes lazily on first request.

**Key files**: `src/app/api/dashboard/route.ts`, `src/app/api/events/route.ts`, `src/core/engine.ts`

## Phase 4: Dashboard UI ✅

Five-panel dark-theme dashboard: RiskHero, RedFlagsPanel, InterventionPanel, Timeline, SessionSummary. Polls every 2 seconds.

**Key files**: `src/components/Dashboard.tsx`, `src/components/RiskHero.tsx`, `src/components/RedFlagsPanel.tsx`, `src/components/InterventionPanel.tsx`, `src/components/Timeline.tsx`, `src/components/SessionSummary.tsx`, `src/components/WatchdogState.tsx`

## Phase 5: Polish + Demo ✅

Tuned demo timing, empty states, responsive design, README. Full demo tells a coherent story in ~60-90 seconds.

## Phase 6: File Ingestion Adapter ✅

`FileEventSource` reads real OpenClaw `.jsonl` session files. JSONL parser handles OpenClaw's gateway event format. Auto-detection of event types from raw gateway data. Tail approach (reads last 50KB) for joining in-progress sessions.

**Key files**: `src/ingestion/file-source.ts`, `src/ingestion/session-watcher.ts`

## Phase 7A: Telegram Notifications ✅

Complete Telegram-first monitoring pipeline:

| Feature | Status |
|---|---|
| Session watcher (auto-detect new sessions) | ✅ |
| Telegram bot (long-polling, DM to operator) | ✅ |
| Message templates (per-rule alerts) | ✅ |
| Inline buttons (Acknowledge / Flag for Review) | ✅ |
| Engine callbacks (`onRuleTriggered`, `onRiskChanged`) | ✅ |
| Warmup flag (suppress stale alerts from historical data) | ✅ |
| 60-second per-rule cooldown (prevent alert flooding) | ✅ |
| `/status` and `/help` commands | ✅ |

**Key files**: `src/telegram/telegram-bot.ts`, `src/telegram/message-templates.ts`, `src/telegram/operator-intent.ts`, `src/ingestion/session-watcher.ts`, `src/instrumentation.ts`

**Known adjustments made during 7A**:
- `cd-long-run-no-summary` rule disabled (too noisy, overlaps with `lp-no-progress`)
- Looping thresholds raised (repeated tool: 3→5, no-progress: 20→50 events)
- Error-retry threshold raised (2→3 matching errors)
- Dashboard URL button removed (Telegram rejects `http://localhost` URLs)

---

# Part B — Active Forward Plan

---

## Phase 7A.5 — Stabilize the Operator Loop

> **Goal**: Polish 7A into a rock-solid, demonstrable product. Not new features — solidify existing ones.

### Step 11 🟢 — Stronger alert deduplication / aggregation

Extend the existing 60-second cooldown with target-aware aggregation:

- Same session + same rule + same target within cooldown window → single aggregated message
- Example: "⚠️ Path outside root — repeated 3 times (latest: `/etc/hosts`)"
- Risk-level-change alerts always pass through (never suppressed by aggregation)
- Counter updates replace per-event messages

### Step 12 🟢 — Richer alert message context

Standardize every Telegram alert to this template:

```
🚨 [Rule Name] [Severity Emoji]

Event #N: [event_type] tool → target
Reason: concise explanation
Recommended: next step

Session: [session ID prefix]
```

Every alert should be self-contained — the operator should understand the situation without opening the dashboard.

### Step 13 🟢 — Persist operator decisions with correct semantics

> [!IMPORTANT]
> **Acknowledgement must NOT clear an active flag.** Active/inactive is controlled by system state (rule logic), not by button clicks.

#### Operator Decision Model

```typescript
interface OperatorDecision {
  flagId: string;           // The RedFlag this decision is about
  ruleId: string;
  action: 'acknowledged' | 'flagged_for_review';
  timestamp: number;
  sessionId: string;
}
```

Add to `SupervisorState`:
```typescript
operatorDecisions: OperatorDecision[];
```

#### Decision semantics

| Button | Meaning | System behavior |
|---|---|---|
| ✅ Acknowledged | "I saw this warning" | Records decision. Flag remains active until system resolves it. UI shows flag as "acknowledged." |
| 🚩 Flag for Review | "This needs extra attention" | Records decision. Flag remains active AND is marked for review. UI shows flag as "flagged." |

#### How flags get resolved

Flags become inactive **only** when:
- The rule's condition is no longer true (e.g., no more repeated actions in the sliding window)
- The session ends
- A display-aging TTL moves the flag out of the active view (but this must NOT imply the underlying condition was resolved — it is archival only)

The operator decision is **metadata on the flag** — it enriches the audit trail but does not control active/inactive state.

#### Persistence

- Operator decisions are durably appended to `data/decisions.jsonl`
- Decisions survive server restarts (reloaded on engine init)
- Dashboard shows decision history per flag: who acknowledged, when, whether flagged for review

### Step 14 🟢 — Build + self-validate

- `npx tsc --noEmit`
- `npm run build`

### Step 15 🔴 HUMAN — End-to-end demo flow

User must:
1. Start Lobsterman dev server
2. Start OpenClaw gateway + TUI
3. Give OpenClaw a task that triggers 2-3 warnings
4. Verify in Telegram:
   - [ ] Alerts arrive with full context, not duplicated/spammed
   - [ ] Tapping "Acknowledged" shows confirmation but does NOT remove the warning
   - [ ] Tapping "Flag" marks it for review
5. Check dashboard:
   - [ ] Decisions visible alongside corresponding flags
   - [ ] Flags remain active until system resolves them, regardless of operator action

### Acceptance Criteria

- [ ] Repeated same-rule alerts are aggregated instead of spammed
- [ ] Operator decisions persist across server reload/restart
- [ ] Dashboard reflects decision history correctly (acknowledged, flagged, timestamps)
- [ ] Acknowledging a flag does NOT remove it from active state
- [ ] Risk-level-change alerts always get through despite cooldown
- [ ] End-to-end demo works on a real OpenClaw session without manual intervention

**🟡 STOP — Phase 7A.5 Complete**
**Continue condition:** User confirms "7A.5 stable, move to 8A."

---

## Phase 8A — Minimal Execution Verification (2 Verifiers)

> **Goal**: Move from "we saw it happen" to "we confirmed the result" — for file operations only.
>
> Design philosophy: "先垂直，后通用" — Only FileWriteVerifier + FileDeleteVerifier. No shell commands yet.

> [!IMPORTANT]
> **Scope boundary**: Phase 8A ONLY verifies file operations inside `LOBSTERMAN_PROJECT_ROOT`. Paths outside the project root still trigger risky-action alerts (Level 1) but do NOT enter automatic execution verification (Level 2). This prevents the verifier from expanding into an uncontrolled filesystem-wide checker.

### New Types

#### `src/verification/types.ts`

```typescript
export type VerificationStatus = 'verified' | 'mismatch' | 'unverifiable' | 'pending';

export interface VerificationResult {
  eventId: string;
  action: 'file_delete' | 'file_write';
  targetPath: string;
  claimed: string;           // "wrote src/auth.ts" or "deleted temp/debug.log"
  observed: string;          // "file exists, 842 bytes" or "file still exists"
  status: VerificationStatus;
  checkedAt: number;
  latencyMs: number;         // Time between tool_result and verification check
}

export interface PendingVerification {
  toolCallEventId: string;
  sessionId: string;
  action: 'file_delete' | 'file_write';
  targetPath: string;
  queuedAt: number;
  status: 'waiting_for_result' | 'ready_to_verify' | 'expired';
}
```

### Verification Workflow

> [!IMPORTANT]
> The pairing logic between `tool_call` → `tool_result` is critical. This must be explicit.

```
1. Engine sees a matching tool_call (write/delete pattern detected)
   → Extract target path
   → If path is OUTSIDE LOBSTERMAN_PROJECT_ROOT → skip verification (risky-action rules handle it)
   → If path cannot be parsed → mark as unverifiable, do not queue
   → Create PendingVerification { status: 'waiting_for_result' }

2. Engine sees the corresponding tool_result
   → Match to pending: prefer nearest unmatched pending entry within the same session and same tool family
   → Do NOT match across sessions
   → If ambiguity remains, mark unverifiable rather than guessing
   → If tool_result does NOT indicate success → do not claim verified, mark unverifiable
   → Set pending status → 'ready_to_verify'

3. Run the appropriate verifier (FileWrite or FileDelete)
   → Perform filesystem check
   → Produce VerificationResult

4. Emit result
   → Add to session state
   → Fire onVerificationResult callback → Telegram

5. Expiration
   → If no matching tool_result arrives within 30 seconds → expire the pending entry
   → Expired entries do NOT trigger Telegram alerts, but are recorded in session state and debug logs for traceability
```

### Step 16 🟢 — Verification types

Create `src/verification/types.ts` with `VerificationResult`, `PendingVerification`, and `VerificationStatus`.

### Step 17 🟢 — FileDeleteVerifier

Create `src/verification/file-delete-verifier.ts`:
- Input: resolved target path (must be inside `LOBSTERMAN_PROJECT_ROOT`)
- Check: `fs.existsSync(targetPath)`
- Output: `verified` (file gone) or `mismatch` (file still exists)
- If path cannot be resolved: `unverifiable`

### Step 18 🟢 — FileWriteVerifier

Create `src/verification/file-write-verifier.ts`:
- Input: resolved target path (must be inside `LOBSTERMAN_PROJECT_ROOT`)
- Check: `fs.existsSync(targetPath)` + `fs.statSync(targetPath).size > 0`
- Output: `verified` (exists, non-empty), `mismatch` (missing or empty), or `unverifiable`

### Step 19 🟢 — Verifier engine + wiring

Create `src/verification/verifier-engine.ts`:
- Maintains a `PendingVerification[]` queue
- On `tool_call` with write/delete pattern + path inside project root → enqueue
- On `tool_result` → match to pending → run verifier → emit result
- Expiration: sweep pending entries older than 30s on each poll
- Wire into `handleEvent` in `engine.ts`
- Fire `onVerificationResult` callback to Telegram

### Step 20 🟢 — Telegram verification messages

Format for verified outcomes:
```
✅ Verified Write — src/auth/jwt-provider.ts exists (842 bytes)
✅ Verified Delete — temp/debug.log confirmed removed
```

Format for mismatches:
```
⚠️ Verification Mismatch
Agent claimed write, but src/auth/jwt-provider.ts does not exist

⚠️ Verification Mismatch
Agent claimed deletion, but temp/debug.log still exists (1.2KB)
```

Mismatch alerts use existing alert cooldown. Verified outcomes are informational (no cooldown needed, but can be rate-limited to avoid noise).

### Step 21 🟢 — Build + self-validate

### Step 22 🔴 HUMAN — Live verification test

User must:
1. Restart dev server
2. Ask OpenClaw to write a file inside project root → verify "✅ Verified Write" in Telegram
3. Ask OpenClaw to delete a file inside project root → verify "✅ Verified Delete" in Telegram
4. Verify that paths outside project root do NOT produce verification messages
5. (Bonus) Test a mismatch scenario if possible

### Acceptance Criteria

- [ ] File write actions inside project root produce `verified`, `mismatch`, or `unverifiable`
- [ ] File delete actions inside project root produce `verified`, `mismatch`, or `unverifiable`
- [ ] Paths outside `LOBSTERMAN_PROJECT_ROOT` do NOT enter verification (Level 1 rules still fire)
- [ ] No silent failure in the verification flow (all pending entries resolve or expire)
- [ ] Verification results appear in Telegram messages
- [ ] Verification results are stored in session state
- [ ] PendingVerification entries expire after 30s if no matching tool_result arrives
- [ ] Build passes: `npx tsc --noEmit` and `npm run build`

**🟡 STOP — Phase 8A Complete**
**Continue condition:** User confirms "8A verified, move to 7B-lite."

---

## Phase 7B-lite — Deterministic Session Summary

> **Goal**: Send a session report card when a session goes idle. Template-based — no LLM required.
>
> "锦上添花" — this is a nice-to-have that rounds out the product, not a core trust feature.

### Session End Detection

Two concepts, handled differently:

| Trigger | Type | Behavior |
|---|---|---|
| No new JSONL events for 60s | **Idle summary** | Send interim report. Session may resume later. |
| `sessions.json` status changes to terminal state | **Final summary** | Send final report. Session is definitively over. |

> [!NOTE]
> A quiet period does not always mean a session is truly finished. An idle summary should be clearly labeled as **interim** ("Session appears idle") rather than **final** ("Session complete"). If the session resumes, the idle summary does not need to be retracted — it serves as a snapshot.

### Step 23 🟢 — Session summary generator

Create `src/telegram/session-summary.ts`:
- Monitor event flow; trigger summary when idle for 60s or terminal state detected
- Generate from `SupervisorState` directly (no LLM call):

```
🦞 Session Report Card (interim)

📋 Task: "Delete test files"
⏱ Duration: 4m 32s
📊 Events: 54 total
🛠 Tools: exec (12), read (8), write (3)
⚠️ Warnings: 2 triggered
🔴 Peak Risk: HIGH
✅ Decisions: 1 acknowledged, 1 flagged
🔍 Verifications: 2 verified, 0 mismatches
```

- For final summaries (if terminal state detected), use heading "Session Report Card (final)"
- Dedup rules:
  - One idle summary per idle interval per session (if session resumes and goes idle again, a new idle summary is allowed)
  - One final summary per session (sent only once)
  - A final summary supersedes idle summaries conceptually, but does not require deleting prior idle summaries
- If session resumes after idle summary, reset the idle timer

### Step 24 🔴 HUMAN — Live test

User must:
1. Run an OpenClaw task, let it complete
2. Wait ~60s after last event
3. Verify summary arrives in Telegram with correct stats

### Acceptance Criteria

- [ ] Idle summary triggers after 60s of no events
- [ ] Summary contains correct task, duration, event count, warnings, risk, decisions, verifications
- [ ] Summary is clearly labeled as "interim" or "final"
- [ ] No duplicate summaries for the same idle period
- [ ] If session resumes, a new idle summary can trigger later

**🟡 STOP — Phase 7B-lite Complete**
**Continue condition:** User confirms "7B-lite works."

> **Future enhancement**: Optionally add a 1-2 sentence LLM assessment below the template summary. But the template alone is already valuable and does not depend on model quality or API availability.

---

## Phase 7C — Optional Gateway Control (Research Gate)

> [!WARNING]
> **This is a research gate, not an assumed implementation phase.** Lobsterman v1 does NOT depend on real agent control. This phase may be permanently deferred if the OpenClaw control API is unstable, undocumented, unsafe, or unnecessary for the v1 value proposition.

### Prerequisites for proceeding

All of the following must be true before any implementation begins:

- [ ] OpenClaw Gateway WebSocket API supports pause/resume/stop (or equivalent)
- [ ] API is documented or reverse-engineerable
- [ ] Auth model is clear (token-based, session-scoped)
- [ ] Control operations are safely reversible (pause can be resumed)
- [ ] Testing is possible without risking data loss or corruption

### Step 25 🟢 — Research

- Run `openclaw gateway --help`, `openclaw agent --help`
- Search OpenClaw docs for control methods
- Inspect WS protocol if accessible
- Document findings

**🟡 STOP — Research Checkpoint**
Report: API findings, recommendation (proceed, defer, or permanently skip).

### Step 26 🟢 — (Conditional) Wire real control
- Only if Step 25 confirmed all prerequisites
- Create `src/telegram/openclaw-client.ts`
- Upgrade inline buttons to real Pause/Resume/Stop

### Step 27 🔴 — (Conditional) Live intervention test
- User runs OpenClaw task, presses Pause → verifies agent actually pauses

---

## Phase 8B — Extended Verification (Future)

> Only after Phase 8A is stable and proven in real use.

| Verifier | What it checks | Complexity |
|---|---|---|
| `ShellCommandVerifier` | Cross-check exit code vs agent's follow-up claims | Medium (requires semantic judgment) |
| `GitDiffVerifier` | `git status` shows changes after agent claims edits | Easy |
| `BuildArtifactVerifier` | Output directory exists after build command | Easy |

These are deferred because:
- ShellCommandVerifier involves semantic inference (matching agent text to exit codes) — risk of false positives
- GitDiffVerifier and BuildArtifactVerifier are straightforward but lower priority than file ops
- Phase 8A must prove the verification pattern works before expanding scope
