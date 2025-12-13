   // ===============================
// V1LEFarm Telegram Bot — FINAL v2
// ===============================

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ---------- ENV ----------
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || ADMIN_IDS.length === 0) {
  console.error("❌ BOT_TOKEN or ADMIN_IDS missing");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("✅ Bot started");

// ===============================
// USER / XP SYSTEM
// ===============================
const DB_FILE = './users.json';

let users = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function saveUsers() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function ensureUser(id) {
  if (!users[id]) users[id] = { xp: 0, level: 1 };
}

function xpNeeded(level) {
  return level * 10;
}

function addXP(id, amount) {
  ensureUser(id);
  users[id].xp += amount;

  while (users[id].xp >= xpNeeded(users[id].level)) {
    users[id].xp -= xpNeeded(users[id].level);
    users[id].level++;
  }
  saveUsers();
}

// ===============================
// PRODUCTS
// ===============================
const PRODUCTS = {
  god: { name: "God Complex", price: 10 },
  kgb: { name: "Killer Green Budz", price: 10 }
};

// ===============================
// STATE
// ===============================
const sessions = {};
const orders = {};

// ===============================
// /start
// ===============================
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  ensureUser(chatId);
  addXP(chatId, 1);

  sessions[chatId] = { step: "product" };

  bot.sendMessage(
    chatId,
    `💥 *Welcome to Root Tree*\n\n⭐ Level: *${users[chatId].level}*\n`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🪴 God Complex", callback_data: "product_god" }],
          [{ text: "🪴 Killer Green Budz", callback_data: "product_kgb" }]
        ]
      }
    }
  );
});

// ===============================
// CALLBACKS
// ===============================
bot.on('callback_query', q => {
  const chatId = q.message.chat.id;
  const data = q.data;

  // ----- Product select -----
  if (data.startsWith("product_")) {
    const key = data.split("_")[1];
    sessions[chatId] = { step: "cash", product: key };

    return bot.editMessageText(
      `✅ *${PRODUCTS[key].name} selected*\n\n💰 $10 per gram\n📦 Minimum 2g ($20)\n\n✏️ Type cash amount (example: \`$25\`)`,
      { chat_id: chatId, message_id: q.message.message_id, parse_mode: "Markdown" }
    );
  }

  // ----- Confirm order -----
  if (data === "confirm_order") {
    const s = sessions[chatId];
    if (!s) return;

    const orderId = Date.now().toString();
    orders[orderId] = {
      ...s,
      userId: chatId,
      status: "pending",
      adminMessages: {}
    };

    const userLink = q.from.username
      ? `@${q.from.username}`
      : `[User](tg://user?id=${chatId})`;

    ADMIN_IDS.forEach(adminId => {
      bot.sendMessage(
        adminId,
        `🧾 *New Order*\n\n👤 ${userLink}\n📦 ${PRODUCTS[s.product].name}\n⚖️ ${s.grams}g\n💰 $${s.cash}\n⭐ Level: ${users[chatId].level}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Accept", callback_data: `admin_accept_${orderId}` },
                { text: "❌ Reject", callback_data: `admin_reject_${orderId}` }
              ]
            ]
          }
        }
      ).then(m => {
        orders[orderId].adminMessages[adminId] = m.message_id;
      });
    });

    sessions[chatId] = null;

    return bot.editMessageText(
      "📨 *Order sent to admins.*",
      { chat_id: chatId, message_id: q.message.message_id, parse_mode: "Markdown" }
    );
  }

  // ----- Cancel -----
  if (data === "cancel_order") {
    sessions[chatId] = null;
    return bot.editMessageText(
      "❌ Order cancelled.",
      { chat_id: chatId, message_id: q.message.message_id }
    );
  }

  // ----- Admin accept -----
  if (data.startsWith("admin_accept_")) {
    const id = data.split("_")[2];
    const o = orders[id];
