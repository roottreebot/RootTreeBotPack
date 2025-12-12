#!/bin/bash
set -e
echo "=== Installing V1LEFarm Bot (GitHub-safe) ==="

if [ -z "$BOT_TOKEN" ]; then
  echo "ERROR: Set BOT_TOKEN first (export BOT_TOKEN=...)"
  exit 1
fi

if [ -z "$ADMIN_IDS" ]; then
  echo "ERROR: Set ADMIN_IDS first (export ADMIN_IDS=666,777)"
  exit 1
fi

pkg install -y nodejs git curl || apt install -y nodejs git curl
npm install -g pm2

mkdir -p ~/v1lefarm
cd ~/v1lefarm

cp bot.js .

npm init -y
npm install node-telegram-bot-api

pm2 start bot.js --name v1lefarmbot
pm2 save
echo "Installed."
