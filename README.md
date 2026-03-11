# Lobsterman

**AI Agent Runtime Safety & Audit Layer**

Runtime monitoring · Deterministic guardrails · Human-in-the-loop · Evidence-backed audit

Lobsterman monitors OpenClaw agent sessions in real time via Telegram DM and web dashboard. It raises warnings when it detects context danger, looping behavior, or risky actions — before they become expensive failures.

> Built on gateway-level event streams, not agent self-reports. [Why this matters →](./IMPLEMENTATION_PLAN.md#phase-8-execution-verification-layer-future)

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000 — demo mode starts automatically
```

## Modes

| Mode | What | Set via |
|---|---|---|
| `demo` | Pre-scripted 40-event scenario | Default |
| `file` | Monitor a specific JSONL transcript | `LOBSTERMAN_MODE=file` |
| `telegram` | Auto-detect sessions + Telegram DM alerts | `LOBSTERMAN_MODE=telegram` |

## What You'll See (Demo Mode)

The demo simulates an agent refactoring an auth module:

1. **Events 1–15** — Normal progress. Risk stays **LOW**.
2. **Events 16–22** — **Context Danger**. Agent reads huge files. Warnings appear.
3. **Events 23–30** — **Looping**. Agent retries builds with the same error. Escalates to **CRITICAL**.
4. **Events 31–35** — **Risky Action**. Agent edits files outside project, touches `.env`, runs `rm -rf`.
5. **Events 36–40** — Continued escalation. Intervention panel recommends **STOP**.

## MVP Rules (6 active)

| Category | Rule | Severity |
|---|---|---|
| Context Danger | Single output > 16KB | Medium |
| Context Danger | 3+ large outputs in 10-event window | High |
| Looping | Same tool+target called 3+ times | Medium → High |
| Looping | Same error repeated with retries | Critical |
| Risky Action | File path outside project root | Critical |
| Risky Action | Sensitive file or destructive command | High |

## Architecture

```
OpenClaw Gateway ─── JSONL ──→ Lobsterman Engine ──→ Telegram Bot (DM)
                   sessions/        │                      │
                                    │                 inline buttons
                                    ▼                      ▼
                              Rule Pipeline          Operator Intent
                              (deterministic)        (decision capture)
                                    │
                                    ▼
                              Web Dashboard
                              (deep-dive view)
```

- **Engine**: Deterministic rule pipeline — no LLM calls in the hot path
- **State**: In-memory with throttled persistence
- **Telegram**: Templated warnings (zero-cost, zero-latency). LLM only for session reports.
- **Dashboard**: Next.js + Tailwind, polls every 2 seconds, risk-first layout

### Trust Model

```
Agent says "I did it"          → Don't trust (execution hallucination risk)
Gateway logs show it happened  → Trust but verify (Lobsterman Level 2) ← current
Independent check confirms it  → Verified (Lobsterman Level 3, planned)
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOBSTERMAN_MODE` | `demo` | `demo`, `file`, or `telegram` |
| `LOBSTERMAN_PROJECT_ROOT` | `/Users/example/project` | For risky action path checks |
| `LOBSTERMAN_SOURCE_FILE` | — | JSONL transcript path (mode=file) |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (mode=telegram) |
| `TELEGRAM_CHAT_ID` | — | Your Telegram chat ID (mode=telegram) |
| `OPENCLAW_STATE_DIR` | `~/.openclaw` | OpenClaw state directory |

## Project Structure

```
src/
├── app/                    # Next.js pages + API routes
├── core/                   # Engine logic
│   ├── types.ts            # All TypeScript interfaces
│   ├── engine.ts           # Orchestrator (callbacks + session watcher)
│   ├── rule-engine.ts      # Rule evaluation pipeline
│   ├── state-store.ts      # In-memory state + persistence
│   ├── intervention.ts     # Flags → recommended action
│   └── ...
├── rules/                  # Rule implementations
│   ├── context-danger.ts
│   ├── looping.ts
│   └── risky-action.ts
├── ingestion/              # Data source adapters
│   ├── mock-source.ts      # Demo event emitter
│   ├── file-source.ts      # JSONL file watcher
│   └── session-watcher.ts  # Auto-detect OpenClaw sessions
├── telegram/               # Telegram bot integration
│   ├── telegram-bot.ts     # Bot core (long-polling + inline buttons)
│   ├── message-templates.ts # MarkdownV2 warning templates
│   └── operator-intent.ts  # Decision capture layer
├── components/             # React UI components
└── lib/                    # Utilities + demo data
```

## What Lobsterman Is NOT

- ❌ Not an AI assistant or productivity tool
- ❌ Not a replacement for OpenClaw's security patches
- ❌ Not a prompt injection "solution"
- ❌ Not a substitute for minimum-privilege architecture

## Status

**Phase 7A** — Telegram notifications MVP in progress. See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for full roadmap.
