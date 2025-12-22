// === V1LE FARM BOT (FINAL – MOBILE FRIENDLY, FULL FEATURES, 2 PENDING ORDERS) ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

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

// ================= SESSIONS =================
const sessions = {};

// ================= CLEANUP =================
function cleanupOrders(id) {
  const u = users[id];
  if (!u) return;
  u.orders = u.orders.filter(o => o.status !== '❌ Rejected');
  if (u.orders.length > 5) u.orders = u.orders.slice(-5);
}

// ================= WEEKLY RESET =================
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
function checkWeeklyReset() {
  if (Date.now() - meta.weeklyReset >= WEEK_MS) {
    for (const id in users) users[id].weeklyXp = 0;
    meta.weeklyReset = Date.now();
    saveAll();
    console.log('✅ Weekly XP reset completed');
  }
}
setInterval(checkWeeklyReset, 60 * 60 * 1000);

// ================= LEADERBOARD =================
function getLeaderboard(page = 0) {
  const lbSize = 5;
  const list = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);

  const totalPages = Math.ceil(list.length / lbSize) || 1;
  const slice = list.slice(page * lbSize, page * lbSize + lbSize);

  let text = `*📊 Weekly Leaderboard*\n\n`;
  slice.forEach(([id, u], i) => {
    text += `#${page * lbSize + i + 1} — *@${u.username || id}* — Lv *${u.level}* — XP *${u.weeklyXp}*\n`;
  });

  const buttons = [[
    { text: '⬅ Prev', callback_data: `lb_${page - 1}` },
    { text: '➡ Next', callback_data: `lb_${page + 1}` }
  ]];

  return { text, buttons };
}

// ================= SEND/EDIT MAIN MENU =================
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

