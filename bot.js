// V1LEFarm Bot (GitHub-safe: token & admin IDs are placeholders)
const TOKEN = process.env.BOT_TOKEN;  
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(x=>Number(x)) : [];

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('Bot started');

bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id, "Bot is running (GitHub-safe version)");
});
