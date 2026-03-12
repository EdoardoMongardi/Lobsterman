# Setup Guide

Complete instructions for installing and running Lobsterman from scratch.

## Prerequisites

- **Node.js 22+** ([download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **OpenClaw** installed and configured ([docs](https://github.com/openclaw/openclaw))
- A project directory the AI agent will work in

---

## 1. Install Lobsterman

```bash
git clone https://github.com/EdoardoMongardi/Lobsterman.git
cd Lobsterman
npm install
```

---

## 2. Run the Dashboard (Demo Mode)

No configuration needed — just start:

```bash
npm run dev
```

Open **http://localhost:3000** in your browser.

You'll see a simulated 40-event scenario that demonstrates the full rule pipeline: context danger → looping → risky actions → risk escalation. This runs automatically and resets when you click "Reset."

---

## 3. Set Up Telegram Notifications

Lobsterman sends real-time alerts to your Telegram via a shared bot. You don't need to create your own bot — just get your personal chat ID.

### Step 3a: Message the Lobsterman Bot

1. Open Telegram and search for **@lobsterman_watch_bot** (or ask the project maintainer for the bot link)
2. Tap **Start** or send any message (e.g., "hello")
3. The bot won't reply yet — that's normal. You just need to initiate a chat so Telegram registers your chat ID.

### Step 3b: Find Your Chat ID

1. Open this URL in your browser (the bot token is shared — ask the project maintainer):
   ```
   https://api.telegram.org/bot<BOT_TOKEN>/getUpdates
   ```
2. Look for your message in the JSON. Find `"chat":{"id":XXXXXXX}` — that number is your **chat ID**
3. **Save this number** — you'll use it in Step 4

> **Tip**: If you see an empty `"result":[]`, send another message to the bot and refresh the URL.
>
> **Privacy note**: Each user gets messages in their own private chat. Other users cannot see your alerts.

---

## 4. Configure Environment Variables

Create a `.env.local` file in the Lobsterman project root:

```bash
# Required for Telegram mode
LOBSTERMAN_MODE=telegram

# Shared bot token — ask the project maintainer for this
TELEGRAM_BOT_TOKEN=ask_maintainer_for_token

# YOUR personal chat ID from Step 3b
TELEGRAM_CHAT_ID=your_chat_id_from_step_3b

# Required: path to the project YOUR AI agent is working on
# Lobsterman will only verify file operations inside this directory
LOBSTERMAN_PROJECT_ROOT=/Users/yourname/path/to/project

# Optional: OpenClaw state directory (default: ~/.openclaw)
OPENCLAW_STATE_DIR=~/.openclaw
```

> **Important**: `LOBSTERMAN_PROJECT_ROOT` must be the **same directory** you give to your AI agent. This is how Lobsterman knows which file operations are "inside root" (normal) vs "outside root" (risky).

---

## 5. Start Lobsterman in Telegram Mode

```bash
cd Lobsterman
npm run dev
```

Terminal should show:
```
[Lobsterman] LOBSTERMAN_MODE=telegram
[Lobsterman] Telegram bot started - sending to chat XXXXXXX
[Lobsterman] Initial session — warming up (suppressing stale alerts)
```

Open **http://localhost:3000** — you'll see the live dashboard with "Telegram Mode" badge.

---

## 6. Start an OpenClaw Session

In a separate terminal:

```bash
openclaw gateway   # Terminal 1
openclaw           # Terminal 2 (TUI)
```

When the agent starts a new session, Lobsterman will:
- Detect it automatically
- Send a **🦞 New Session Detected** message to your Telegram

### Starting a New Session

If OpenClaw TUI resumes a previous conversation, type `/new` in the TUI to start a fresh session.

---

## 7. What You'll See

### On Telegram
- **🦞 New Session Detected** — when monitoring begins
- **⚠️ / 🚨 Rule warnings** — when the agent does something risky
  - **✅ Acknowledged** / **🚩 Flag for Review** inline buttons
- **✅ Verified Write** / **✅ Verified Delete** — when file operations are independently confirmed
- **🦞 Session Report Card** — cumulative stats after ~2 minutes of idle

### On the Dashboard (http://localhost:3000)
- **Risk Level** — color-coded (LOW/MEDIUM/HIGH/CRITICAL)
- **Active Warnings** — current red flags with severity
- **Recommended Action** — what the system suggests
- **Event Timeline** — every tool call, message, and result
- **Verification Results** — ✅/❌ counts + recent entries
- **Operator Decisions** — acknowledged/flagged audit trail
- **Watchdog State** — progress markers and key actions

---

## 8. Interacting with Alerts

When Lobsterman sends a warning on Telegram, you'll see two buttons:

| Button | What it does |
|---|---|
| ✅ **Acknowledged** | Records that you saw the alert. No further action. |
| 🚩 **Flag for Review** | Records a concern for later review. Optionally include a reason. |

> These decisions are **audit records only**. Lobsterman does not control the agent — it monitors and alerts.

All decisions are saved to `data/decisions.jsonl` and visible on the dashboard.

---

## Modes Reference

| Mode | Use case | Command |
|---|---|---|
| `demo` | See the dashboard without any setup | `npm run dev` (default) |
| `file` | Replay a specific JSONL transcript | Set `LOBSTERMAN_MODE=file` + `LOBSTERMAN_SOURCE_FILE=path.jsonl` |
| `telegram` | Live monitoring with Telegram alerts | Set `LOBSTERMAN_MODE=telegram` + bot token + chat ID |

---

## Troubleshooting

### No Telegram messages
- Check that `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are correct in `.env.local`
- Make sure you sent at least one message to the bot first (Telegram requires this)
- Check the terminal for errors

### Dashboard shows no events
- Make sure an OpenClaw session is active
- Check terminal for `[Lobsterman] Initial session — warming up` log
- Try clicking "Reset" on the dashboard

### "Path Outside Project Root" false positives
- OpenClaw workspace paths (`~/.openclaw/`) are whitelisted automatically
- If you see false positives for other paths, check `LOBSTERMAN_PROJECT_ROOT` is set correctly

### Bot polling errors (409 Conflict)
- Make sure only one instance of Lobsterman is running
- Kill any other `npm run dev` processes

---

## Further Reading

- [Architecture Overview](./architecture.md) — data flow and design principles
- [Demo Guide](./demo-guide.md) — scripts for demoing Lobsterman
- [Known Limitations](./known-limitations.md) — v1 boundaries and future work
