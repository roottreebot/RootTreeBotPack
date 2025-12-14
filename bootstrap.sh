#!/bin/bash
set -e

# ----------------------------
# V1LE FARM BOT ONE-LINER SETUP
# ----------------------------

# Check if BOT_TOKEN and ADMIN_IDS are set
if [[ -z "$BOT_TOKEN" ]] || [[ -z "$ADMIN_IDS" ]]; then
  echo "❌ Please provide BOT_TOKEN and ADMIN_IDS as environment variables."
  echo "Example:"
  echo "BOT_TOKEN='YOUR_BOT_TOKEN' ADMIN_IDS='123456' bash bootstrap.sh"
  exit 1
fi

echo "📦 Updating packages..."
pkg update -y || apt update -y
pkg upgrade -y || apt upgrade -y

echo "📦 Installing Node.js, Git, and Curl..."
pkg install -y nodejs git curl || apt install -y nodejs git curl

echo "📦 Installing PM2 globally..."
npm install -g pm2

# Remove old folder if exists
rm -rf ~/V1LEFarmBot

echo "📥 Cloning V1LEFarmBotPack repository..."
git clone https://github.com/roottreebot/V1LEFarmBotPack.git ~/V1LEFarmBot

cd ~/V1LEFarmBot

echo "📦 Installing npm dependencies..."
npm install

echo "✅ Installation complete!"

echo "🚀 Starting the bot with PM2..."
pm2 start bot.js --name V1LEFarmBot
pm2 save

echo "🎉 Bot is now running!"
echo "Use 'pm2 logs V1LEFarmBot' to see bot output."
echo "Use 'pm2 restart V1LEFarmBot' to restart the bot."
