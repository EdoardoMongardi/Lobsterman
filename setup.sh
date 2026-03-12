#!/bin/bash
# 🦞 Lobsterman Quick Setup
# Run this after cloning: ./setup.sh

set -e

echo ""
echo "🦞 Lobsterman — Quick Setup"
echo "═══════════════════════════"
echo ""

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm install --silent
echo "   ✅ Done"
echo ""

# 2. Check if .env.local already exists
if [ -f .env.local ]; then
    echo "⚠️  .env.local already exists. Overwrite? (y/N)"
    read -r overwrite
    if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
        echo "   Skipping .env.local — keeping existing file."
        echo ""
        echo "🦞 Setup complete! Run: npm run dev"
        exit 0
    fi
fi

# 3. Shared bot token (baked in)
BOT_TOKEN="8759087312:AAGfGSk7K5PnzJobja6QE4zS1VDEPmNDsiY"

# 4. Get chat ID
echo "📱 Telegram Setup"
echo "   1. Open Telegram and message @lobsterman_watch_bot (send 'hello')"
echo "   2. Then open this URL in your browser to find your chat ID:"
echo ""
echo "   https://api.telegram.org/bot${BOT_TOKEN}/getUpdates"
echo ""
echo "   Look for \"chat\":{\"id\":XXXXXXX} — that number is your chat ID."
echo ""
read -p "   Enter your Telegram Chat ID: " CHAT_ID

if [ -z "$CHAT_ID" ]; then
    echo "   ❌ Chat ID is required. Run setup.sh again when ready."
    exit 1
fi

# 5. Get project root
echo ""
echo "📁 Project Root"
echo "   This is the directory your AI agent will be working in."
echo "   Lobsterman verifies file operations inside this directory."
echo ""
read -p "   Enter project root path (e.g., ~/Desktop/MyProject): " PROJECT_ROOT

if [ -z "$PROJECT_ROOT" ]; then
    echo "   ❌ Project root is required. Run setup.sh again when ready."
    exit 1
fi

# Expand ~ if used
PROJECT_ROOT="${PROJECT_ROOT/#\~/$HOME}"

# 6. Write .env.local
cat > .env.local << EOF
LOBSTERMAN_MODE=telegram
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_CHAT_ID=${CHAT_ID}
LOBSTERMAN_PROJECT_ROOT=${PROJECT_ROOT}
OPENCLAW_STATE_DIR=~/.openclaw
EOF

echo ""
echo "   ✅ .env.local created"

# 7. Done
echo ""
echo "═══════════════════════════"
echo "🦞 Setup complete!"
echo ""
echo "   Start Lobsterman:  npm run dev"
echo "   Dashboard:         http://localhost:3000"
echo ""
echo "   Make sure OpenClaw is running (openclaw gateway + openclaw)"
echo "   Lobsterman will auto-detect your sessions."
echo "═══════════════════════════"
echo ""
