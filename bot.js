// === V1LE FARM BOT (FINAL – HARD RESET UI FIX) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// ================= ENV =================
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(Number) || [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ Missing BOT_TOKEN or ADMIN_IDS');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

// ================= SAFE SAVE =================
function safeSave(file, data) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(file + '.tmp', file);
}
function load(file, def) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : def;
}

let users = load(DB_FILE, {});
let meta = load(META_FILE, { weeklyReset: Date.now(), storeOpen: true });

function saveAll() {
  safeSave(DB_FILE, users);
  safeSave(META_FILE, meta);
}

// ================= SHUTDOWN =================
process.on('SIGINT', () => { saveAll(); process.exit(); });
process.on('SIGTERM', () => { saveAll(); process.exit(); });

// ================= USERS =================
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      xp: 0,
      weeklyXp: 0,
      level: 1,
      orders: [],
      banned: false,
      username: username || '',
      lastOrderAt: 0
    };
  }
  if (username) users[id].username = username;
}

// ================= XP =================
function giveXP(id, xp) {
  const u = users[id];
  if (!u || u.banned) return;
  u.xp += xp;
  u.weeklyXp += xp;
  while (u.xp >= u.level * 5) {
    u.xp -= u.level * 5;
    u.level++;
  }
}

function xpBar(xp, lvl) {
  const max = lvl * 5;
  const fill = Math.floor((xp / max) * 10);
  return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

// ================= PRODUCTS =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= ASCII =================
const ASCII_MAIN = `╔═════════╗
║ V1LE FARM
╚═════════╝`;

const ASCII_LB = `╔════════════╗
║ LEADERBOARD
╚════════════╝`;

// ================= SESSIONS =================
const sessions = {};

// ================= HARD UI RESET =================
async function hardResetUI(id) {
  const s = sessions[id];
  if (!s) return;

  if (s.msgIds) {
    for (const mid of s.msgIds) {
      await bot.deleteMessage(id, mid).catch(() => {});
    }
  }
  delete sessions[id];
}

// ================= SEND UI MESSAGE =================
async function sendUI(id, text, opt = {}) {
  if (!sessions[id]) sessions[id] = { msgIds: [] };
  const s = sessions[id];

  const m = await bot.sendMessage(id, text, opt);
  s.msgIds.push(m.message_id);
}

// ================= LEADERBOARD =================
function getLeaderboard() {
  const list = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp)
    .slice(0, 10);

  let text = `${ASCII_LB}\n🏆 Weekly Top Farmers\n\n`;
  list.forEach(([id, u], i) => {
    text += `#${i + 1} @${u.username || id} — Lv${u.level} — ${u.weeklyXp}XP\n`;
  });
  return text;
}

// ================= MAIN MENU =================
async function showMainMenu(id) {
  ensureUser(id);
  await hardResetUI(id);

  const u = users[id];
  const orders = u.orders.length
    ? u.orders.map(o =>
        `${o.status} ${o.product} — ${o.grams}g — $${o.cash}`
      ).join('\n')
    : '_No orders yet_';

  await sendUI(id,
`${ASCII_MAIN}
${meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed'}

🎚 Level ${u.level}
📊 ${xpBar(u.xp, u.level)}

📦 Orders
${orders}

${getLeaderboard()}`,
{
  parse_mode: 'Markdown',
  reply_markup: {
    inline_keyboard: [
      ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
      [{ text: '🔄 Reload Menu', callback_data: 'reload' }],
      ...(ADMIN_IDS.includes(id)
        ? [[{ text: meta.storeOpen ? '🔴 Close Store' : '🟢 Open Store', callback_data: meta.storeOpen ? 'store_close' : 'store_open' }]]
        : [])
    ]
  }
});
}

// ================= START =================
bot.onText(/\/start|\/help/, m => showMainMenu(m.chat.id));

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (q.data === 'reload') return showMainMenu(id);

  if (q.data === 'store_open' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = true; saveAll();
    return showMainMenu(id);
  }

  if (q.data === 'store_close' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = false; saveAll();
    return showMainMenu(id);
  }

  if (q.data.startsWith('product_')) {
    if (!meta.storeOpen)
      return bot.answerCallbackQuery(q.id, { text: 'Store closed', show_alert: true });

    sessions[id] = { msgIds: [] };
    sessions[id].product = q.data.replace('product_', '');
    sessions[id].step = 'amount';

    return sendUI(id, `${ASCII_MAIN}\n✏️ Send grams or $ amount`);
  }

  if (q.data === 'confirm') {
    const s = sessions[id];
    if (!s) return;

    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: '⏳ Pending'
    };

    users[id].orders.push(order);
    users[id].orders = users[id].orders.slice(-10);
    saveAll();

    return showMainMenu(id);
  }
});

// ================= USER INPUT =================
bot.on('message', async msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  if (!msg.from.is_bot)
    setTimeout(() => bot.deleteMessage(id, msg.message_id).catch(() => {}), 2000);

  const s = sessions[id];
  if (!s || s.step !== 'amount') return;

  const price = PRODUCTS[s.product].price;
  let grams, cash;

  if (msg.text.startsWith('$')) {
    cash = parseFloat(msg.text.slice(1));
    grams = +(cash / price).toFixed(1);
  } else {
    grams = Math.round(parseFloat(msg.text) * 2) / 2;
    cash = +(grams * price).toFixed(2);
  }

  if (!grams || grams < 2) return;

  s.grams = grams;
  s.cash = cash;

  await hardResetUI(id);
  await sendUI(id,
`${ASCII_MAIN}
🧾 Order Summary
🌿 ${s.product}
⚖️ ${grams}g
💲 $${cash}`,
{
  reply_markup: {
    inline_keyboard: [
      [{ text: '✅ Confirm', callback_data: 'confirm' }],
      [{ text: '🏠 Back', callback_data: 'reload' }]
    ]
  }
});
});
