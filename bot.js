// === V1LE FARM BOT (FULL: SINGLE MAIN MENU + ORDER SUMMARY + BUTTON LOCK + BACKUPS) ===
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
const BACKUP_DIR = './backups';

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);

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

// ================= BACKUPS =================
function backupData() {
  const timestamp = Date.now();
  const filename = path.join(BACKUP_DIR, `backup_${timestamp}.json`);
  fs.writeFileSync(filename, JSON.stringify({ users, meta }, null, 2));
  const files = fs.readdirSync(BACKUP_DIR).sort();
  while (files.length > 24) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
  console.log('✅ Backup saved:', filename);
}
setInterval(backupData, 60 * 60 * 1000); // hourly

// ================= USERS =================
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = { xp: 0, weeklyXp: 0, level: 1, orders: [], banned: false, username: username || '', lastOrderAt: 0 };
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
const PRODUCTS = { 'God Complex': { price: 10 }, 'Killer Green Budz': { price: 10 } };

// ================= ASCII =================
const ASCII_MAIN = `*╔═════════╗*\n*║ V1LE FARM*\n*╚═════════╝*`;
const ASCII_LB = `*╔════════════╗*\n*║ LEADERBOARD*\n*╚════════════╝*`;

// ================= SESSIONS =================
const sessions = {};

// ================= LEADERBOARD =================
function leaderboard(page = 0) {
  const list = Object.entries(users).filter(([, u]) => !u.banned).sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);
  const size = 10;
  const slice = list.slice(page * size, page * size + size);
  let text = `${ASCII_LB}\n🏆 *Weekly Top Farmers*\n\n`;
  slice.forEach(([id, u], i) => {
    text += `#${page * size + i + 1} — *@${u.username || id}* — Lv*${u.level}* — *${u.weeklyXp}* XP\n`;
  });
  return { text, page };
}

// ================= MAIN MENU =================
async function showMainMenu(id, page = 0, edit = false) {
  ensureUser(id);
  const u = users[id];
  const orders = u.orders.length
    ? u.orders.map(o => `${o.status} *${o.product}* — ${o.grams}g — $${o.cash}`).slice(-10).join('\n\n')
    : '_No orders yet_';
  const lb = leaderboard(page);
  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    [{ text: '⬅ Prev', callback_data: `lb_${page - 1}` }, { text: '➡ Next', callback_data: `lb_${page + 1}` }],
    [{ text: '🔄 Reload Menu', callback_data: 'reload' }]
  ];
  if (ADMIN_IDS.includes(id)) kb.push([{ text: meta.storeOpen ? '🔴 Close Store' : '🟢 Open Store', callback_data: meta.storeOpen ? 'store_close' : 'store_open' }]);

  const menuText =
`${ASCII_MAIN}
${meta.storeOpen ? '🟢 *Store Open*' : '🔴 *Store Closed*'}
⏱ Orders reviewed within 1–2 hours

🎚 *Level ${u.level}*
📊 ${xpBar(u.xp, u.level)}

📦 *Orders (last 10)*
${orders}

${lb.text}`;

  if (edit && sessions[id]?.mainMenuId) {
    return bot.editMessageText(menuText, { chat_id: id, message_id: sessions[id].mainMenuId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }).catch(() => showMainMenu(id, page));
  }

  if (sessions[id]?.mainMenuId) await bot.deleteMessage(id, sessions[id].mainMenuId).catch(() => {});
  const msg = await bot.sendMessage(id, menuText, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
  if (!sessions[id]) sessions[id] = {};
  sessions[id].mainMenuId = msg.message_id;
}

// ================= START =================
bot.onText(/\/start|\/help/, m => showMainMenu(m.chat.id));

