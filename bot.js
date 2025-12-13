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
    `🌱 *Welcome to V1LEFarm*\n\n⭐ Level: *${users[chatId].level}*\n`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🟢 God Complex", callback_data: "product_god" }],
          [{ text: "🌿 Killer Green Budz", callback_data: "product_kgb" }]
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
    if (!o || o.status !== "pending") return;

    o.status = "accepted";
    addXP(o.userId, 5);

    bot.sendMessage(
      o.userId,
      `✅ *Order accepted!*\n\n📦 ${PRODUCTS[o.product].name}\n⚖️ ${o.grams}g\n💰 $${o.cash}\n⭐ New Level: *${users[o.userId].level}*`,
      { parse_mode: "Markdown" }
    );

    ADMIN_IDS.forEach(adminId => {
      const mid = o.adminMessages[adminId];
      if (!mid) return;
      bot.editMessageText(
        `✅ *ORDER ACCEPTED*\n\n📦 ${PRODUCTS[o.product].name}\n⚖️ ${o.grams}g\n💰 $${o.cash}`,
        { chat_id: adminId, message_id: mid, parse_mode: "Markdown" }
      ).catch(() => {});
    });

    delete orders[id];
  }

  // ----- Admin reject -----
  if (data.startsWith("admin_reject_")) {
    const id = data.split("_")[2];
    const o = orders[id];
    if (!o || o.status !== "pending") return;

    bot.sendMessage(o.userId, "❌ *Your order was rejected.*", { parse_mode: "Markdown" });

    ADMIN_IDS.forEach(adminId => {
      const mid = o.adminMessages[adminId];
      if (!mid) return;
      bot.editMessageText(
        `❌ *ORDER REJECTED*`,
        { chat_id: adminId, message_id: mid, parse_mode: "Markdown" }
      ).catch(() => {});
    });

    delete orders[id];
  }
});

// ===============================
// CASH INPUT ($) — SUPPORTS .5g
// ===============================
bot.on('message', msg => {
  const chatId = msg.chat.id;
  const s = sessions[chatId];
  if (!s || s.step !== "cash") return;
  if (!msg.text || !msg.text.startsWith("$")) return;

  const cash = parseFloat(msg.text.replace("$", ""));
  if (isNaN(cash)) return;

  const grams = cash / 10;

  if (grams < 2 || grams % 0.5 !== 0) {
    return bot.sendMessage(
      chatId,
      "❌ Minimum 2g ($20). Must be in 0.5g increments."
    );
  }

  s.cash = cash;
  s.grams = grams;
  s.step = "confirm";

  bot.sendMessage(
    chatId,
    `🧾 *Order Summary*\n\n📦 ${PRODUCTS[s.product].name}\n⚖️ ${grams}g\n💰 $${cash}\n⭐ Level: ${users[chatId].level}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirm Order", callback_data: "confirm_order" }],
          [{ text: "❌ Cancel", callback_data: "cancel_order" }]
        ]
      }
    }
  );
});
