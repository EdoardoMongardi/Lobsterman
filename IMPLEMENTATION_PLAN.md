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

---

# Phase 9 — Validation, Hardening, and Release Prep

> **Goal**: Turn Lobsterman v1 from "feature complete" to "stable, validated, demo-ready, and suitable for alpha testing."

This phase does **not** add major runtime features. It focuses on proving correctness, reducing rough edges, and preparing for external use.

> **Assumption**: The currently enabled rule set is the one present in the codebase at Phase 9 start. Any fixture expectations must be aligned to the actual enabled rule set, not older plan text.

## Phase 9 Non-Goals

- No new major runtime features
- No 7C (gateway control) implementation by default
- No 8B (extended verification) expansion by default
- No task segmentation within sessions
- No redesign of the core session-level model

---

## A. Hardening / Bug Sweep

Systematic review of each v1 layer. Each item specifies what to check, which files are involved, and what regressions we guard against.

### A1. Telegram Layer

| Check | Files | Regression guarded |
|---|---|---|
| **Composed alert dedup**: when 2+ rules fire on same event, exactly one Telegram message is sent | `engine.ts` `composeFlags` | Duplicate alerts from composed vs individual dispatch |
| **Cooldown boundary**: rapid-fire events with same `ruleId + target` → only first alert within window | `engine.ts` `shouldAlert` | Alert spam from high-frequency events |
| **Idle summary single-fire**: after 60s idle, exactly one interim summary sent; no duplicates | `session-summary.ts` `handleIdleTimeout`, `sentIdleSummary` | Double-fire from timer race conditions |
| **Session resume after idle**: new event after idle summary → `sentIdleSummary` resets → new idle period can trigger new summary | `session-summary.ts` `onEventReceived` | Stuck `sentIdleSummary=true` preventing future summaries |
| **Operator button robustness**: unknown `callback_data` formats → handled gracefully, no crash | `telegram-bot.ts` `callback_query` handler | Crash from stale/malformed button presses |
| **MarkdownV2 escaping**: special characters in task text, paths, or reasons → no Telegram parse errors | `message-templates.ts`, `session-summary.ts` `escMd` | Telegram API rejection from unescaped characters |

### A2. Verification Layer

| Check | Files | Regression guarded |
|---|---|---|
| **Pending lifecycle**: every `tool_call` verification matches to exactly one `tool_result`; no orphans | `verifier-engine.ts` `findMatchingPending` | Mismatched verification results |
| **Expiration at 30s**: pending entries with no matching result → status `expired`, cleaned up | `verifier-engine.ts` `expireStale` | Memory leak from abandoned verifications |
| **Root boundary enforcement**: paths outside `LOBSTERMAN_PROJECT_ROOT` → log `verification_skipped_out_of_scope`, no Telegram verification message | `verifier-engine.ts` `isInsideProjectRoot` | ✅ Verified messages for outside-root paths |
| **Mismatch false-positive review**: delete via Trash → original path gone → should count as `verified` for v1 inside-root delete semantics. False `⚠️ Mismatch` when the original path is removed (e.g. moved to Trash) even though delete semantics are satisfied. | `file-delete-verifier.ts` | False mismatch for legitimate Trash operations |
| **Cumulative counter consistency**: `recordVerificationForSummary` called for every verification result, persists across idle periods | `session-summary.ts`, `telegram-bot.ts` | Verification counts reset mid-session |

### A3. State / Persistence Layer

| Check | Files | Regression guarded |
|---|---|---|
| **Restart correctness**: stop → restart Lobsterman → decisions.jsonl reloaded, session re-detected | `operator-intent.ts` `loadDecisions`, `engine.ts` `initializeSource` | Lost decisions or missed session after restart |
| **Session switch isolation**: new session → `stateStore.reset()`, `clearVerifications()`, `resetSessionSummary()`, `clearAlertHistory()`, `resetSequence()` all called | `engine.ts` session watcher callback | Cross-session state leakage (old flags, old verifications) |
| **Persisted state vs in-memory consistency**: `data/session.json` matches `stateStore.getState()` after every persist cycle | `state-store.ts` `persistThrottled` | Dashboard showing stale persisted state |
| **Event sequence reset**: session switch → sequence restarts from 1 | `event-normalizer.ts` `resetSequence` | Confusing event numbers across sessions |

