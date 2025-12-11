#!/bin/bash
set -e

echo "=== V1LEFarm Bot Installer (GitHub-ready) ==="

# Check environment variables
if [ -z "$BOT_TOKEN" ]; then
  echo "ERROR: Set BOT_TOKEN first (export BOT_TOKEN=...)"
  exit 1
fi

if [ -z "$ADMIN_IDS" ]; then
  echo "ERROR: Set ADMIN_IDS first (export ADMIN_IDS=666,777)"
  exit 1
fi

# Install dependencies
pkg install -y nodejs git curl || apt install -y nodejs git curl
npm install -g pm2

# Create bot directory
BOT_DIR="${BOT_DIR:-$HOME/v1lefarm}"
mkdir -p "$BOT_DIR"
cd "$BOT_DIR"

# Download bot.js from GitHub
BOT_JS_URL="https://raw.githubusercontent.com/roottreebot/V1LEFarmBotPack/refs/heads/main/bot.js"
curl -sL "$BOT_JS_URL" -o bot.js

# Make sure bot.js uses environment variables
echo "✅ Using BOT_TOKEN and ADMIN_IDS from environment variables."

# Initialize npm and install dependencies
if [ ! -f package.json ]; then
  npm init -y
fi
npm install node-telegram-bot-api

# Setup PM2 scripts
cat > start.sh <<'SH'
#!/bin/bash
pm2 start bot.js --name v1lefarmbot --watch --max-restarts 100
pm2 save
echo "Bot started. Logs: pm2 logs v1lefarmbot"
SH

cat > stop.sh <<'SH'
#!/bin/bash
pm2 stop v1lefarmbot || true
pm2 delete v1lefarmbot || true
pm2 save
echo "Bot stopped."
SH

cat > restart.sh <<'SH'
#!/bin/bash
pm2 restart v1lefarmbot || pm2 start bot.js --name v1lefarmbot --watch --max-restarts 100
pm2 save
echo "Bot restarted."
SH

chmod +x start.sh stop.sh restart.sh

# Optional: auto-start on Termux boot (requires Termux:Boot app)
mkdir -p ~/.termux/boot
echo "bash $BOT_DIR/start.sh" > ~/.termux/boot/start_bot.sh
chmod +x ~/.termux/boot/start_bot.sh

# Start the bot now
bash start.sh

echo "✅ Installation complete!"
echo "Manage your bot with: ./start.sh ./stop.sh ./restart.sh"
