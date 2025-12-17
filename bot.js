// === V1LE FARM BOT (FULL FINAL VERSION) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ Missing BOT_TOKEN or ADMIN_IDS');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('✅ Bot running');

// ================= DATABASE =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : { weeklyReset: Date.now() };

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

let saveTimer;
function saveAll() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  }, 100);
}

// ================= XP =================
function calculateOrderXP(cash) {
  let xp = 2 + cash * 0.5;
  if (cash >= 50) xp += 10;
  else if (cash >= 20) xp += 5;
  return Math.floor(xp);
}

function giveXP(id, xp) {
  users[id].xp += xp;
  users[id].weeklyXp += xp;
  while (users[id].xp >= users[id].level * 5) {
    users[id].xp -= users[id].level * 5;
    users[id].level++;
  }
}

function addChatXP(id) {
  ensureUser(id);
  giveXP(id, 1);
  saveAll();
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
const ASCII_MAIN = `
╔═════════╗
║ ROOTTREE
╚═════════╝
V1LE FARM
`;

const ASCII_LEADERBOARD = `
╔═══════════╗
║ TOP FARMERS
╚═══════════╝
LEADERBOARD
`;

// ================= SESSIONS =================
const sessions = {};
async function sendOrEdit(id, text, opt = {}) {
  if (!sessions[id]) sessions[id] = {};
  const msgId = sessions[id].mainMsgId;

  if (msgId) {
    try {
      await bot.editMessageText(text, {
        chat_id: id,
        message_id: msgId,
        ...opt
      });
      return;
    } catch {
      sessions[id].mainMsgId = null;
    }
  }

  const m = await bot.sendMessage(id, text, opt);
  sessions[id].mainMsgId = m.message_id;
}

// ================= CLEANUP =================
function cleanupOrders(id) {
  const u = users[id];
  if (!u) return;

  u.orders = u.orders.filter(o => o.status !== '❌ Rejected');
  if (u.orders.length > 10) u.orders = u.orders.slice(-10);
}

// ================= LEADERBOARD =================
function getLeaderboardPage(page = 0, size = 10) {
  const sorted = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);

  const slice = sorted.slice(page * size, page * size + size);
  let txt = `${ASCII_LEADERBOARD}\n🏆 *Weekly Top Farmers*\n\n`;

  slice.forEach(([id, u], i) => {
    txt += `#${page * size + i + 1} — @${u.username || id} — Lv ${u.level} — XP ${u.weeklyXp}\n`;
  });

  return txt;
}

// ================= MAIN MENU =================
async function showMainMenu(id) {
  ensureUser(id);
  cleanupOrders(id);

  const u = users[id];
  const ordersTxt = u.orders.length
    ? u.orders.map(o => {
        const icon = o.status === '✅ Accepted' ? '🟢' : '⚪';
        return `${icon} ${o.product} — ${o.grams}g — $${o.cash} — *${o.status}*`;
      }).join('\n')
    : '_No orders yet_';

  const kb = Object.keys(PRODUCTS).map(p => [
    { text: `🪴 ${p}`, callback_data: `product_${p}` }
  ]);

  await sendOrEdit(
    id,
    `${ASCII_MAIN}
🎚 Level: ${u.level}
📊 XP: ${xpBar(u.xp, u.level)}

📦 *Your Orders*
${ordersTxt}

🛒 Select product 👇

${getLeaderboardPage(0)}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }
  );
}

// ================= START =================
bot.onText(/\/start|\/help/, msg => {
  showMainMenu(msg.chat.id);
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);

  const s = sessions[id] || (sessions[id] = {});

  if (q.data.startsWith('product_')) {
    s.product = q.data.replace('product_', '');
    s.step = 'amount';
    return sendOrEdit(id, `${ASCII_MAIN}\n✏️ Send grams or $ amount`, { parse_mode: 'Markdown' });
  }

  if (q.data === 'confirm_order') {
    const xp = calculateOrderXP(s.cash);
    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: 'Pending',
      pendingXP: xp,
      time: Date.now()
    };

    users[id].orders.push(order);
    saveAll();

    for (const admin of ADMIN_IDS) {
      await bot.sendMessage(admin,
`🧾 *NEW ORDER*
User: @${users[id].username || id}
Product: ${order.product}
Grams: ${order.grams}g
Price: $${order.cash}`,
{
  parse_mode: 'Markdown',
  reply_markup: {
    inline_keyboard: [[
      { text: '✅ Accept', callback_data: `admin_accept_${id}_${users[id].orders.length - 1}` },
      { text: '❌ Reject', callback_data: `admin_reject_${id}_${users[id].orders.length - 1}` }
    ]]
  }
});
    }

    return showMainMenu(id);
  }

  if (q.data.startsWith('admin_')) {
    const [, action, uid, index] = q.data.split('_');
    const userId = Number(uid);
    const i = Number(index);

    ensureUser(userId);
    const order = users[userId].orders[i];
    if (!order || order.status !== 'Pending') return;

    if (action === 'accept') {
      order.status = '✅ Accepted';
      giveXP(userId, order.pendingXP);
      delete order.pendingXP;
      bot.sendMessage(userId, '✅ Order accepted!\n⭐ XP granted');
    } else {
      order.status = '❌ Rejected';
      bot.sendMessage(userId, '❌ Order rejected.\n⚠️ No XP');

      setTimeout(() => {
        users[userId].orders = users[userId].orders.filter(o => o !== order);
        saveAll();
      }, 10 * 60 * 1000);
    }

    cleanupOrders(userId);
    saveAll();
    showMainMenu(userId);
  }
});

// ================= USER INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  // Auto recreate menu if deleted
  if (!sessions[id]?.mainMsgId) {
    showMainMenu(id);
  }

  addChatXP(id);

  const s = sessions[id];
  if (!s || s.step !== 'amount') return;

  const price = PRODUCTS[s.product].price;
  const t = msg.text.trim();
  let grams, cash;

  if (t.startsWith('$')) {
    cash = parseFloat(t.slice(1));
    grams = +(cash / price).toFixed(1);
  } else {
    grams = Math.round(parseFloat(t) * 2) / 2;
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
  parse_mode: 'Markdown',
  reply_markup: {
    inline_keyboard: [[
      { text: '✅ Confirm', callback_data: 'confirm_order' }
    ]]
  }
});
});