### A4. Dashboard / UX Layer

| Check | Files | Regression guarded |
|---|---|---|
| **Dashboard state matches Telegram**: risk level, flag counts, event counts consistent | `route.ts`, all dashboard components | User sees conflicting info between dashboard and Telegram |
| **Flag display correctness**: active flags shown with correct severity icons | Dashboard components | Wrong severity color/icon mapping |
| **Cumulative vs live scope labels**: report card clearly separates "Cumulative session stats" from "Verified (since monitoring started)" | `session-summary.ts` `buildSummary` | Users comparing incomparable numbers |

### Hardening Deliverable

> **Step 25** 🟢: Sweep each table above. For each item, verify correctness by code review and/or quick manual test. Fix any bugs found. Commit fixes atomically per layer.

---

## B. Lean Systematic Verification Pipeline

### B1. Unit / Logic Tests

Create `tests/` directory with focused test files. Use Node.js built-in `node:test` runner (zero dependencies).

| Test file | Priority | What it tests | Key assertions |
|---|---|---|---|
| `tests/alert-composition.test.ts` | P0 | `composeFlags()` in engine.ts | Single flag → passthrough; 2 flags → merged title, highest severity wins; 3+ flags → correct ordering |
| `tests/cooldown.test.ts` | P0 | `shouldAlert()` dedup logic | Same ruleId+target within window → suppressed; different targets → both fire; window expires → fires again |
| `tests/exec-path-extractor.test.ts` | P0 | `extractFileOpFromCommand()` | osascript delete → correct path; `cat > path` → write; `rm path` → delete; `$HOME` resolution; no match → null |
| `tests/root-boundary.test.ts` | P0 | `isInsideProjectRoot()` + `ra-path-outside-root` rule | Inside root → pass; outside root → flag; no root set → skip |
| `tests/verification-lifecycle.test.ts` | P0 | Pending verification queue | tool_call → queued; tool_result → matched → verified/mismatch; timeout → expired; outside root → skipped |
| `tests/summary-trigger.test.ts` | P0 | Idle timer and cumulative counters | Events reset timer; 60s idle → fires once; resume → resets; new idle → fires again; counters cumulative |
| `tests/progress-marker.test.ts` | P1 (optional) | `detectProgressMarker()` | exec tool_result → progress; user_message → progress; error → not progress. Lower priority — not core v1 trust semantics. |

> **Step 26** 🟢: Implement the P0 test files (6 required, 1 optional). Run with `node --test tests/`. All P0 tests must pass.

### B2. Scenario Replay Validation

Create `tests/fixtures/` with static event transcript files. Each fixture is a `.jsonl` file replayed through the engine using a replay harness written as `tests/replay.test.ts` (also runs under `node:test` for consistency).

| Fixture name | Input scenario | Expected outcomes |
|---|---|---|
| `clean-write-session.jsonl` | User sends task → agent writes file inside root → completes | ✅ Verified Write, Risk: LOW, 0 warnings |
| `delete-inside-root.jsonl` | User asks delete → agent deletes file inside root | ✅ Verified Delete, `ra-sensitive-destructive` fires |
| `delete-outside-root.jsonl` | Agent deletes file outside root | `ra-path-outside-root` + `ra-sensitive-destructive` composed, no verification message, `verification_skipped_out_of_scope` logged |
| `outside-root-destructive-composed.jsonl` | Single event triggers both `ra-path-outside-root` and `ra-sensitive-destructive` | State has both flags trackable; Telegram sends exactly 1 composed alert; risk escalation handled separately |
| `retry-loop.jsonl` | Agent calls same tool 4+ times on same target | `lp-repeated-tool-target` fires, Risk escalates |
| `missing-tool-result.jsonl` | tool_call with no matching tool_result within 30s | Pending verification expires, status = `expired` |
| `idle-then-resume.jsonl` | Events → 60s gap → more events | First idle summary sent; after resume, new events reset timer; second idle → second summary |
| `warmup-then-live.jsonl` | 50 historical events (warmup) + 5 live events | Stats cumulative (55 events), flags from warmup in cumulative counts, alerts only dispatched for live events, verifications only for live |

