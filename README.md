# V1LEFarm Telegram Bot

## Installation
1. Set environment variables:
   export BOT_TOKEN="your_bot_token_here"
   export ADMIN_IDS="12345,67890"

2. Run bootstrap:
   bash -c "$(curl -s https://raw.githubusercontent.com/roottreebot/V1LEFarmBotPack/refs/heads/main/bootstrap.sh)"

3. Check logs:
   pm2 logs v1lefarmbot

## Files
- bot.js — main bot script
- install_bot.sh — installer
- bootstrap.sh — initial bootstrap
- package.json — Node.js dependencies
- .gitignore — ignored files
