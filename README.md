# 🦞 Lobsterman

**AI Agent Runtime Safety & Audit Layer**

Runtime monitoring · Deterministic guardrails · Human-in-the-loop · Evidence-backed audit

Lobsterman monitors OpenClaw agent sessions in real time via Telegram DM and web dashboard. It raises warnings when it detects context danger, looping behavior, or risky actions — before they become expensive failures.

> Built on gateway-level event streams, not agent self-reports. [Why this matters →](#trust-model)

## Who Is This For?

- **Operators** running AI coding agents on their own machines who want visibility
- **Students/researchers** building with agent frameworks who need guardrails
- **Teams** evaluating agent trustworthiness through behavioral evidence

## Quick Start

```bash
# Clone and install
git clone https://github.com/EdoardoMongardi/Lobsterman.git
cd Lobsterman
npm install

# Demo mode — see it work immediately
npm run dev
# Open http://localhost:3000

# Telegram mode — live monitoring
export LOBSTERMAN_MODE=telegram
export TELEGRAM_BOT_TOKEN=your_bot_token
export TELEGRAM_CHAT_ID=your_chat_id
export LOBSTERMAN_PROJECT_ROOT=/path/to/monitored/project
npm run dev
```

## What It Detects

| Category | Rule | Severity |
|---|---|---|
| Context Danger | Single output > 16KB | Medium |
| Context Danger | 3+ large outputs in 10-event window | High |
| Looping | Same tool+target called 3+ times | Medium → High |
| Looping | Same error repeated with retries | Critical |
| Risky Action | File path outside project root | Critical |
| Risky Action | Sensitive file or destructive command | High |

Multi-rule events are **composed into a single alert** (e.g., "Destructive Command — Outside Project Root") to prevent spam.

## Trust Model

Lobsterman operates at three trust levels:

| Level | Source | Status |
|---|---|---|
| **Level 0** | Agent self-report ("I wrote the file") | ❌ Not trusted — execution hallucination risk |
| **Level 1** | Gateway transcript / runtime monitoring | ✅ Active — deterministic rule evaluation on real event streams |
| **Level 2** | Independent result verification | ✅ Active (v1: file write/delete inside project root) |

### Human Response Layer

Operator decisions (acknowledge / flag for review) are captured as audit metadata via Telegram inline buttons. These are **not** a trust level — they are human-in-the-loop accountability records persisted to `data/decisions.jsonl`.

## Architecture

```
OpenClaw Gateway ─── JSONL ──→ Lobsterman Engine ──→ Telegram Bot (DM)
                   sessions/        │                      │
                                    │                 inline buttons
                                    ▼                      ▼
                              Rule Pipeline          Operator Intent
                              (deterministic)        (decision capture)
                                    │
                                    ├──→ Verification Engine (Level 2)
                                    │
                                    ▼
                              Web Dashboard
                              (deep-dive view)
```

- **Engine**: Deterministic rule pipeline — no LLM calls in the hot path
- **Verification**: File write/delete checks after tool execution (inside project root only)
- **Session Summary**: Cumulative session stats + peak risk level via Telegram
- **State**: In-memory with throttled persistence to disk
- **Dashboard**: Next.js + Tailwind, polls every 2 seconds, risk-first layout

See [docs/architecture.md](./docs/architecture.md) for the full data flow.

## Modes

| Mode | What | Set via |
|---|---|---|
| `demo` | Pre-scripted 40-event scenario | Default |
| `file` | Monitor a specific JSONL transcript | `LOBSTERMAN_MODE=file` |
| `telegram` | Auto-detect sessions + Telegram DM alerts | `LOBSTERMAN_MODE=telegram` |

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOBSTERMAN_MODE` | `demo` | `demo`, `file`, or `telegram` |
| `LOBSTERMAN_PROJECT_ROOT` | `/Users/example/project` | For risky action path checks + verification boundary |
| `LOBSTERMAN_SOURCE_FILE` | — | JSONL transcript path (mode=file) |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token (mode=telegram) |
| `TELEGRAM_CHAT_ID` | — | Your Telegram chat ID (mode=telegram) |
| `OPENCLAW_STATE_DIR` | `~/.openclaw` | OpenClaw state directory |

## Testing

```bash
# Run all tests (41 tests: 34 unit + 7 replay scenarios)
npx tsx --test tests/*.test.ts
```

Tests use Node.js built-in `node:test` runner. No external test framework dependencies.

## Project Structure

```
src/
├── app/                    # Next.js pages + API routes
├── core/                   # Engine logic
│   ├── types.ts            # All TypeScript interfaces
│   ├── engine.ts           # Orchestrator + alert composition/cooldown
│   ├── state-store.ts      # In-memory state + persistence
│   └── intervention.ts     # Flags → risk level → recommended action
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
│   ├── session-summary.ts  # Cumulative session report card
│   └── operator-intent.ts  # Decision capture layer
├── verification/           # Level 2 execution verification
│   ├── verifier-engine.ts  # Pending queue + lifecycle
│   ├── file-write-verifier.ts
│   └── file-delete-verifier.ts
├── components/             # React UI components
└── lib/                    # Utilities + demo data
tests/
├── *.test.ts               # Unit + integration tests (node:test)
└── fixtures/               # JSONL scenario replay fixtures
```

## What Lobsterman Is NOT

- ❌ Not an AI assistant or productivity tool
- ❌ Not a replacement for OpenClaw's security patches
- ❌ Not a prompt injection "solution"
- ❌ Not a substitute for minimum-privilege architecture
- ❌ Not a control plane — it monitors and alerts, it does not block

## Known Limitations

See [docs/known-limitations.md](./docs/known-limitations.md) for the full list. Key boundaries:

- **Session-level monitoring** — no cross-session correlation
- **Level 2 verification** limited to file write/delete inside project root
- **No universal side-effect verification** — network, registry, system state not checked
- **Depends on OpenClaw JSONL format** — not agent-agnostic (yet)

## Status

**Phase 9** — Validation, hardening, and release prep complete. See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for full roadmap.