> **Step 27** 🟢: Create the 8 fixtures and the replay harness as `tests/replay.test.ts`. Run with `node --test tests/replay.test.ts`. All scenarios must pass.

### B3. Manual Live Validation Checklist

A checklist to run before demos or alpha release.

```
LOBSTERMAN v1 — MANUAL VALIDATION CHECKLIST

Setup:
□ .env.local has TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, LOBSTERMAN_PROJECT_ROOT
□ npm run dev starts cleanly
□ Session watcher detects active OpenClaw session

Telegram:
□ Session start message appears in Telegram
□ Ask OpenClaw to write file inside root → ✅ Verified Write
□ Ask OpenClaw to delete file inside root → ✅ Verified Delete + 🚨 Destructive
□ Ask OpenClaw to delete file outside root → composed 🚨 alert (no verification)
□ Press ✅ Acknowledged button → "Decision recorded" response
□ Press 🚩 Flag for Review button → "Decision recorded" response
□ Wait 60s idle → interim report card appears with correct stats

Summary accuracy:
□ Session ID matches (first 8 chars)
□ Latest user request shows clean text (not raw JSON)
□ Events, warnings, risk are cumulative
□ Verifications labeled "(since monitoring started)"
□ Peak Risk reflects highest level reached

Dashboard:
□ http://localhost:3000 loads
□ Risk level matches Telegram
□ Recent events list is populated
□ Active flags shown correctly

Recovery:
□ Stop npm run dev → restart → decisions.jsonl preserved
□ New OpenClaw session → Lobsterman resets and picks up new session
```

> **Step 28** 🔴 HUMAN: Run the full checklist above. Record pass/fail for each item.

---

## C. Metrics / Success Criteria

| # | Criterion | Measurement |
|---|---|---|
| C1 | **Alert composition correctness** | Multi-rule events produce exactly 1 Telegram message (tested in B1 + B2) |
| C2 | **Cooldown suppression works** | Rapid same-target events → at most 1 alert per cooldown window (tested in B1) |
| C3 | **Outside-root containment** | No `✅ Verified` messages for paths outside `LOBSTERMAN_PROJECT_ROOT` (tested in B2) |
| C4 | **Verification resolution** | Pending → verified/mismatch/expired, no stuck entries (tested in B1 + B2) |
| C5 | **Summary non-duplication** | One idle summary per idle period, resets on resume (tested in B1) |
| C6 | **Persistence across restart** | `decisions.jsonl` survives restart, state is reloaded (manual checklist B3) |
| C7 | **All unit tests pass** | `node --test tests/` → 0 failures |
| C8 | **All scenario replays pass** | `node --test tests/replay.test.ts` → all 8 scenarios green |
| C9 | **Manual checklist complete** | All items in B3 checked off by human |
| C10 | **Build clean** | `npx tsc --noEmit` → 0 errors |

---

## D. Documentation / Packaging

### D1. README.md

> **Step 29** 🟢: Rewrite `README.md` with the following sections:

1. **What is Lobsterman** — one-paragraph elevator pitch
2. **Who it's for** — operators supervising AI coding agents
3. **Trust model**:
   - Level 0: Agent self-report
   - Level 1: Gateway transcript / runtime monitoring
   - Level 2: Independent result verification
4. **Human response layer** — operator acknowledgement / flagging as audit metadata (intentionally not a trust level)
5. **What it detects** — risky actions, looping, context danger, file operations
6. **Quick start** — env vars, `npm install`, `npm run dev`
7. **Architecture** — brief system diagram (ASCII or Mermaid)
8. **Current boundaries / non-goals** — see D4

