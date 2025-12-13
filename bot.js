// ===============================
// V1LEFarm Bot – XP Foundation
// ===============================

// ENV (GitHub-safe)
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => Number(id))
  : [];

if (!TOKEN) {
  console.error("❌ BOT_TOKEN missing");
  process.exit(1);
}

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// Bot init
const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot started");

// Error logging (important)
bot.on('polling_error', err => console.error("Polling error:", err));
bot.on('webhook_error', err => console.error("Webhook error:", err));

// ===============================
// XP / LEVEL SYSTEM
// ===============================
const DB_FILE = './users.json';
let users = {};

if (fs.existsSync(DB_FILE)) {
  users = JSON.parse(fs.readFileSync(DB_FILE));
}

function saveUsers() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function getUser(chatId) {
  if (!users[chatId]) {
    users[chatId] = {
      xp: 0,
      level: 1
    };
  }
  return users[chatId];
}

function addXP(chatId, amount = 1) {
  const user = getUser(chatId);
  user.xp += amount;

  const needed = user.level * 5;
  if (user.xp >= needed) {
    user.level++;
    user.xp = 0;
    return true; // leveled up
  }
  saveUsers();
  return false;
}

// ===============================
// /start COMMAND (NO SPAM)
// ===============================
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);

  const leveledUp = addXP(chatId, 1);

  let text =
    `🌱 *Welcome to V1LEFarm*\n\n` +
    `⭐ Level: ${user.level}\n` +
    `⚡ XP: ${user.xp}/${user.level * 5}\n\n` +
    `More features coming soon…`;

  if (leveledUp) {
    text += `\n\n🎉 *LEVEL UP!* You are now level ${user.level}`;
  }

  bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// ===============================
// BASIC MESSAGE XP (ANTI-SPAM)
// ===============================
const lastXP = {};

bot.on('message', msg => {
  const chatId = msg.chat.id;
  const now = Date.now();

  // Prevent XP spam (1 XP per 30s)
  if (lastXP[chatId] && now - lastXP[chatId] < 30000) return;

  lastXP[chatId] = now;
  addXP(chatId, 1);
});

// ===============================
// ADMIN COMMAND (OPTIONAL)
// ===============================
bot.onText(/\/stats/, msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  bot.sendMessage(
    msg.chat.id,
    `👥 Total users: ${Object.keys(users).length}`
  );
});
