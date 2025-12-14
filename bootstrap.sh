#!/bin/bash
set -e

# ----------------------------
# V1LE FARM BOT SETUP
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

echo "📦 Installing Node.js, Git, Curl..."
pkg install -y nodejs git curl unzip

echo "📦 Installing PM2 globally..."
npm install -g pm2

# Remove old bot folder if exists
rm -rf ~/V1LEFarmBot

echo "📥 Downloading V1LEFarmBotPack directly..."
cd ~
curl -L https://github.com/roottreebot/V1LEFarmBotPack/archive/refs/heads/main.zip -o V1LEFarmBotPack.zip
unzip -o V1LEFarmBotPack.zip
mv V1LEFarmBotPack-main V1LEFarmBot
rm V1LEFarmBotPack.zip

cd ~/V1LEFarmBot

echo "📦 Installing npm dependencies..."
npm install

echo "🚀 Starting the bot with PM2..."
pm2 start bot.js --name V1LEFarmBot
pm2 save

echo "🎉 Bot is now running!"
echo "Use 'pm2 logs V1LEFarmBot' to see bot output."
echo "Use 'pm2 restart V1LEFarmBot' to restart the bot."
