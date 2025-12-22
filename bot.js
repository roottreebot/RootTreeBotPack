// === V1LE FARM BOT (FINAL WITH ORDER XP PROGRESS BAR + IMPORT/EXPORT) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

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
      username: username || ''
    };
  }
  if (username) users[id].username = username;
}

// ================= XP =================
function giveXP(id, xp) {
  const u = users[id];
  if (u.banned) return;

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
async function sendOrEdit(id, text, opt = {}) {
  if (!sessions[id]) sessions[id] = {};
  const mid = sessions[id].mainMsgId;

  if (mid) {
    try {
      await bot.editMessageText(text, {
        chat_id: id,
        message_id: mid,
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

// ================= WEEKLY RESET =================
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
setInterval(() => {
  if (Date.now() - meta.weeklyReset >= WEEK_MS) {
    for (const id in users) users[id].weeklyXp = 0;
    meta.weeklyReset = Date.now();
    saveAll();
  }
}, 60 * 60 * 1000);

// ================= LEADERBOARD =================
function getLeaderboard(page = 0) {
  const list = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);

  const size = 10;
  const slice = list.slice(page * size, page * size + size);

  let text = `${ASCII_LB}\n🏆 *Weekly Top Farmers*\n\n`;
  slice.forEach(([id, u], i) => {
    text += `#${page * size + i + 1} — @${u.username || id} — Lv ${u.level} — XP ${u.weeklyXp}\n`;
  });

  return {
    text,
    buttons: [[
      { text: '⬅ Prev', callback_data: `lb_${page - 1}` },
      { text: '➡ Next', callback_data: `lb_${page + 1}` }
    ]]
  };
}

// ================= MAIN MENU =================
async function showMainMenu(id, lbPage = 0) {
  ensureUser(id);
  cleanupOrders(id);
  const u = users[id];
  const lb = getLeaderboard(lbPage);

  const orders = u.orders.length
    ? u.orders.map(o => `• ${o.product} — ${o.grams}g — $${o.cash} — *${o.status}*`).join('\n')
    : '_No orders yet_';

  let kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    ...lb.buttons
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

🎚 Level: ${u.level}
📊 XP: ${xpBar(u.xp, u.level)}

📦 *Your Orders*
${orders}

${lb.text}`,
{ parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
}

// ================= START =================
bot.onText(/\/start|\/help/, m => showMainMenu(m.chat.id));

// ================= IMPORT / EXPORT =================
bot.onText(/\/exportdb/, async msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;

  const data = { users, meta };
  fs.writeFileSync('export.json', JSON.stringify(data, null, 2));

  await bot.sendDocument(msg.chat.id, 'export.json', {
    caption: '📦 Database export'
  });
});

bot.onText(/\/importdb/, msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;

  sessions[msg.chat.id] = { awaitingImport: true };
  bot.sendMessage(msg.chat.id, '📤 Please upload the exported JSON file');
});

bot.on('document', async msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  if (!sessions[msg.chat.id]?.awaitingImport) return;

  const file = await bot.downloadFile(msg.document.file_id, '.');
  try {
    const data = JSON.parse(fs.readFileSync(file));
    if (!data.users || !data.meta) throw new Error();

    users = data.users;
    meta = data.meta;
    saveAll();

    delete sessions[msg.chat.id].awaitingImport;
    bot.sendMessage(msg.chat.id, '✅ Database imported successfully');
  } catch {
    bot.sendMessage(msg.chat.id, '❌ Invalid database file');
  } finally {
    fs.unlinkSync(file);
  }
});

// ================= CALLBACKS + INPUT =================
// (unchanged from your version — kept exactly as-is)
