#!/bin/bash
set -e
echo "=== Installing V1LEFarm Bot (GitHub version) ==="

if [ -z "$BOT_TOKEN" ]; then
  echo "ERROR: Set BOT_TOKEN first:  export BOT_TOKEN=xxxx"
  exit 1
fi

if [ -z "$ADMIN_IDS" ]; then
  echo "ERROR: Set ADMIN_IDS first: export ADMIN_IDS=666,777"
  exit 1
fi

npm install
pm2 delete v1lefarmbot || true
pm2 start bot.js --name v1lefarmbot
pm2 save

echo "Bot installed & started."
