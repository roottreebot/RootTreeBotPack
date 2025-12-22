// === V1LE FARM BOT — FINAL STABLE FULL BUILD ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS?.split(',').map(Number) || [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('Missing BOT_TOKEN or ADMIN_IDS');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

/* ================= FILES ================= */
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';
const BACKUP_DIR = './backups';
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

/* ================= LOAD / SAVE ================= */
const load = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : d;
const save = (f, d) => {
  fs.writeFileSync(f + '.tmp', JSON.stringify(d, null, 2));
  fs.renameSync(f + '.tmp', f);
};

let users = load(DB_FILE, {});
let meta = load(META_FILE, { storeOpen: true, weeklyReset: Date.now() });

function saveAll() {
  save(DB_FILE, users);
  save(META_FILE, meta);
}

/* ================= BACKUPS ================= */
setInterval(() => {
  const file = `${BACKUP_DIR}/backup_${Date.now()}.json`;
  fs.writeFileSync(file, JSON.stringify({ users, meta }, null, 2));
  const files = fs.readdirSync(BACKUP_DIR).sort();
  while (files.length > 24) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
}, 60 * 60 * 1000);

/* ================= DATA ================= */
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

const sessions = {};
const spam = {};

/* ================= HELPERS ================= */
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      xp: 0,
      weeklyXp: 0,
      level: 1,
      orders: [],
      banned: false,
      lastOrderAt: 0,
      username: username || ''
    };
  }
  if (username) users[id].username = username;
}

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

function spamCheck(id) {
  const now = Date.now();
  if (!spam[id]) spam[id] = { last: 0, strikes: 0, lockUntil: 0 };
  if (spam[id].lockUntil > now) return false;

  if (now - spam[id].last < 700) {
    spam[id].strikes++;
    if (spam[id].strikes >= 3) {
      spam[id].lockUntil = now + 30000;
      return false;
    }
  } else spam[id].strikes = 0;

  spam[id].last = now;
  return true;
}

/* ================= UI ================= */
const ASCII = `*╔══════════════╗*
*║ 𝗩1𝗟𝗘 𝗙𝗔𝗥𝗠*
*╚══════════════╝*`;

function leaderboard(page = 0) {
  const list = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);

  const size = 5;
  const slice = list.slice(page * size, page * size + size);

  let text = `🏆 *WEEKLY LEADERBOARD*\n`;
  slice.forEach(([id, u], i) => {
    text += `*#${page * size + i + 1}* @${u.username || id} — ${u.weeklyXp}XP\n`;
  });

  if (!slice.length) text += `_No data yet_`;
  return text;
}

async function showMenu(id, page = 0, edit = false) {
  ensureUser(id);
  const u = users[id];

  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    [
      { text: '⬅ Prev', callback_data: `lb_${page - 1}` },
      { text: '➡ Next', callback_data: `lb_${page + 1}` }
    ],
    [{ text: '🔄 Reload', callback_data: 'reload' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    kb.push([{ text: meta.storeOpen ? '🔴 Close Store' : '🟢 Open Store', callback_data: meta.storeOpen ? 'store_close' : 'store_open' }]);
  }

  const text =
`${ASCII}
${meta.storeOpen ? '🟢 *STORE OPEN*' : '🔴 *STORE CLOSED*'}
⏱ *Orders take 1–2 hours*

🎚 *Level:* ${u.level}
📦 *Orders:* ${u.orders.length}

${leaderboard(page)}`;

  if (edit && sessions[id]?.menuId) {
    return bot.editMessageText(text, {
      chat_id: id,
      message_id: sessions[id].menuId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: kb }
    }).catch(() => {});
  }

  if (sessions[id]?.menuId)
    await bot.deleteMessage(id, sessions[id].menuId).catch(() => {});

  const m = await bot.sendMessage(id, text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
  sessions[id] = sessions[id] || {};
  sessions[id].menuId = m.message_id;
  sessions[id].lbPage = page;
}

/* ================= COMMANDS ================= */
bot.onText(/\/start|\/help/, m => showMenu(m.chat.id));

bot.onText(/\/exportdb/, m => {
  if (!ADMIN_IDS.includes(m.chat.id)) return;
  const files = fs.readdirSync(BACKUP_DIR).sort().reverse();
  if (!files.length) return bot.sendMessage(m.chat.id, '❌ No backups found');
  bot.sendDocument(m.chat.id, path.join(BACKUP_DIR, files[0]));
});

bot.onText(/\/importdb/, m => {
  if (!ADMIN_IDS.includes(m.chat.id)) return;
  const files = fs.readdirSync(BACKUP_DIR).sort().reverse();

  if (!files.length) {
    sessions[m.chat.id] = { awaitingDB: true };
    return bot.sendMessage(m.chat.id, '📥 Send backup JSON file');
  }

  const data = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, files[0])));
  users = data.users;
  meta = data.meta;
  saveAll();
  bot.sendMessage(m.chat.id, '✅ Database imported');
});

bot.on('document', async msg => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id) || !sessions[id]?.awaitingDB) return;

  const file = await bot.getFile(msg.document.file_id);
  const filePath = await bot.downloadFile(file.file_path, './');
  const data = JSON.parse(fs.readFileSync(filePath));
  users = data.users;
  meta = data.meta;
  saveAll();

  delete sessions[id].awaitingDB;
  bot.sendMessage(id, '✅ Database imported from file');
});

/* ================= CALLBACKS ================= */
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  if (!spamCheck(id)) return bot.answerCallbackQuery(q.id, { text: '⏳ Slow down', show_alert: true });

  ensureUser(id, q.from.username);
  await bot.answerCallbackQuery(q.id).catch(() => {});
  const s = sessions[id] || {};

  if (q.data === 'reload') return showMenu(id, s.lbPage || 0, true);
  if (q.data.startsWith('lb_')) return showMenu(id, Math.max(0, Number(q.data.split('_')[1])), true);

  if (q.data === 'store_open' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = true; saveAll(); return showMenu(id, s.lbPage || 0, true);
  }

  if (q.data === 'store_close' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = false; saveAll(); return showMenu(id, s.lbPage || 0, true);
  }

  if (q.data.startsWith('product_')) {
    if (!meta.storeOpen)
      return bot.answerCallbackQuery(q.id, { text: 'Store is closed', show_alert: true });

    if (s.menuId) await bot.deleteMessage(id, s.menuId).catch(() => {});
    sessions[id] = { step: 'amount', product: q.data.replace('product_', '') };

    return bot.sendMessage(id, `${ASCII}\n✏️ *Send grams or $ amount*`, { parse_mode: 'Markdown' });
  }

  if (q.data === 'confirm') {
    if (!s.product || !s.grams) return;

    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: '⏳ Pending',
      createdAt: Date.now(),
      pendingXP: Math.floor(2 + s.cash * 0.5),
      adminMsgs: []
    };

    users[id].orders.push(order);
    saveAll();
    delete sessions[id];
    return showMenu(id);
  }

  if (q.data === 'back') {
    delete sessions[id];
    return showMenu(id);
  }
});

/* ================= USER INPUT ================= */
bot.on('message', msg => {
  const id = msg.chat.id;
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

  bot.sendMessage(
    id,
`${ASCII}
🧾 *ORDER SUMMARY*
🌿 *${s.product}*
⚖️ ${grams}g
💲 $${cash}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Confirm', callback_data: 'confirm' }],
          [{ text: '⬅ Back', callback_data: 'back' }]
        ]
      }
    }
  );
});