// ================= DB IMPORT/EXPORT =================
bot.onText(/\/exportdb/, m => {
  if (!ADMIN_IDS.includes(m.chat.id)) return;
  const latest = fs.readdirSync(BACKUP_DIR).sort().reverse()[0];
  if (!latest) return bot.sendMessage(m.chat.id, 'No backups found!');
  bot.sendDocument(m.chat.id, path.join(BACKUP_DIR, latest));
});
bot.onText(/\/importdb/, m => {
  if (!ADMIN_IDS.includes(m.chat.id)) return;
  const latest = fs.readdirSync(BACKUP_DIR).sort().reverse()[0];
  if (!latest) return bot.sendMessage(m.chat.id, 'No backups found!');
  const data = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, latest)));
  users = data.users;
  meta = data.meta;
  saveAll();
  bot.sendMessage(m.chat.id, '✅ Database imported from latest backup!');
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (!sessions[id]) sessions[id] = {};
  const s = sessions[id];

  // Initialize userButtonTimestamps map if it doesn't exist
  if (!s.userButtonTimestamps) s.userButtonTimestamps = {};

  const buttonKey = q.data; // Use callback_data as key
  const now = Date.now();
  const lastPress = s.userButtonTimestamps[buttonKey] || 0;

  // Ignore if same button pressed within last 3 seconds
  if (lastPress && (now - lastPress < 3000)) {
    return; // Do not process this spam click
  }

  // Update last press timestamp
  s.userButtonTimestamps[buttonKey] = now;

  // Remove or comment out your existing 30s lock
  // if (s.lockedUntil && Date.now() < s.lockedUntil) return;
  // s.lockedUntil = Date.now() + 30_000;

  try {
    if (q.data === 'reload') { await showMainMenu(id, 0, true); return; }
    if (q.data.startsWith('lb_')) { await showMainMenu(id, Math.max(0, Number(q.data.split('_')[1])), true); return; }

    if (q.data === 'store_open' && ADMIN_IDS.includes(id)) { meta.storeOpen = true; saveAll(); await showMainMenu(id, 0, true); return; }
    if (q.data === 'store_close' && ADMIN_IDS.includes(id)) { meta.storeOpen = false; saveAll(); await showMainMenu(id, 0, true); return; }

    if (q.data.startsWith('product_')) {
      if (!meta.storeOpen) { await bot.answerCallbackQuery(q.id, { text: '🛑 Store is closed!', show_alert: true }); return; }
      const u = users[id];
      if (Date.now() - u.lastOrderAt < 5 * 60_000) { await bot.answerCallbackQuery(q.id, { text: 'Please wait before ordering again', show_alert: true }); return; }

      // Merge session
      if (!sessions[id]) sessions[id] = { msgIds: [], lockedUntil: 0 };
      s.step = 'amount';
      s.product = q.data.replace('product_', '');
      if (s.mainMenuId) await bot.deleteMessage(id, s.mainMenuId).catch(() => {}); delete s.mainMenuId;
      await bot.sendMessage(id, `${ASCII_MAIN}\n✏️ Send grams or $ amount`).then(m => s.msgIds.push(m.message_id));
      return;
    }

    if (q.data === 'confirm') {
      if (!s || !s.product || !s.grams || !s.cash) return bot.sendMessage(id, '❌ Order info missing');
      const u = users[id];
      u.lastOrderAt = Date.now();
      const order = { product: s.product, grams: s.grams, cash: s.cash, status: '⏳ Pending', createdAt: Date.now(), pendingXP: Math.floor(2 + s.cash * 0.5), adminMsgs: [] };
      u.orders.push(order); u.orders = u.orders.slice(-10); saveAll();

      for (const admin of ADMIN_IDS) {
        const m = await bot.sendMessage(admin, `🧾 *NEW ORDER*\n@${u.username || id}\n*${order.product}* — ${order.grams}g — $${order.cash}`, { reply_markup: { inline_keyboard: [[{ text: '✅ Accept', callback_data: `admin_accept_${id}_${u.orders.length - 1}` }, { text: '❌ Reject', callback_data: `admin_reject_${id}_${u.orders.length - 1}` }]] }, parse_mode: 'Markdown' });
        order.adminMsgs.push({ admin, msgId: m.message_id });
      }

      if (s.msgIds) s.msgIds.forEach(mid => bot.deleteMessage(id, mid).catch(() => {}));
      delete sessions[id];
      await showMainMenu(id, 0);
      return;
    }

    if (q.data === 'back') {
      if (s?.msgIds) s.msgIds.forEach(mid => bot.deleteMessage(id, mid).catch(() => {}));
      delete sessions[id];
      await showMainMenu(id, 0);
      return;
    }

    if (q.data.startsWith('admin_')) {
      const [, action, uid, index] = q.data.split('_');
      const userId = Number(uid);
      const order = users[userId]?.orders[index];
      if (!order || order.status !== '⏳ Pending') return;

      order.status = action === 'accept' ? '🟢 Accepted' : '❌ Rejected';
      if (action === 'accept') {
        giveXP(userId, order.pendingXP); delete order.pendingXP;
        bot.sendMessage(userId, '✅ Your order accepted!').then(m => setTimeout(() => bot.deleteMessage(userId, m.message_id).catch(() => {}), 5000));
      } else {
        bot.sendMessage(userId, '❌ Your order rejected').then(m => setTimeout(() => bot.deleteMessage(userId, m.message_id).catch(() => {}), 5000));
        users[userId].orders = users[userId].orders.filter(o => o !== order);
      }

      for (const { admin, msgId } of order.adminMsgs) bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: admin, message_id: msgId }).catch(() => {});
      saveAll();
      await showMainMenu(userId, 0, true);
      return;
    }

  } catch (err) { console.error(err); }
});
