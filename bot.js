/**
 * === V1LE FARM BOT ===
 * Termux + PM2 + Polling SAFE
 */

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ================= ENV =================
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ Missing BOT_TOKEN or ADMIN_IDS');
  process.exit(1);
}

// ================= BOT =================
const bot = new TelegramBot(TOKEN, { polling: true });

bot.deleteWebHook({ drop_pending_updates: true })
  .then(() => console.log('🧹 Webhook cleared, polling active'))
  .catch(() => console.log('ℹ️ No webhook to clear'));

console.log('✅ Bot running');

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';
const SESSIONS_FILE = 'sessions.json';

// ================= DATA =================
let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let sessions = fs.existsSync(SESSIONS_FILE)
  ? JSON.parse(fs.readFileSync(SESSIONS_FILE))
  : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : {
      weeklyReset: Date.now(),
      sales: { totalOrders: 0, totalRevenue: 0 }
    };

// ================= SAVE =================
let saveTimer;
function saveAll() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  }, 300);
}

// ================= HELPERS =================
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      xp: 0,
      weeklyXp: 0,
      level: 1,
      orders: [],
      banned: false,
      username: username || ''
    };
  }
  if (username) users[id].username = username;
}

function isAdmin(id) {
  return ADMIN_IDS.includes(id);
}

function banGuard(id) {
  ensureUser(id);
  if (users[id].banned) {
    bot.sendMessage(id, '🚫 You are banned.');
    return true;
  }
  return false;
}

// ================= CONFIG =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ================= XP =================
function addXP(id, amount) {
  users[id].xp += amount;
  users[id].weeklyXp += amount;

  while (users[id].xp >= users[id].level * 5) {
    users[id].xp -= users[id].level * 5;
    users[id].level++;
  }
  saveAll();
}

function xpBar(xp, lvl) {
  const max = lvl * 5;
  const fill = Math.floor((xp / max) * 10);
  return '🟥'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

// ================= ASCII =================
const HEADER = `
\`\`\`
█████▄   ▄██▄   ▄██▄ ██████
██▄▄██▄ ██  ██ ██  ██  ██
██   ██    ▀██▀   ▀██▀   ██
        V 1 L E   F A R M
\`\`\`
`;

// ================= WEEK RESET =================
function checkWeeklyReset() {
  if (Date.now() - meta.weeklyReset >= WEEK_MS) {
    for (const u of Object.values(users)) u.weeklyXp = 0;
    meta.weeklyReset = Date.now();
    saveAll();
  }
}

// ================= MAIN MENU =================
async function sendOrEdit(id, text, opts = {}) {
  if (!sessions[id]) sessions[id] = {};
  const mid = sessions[id].mainMsgId;

  try {
    if (mid) {
      await bot.editMessageText(text, {
        chat_id: id,
        message_id: mid,
        ...opts
      });
      return;
    }
  } catch {}

  const m = await bot.sendMessage(id, text, opts);
  sessions[id].mainMsgId = m.message_id;
  saveAll();
}

async function showMainMenu(id) {
  ensureUser(id);
  sessions[id].step = null;

  const kb = Object.keys(PRODUCTS).map(p => [
    { text: `🌿 ${p}`, callback_data: `product_${p}` }
  ]);

  const pending = users[id].orders.filter(o => o.status === 'Pending');
  const pendingTxt = pending.length
    ? '📦 Pending Orders:\n' +
      pending.map(o => `• ${o.product} — ${o.grams}g — $${o.cash}`).join('\n') +
      '\n\n'
    : '';

  await sendOrEdit(
    id,
    `${HEADER}
🎚 Level: *${users[id].level}*
📊 XP: ${xpBar(users[id].xp, users[id].level)}

${pendingTxt}🛒 Select product`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: kb }
    }
  );
}

// ================= COMMANDS =================
bot.onText(/\/start/, msg => {
  if (banGuard(msg.chat.id)) return;
  showMainMenu(msg.chat.id);
});

// ================= MESSAGE INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;

  // Delete user messages
  if (!msg.from.is_bot) {
    setTimeout(() => {
      bot.deleteMessage(id, msg.message_id).catch(() => {});
    }, 3000);
  }

  if (!sessions[id] || sessions[id].step !== 'amount') return;

  const price = PRODUCTS[sessions[id].product].price;
  const t = msg.text.trim();

  let grams, cash;
  if (t.startsWith('$')) {
    cash = parseFloat(t.slice(1));
    grams = +(cash / price).toFixed(1);
  } else {
    grams = Math.round(parseFloat(t) * 2) / 2;
    cash = +(grams * price).toFixed(2);
  }

  if (!grams || grams < 2) {
    return sendOrEdit(id, '❌ Minimum order is 2g');
  }

  sessions[id].grams = grams;
  sessions[id].cash = cash;
  sessions[id].step = 'confirm';
  saveAll();

  sendOrEdit(
    id,
    `${HEADER}
🧾 *Confirm Order*
🌿 ${sessions[id].product}
⚖️ ${grams}g
💲 $${cash}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Confirm', callback_data: 'confirm_order' }],
          [{ text: '🏠 Cancel', callback_data: 'back_main' }]
        ]
      }
    }
  );
});

// ================= STARTUP PING =================
for (const adminId of ADMIN_IDS) {
  bot.sendMessage(adminId, '✅ *V1LE FARM BOT ONLINE*', {
    parse_mode: 'Markdown'
  }).catch(() => {});
}
