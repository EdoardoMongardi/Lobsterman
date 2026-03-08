#!/usr/bin/env bash
# Print the path to the most recently modified OpenClaw session transcript.
# Usage: export WATCHTOWER_SOURCE_FILE=$(./scripts/latest-openclaw-session.sh)
#        npm run dev

SESSIONS_DIR="${OPENCLAW_SESSIONS_DIR:-$HOME/.openclaw/agents/main/sessions}"
if [[ ! -d "$SESSIONS_DIR" ]]; then
  echo "Sessions dir not found: $SESSIONS_DIR" >&2
  exit 1
fi

LATEST=$(ls -t "$SESSIONS_DIR"/*.jsonl 2>/dev/null | head -1)
if [[ -z "$LATEST" ]]; then
  echo "No .jsonl session file in $SESSIONS_DIR" >&2
  exit 1
fi

echo "$LATEST"
