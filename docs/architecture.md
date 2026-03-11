# Architecture Overview

Data flow from OpenClaw JSONL transcript to Telegram/dashboard output.

## Pipeline

```
┌─────────────────────┐
│  OpenClaw JSONL      │   Raw event stream (~/.openclaw/sessions/*.jsonl)
│  (gateway transcript)│
└─────────┬───────────┘
          │ fs.watch (file-source.ts)
          ▼
┌─────────────────────┐
│  Event Normalizer    │   Parses raw JSON → NormalizedEvent
│  (event-normalizer)  │   Assigns: id, sequence, type, tool, target, tags
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  State Updater       │   Updates SupervisorState:
│  (state-updater.ts)  │   - stats, recentKeyActions, progressMarkers
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Rule Engine         │   Evaluates all enabled rules against event + state
│  (engine.ts)         │   Rules: context-danger, looping, risky-action
│                      │   Output: RedFlag[] per event
└─────────┬───────────┘
          │
          ├──→ composeFlags()     Multi-rule → single composed alert
          │    shouldAlert()      Cooldown dedup (60s, per ruleId+target)
          │
          ├──→ computeRiskLevel() Flags → risk: low/medium/high/critical
          │    intervention.ts    Risk → recommended action: none/review/pause/stop
          │
          ├──→ processVerification()   Level 2: pending queue
          │    verifier-engine.ts       tool_call → pending → tool_result → verify
          │    file-write-verifier.ts   exists + non-empty?
          │    file-delete-verifier.ts  path gone?
          │
          ▼
┌─────────────────────┐
│  Callbacks           │
│  (engine callbacks)  │
│                      │
│  ├─ onRuleTriggered  │──→ Telegram: MarkdownV2 warning + inline buttons
│  ├─ onRiskChanged    │──→ Telegram: risk level change notification
│  ├─ onSessionStart   │──→ Telegram: new session detected
│  └─ verification cb  │──→ Telegram: verified/mismatch result
│                      │
└─────────┬───────────┘
          │
          ├──→ Telegram Bot      Long-polling, inline keyboard buttons
          │    (telegram-bot.ts)  Ack / Flag for Review → operator-intent.ts
          │
          ├──→ Session Summary    Idle timer (2min) → interim report card
          │    (session-summary)  Cumulative stats + peak risk + verifications
          │
          ├──→ State Store        In-memory SupervisorState
          │    (state-store.ts)   Throttled disk persistence (every 5 events / 2s)
          │
          └──→ Dashboard API      GET /api/dashboard → JSON snapshot
               (route.ts)         Next.js frontend polls every 2s
```

## Key Design Principles

1. **Deterministic hot path**: No LLM calls during event processing. Rules are pure functions.
2. **Composed alerts**: Multiple rules on one event → single message (prevents spam).
3. **Cooldown dedup**: Same rule+target within 60s → suppressed (with repeat count).
4. **Warmup isolation**: First session on startup suppresses stale historical alerts.
5. **Session-level model**: State resets on session switch (alert history, verifications, summary).
6. **Level 2 inside root only**: Verification scoped to `LOBSTERMAN_PROJECT_ROOT` to avoid false positives.

## Persistence

- `data/state.json` — throttled SupervisorState snapshot
- `data/decisions.jsonl` — append-only operator decisions
- No database. All state reconstructable from JSONL replay.
