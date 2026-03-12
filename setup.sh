#!/bin/bash
# 🦞 Lobsterman Quick Setup
# Run this after cloning: ./setup.sh

set -e

echo ""
echo "🦞 Lobsterman — Quick Setup"
echo "═══════════════════════════"
echo ""

# ─── Prerequisite Checks ───

MISSING=""

# Check Node.js
if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 22 ]; then
        echo "❌ Node.js $NODE_VERSION found, but version 22+ is required."
        echo "   Download: https://nodejs.org/"
        MISSING="yes"
    else
        echo "✅ Node.js $(node -v)"
    fi
else
    echo "❌ Node.js not found. Version 22+ is required."
    echo "   Download: https://nodejs.org/"
    MISSING="yes"
fi

# Check npm
if command -v npm &>/dev/null; then
    echo "✅ npm $(npm -v)"
else
    echo "❌ npm not found. It comes with Node.js — install Node.js first."
    echo "   Download: https://nodejs.org/"
    MISSING="yes"
fi

# Check OpenClaw
if command -v openclaw &>/dev/null; then
    echo "✅ OpenClaw found"
elif [ -d "$HOME/.openclaw" ]; then
    echo "✅ OpenClaw state directory found (~/.openclaw)"
else
    echo "⚠️  OpenClaw not detected (no 'openclaw' command or ~/.openclaw directory)"
    echo "   Lobsterman requires OpenClaw to monitor agent sessions."
    echo "   Install: https://github.com/openclaw/openclaw"
    echo ""
    read -p "   Continue anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        echo "   Setup cancelled. Install OpenClaw first."
        exit 1
    fi
fi

if [ -n "$MISSING" ]; then
    echo ""
    echo "❌ Please install the missing prerequisites and run ./setup.sh again."
    exit 1
fi

echo ""

# ─── Install Dependencies ───

echo "📦 Installing dependencies..."
npm install --silent
echo "   ✅ Done"
echo ""

# ─── Check for Existing .env.local ───

if [ -f .env.local ]; then
    echo "⚠️  .env.local already exists. Overwrite? (y/N)"
    read -r overwrite
    if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
        echo "   Keeping existing .env.local."
        echo ""
        echo "🦞 Setup complete! Run: npm run dev"
        exit 0
    fi
fi

# ─── Shared Bot Token ───

BOT_TOKEN="8759087312:AAGfGSk7K5PnzJobja6QE4zS1VDEPmNDsiY"

# ─── Get Chat ID ───

echo "📱 Telegram Setup"
echo ""
echo "   1. Open Telegram and message @lobsterman_watch_bot (send 'hello')"
echo "   2. Then open this URL in your browser to find your chat ID:"
echo ""
echo "   https://api.telegram.org/bot${BOT_TOKEN}/getUpdates"
echo ""
echo "   Look for \"chat\":{\"id\":XXXXXXX} — that number is your chat ID."
echo ""
read -p "   Enter your Telegram Chat ID: " CHAT_ID

if [ -z "$CHAT_ID" ]; then
    echo "   ❌ Chat ID is required. Run ./setup.sh again when ready."
    exit 1
fi

# ─── Get Project Root ───

echo ""
echo "📁 Project Root"
echo "   This is the directory your AI agent will be working in."
echo "   Lobsterman verifies file operations inside this directory."
echo ""
read -p "   Enter project root path (e.g., ~/Desktop/MyProject): " PROJECT_ROOT

if [ -z "$PROJECT_ROOT" ]; then
    echo "   ❌ Project root is required. Run ./setup.sh again when ready."
    exit 1
fi

# Expand ~ if used
PROJECT_ROOT="${PROJECT_ROOT/#\~/$HOME}"

# Validate the directory exists
if [ ! -d "$PROJECT_ROOT" ]; then
    echo "   ⚠️  Directory '$PROJECT_ROOT' does not exist."
    read -p "   Continue anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        echo "   Setup cancelled. Create the directory first or provide a valid path."
        exit 1
    fi
else
    echo "   ✅ Directory exists"
fi

# ─── Write .env.local ───

cat > .env.local << EOF
LOBSTERMAN_MODE=telegram
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_CHAT_ID=${CHAT_ID}
LOBSTERMAN_PROJECT_ROOT=${PROJECT_ROOT}
OPENCLAW_STATE_DIR=~/.openclaw
EOF

echo ""
echo "   ✅ .env.local created"

# ─── Done ───

echo ""
echo "═══════════════════════════"
echo "🦞 Setup complete!"
echo ""
echo "   Start Lobsterman:  npm run dev"
echo "   Dashboard:         http://localhost:3000"
echo ""
echo "   Make sure OpenClaw is running, then start or resume a session."
echo "   Lobsterman will auto-detect your sessions and send alerts"
echo "   to your Telegram via @lobsterman_watch_bot."
echo "═══════════════════════════"
echo ""
