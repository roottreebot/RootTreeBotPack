// ===============================
// V1LEFarm Bot – Admin Accept Flow
// ===============================

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(id => Number(id))
  : [];

if (!TOKEN || ADMIN_IDS.length === 0) {
  console.error("❌ BOT_TOKEN or ADMIN_IDS missing");
  process.exit(1);
}

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const bot = new TelegramBot(TOKEN, { polling: true });

console.log("✅ Bot online");

// ---------------- XP SYSTEM ----------------
const DB_FILE = './users.json';
let users = fs.existsSync(DB_FILE)
  ? JSON.parse(fs.readFileSync(DB_FILE))
  : {};

function saveUsers() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

function getUser(id) {
  if (!users[id]) users[id] = { xp: 0, level: 1 };
  return users[id];
}

function addXP(id, amount = 1) {
  const u = getUser(id);
  u.xp += amount;
  if (u.xp >= u.level * 5) {
    u.level++;
    u.xp = 0;
  }
  saveUsers();
}

// ---------------- SESSIONS ----------------
const sessions = {};
const orders = {}; // orderId -> data

// ---------------- /start ----------------
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  addXP(chatId, 1);

  sessions[chatId] = { state: "await_cash" };

  bot.sendMessage(
    chatId,
    `🌱 *V1LEFarm Orders*\n\n` +
    `💰 $10 per gram\n📦 Minimum $20 (2g)\n\n` +
    `✏️ Type the amount you want\nExample: \`$30\``,
    { parse_mode: "Markdown" }
  );
});

// ---------------- CASH INPUT ----------------
bot.on('message', msg => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!sessions[chatId]) return;
  if (!text || !text.startsWith("$")) return;

  const cash = Number(text.replace("$", ""));
  if (isNaN(cash) || cash < 20 || cash % 5 !== 0) {
    return bot.sendMessage(chatId, "❌ Minimum $20, increments of $5.");
  }

  const grams = cash / 10;

  sessions[chatId] = { state: "confirm", grams, cash };

  bot.sendMessage(
    chatId,
    `🧾 *Order Summary*\n\n⚖️ ${grams}g\n💰 $${cash}\n\nConfirm?`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Confirm Order", callback_data: "user_confirm" }],
          [{ text: "❌ Cancel", callback_data: "user_cancel" }]
        ]
      }
    }
  );
});

// ---------------- CALLBACKS ----------------
bot.on('callback_query', q => {
  const chatId = q.message.chat.id;

  // USER CANCEL
  if (q.data === "user_cancel") {
    sessions[chatId] = null;
    return bot.editMessageText("❌ Order cancelled.", {
      chat_id: chatId,
      message_id: q.message.message_id
    });
  }

  // USER CONFIRM
  if (q.data === "user_confirm") {
    const s = sessions[chatId];
    if (!s) return;

    const orderId = Date.now().toString();
    orders[orderId] = {
      userId: chatId,
      grams: s.grams,
      cash: s.cash
    };

    const user =
      q.from.username
        ? `@${q.from.username}`
        : `[User](tg://user?id=${chatId})`;

    ADMIN_IDS.forEach(id => {
      bot.sendMessage(
        id,
        `🧾 *New Order*\n👤 ${user}\n⚖️ ${s.grams}g\n💰 $${s.cash}\n\nSelect product:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🟢 God Complex", callback_data: `prod_GOD_${orderId}` },
                { text: "🌿 Killer Green Budz", callback_data: `prod_KGB_${orderId}` }
              ],
              [
                { text: "❌ Reject", callback_data: `reject_${orderId}` }
              ]
            ]
          }
        }
      );
    });

    sessions[chatId] = null;
    return bot.editMessageText("📨 Order sent to admins.", {
      chat_id: chatId,
      message_id: q.message.message_id
    });
  }

  // ADMIN PRODUCT SELECT
  if (q.data.startsWith("prod_")) {
    const [, product, orderId] = q.data.split("_");
    const order = orders[orderId];
    if (!order) return;

    order.product = product === "GOD" ? "God Complex" : "Killer Green Budz";

    bot.editMessageText(
      `✅ Product selected: ${order.product}\n\nAccept order?`,
      {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Accept Order", callback_data: `accept_${orderId}` }],
            [{ text: "❌ Reject", callback_data: `reject_${orderId}` }]
          ]
        }
      }
    );
  }

  // ADMIN ACCEPT
  if (q.data.startsWith("accept_")) {
    const orderId = q.data.split("_")[1];
    const order = orders[orderId];
    if (!order) return;

    addXP(order.userId, 2);

    bot.sendMessage(
      order.userId,
      `✅ *Order Accepted*\n\nProduct: ${order.product}\n⚖️ ${order.grams}g\n💰 $${order.cash}`,
      { parse_mode: "Markdown" }
    );

    delete orders[orderId];
    return bot.editMessageText("✅ Order accepted & user notified.", {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id
    });
  }

  // ADMIN REJECT
  if (q.data.startsWith("reject_")) {
    const orderId = q.data.split("_")[1];
    const order = orders[orderId];
    if (order) {
      bot.sendMessage(order.userId, "❌ Your order was rejected.");
      delete orders[orderId];
    }
    return bot.editMessageText("❌ Order rejected.", {
      chat_id: q.message.chat.id,
      message_id: q.message.message_id
    });
  }
});
