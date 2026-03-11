# Demo Guide

Step-by-step script for showcasing Lobsterman's features.

## Prerequisites

- Node.js 22+
- npm dependencies installed (`npm install`)
- For Telegram demo: bot token + chat ID configured

## Demo 1: Dashboard (2 minutes)

1. **Start in demo mode** (default):

   ```bash
   npm run dev
   ```

2. **Open dashboard**: http://localhost:3000

3. **Watch the simulation** — 40 events over ~60 seconds:
   - **Events 1–15**: Normal progress. Risk stays **LOW** (green).
   - **Events 16–22**: **Context Danger** — agent reads huge files. Warnings appear. Risk → **MEDIUM**.
   - **Events 23–30**: **Looping** — agent retries builds with the same error. Risk → **HIGH** → **CRITICAL**.
   - **Events 31–35**: **Risky Action** — agent edits files outside project root, touches `.env`, runs `rm -rf`.
   - **Events 36–40**: Full escalation. Intervention panel recommends **STOP**.

4. **Point out key UI elements**:
   - Risk level indicator (color-coded)
   - Active red flags with severity badges
   - Recent key actions timeline
   - Progress markers (file created, build passed, etc.)
   - Intervention recommendation panel

## Demo 2: Telegram Live Monitoring (5 minutes)

1. **Setup**:

   ```bash
   export LOBSTERMAN_MODE=telegram
   export TELEGRAM_BOT_TOKEN=your_token
   export TELEGRAM_CHAT_ID=your_chat_id
   export LOBSTERMAN_PROJECT_ROOT=/path/to/project
   npm run dev
   ```

2. **Start an OpenClaw session** on the monitored project.

3. **Show Telegram messages** as they arrive:
   - 🦞 Session start notification with task summary
   - ⚠️ Rule warnings with inline buttons (Ack / Flag)
   - ✅ Verification results (file write confirmed)
   - 📊 Risk level changes

4. **Interact with buttons**:
   - Tap "✅ Acknowledged" → saved as audit record
   - Tap "🚩 Flag for Review" → saved for later review

5. **Wait for idle summary** (~2 minutes of no events):
   - Shows cumulative session stats
   - Peak risk level
   - Verification counts (since monitoring started)

## Demo 3: Verification in Action (3 minutes)

1. Start Telegram mode pointing at a project.

2. Ask the agent to **write a file** inside the project:
   - Lobsterman queues pending verification
   - On tool_result → checks file exists + non-empty
   - Sends ✅ Verified Write message

3. Ask the agent to **delete a file** outside the project root:
   - Alert fires: "Destructive Command — Outside Project Root" (composed)
   - No verification (outside root boundary)
   - Buttons for operator acknowledgment

## Talking Points

- **Not an AI assistant** — Lobsterman is a monitoring tool. It doesn't help the agent, it watches it.
- **Deterministic** — No LLM in the hot path. Rules are pure functions. Same input → same output.
- **Trust model** — Three levels: agent self-report (untrusted), gateway transcript (Level 1), independent verification (Level 2).
- **Composed alerts** — Multi-rule events → single message. No spam.
- **Human-in-the-loop** — Operator decisions are audit records, not control signals.