// ================= MAIN MENU =================
async function showMainMenu(id, lbPage = 0) {
  ensureUser(id);
  cleanupOrders(id);

  const u = users[id];
  const orders = u.orders.length
    ? u.orders.map(o =>
        `${o.status === '✅ Accepted' ? '🟢' : '⚪'} *${o.product}* — ${o.grams}g — $${o.cash} — *${o.status}*`
      ).join('\n')
    : '_No orders yet_';

  const lb = getLeaderboard(lbPage);

  let kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    lb.buttons[0],
    [{ text: '🔄 Reload Menu', callback_data: 'reload' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    const storeBtn = meta.storeOpen
      ? { text: '🔴 Close Store', callback_data: 'store_close' }
      : { text: '🟢 Open Store', callback_data: 'store_open' };
    kb.push([storeBtn]);
  }

  const storeStatus = meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed';

  await sendOrEdit(
    id,
`${storeStatus}
🎚 Level: *${u.level}*
📊 XP: ${xpBar(u.xp, u.level)}

📦 *Your Orders* (last 5)
${orders}

${lb.text}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }
  );
}

// ================= START =================
bot.onText(/\/start|\/help/, msg => showMainMenu(msg.chat.id, 0));

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  const s = sessions[id] || (sessions[id] = {});
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (q.data === 'reload') return showMainMenu(id);
  if (q.data.startsWith('lb_')) return showMainMenu(id, Math.max(0, Number(q.data.split('_')[1])));

  if (q.data === 'store_open' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = true; saveAll(); return showMainMenu(id);
  }
  if (q.data === 'store_close' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = false; saveAll(); return showMainMenu(id);
  }

  if (q.data.startsWith('product_')) {
    if (!meta.storeOpen) return bot.answerCallbackQuery(q.id, { text: '🛑 Store is closed! Orders disabled.', show_alert: true });
    if (Date.now() - (s.lastClick || 0) < 30000) return bot.answerCallbackQuery(q.id, { text: 'Please wait before clicking again', show_alert: true });
    s.lastClick = Date.now();

    // ✅ MAX 2 PENDING ORDERS
    const pendingCount = users[id].orders.filter(o => o.status === 'Pending').length;
    if (pendingCount >= 2) return bot.answerCallbackQuery(q.id, { text: '❌ You already have 2 pending orders!', show_alert: true });

    s.product = q.data.replace('product_', '');
    s.step = 'amount';
    return sendOrEdit(id, `✏️ Send grams or $ amount for *${s.product}*`);
  }

  if (q.data === 'confirm_order') {
    if (!meta.storeOpen) return bot.answerCallbackQuery(q.id, { text: 'Store is closed! Cannot confirm order.', show_alert: true });

    const xp = Math.floor(2 + s.cash * 0.5);
    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: 'Pending',
      pendingXP: xp,
      adminMsgs: []
    };

    users[id].orders.push(order);
    users[id].orders = users[id].orders.slice(-5);
    saveAll();

    for (const admin of ADMIN_IDS) {
      const m = await bot.sendMessage(
        admin,
`🧾 *NEW ORDER*
User: @${users[id].username || id}
Product: ${order.product}
Grams: ${order.grams}g
Price: $${order.cash}
Status: ⚪ Pending`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Accept', callback_data: `admin_accept_${id}_${users[id].orders.length - 1}` },
              { text: '❌ Reject', callback_data: `admin_reject_${id}_${users[id].orders.length - 1}` }
            ]]
          }
        }
      );
      order.adminMsgs.push({ admin, msgId: m.message_id });
    }

    return showMainMenu(id);
  }

  if (q.data.startsWith('admin_')) {
    const [, action, uid, index] = q.data.split('_');
    const userId = Number(uid);
    const i = Number(index);
    const order = users[userId]?.orders[i];
    if (!order || order.status !== 'Pending') return;

    order.status = action === 'accept' ? '✅ Accepted' : '❌ Rejected';

    if (action === 'accept') {
      giveXP(userId, order.pendingXP);
      delete order.pendingXP;
      bot.sendMessage(userId, '✅ Your order has been accepted!').then(msg => setTimeout(() => bot.deleteMessage(userId, msg.message_id).catch(() => {}), 5000));
    } else {
      bot.sendMessage(userId, '❌ Your order has been rejected!').then(msg => setTimeout(() => bot.deleteMessage(userId, msg.message_id).catch(() => {}), 5000));
      users[userId].orders = users[userId].orders.filter(o => o !== order);
    }

    const adminText = `🧾 *ORDER UPDATED*
User: @${users[userId].username || userId}
Product: ${order.product}
Grams: ${order.grams}g
Price: $${order.cash}
Status: ${order.status}`;

    for (const { admin, msgId } of order.adminMsgs) {
      bot.editMessageText(adminText, { chat_id: admin, message_id: msgId, parse_mode: 'Markdown' }).catch(() => {});
    }

    saveAll();
    return showMainMenu(userId);
  }
});

// ================= USER INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  if (!msg.from.is_bot) setTimeout(() => bot.deleteMessage(id, msg.message_id).catch(() => {}), 2000);

  const s = sessions[id];
  if (!s || s.step !== 'amount') return;

  const text = msg.text?.trim();
  if (!text) return;

  const price = PRODUCTS[s.product].price;
  let grams, cash;
  if (text.startsWith('$')) {
    cash = parseFloat(text.slice(1));
    grams = +(cash / price).toFixed(1);
  } else {
    grams = Math.round(parseFloat(text) * 2) / 2;
    cash = +(grams * price).toFixed(2);
  }

  if (!grams || grams < 2) return;

  s.grams = grams;
  s.cash = cash;

  sendOrEdit(
    id,
`🧾 *Order Summary*
🌿 *${s.product}*
⚖️ ${grams}g
💲 $${cash}`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Confirm', callback_data: 'confirm_order' }],
          [{ text: '🏠 Back to Menu', callback_data: 'reload' }]
        ]
      },
      parse_mode: 'Markdown'
    }
  );
});

// ================= ADMIN COMMANDS =================
bot.onText(/\/ban (.+)/, (msg, match) => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return;
  let target = match[1];
  let uid = Number(target);
  if (isNaN(uid)) uid = Object.keys(users).find(k => users[k].username?.toLowerCase() === target.replace('@','').toLowerCase());
  if (!uid || !users[uid]) return bot.sendMessage(id,'User not found');
  users[uid].banned = true; saveAll();
  bot.sendMessage(id, `🔨 Banned [${users[uid].username||uid}](tg://user?id=${uid})`, {parse_mode:'Markdown'});
});

bot.onText(/\/unban (.+)/, (msg, match) => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return;
  let target = match[1];
  let uid = Number(target);
  if (isNaN(uid)) uid = Object.keys(users).find(k => users[k].username?.toLowerCase() === target.replace('@','').toLowerCase());
  if (!uid || !users[uid]) return bot.sendMessage(id,'User not found');
  users[uid].banned = false; saveAll();
  bot.sendMessage(id, `✅ Unbanned [${users[uid].username||uid}](tg://user?id=${uid})`, {parse_mode:'Markdown'});
});

// ================= EXPORT/IMPORT DB =================
bot.onText(/\/exportdb/, msg => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return;
  const dbbackup = { users, meta };
  fs.writeFileSync('dbbackup.json', JSON.stringify(dbbackup, null, 2));
  bot.sendDocument(id, 'dbbackup.json');
});

bot.onText(/\/importdb/, msg => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return;
  bot.sendMessage(id,'Please send the JSON file to import').then(()=>{
    const listener = (fileMsg)=>{
      if(!fileMsg.document) return;
      const fileId = fileMsg.document.file_id;
      bot.downloadFile(fileId, './').then(path=>{
        try{
          const data = JSON.parse(fs.readFileSync(path));
          users = data.users||{};
          meta = data.meta||meta;
          saveAll();
          bot.sendMessage(id,'✅ Database imported successfully');
        }catch{
          bot.sendMessage(id,'❌ Failed to import DB');
        }
      });
      bot.removeListener('message',listener);
    };
    bot.on('message',listener);
  });
});
