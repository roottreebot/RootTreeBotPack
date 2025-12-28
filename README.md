RUN THIS:

export BOT_TOKEN="INSERT-BOT-TOKEN-HERE"
export ADMIN_IDS="INSERT-ADMIN-ID-HERE" (IF MULTIPLE USE , NO SPACE)

bash -c "$(curl -s https://raw.githubusercontent.com/roottreebot/V1LEFarmBotPack/refs/heads/main/bootstrap.sh)"

3. Check logs:
   pm2 logs v1lefarmbot

## Files
- bot.js — main bot script
- install_bot.sh — installer
- bootstrap.sh — initial bootstrap
- package.json — Node.js dependencies
- user.json - users
- .gitignore — ignored files
_ meta.json - meta
