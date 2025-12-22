// === V1LE FARM BOT (FINAL – LAST 5 ORDERS + IMPORT/EXPORT FIXED) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(Number) || [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('❌ BOT_TOKEN or ADMIN_IDS missing');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';
const TMP_IMPORT = 'import_tmp.json';

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
      lastClick: 0,
      lastProductClick: 0,
      productLockUntil: 0
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

// ================= UI =================
const ASCII_MAIN = '*V1LE FARM*';
const sessions = {};

async function sendOrEdit(id, text, opts = {}) {
  if (!sessions[id]) sessions[id] = {};
  try {
    if (sessions[id].menuId) {
      await bot.editMessageText(text, {
        chat_id: id,
        message_id: sessions[id].menuId,
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

  let t = '*LEADERBOARD*\n';
  list.forEach(([id, u], i) => {
    t += `#${i + 1} @${u.username || id} — ${u.weeklyXp}XP\n`;
  });
  return t;
}

// ================= MAIN MENU =================
async function showMainMenu(id) {
  ensureUser(id);
  const u = users[id];

  // Show only last 5 orders
  const orders = u.orders.length
    ? u.orders.slice(-5).map(o => `• ${o.product} ${o.grams}g — ${o.status}`).join('\n')
    : '_No orders yet_';

  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    [{ text: '🔄 Reload', callback_data: 'reload' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    kb.push([
      {
        text: meta.storeOpen ? '🔴 Close Store' : '🟢 Open Store',
        callback_data: meta.storeOpen ? 'store_close' : 'store_open'
      }
    ]);
  }

  await sendOrEdit(
    id,
`${ASCII_MAIN}
${meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed'}

🎚 Level ${u.level}
📊 ${xpBar(u.xp, u.level)}

📦 Last 5 Orders
${orders}

${leaderboard()}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }
  );
}

// ================= START =================
bot.onText(/\/start|\/help/, m => showMainMenu(m.chat.id));

// ================= IMPORT / EXPORT =================
bot.onText(/\/exportdb/, msg => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return;

  const data = { users, meta };
  const file = `backup_${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  bot.sendDocument(id, file).then(() => fs.unlinkSync(file));
});

bot.onText(/\/importdb/, msg => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return;

  sessions[id] = { waitingImport: true };
  bot.sendMessage(id, '📥 Send the backup JSON file to import.');
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  const u = users[id];
  const s = sessions[id] || (sessions[id] = {});
  const now = Date.now();

  if (now - u.lastClick < 400) return bot.answerCallbackQuery(q.id);
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
    if (!meta.storeOpen) {
      return bot.answerCallbackQuery(q.id, { text: '🛑 Store closed', show_alert: true });
    }

    if (u.productLockUntil > now) {
      return bot.answerCallbackQuery(q.id, {
        text: `⏳ Wait ${Math.ceil((u.productLockUntil - now)/1000)}s`,
        show_alert: true
      });
    }

    if (now - u.lastProductClick < 1500) {
      u.productLockUntil = now + 30000;
      saveAll();
      return bot.answerCallbackQuery(q.id, { text: '🚫 Product buttons locked 30s (spam)', show_alert: true });
    }

    u.lastProductClick = now;
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
      pendingXP: Math.floor(2 + s.cash * 0.5),
      adminMsgs: []
    };

    users[id].orders.push(order);
    saveAll();

    for (const admin of ADMIN_IDS) {
      const m = await bot.sendMessage(
        admin,
`🧾 NEW ORDER
@${u.username || id}
${order.product} — ${order.grams}g — $${order.cash}
Status: ⏳ Pending`,
{
  reply_markup: { inline_keyboard: [[
    { text: '✅ Accept', callback_data: `admin_accept_${id}_${users[id].orders.length - 1}` },
    { text: '❌ Reject', callback_data: `admin_reject_${id}_${users[id].orders.length - 1}` }
  ]] }
});
      order.adminMsgs.push({ admin, msgId: m.message_id });
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
    if (!order || order.status !== '⏳ Pending') return;

    order.status = act === 'accept' ? '✅ Accepted' : '❌ Rejected';
    if (act === 'accept') giveXP(userId, order.pendingXP);

    const finalText =
`🧾 ORDER ${order.status}
@${users[userId].username || userId}
${order.product} — ${order.grams}g — $${order.cash}`;

    for (const { admin, msgId } of order.adminMsgs) {
      bot.editMessageText(finalText, {
        chat_id: admin,
        message_id: msgId
      }).catch(() => {});
    }

    saveAll();
    return showMainMenu(userId);
  }
});

// ================= USER INPUT + IMPORT FILE =================
bot.on('message', async msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  if (!msg.from.is_bot) {
    setTimeout(() => bot.deleteMessage(id, msg.message_id).catch(() => {}), 2000);
  }

  const s = sessions[id];

  // ===== IMPORT FILE HANDLER =====
  if (s?.waitingImport && msg.document) {
    const file = await bot.downloadFile(msg.document.file_id, '.');
    try {
      const data = JSON.parse(fs.readFileSync(file));
      if (!data.users || !data.meta) throw 'Invalid backup';

      users = data.users;
      meta = data.meta;
      saveAll();

      bot.sendMessage(id, '✅ Database imported successfully');
    } catch {
      bot.sendMessage(id, '❌ Invalid backup file');
    } finally {
      delete sessions[id].waitingImport;
      fs.unlinkSync(file);
      showMainMenu(id);
    }
    return;
  }

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
