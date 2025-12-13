// ===============================
// V1LEFarm Telegram Bot — FINAL
// ===============================

// ENV (GitHub-safe)
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || ADMIN_IDS.length === 0) {
  console.error("❌ BOT_TOKEN or ADMIN_IDS missing");
  process.exit(1);
}

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("✅ Bot started");

// ---------- Error logging ----------
bot.on('polling_error', err => console.error("Polling error:", err));
bot.on('webhook_error', err => console.error("Webhook error:", err));

// ===============================
// XP / LEVEL SYSTEM
// ===============================
const USER_DB = './users.json';
let users = fs.existsSync(USER_DB)
  ? JSON.parse(fs.readFileSync(USER_DB))
  : {};

function saveUsers() {
  fs.writeFileSync(USER_DB, JSON.stringify(users, null, 2));
}

function addXP(chatId, amount = 1) {
  if (!users[chatId]) users[chatId] = { xp: 0, level: 1 };
  users[chatId].xp += amount;

  const needed = users[chatId].level * 5;
  if (users[chatId].xp >= needed) {
    users[chatId].xp = 0;
    users[chatId].level++;
  }
  saveUsers();
}

// ===============================
// PRODUCTS
// ===============================
const PRODUCTS = {
  god: { name: "God Complex", emoji: "🟢", price: 10 },
  kgb: { name: "Killer Green Budz", emoji: "🌿", price: 10 }
};

// ===============================
// STATE
// ===============================
const sessions = {}; // per-user state
const orders = {};   // active orders

// ===============================
// /start
// ===============================
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  addXP(chatId);

  sessions[chatId] = { step: "product" };

  bot.sendMessage(
    chatId,
    "🌱 *Choose a product:*",
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
// CALLBACK HANDLER
// ===============================
bot.on('callback_query', q => {
  const chatId = q.message.chat.id;
  const msgId = q.message.message_id;
  const data = q.data;

  // ---------- USER PRODUCT ----------
  if (data.startsWith("product_")) {
    const key = data.split("_")[1];
    sessions[chatId] = { step: "cash", product: key };

    return bot.editMessageText(
      `✅ *${PRODUCTS[key].name} selected*\n\n💰 $10 per gram\n📦 Minimum $20\n\n✏️ Type cash amount (example: \`$30\`)`,
      { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" }
    );
  }

  // ---------- USER CONFIRM ----------
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

    const userTag =
      q.from.username
        ? `@${q.from.username}`
        : `[User](tg://user?id=${chatId})`;

    ADMIN_IDS.forEach(adminId => {
      bot.sendMessage(
        adminId,
        `🧾 *New Order*\n\n👤 ${userTag}\n📦 ${PRODUCTS[s.product].name}\n⚖️ ${s.grams}g\n💰 $${s.cash}`,
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
      ).then(msg => {
        orders[orderId].adminMessages[adminId] = msg.message_id;
      });
    });

    sessions[chatId] = null;

    return bot.editMessageText(
      "📨 *Order sent to admins.*",
      { chat_id: chatId, message_id: msgId, parse_mode: "Markdown" }
    );
  }

  // ---------- USER CANCEL ----------
  if (data === "cancel_order") {
    sessions[chatId] = null;
    return bot.editMessageText(
      "❌ Order cancelled.",
      { chat_id: chatId, message_id: msgId }
    );
  }

  // ---------- ADMIN ACCEPT ----------
  if (data.startsWith("admin_accept_")) {
    const id = data.split("_")[2];
    const order = orders[id];
    if (!order || order.status !== "pending") return;

    order.status = "accepted";
    addXP(order.userId, 2);

    bot.sendMessage(
      order.userId,
      `✅ *Your order was accepted!*\n\n📦 ${PRODUCTS[order.product].name}\n⚖️ ${order.grams}g\n💰 $${order.cash}`,
      { parse_mode: "Markdown" }
    );

    ADMIN_IDS.forEach(adminId => {
      const msgId = order.adminMessages[adminId];
      if (!msgId) return;

      bot.editMessageText(
        `✅ *ORDER ACCEPTED*\n\n📦 ${PRODUCTS[order.product].name}\n⚖️ ${order.grams}g\n💰 $${order.cash}`,
        {
          chat_id: adminId,
          message_id: msgId,
          parse_mode: "Markdown"
        }
      ).catch(() => {});
    });

    delete orders[id];
    return;
  }

  // ---------- ADMIN REJECT ----------
  if (data.startsWith("admin_reject_")) {
    const id = data.split("_")[2];
    const order = orders[id];
    if (!order || order.status !== "pending") return;

    order.status = "rejected";

    bot.sendMessage(
      order.userId,
      "❌ *Your order was rejected.*",
      { parse_mode: "Markdown" }
    );

    ADMIN_IDS.forEach(adminId => {
      const msgId = order.adminMessages[adminId];
      if (!msgId) return;

      bot.editMessageText(
        `❌ *ORDER REJECTED*\n\n📦 ${PRODUCTS[order.product].name}\n⚖️ ${order.grams}g\n💰 $${order.cash}`,
        {
          chat_id: adminId,
          message_id: msgId,
          parse_mode: "Markdown"
        }
      ).catch(() => {});
    });

    delete orders[id];
    return;
  }
});

// ===============================
// CASH INPUT ($)
// ===============================
bot.on('message', msg => {
  const chatId = msg.chat.id;
  const s = sessions[chatId];
  if (!s || s.step !== "cash") return;

  if (!msg.text || !msg.text.startsWith("$")) return;

  const cash = Number(msg.text.replace("$", ""));
  if (isNaN(cash) || cash < 20 || cash % 10 !== 0) {
    return bot.sendMessage(
      chatId,
      "❌ Minimum $20. Must be in $10 increments."
    );
  }

  s.cash = cash;
  s.grams = cash / 10;
  s.step = "confirm";

  bot.sendMessage(
    chatId,
    `🧾 *Order Summary*\n\n📦 ${PRODUCTS[s.product].name}\n⚖️ ${s.grams}g\n💰 $${cash}`,
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