### D2. Architecture Overview

> **Step 30** 🟢: Create `docs/architecture.md`:

```
OpenClaw JSONL → session-watcher → file-source → event-normalizer
    → state-store → rule-engine → [flags] → alert-composition → telegram-bot
    → state-updater                        → verification-engine → telegram-bot
                                           → session-summary → telegram-bot
    Dashboard ← state-store (API routes)
    Persistence: data/session.json, data/events.jsonl, data/decisions.jsonl
```

Cover each layer in 2–3 sentences: responsibility, key files, data flow.

### D3. Demo Guide

> **Step 31** 🟢: Create `docs/demo-guide.md` — a step-by-step demo script:

1. Start Lobsterman + show Telegram bot
2. Send a safe task to OpenClaw (write a poem) → show verified write
3. Send a risky task (delete files outside root) → show composed alert + operator buttons
4. Acknowledge the alert → show decision recorded
5. Wait for idle summary → show the report card
6. Show dashboard at localhost:3000
7. Show persistence (restart, decisions survive)

Estimated demo time: 5–7 minutes.

### D4. Known Limitations

> **Step 32** 🟢: Create `docs/known-limitations.md`:

- Session-level monitoring only; no per-task segmentation in v1
- Level 2 verification limited to file write/delete inside `LOBSTERMAN_PROJECT_ROOT`
- No universal side-effect verification (network, database, system config)
- No real control plane in v1 (acknowledged ≠ paused/stopped)
- Warmup stats are cumulative but verification is live-only
- Single-operator model (one Telegram chat)
- Depends on OpenClaw JSONL transcript format

---

## E. Alpha Release Readiness

### Release Readiness Checklist

```
LOBSTERMAN v1 — RELEASE READINESS

Stability:
□ No known crash-on-startup bugs
□ npm run dev runs for 30+ minutes without errors
□ Session switch handled cleanly (no stale state)

Validation:
□ All unit tests pass (C7)
□ All scenario replays pass (C8)
□ Manual checklist passed (C9)
□ Build clean (C10)

Documentation:
□ README.md complete (D1)
□ Architecture overview written (D2)
□ Demo guide written (D3)
□ Known limitations documented (D4)

Known issues policy:
□ All known bugs filed as GitHub issues with [v1] label
□ No critical/high severity bugs open
□ Medium/low bugs documented in known-limitations.md if not fixed
□ All currently known false-positive / ambiguous alert cases are
  documented and understood (critical for a monitoring product)

Demo confidence:
□ Demo guide successfully executed end-to-end
□ No embarrassing UI/UX issues in dashboard
□ Telegram messages render correctly (no MarkdownV2 errors)
□ Report card shows accurate cumulative stats
```

> **Step 33** 🔴 HUMAN: Run the release readiness checklist. All items must pass before declaring v1 alpha-ready.

---

## Phase 9 Summary

| Step | Type | Deliverable |
|---|---|---|
| 25 | 🟢 Code | Hardening bug sweep (A1–A4) |
| 26 | 🟢 Code | Unit/logic tests (6 required + 1 optional) |
| 27 | 🟢 Code | Scenario replay fixtures + harness (8 fixtures) |
| 28 | 🔴 Human | Manual live validation |
| 29 | 🟢 Docs | README.md rewrite |
| 30 | 🟢 Docs | Architecture overview |
| 31 | 🟢 Docs | Demo guide |
| 32 | 🟢 Docs | Known limitations |
| 33 | 🔴 Human | Release readiness sign-off |

**Phase 9 complete when**: All 🟢 steps done, both 🔴 HUMAN checklists passed, all C1–C10 criteria met.

---

## Phase 9 Deliverable Narrative

At the end of Phase 9, Lobsterman v1 should be:

- **Stable** under real OpenClaw sessions
- **Protected** against key semantic regressions
- **Documented** well enough for demo / alpha users
- **Packaged** as an alpha-ready operator-facing runtime watchdog

