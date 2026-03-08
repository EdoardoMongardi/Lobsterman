# Testing Watchtower with Live OpenClaw

This guide sets up OpenClaw (newest version) and wires Watchtower to tail a **live session transcript** so you can monitor a real run.

## 1. Install OpenClaw

**Requirements:** Node.js **22+**, Git, 8GB+ RAM.

```bash
npm install -g openclaw@latest
```

As of March 2026 the latest is **2026.3.x**. Check with:

```bash
openclaw --version
```

First-time setup (model, auth, workspace):

```bash
openclaw onboard --install-daemon
```

## 2. Where OpenClaw Writes Session Transcripts

Watchtower reads the **session transcript** (one JSON object per line), not the gateway log.

- **Path pattern:** `~/.openclaw/agents/<agent-id>/sessions/<sessionKey>.jsonl`
- **Default agent:** `main` → `~/.openclaw/agents/main/sessions/`
- **Session keys:** Direct chat usually uses key `main`; Node/CLI runs use keys like `node-<id>`.
- **Metadata:** Session list is in `~/.openclaw/agents/main/sessions/sessions.json`.

So the transcript file you want is typically:

- **Default main session:** `~/.openclaw/agents/main/sessions/main.jsonl`

If you use another agent or channel, list the directory and pick the `.jsonl` for the session you’re running:

```bash
ls -la ~/.openclaw/agents/main/sessions/*.jsonl
# or
cat ~/.openclaw/agents/main/sessions/sessions.json | head -50
```

To **tail the most recently modified** session (handy when you don’t know the key):

```bash
ls -t ~/.openclaw/agents/main/sessions/*.jsonl 2>/dev/null | head -1
```

## 3. Configure Watchtower for Live Mode

In the Watchtower repo, edit `.env.local`:

```env
WATCHTOWER_MODE=file
WATCHTOWER_SOURCE_FILE=/Users/YOUR_USERNAME/.openclaw/agents/main/sessions/main.jsonl
WATCHTOWER_PROJECT_ROOT=/path/to/your/project
```

- Replace `YOUR_USERNAME` with your macOS username (or use `~` if your shell expands it; Node may not, so prefer `$HOME` or a full path).
- Set `WATCHTOWER_PROJECT_ROOT` to the project root OpenClaw is working in (used for “path outside project root” and similar rules).

**Optional:** Point at the latest session file dynamically:

```bash
export WATCHTOWER_SOURCE_FILE=$(ls -t ~/.openclaw/agents/main/sessions/*.jsonl 2>/dev/null | head -1)
npm run dev
```

## 4. Run a Live Test

1. **Terminal 1 — Watchtower**
   ```bash
   cd /path/to/lobsterman
   # .env.local already has WATCHTOWER_MODE=file and WATCHTOWER_SOURCE_FILE
   npm run dev
   ```
   Open http://localhost:3000 (or the port shown). You should see “Live Mode” and an empty or initial state.

2. **Terminal 2 — OpenClaw**
   Start the gateway if needed, then run a task in the project you set as `WATCHTOWER_PROJECT_ROOT`:
   ```bash
   openclaw start   # or your usual start command
   # In another tab or via UI: start a coding task in your project
   ```

3. As OpenClaw writes to the session transcript, Watchtower will tail it and update the dashboard (risk, flags, timeline) in real time.

## 5. Troubleshooting

- **No events in Watchtower**  
  Confirm the transcript path exists and is being written to (e.g. `tail -f ~/.openclaw/agents/main/sessions/main.jsonl` while you send a message to OpenClaw).

- **“Permission denied” on session file**  
  Use a path your user can read; avoid pointing at a transcript from another user or container.

- **Wrong project root**  
  If “path outside project root” fires for paths you consider inside the project, set `WATCHTOWER_PROJECT_ROOT` to the real project root (the directory OpenClaw’s cwd is in).

- **OpenClaw version**  
  Session transcript format is stable; if something breaks after an upgrade, check [OpenClaw session docs](https://docs.openclaw.ai/concepts/session) and the Watchtower OpenClaw parser in `src/ingestion/openclaw-parser.ts`.

## References

- [OpenClaw Setup](https://docs.openclaw.ai/start/setup)
- [OpenClaw Session Management](https://docs.openclaw.ai/concepts/session)
- [OpenClaw Logging](https://docs.openclaw.ai/logging)
