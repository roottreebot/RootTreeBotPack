// === V1LE FARM BOT (FINAL – STABLE INLINE BUTTONS) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(Number) || [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('Missing BOT_TOKEN or ADMIN_IDS');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : { weeklyReset: Date.now(), storeOpen: true };

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

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
      lastClick: 0
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
const ASCII_MAIN = `*V1LE FARM*`;
const ASCII_LB = `*LEADERBOARD*`;

// ================= SESSIONS =================
const sessions = {};

async function sendOrEdit(id, text, opts = {}) {
  if (!sessions[id]) sessions[id] = {};
  const mid = sessions[id].menuId;
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
  sessions[id].menuId = m.message_id;
}

// ================= LEADERBOARD =================
function leaderboard() {
  const list = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp)
    .slice(0, 5);

  let t = `${ASCII_LB}\n`;
  list.forEach(([id, u], i) => {
    t += `#${i + 1} @${u.username || id} — ${u.weeklyXp}XP\n`;
  });
  return t;
}

// ================= MAIN MENU =================
async function showMainMenu(id) {
  ensureUser(id);
  const u = users[id];

  const orders = u.orders.length
    ? u.orders.map(o => `• ${o.product} ${o.grams}g — ${o.status}`).join('\n')
    : '_No orders yet_';

  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    [{ text: '🔄 Reload', callback_data: 'reload' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    kb.push([{
      text: meta.storeOpen ? '🔴 Close Store' : '🟢 Open Store',
      callback_data: meta.storeOpen ? 'store_close' : 'store_open'
    }]);
  }

  await sendOrEdit(id,
`${ASCII_MAIN}
${meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed'}

🎚 Level ${u.level}
📊 ${xpBar(u.xp, u.level)}

📦 Orders
${orders}

${leaderboard()}`,
{
  parse_mode: 'Markdown',
  reply_markup: { inline_keyboard: kb }
});
}

// ================= START =================
bot.onText(/\/start|\/help/, m => showMainMenu(m.chat.id));

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  const u = users[id];
  const s = sessions[id] || (sessions[id] = {});
  const now = Date.now();

  // spam lock (only if spam)
  if (now - u.lastClick < 500) {
    u.lastClick = now;
    return bot.answerCallbackQuery(q.id);
  }
  u.lastClick = now;
  await bot.answerCallbackQuery(q.id);

  if (q.data === 'reload') return showMainMenu(id);

  if (q.data === 'store_open' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = true; saveAll(); return showMainMenu(id);
  }
  if (q.data === 'store_close' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = false; saveAll(); return showMainMenu(id);
  }

  if (q.data.startsWith('product_')) {
    if (!meta.storeOpen)
      return bot.answerCallbackQuery(q.id, { text: 'Store closed', show_alert: true });

    s.product = q.data.replace('product_', '');
    s.step = 'amount';

    return sendOrEdit(id, `${ASCII_MAIN}\n✏️ Send grams or $ amount`);
  }

  if (q.data === 'confirm') {
    if (!s.product || !s.grams) return;
    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: '⏳ Pending',
      pendingXP: Math.floor(2 + s.cash * 0.5)
    };

    users[id].orders.push(order);
    saveAll();

    for (const admin of ADMIN_IDS) {
      bot.sendMessage(admin,
`🧾 NEW ORDER
@${u.username || id}
${order.product} — ${order.grams}g — $${order.cash}`,
{
  reply_markup: {
    inline_keyboard: [[
      { text: '✅ Accept', callback_data: `admin_accept_${id}_${users[id].orders.length - 1}` },
      { text: '❌ Reject', callback_data: `admin_reject_${id}_${users[id].orders.length - 1}` }
    ]]
  }
});
    }

    delete s.step;
    delete s.product;
    delete s.grams;
    delete s.cash;

    return showMainMenu(id);
  }

  if (q.data.startsWith('admin_')) {
    const [, act, uid, idx] = q.data.split('_');
    const userId = Number(uid);
    const order = users[userId]?.orders[idx];
    if (!order) return;

    if (act === 'accept') {
      order.status = '🟢 Accepted';
      giveXP(userId, order.pendingXP);
    } else {
      order.status = '❌ Rejected';
    }
    saveAll();
    return showMainMenu(userId);
  }
});

// ================= USER INPUT =================
bot.on('message', msg => {
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

  sendOrEdit(id,
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
