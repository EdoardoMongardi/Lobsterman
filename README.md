# OpenClaw Watchtower

Runtime watchdog for long-running OpenClaw workflows.

Watchtower monitors agent sessions in real time and raises warnings when it detects context danger, looping behavior, or risky actions — before they become expensive failures.

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3000 — demo mode starts automatically
```

## What You'll See

The demo runs a pre-scripted 40-event scenario simulating an agent refactoring an auth module. Watch as:

1. **Events 1–15** — Normal progress. Files created, edited, builds pass. Risk stays **LOW**.
2. **Events 16–22** — **Context Danger**. Agent reads huge files (8KB, 6KB, 10KB). Warnings appear.
3. **Events 23–30** — **Looping**. Agent retries `npm run build` with the same TypeScript error. Escalates to **CRITICAL**.
4. **Events 31–35** — **Risky Action**. Agent edits files outside the project, touches `.env`, runs `rm -rf`.
5. **Events 36–40** — Continued escalation. Intervention panel recommends **STOP**.

Total demo time: ~60 seconds.

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

- **Engine**: Deterministic rule pipeline — no LLM calls in the hot path
- **State**: In-memory with throttled persistence to `data/session.json` and `data/events.jsonl`
- **API**: `GET /api/dashboard` (full state) and `GET /api/events?since=N` (incremental)
- **UI**: Next.js + Tailwind, polls every 2 seconds, risk-first layout
- **Ingestion**: Mock source (demo) → File source (post-MVP)

See [DESIGN.md](./DESIGN.md) for full architecture documentation.

## Testing with Live OpenClaw

To monitor a **real** OpenClaw session:

1. Install OpenClaw: `npm install -g openclaw@latest` (Node 22+).
2. Set `.env.local`: `WATCHTOWER_MODE=file`, `WATCHTOWER_SOURCE_FILE` to your session transcript path, `WATCHTOWER_PROJECT_ROOT` to your project root.
3. Default transcript path: `~/.openclaw/agents/main/sessions/main.jsonl`.
4. Run Watchtower (`npm run dev`), then start an OpenClaw task; the dashboard updates live.

**Full steps:** See [OPENCLAW_LIVE_SETUP.md](./OPENCLAW_LIVE_SETUP.md).

**Latest session path:** `./scripts/latest-openclaw-session.sh` prints the most recently modified transcript (e.g. `export WATCHTOWER_SOURCE_FILE=$(./scripts/latest-openclaw-session.sh)`).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WATCHTOWER_MODE` | `demo` | `demo` or `file` |
| `WATCHTOWER_PROJECT_ROOT` | `/Users/example/project` | Used for risky action path checks |
| `WATCHTOWER_SOURCE_FILE` | — | Path to JSONL session transcript (when mode=file) |

## Project Structure

```
src/
├── app/                    # Next.js pages + API routes
│   ├── api/dashboard/      # GET /api/dashboard
│   ├── api/events/         # GET /api/events?since=N
│   ├── page.tsx            # Dashboard page
│   └── layout.tsx
├── core/                   # Engine logic
│   ├── types.ts            # All TypeScript interfaces
│   ├── engine.ts           # Orchestrator (lazy singleton)
│   ├── rule-engine.ts      # Rule evaluation pipeline
│   ├── state-store.ts      # In-memory state + persistence
│   ├── state-updater.ts    # State mutation logic
│   ├── event-normalizer.ts # Raw → NormalizedEvent
│   └── intervention.ts     # Flags → recommended action
├── rules/                  # Rule implementations
│   ├── context-danger.ts   # 2 active + 2 deferred
│   ├── looping.ts          # 2 active + 2 deferred
│   └── risky-action.ts     # 2 active + 2 deferred
├── ingestion/              # Data source adapters
│   ├── mock-source.ts      # Demo event emitter
│   └── file-source.ts      # JSONL file watcher (stub)
├── components/             # React UI components
└── lib/                    # Utilities + demo data
    ├── demo-scenario.ts    # 40 pre-scripted events
    └── utils.ts
```

## Status

**MVP / Demo** — not production-ready. Local-first, single-user, advisory-only.
