// === V1LE FARM BOT (FINAL – MOBILE FRIENDLY, FULL FEATURES, 2 PENDING ORDERS) ===
const TelegramBot = require('node-telegram-bot-api');
// Track bot start time
const BOT_START_TIME = Date.now();
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

// ===== GLOBAL STATE =====
const users = {};
const sessions = {};
const lastMessages = {}; // 👈 REQUIRED

async function sendOrEdit(chatId, text, options = {}) {
  if (!lastMessages[chatId]) {
    const m = await bot.sendMessage(chatId, text, options);
    lastMessages[chatId] = m.message_id;
  } else {
    bot.editMessageText(text, {
      chat_id: chatId,
      message_id: lastMessages[chatId],
      ...options
    }).catch(() => {});
  }
}

// commands
bot.onText(/\/shop/, ...);
bot.onText(/\/start/, ...);

// callback_query
bot.on('callback_query', ...);

// other functions
function showShop(...) { ... }
function showMainMenu(...) { ... }

// ================= SLOTS CONFIG =================
const SLOT_COOLDOWN = 10 * 1000; // 10s
const SLOT_SYMBOLS = ['🍒', '🍋', '🍊', '🍉', '⭐'];
const ULTRA_SYMBOL = '💎'; // ultra rare
const ULTRA_CHANCE = 0.03; // 3% chance per reel

function spinReel() {
  if (Math.random() < ULTRA_CHANCE) return ULTRA_SYMBOL;
  return SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
}

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';
const FEEDBACK_FILE = 'feedback.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : { weeklyReset: Date.now(), storeOpen: true };

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

let feedback = fs.existsSync(FEEDBACK_FILE)
  ? JSON.parse(fs.readFileSync(FEEDBACK_FILE))
  : [];

// ================= SAVE DB =================
function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2));
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
      lastOrderAt: 0,
      roles: [],
      
      // 🔥 DAILY SYSTEM
      lastDaily: 0,
      dailyStreak: 0,
      lastSlot: 0,
      lastSpin: 0,
   
    cosmetics: {
        badge: null,
        title: null,
        frame: null
    }
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

// ================= STREAK DISPLAY =================
function streakText(u) {
  if (!u || !u.dailyStreak || u.dailyStreak < 1) {
    return '🔥 Daily Streak: 0 ';
  }
  return `🔥 Daily Streak: ${u.dailyStreak} day${u.dailyStreak === 1 ? '' : 's'}`;
}

// ================= PRODUCTS =================
const PRODUCTS = {
  'Jacky Ds': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= ROLE SHOP =================
const ROLE_SHOP = {
  "🌟 Novice": { price: 50 },
  "🌀 Initiate": { price: 50 },
  "🔥 Apprentice": { price: 100 },
  "💎 Adept": { price: 200 },
  "⚡ Expert": { price: 350 },
  "🌈 Master": { price: 550 },
  "👑 Grandmaster": { price: 800 },
  "🚀 Legendary": { price: 1200 },
  "🛡️ Elite": { price: 1700 },
  "⚔️ Champion": { price: 2300 },
  "🏆 Mythic": { price: 3000 },  // <-- added comma
  "🔥 Spark": { price: 120 },
  "💠 Shard": { price: 180 },
  "⚡ Bolt": { price: 260 },
  "🌈 Prism": { price: 350 },
  "👑 Sovereign": { price: 450 },
  "🚀 Comet": { price: 600 },
  "🛡️ Guardian": { price: 750 },
  "⚔️ Warlord": { price: 950 },
  "🏆 Titan": { price: 1200 },
  "🌟 Celestial": { price: 1500 },
  "🔥 Inferno": { price: 1800 },
  "💎 Radiant": { price: 2100 },
  "⚡ Storm": { price: 2500 },
  "🌈 Aurora": { price: 2900 },
  "👑 Emperor": { price: 3400 },
  "🚀 Voyager": { price: 4000 },
  "🛡️ Sentinel": { price: 4700 },
  "⚔️ Conqueror": { price: 5500 },
  "🏆 Immortal": { price: 6500 }
};

// ================= HELPER FUNCTIONS =================
function getHighestRole(user) {
  if (!user.roles || user.roles.length === 0) return "_No role_";

  // ROLE_SHOP keys in order of increasing price
  const roleNames = Object.keys(ROLE_SHOP);
  
  // Find the highest role the user owns
  let highest = "_No role_";
  for (const role of roleNames) {
    if (user.roles.includes(role)) highest = role;
  }

  return highest;
}

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
  const highestRole = getHighestRole(u);

  const orders = u.orders.length
    ? u.orders.slice(-5).map(o =>
        `${o.status === '✅ Accepted' ? '🟢' : '⚪'} *${o.product}* — ${o.grams}g — $${o.cash} — *${o.status}*`
      ).join('\n')
    : '_No orders yet_';

  const lb = getLeaderboard(lbPage);

  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
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
👑 Highest Role: *${highestRole}*
🎚 Level: *${u.level}*
📊 XP: ${xpBar(u.xp, u.level)}
${streakText(u)}
📦 *Your Orders* (last 5)
${orders}

${lb.text}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }
  );
}

// START / HELP handler
bot.onText(/\/start|\/help/, async msg => {
  await showMainMenu(msg.chat.id, 0);
});

// ================= CALLBACK =================
bot.on('callback_query', async (q) => {
  const id = q.message.chat.id;
  const data = q.data;
  ensureUser(id, q.from.username);
  const s = sessions[id] || (sessions[id] = {});
  const u = users[id];

  await bot.answerCallbackQuery(q.id).catch(() => {});

  // ================== SHOP PAGINATION ==================
if (data.startsWith('shop_page_')) {
  const page = Number(data.split('_')[2]);
  return showShop(id, page);
}

// ================== BUY ROLE ==================
if (data.startsWith('buyrole_')) {
  const role = data.replace('buyrole_', '');
  const roleData = ROLE_SHOP[role];

  if (!roleData)
    return bot.answerCallbackQuery(q.id, { text: 'Role not found!', show_alert: true });

  if (u.roles.includes(role))
    return bot.answerCallbackQuery(q.id, { text: 'You already own this role!', show_alert: true });

  if (u.xp < roleData.price)
    return bot.answerCallbackQuery(q.id, { text: 'Not enough XP!', show_alert: true });

  u.xp -= roleData.price;
  u.roles.push(role);
  saveAll();

  bot.answerCallbackQuery(q.id, { text: `✅ Purchased ${role}!` });
  return showShop(id, 0);
}

  // ================== LEADERBOARD PAGINATION ==================
  if (data.startsWith('lb_')) {
    const page = Math.max(0, Number(data.split('_')[1]));
    return showLeaderboard(id, page, q.message.message_id);
  }

  // ================== WEEKLY LEADERBOARD ==================
  if (data.startsWith('weekly_')) {
    const page = Math.max(0, Number(data.split('_')[1]));
    return showWeekly(id, page, q.message.message_id);
  }

  // ================== STORE OPEN/CLOSE ==================
  if (data === 'store_open' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = true; saveAll(); return showMainMenu(id, q.message.message_id);
  }
  if (data === 'store_close' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = false; saveAll(); return showMainMenu(id, q.message.message_id);
  }

  // ================== PRODUCT ORDERS ==================
  if (data.startsWith('product_')) {
    if (!meta.storeOpen) return bot.answerCallbackQuery(q.id, { text: '🛑 Store is closed!', show_alert: true });
    if (Date.now() - (s.lastClick || 0) < 30000) return bot.answerCallbackQuery(q.id, { text: 'Please wait before clicking again', show_alert: true });
    s.lastClick = Date.now();

    const pendingCount = u.orders.filter(o => o.status === 'Pending').length;
    if (pendingCount >= 2) return bot.answerCallbackQuery(q.id, { text: '❌ You already have 2 pending orders!', show_alert: true });

    s.product = data.replace('product_', '');
    s.step = 'amount';
    return sendOrEdit(id, `✏️ Send grams or $ amount for *${s.product}*`, { message_id: q.message.message_id, parse_mode: 'Markdown' });
  }

  // ================== CONFIRM ORDER ==================
  if (data === 'confirm_order') {
    if (!meta.storeOpen) return bot.answerCallbackQuery(q.id, { text: 'Store is closed! Cannot confirm order.', show_alert: true });

    const xp = Math.floor(2 + s.cash * 0.5);
    const order = { product: s.product, grams: s.grams, cash: s.cash, status: 'Pending', pendingXP: xp, adminMsgs: [] };

    u.orders.push(order);
    u.orders = u.orders.slice(-5); // keep last 5 orders
    saveAll();

    for (const admin of ADMIN_IDS) {
      const m = await bot.sendMessage(admin,
        `🧾 *NEW ORDER*\nUser: @${u.username || id}\nProduct: ${order.product}\nGrams: ${order.grams}g\nPrice: $${order.cash}\nStatus: ⚪ Pending`,
        {
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[
            { text: '✅ Accept', callback_data: `admin_accept_${id}_${u.orders.length - 1}` },
            { text: '❌ Reject', callback_data: `admin_reject_${id}_${u.orders.length - 1}` }
          ]] }
        }
      );
      order.adminMsgs.push({ admin, msgId: m.message_id });
    }

    return showMainMenu(id, q.message.message_id);
  }

  // ================== ADMIN ACTIONS ==================
  if (data.startsWith('admin_')) {
    const [, action, uid, index] = data.split('_');
    const userId = Number(uid);
    const i = Number(index);
    const order = users[userId]?.orders[i];
    if (!order || order.status !== 'Pending') return;

    order.status = action === 'accept' ? '✅ Accepted' : '❌ Rejected';
    if (action === 'accept') { giveXP(userId, order.pendingXP); delete order.pendingXP; }
    else users[userId].orders = users[userId].orders.filter(o => o !== order);

    for (const { admin, msgId } of order.adminMsgs) {
      bot.editMessageText(`🧾 *ORDER UPDATED*\nUser: @${users[userId].username || userId}\nProduct: ${order.product}\nGrams: ${order.grams}g\nPrice: ${order.cash}\nStatus: ${order.status}`,
        { chat_id: admin, message_id: msgId, parse_mode: 'Markdown' }).catch(() => {});
    }

    saveAll();
    return showMainMenu(userId, q.message.message_id);
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

// ================= TRACK LAST ACTIVITY =================
bot.on('message', msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);
  users[id].lastActive = Date.now(); // Track last activity timestamp
  saveAll(); // Save to persist activity
});

// ================= /activeusers COMMAND =================
bot.onText(/\/activeusers/, (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return; // Only admins

  const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const activeUsers = Object.values(users).filter(u => u.lastActive && now - u.lastActive <= ONE_WEEK_MS);

  bot.sendMessage(chatId, `📊 Active Users in last 7 days: *${activeUsers.length}*`, {
    parse_mode: 'Markdown'
  });
});

// ================= /uptime =================
bot.onText(/\/uptime/, (msg) => {
  const chatId = msg.chat.id;

  const now = Date.now();
  let diff = now - BOT_START_TIME;

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  diff %= 24 * 60 * 60 * 1000;

  const hours = Math.floor(diff / (60 * 60 * 1000));
  diff %= 60 * 60 * 1000;

  const minutes = Math.floor(diff / (60 * 1000));
  diff %= 60 * 1000;

  const seconds = Math.floor(diff / 1000);

  bot.sendMessage(
    chatId,
    `⏱ Bot Uptime:\n${days}d ${hours}h ${minutes}m ${seconds}s`,
    { parse_mode: 'Markdown' }
  );
});

// ================= /resetweekly COMMAND WITH CONFIRMATION =================
bot.onText(/\/resetweekly/, async (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  const sentMsg = await bot.sendMessage(chatId, '⚠️ Are you sure you want to reset *weekly XP* for all users?', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Confirm', callback_data: 'resetweekly_confirm' },
          { text: '❌ Cancel', callback_data: 'resetweekly_cancel' }
        ]
      ]
    }
  });
});

// ================= INLINE BUTTON HANDLER FOR /resetweekly =================
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (!ADMIN_IDS.includes(chatId)) return;
  await bot.answerCallbackQuery(q.id);

  if (data === 'resetweekly_confirm') {
    // Reset weekly XP
    for (const u of Object.values(users)) u.weeklyXp = 0;
    meta.weeklyReset = Date.now();
    saveAll();

    bot.editMessageText('✅ Weekly XP has been reset for all users.', {
      chat_id: chatId,
      message_id: q.message.message_id
    });
  }

  if (data === 'resetweekly_cancel') {
    bot.editMessageText('❌ Weekly XP reset canceled.', {
      chat_id: chatId,
      message_id: q.message.message_id
    });
  }
});

// ================= /rank COMMAND (with XP bars) =================
bot.onText(/\/rank(?:\s+@?(\w+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  ensureUser(fromId, msg.from.username);

  const targetUsername = match[1]?.toLowerCase();

  // XP bar helper (same as main menu)
  function xpBar(xp, lvl) {
    const max = lvl * 5;
    const fill = Math.floor((xp / max) * 10);
    return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
  }

  if (targetUsername) {
    // Compare with specific username
    const targetId = Object.keys(users).find(
      id => users[id].username?.toLowerCase() === targetUsername
    );

    if (!targetId || !users[targetId]) {
      return bot.sendMessage(chatId, `❌ User @${targetUsername} not found`);
    }

    const u1 = users[fromId];
    const u2 = users[targetId];

    let comparison = '';
    if (u1.level > u2.level) comparison = '💪 You are higher level than them!';
    else if (u1.level < u2.level) comparison = '⚡ They are higher level than you!';
    else comparison = '🤝 You are the same level!';

    const text = `📊 *Rank Comparison*

You: Lv *${u1.level}* — XP ${xpBar(u1.xp, u1.level)} — ChatID: \`${fromId}\`
@${users[targetId].username}: Lv *${u2.level}* — XP ${xpBar(u2.xp, u2.level)} — ChatID: \`${targetId}\`

${comparison}`;

    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } else {
    // Compare to top 3 users
    const u = users[fromId];
    const topUsers = Object.entries(users)
      .filter(([id, user]) => !user.banned)
      .sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp)
      .slice(0, 3);

    let text = `📊 *Top 3 Users vs You*\n\nYou: Lv *${u.level}* — XP ${xpBar(u.xp, u.level)} — ChatID: \`${fromId}\`\n\n`;

    topUsers.forEach(([id, user], i) => {
      let cmp = '';
      if (u.level > user.level) cmp = '💪 You are higher level!';
      else if (u.level < user.level) cmp = '⚡ They are higher level!';
      else cmp = '🤝 Same level!';

      text += `#${i + 1} — @${user.username || id}: Lv *${user.level}* — XP ${xpBar(user.xp, user.level)} — ChatID: \`${id}\` — ${cmp}\n`;
    });

    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }
});

// ================= ADMIN /userstats =================
bot.onText(/\/userstats (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const adminId = msg.from.id;

  // Admin only
  if (!ADMIN_IDS.includes(adminId)) {
    return bot.sendMessage(chatId, '❌ Admin only command.');
  }

  const input = match[1].replace('@', '').trim();
  let targetId = null;

  // Find user by ID
  if (!isNaN(input)) {
    targetId = Number(input);
  } else {
    // Find user by username
    const found = Object.values(users).find(
      u => u.username && u.username.toLowerCase() === input.toLowerCase()
    );
    if (found) targetId = found.id;
  }

  if (!targetId || !users[targetId]) {
    return bot.sendMessage(chatId, '❌ User not found in database.');
  }

  const u = users[targetId];
  const roles = u.roles?.length ? u.roles.join(', ') : '_No roles owned yet_';
  const highestRole = getHighestRole(u);

  const profileText = `
👤 *User Profile*

🆔 ID: \`${u.id}\`
👑 Level: *${u.level}*
📊 XP: ${xpBar(u.xp, u.level)}
📅 Weekly XP: *${u.weeklyXp}*

👑 Highest Role: *${highestRole}*
📛 Roles: *${roles}*

📦 Orders: *${u.orders?.length || 0}*
🚫 Banned: *${u.banned ? 'Yes' : 'No'}*
  `;

  try {
    const photos = await bot.getUserProfilePhotos(targetId, { limit: 1 });

    if (photos.total_count > 0) {
      const fileId = photos.photos[0][photos.photos[0].length - 1].file_id;

      return bot.sendPhoto(chatId, fileId, {
        caption: profileText,
        parse_mode: 'Markdown'
      });
    }
  } catch (err) {}

  bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
});

// ================= /shop COMMAND LISTENER =================
bot.onText(/\/shop/, (msg) => {
  const chatId = msg.chat.id;
  ensureUser(chatId, msg.from.username);
  showShop(chatId, 0); // show the first page of the shop
});

const SHOP_PAGE_SIZE = 5;

// Show shop page
function showShop(chatId, page = 0) {
  const allRoles = Object.entries(ROLE_SHOP);
  const totalPages = Math.ceil(allRoles.length / SHOP_PAGE_SIZE) || 1;
  page = Math.max(0, Math.min(page, totalPages - 1));

  const slice = allRoles.slice(page * SHOP_PAGE_SIZE, (page + 1) * SHOP_PAGE_SIZE);

  let text = `🛒 *Role Shop*\n_Page ${page + 1}/${totalPages}_\n\n`;
  const buttons = [];

  slice.forEach(([name, { price }], i) => {
    text += `${i + 1}. ${name} — ${price} XP\n`;
    buttons.push([{ text: `💰 Buy ${name}`, callback_data: `buyrole_${name}` }]);
  });

  const navButtons = [];
  if (page > 0) navButtons.push({ text: '⬅ Prev', callback_data: `shop_page_${page - 1}` });
  if (page < totalPages - 1) navButtons.push({ text: '➡ Next', callback_data: `shop_page_${page + 1}` });
  if (navButtons.length) buttons.push(navButtons);

  // ✅ THIS LINE FIXES DEAD BUTTONS
  sendOrEdit(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

// ================= /slots (ANIMATED + ULTRA) =================
bot.onText(/\/slots (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const uid = msg.from.id;
  ensureUser(uid, msg.from.username);

  const u = users[uid];
  const bet = parseInt(match[1]);
  const now = Date.now();

  // ⏳ Cooldown
  if (now - u.lastSlot < SLOT_COOLDOWN) {
    const sec = Math.ceil((SLOT_COOLDOWN - (now - u.lastSlot)) / 1000);
    return bot.sendMessage(chatId, `⏳ Wait *${sec}s* before spinning again`, {
      parse_mode: 'Markdown'
    });
  }

  if (bet <= 0) return bot.sendMessage(chatId, '❌ Bet must be above 0 XP');
  if (bet > u.xp) return bot.sendMessage(chatId, `❌ You only have ${u.xp} XP`);

  u.lastSlot = now;

  // 🎞 Fake spin frames
  const frames = [
    '🎰\n┃ ❓ ┃ ❓ ┃ ❓ ┃',
    '🎰\n┃ 🍒 ┃ ❓ ┃ ❓ ┃',
    '🎰\n┃ 🍒 ┃ 🍋 ┃ ❓ ┃',
  ];

  const spinMsg = await bot.sendMessage(chatId, frames[0], { parse_mode: 'Markdown' });

  await new Promise(r => setTimeout(r, 400));
  await bot.editMessageText(frames[1], {
    chat_id: chatId,
    message_id: spinMsg.message_id,
    parse_mode: 'Markdown'
  });

  await new Promise(r => setTimeout(r, 400));
  await bot.editMessageText(frames[2], {
    chat_id: chatId,
    message_id: spinMsg.message_id,
    parse_mode: 'Markdown'
  });

  // 🎰 Final spin
  const r1 = spinReel();
  const r2 = spinReel();
  const r3 = spinReel();

  let payout = 0;
  let result = '';

  // 💎 ULTRA JACKPOT
  if (r1 === ULTRA_SYMBOL && r2 === ULTRA_SYMBOL && r3 === ULTRA_SYMBOL) {
    payout = bet * 10;
    result = '💎💎💎 *ULTRA JACKPOT!* x10';
  }
  // 🎯 Normal jackpot
  else if (r1 === r2 && r2 === r3) {
    payout = bet * 5;
    result = '🎉 *JACKPOT!* x5';
  }
  // ⭐ Two match
  else if (r1 === r2 || r2 === r3 || r1 === r3) {
    payout = bet * 2;
    result = '⭐ *Nice hit!* x2';
  }
  // ❌ Lose
  else {
    payout = -bet;
    result = '💸 *No match*';
  }

  // Apply XP
  if (payout > 0) {
    giveXP(uid, payout);
  } else {
    u.xp += payout;
    if (u.xp < 0) u.xp = 0;
  }

  saveAll();

  // 🧾 Final result
  await bot.editMessageText(
`🎰 *SLOTS RESULT*

┃ ${r1} ┃ ${r2} ┃ ${r3} ┃

${result}

🎯 Bet: *${bet} XP*
📊 XP Now: *${u.xp}*`,
    {
      chat_id: chatId,
      message_id: spinMsg.message_id,
      parse_mode: 'Markdown'
    }
  );
});

// ================= /userprofile COMMAND =================
bot.onText(/\/userprofile(?:\s+@?(\w+))?/, async (msg, match) => {
  const targetName = match[1];
  if (!targetName) return bot.sendMessage(msg.chat.id, '❌ Usage: /userprofile @username');

  const target = Object.values(users).find(u => u.username?.toLowerCase() === targetName.toLowerCase());
  if (!target) return bot.sendMessage(msg.chat.id, '❌ User not found');

  const highestRole = getHighestRole(target);

  bot.sendMessage(msg.chat.id,
`👤 *${target.username || target.id}'s Profile*
Level: ${target.level}
XP: ${xpBar(target.xp, target.level)}
🔥 Daily Streak: ${target.dailyStreak || 0}
🏷 Highest Role: *${highestRole}*
📦 Orders: ${target.orders.length}`, 
  { parse_mode: 'Markdown' });
});

// ================= /profile COMMAND =================
bot.onText(/\/profile/, async msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);
  const u = users[id];

  const highestRole = getHighestRole(u);

  // Only a refresh button
  const kb = [
    [{ text: '🔄 Refresh Profile', callback_data: 'reload_profile' }]
  ];

  await sendOrEdit(id, 
`👤 *Your Profile*
Username: @${u.username || id}
Level: ${u.level}
XP: ${xpBar(u.xp, u.level)}
🔥 Daily Streak: ${u.dailyStreak || 0}
🏷 Highest Role: *${highestRole}*
📦 Orders: ${u.orders.length}`, 
  { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
});

// ================= BLACKJACK WITH XP AS CURRENCY =================
const suitsEmoji = ['♠️', '♥️', '♦️', '♣️'];
const valuesEmoji = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

function drawCardEmoji() {
  const suit = suitsEmoji[Math.floor(Math.random()*suitsEmoji.length)];
  const value = valuesEmoji[Math.floor(Math.random()*valuesEmoji.length)];
  return { suit, value };
}

function cardValue(card) {
  if (['J','Q','K'].includes(card.value)) return 10;
  if (card.value==='A') return 11;
  return parseInt(card.value);
}

function handTotal(hand) {
  let total = 0, aces = 0;
  for (const c of hand) {
    total += cardValue(c);
    if (c.value==='A') aces++;
  }
  while(total>21 && aces>0){ total-=10; aces--; }
  return total;
}

function handString(hand, hideSecond=false) {
  if(hideSecond) return `${hand[0].value}${hand[0].suit} ❓`;
  return hand.map(c=>`${c.value}${c.suit}`).join(' ');
}

const bjSessions = {}; // active blackjack games

bot.onText(/\/blackjack (\d+)/, async (msg, match)=>{
  const chatId = msg.chat.id;
  const uid = msg.from.id;
  let bet = parseInt(match[1]);

  ensureUser(uid, msg.from.username);
  const user = users[uid];

  if(bet <= 0) return bot.sendMessage(chatId,'❌ Bet must be greater than 0 XP.');
  if(bet > user.xp) return bot.sendMessage(chatId, `❌ You don't have enough XP. Current XP: ${user.xp}`);

  // Initialize game session
  const userHand = [drawCardEmoji(), drawCardEmoji()];
  const dealerHand = [drawCardEmoji(), drawCardEmoji()];
  bjSessions[uid] = { userHand, dealerHand, bet, doubled: false };

  const text = `🃏 *Blackjack*\n\n`+
               `Your Hand: ${handString(userHand)} — Total: ${handTotal(userHand)}\n`+
               `Dealer's Hand: ${handString(dealerHand,true)}\n\n`+
               `Bet: ${bet} XP`;

  await bot.sendMessage(chatId,text,{
    parse_mode:'Markdown',
    reply_markup:{ inline_keyboard:[
      [
        { text:'🃏 Hit', callback_data:`bj_hit_${uid}` },
        { text:'✋ Stand', callback_data:`bj_stand_${uid}` },
        { text:'💥 Double Down', callback_data:`bj_double_${uid}` }
      ]
    ]}
  });
});

// ================= INLINE HANDLER =================
bot.on('callback_query', async q=>{
  const chatId = q.message.chat.id;
  const uid = q.from.id;
  if(!bjSessions[uid]) return;
  const session = bjSessions[uid];
  const user = users[uid];
  const data = q.data;
  await bot.answerCallbackQuery(q.id);

  function endGame(resultText) {
    saveAll();
    delete bjSessions[uid];
    bot.editMessageText(resultText,{ chat_id:chatId, message_id:q.message.message_id, parse_mode:'Markdown' });
  }

  if(data === `bj_hit_${uid}`){
    session.userHand.push(drawCardEmoji());
    const total = handTotal(session.userHand);
    if(total>21){
      user.xp -= session.bet;
      endGame(`💥 Bust!\nYour Hand: ${handString(session.userHand)} — Total: ${total}\n❌ You lost ${session.bet} XP. Current XP: ${user.xp}`);
    } else{
      bot.editMessageText(`Your Hand: ${handString(session.userHand)} — Total: ${total}\nDealer's Hand: ${handString(session.dealerHand,true)}\n\nBet: ${session.bet} XP`,{
        chat_id:chatId, message_id:q.message.message_id, parse_mode:'Markdown',
        reply_markup:{ inline_keyboard:[
          [
            { text:'🃏 Hit', callback_data:`bj_hit_${uid}` },
            { text:'✋ Stand', callback_data:`bj_stand_${uid}` },
            { text:'💥 Double Down', callback_data:`bj_double_${uid}` }
          ]
        ]}
      });
    }
  }

  if(data === `bj_double_${uid}`){
    if(session.doubled) return;
    if(user.xp < session.bet*2) return bot.answerCallbackQuery(q.id,{text:'❌ Not enough XP to double down!', show_alert:true});
    session.bet *= 2;
    session.doubled = true;
    session.userHand.push(drawCardEmoji());
    const total = handTotal(session.userHand);
    if(total>21){
      user.xp -= session.bet;
      endGame(`💥 Bust after Double Down!\nYour Hand: ${handString(session.userHand)} — Total: ${total}\n❌ You lost ${session.bet} XP. Current XP: ${user.xp}`);
    } else{
      data = `bj_stand_${uid}`;
    }
  }

  if(data === `bj_stand_${uid}`){
    let dealerTotal = handTotal(session.dealerHand);
    while(dealerTotal<17){
      session.dealerHand.push(drawCardEmoji());
      dealerTotal = handTotal(session.dealerHand);
    }

    const userTotal = handTotal(session.userHand);
    let result = `🃏 *Blackjack Result*\n\nYour Hand: ${handString(session.userHand)} — Total: ${userTotal}\n`+
                 `Dealer's Hand: ${handString(session.dealerHand)} — Total: ${dealerTotal}\n\n`;

    if(dealerTotal>21 || userTotal>dealerTotal){
      user.xp += session.bet;
      result += `🎉 You win! Gained ${session.bet} XP.\nCurrent XP: ${user.xp}`;
    } else if(userTotal === dealerTotal){
      result += `⚖️ Draw! Bet returned. Current XP: ${user.xp}`;
    } else{
      user.xp -= session.bet;
      result += `💸 You lost ${session.bet} XP.\nCurrent XP: ${user.xp}`;
    }

    endGame(result);
  }
});

// ================= PAGINATED /BANLIST COMMAND =================
const BANLIST_PAGE_SIZE = 5;

// Show banlist with optional page
async function showBanlist(chatId, page = 0) {
  const bannedUsers = Object.entries(users).filter(([id, u]) => u.banned);
  const totalPages = Math.ceil(bannedUsers.length / BANLIST_PAGE_SIZE) || 1;
  page = Math.max(0, Math.min(page, totalPages - 1));

  if (bannedUsers.length === 0) {
    return bot.sendMessage(chatId, '✅ No banned users currently.');
  }

  const slice = bannedUsers.slice(page * BANLIST_PAGE_SIZE, (page + 1) * BANLIST_PAGE_SIZE);
  let text = `🚫 *Banned Users* (Total: ${bannedUsers.length})\n_Page ${page + 1} of ${totalPages}_\n\n`;
  const buttons = [];

  slice.forEach(([id, u], i) => {
    text += `${page * BANLIST_PAGE_SIZE + i + 1}. @${u.username || 'N/A'} — ChatID: \`${id}\`\n`;
    buttons.push([{ text: `✅ Unban @${u.username || id}`, callback_data: `unban_${id}_page_${page}` }]);
  });

  // Navigation buttons
  const navButtons = [];
  if (page > 0) navButtons.push({ text: '⬅ Prev', callback_data: `banlist_page_${page - 1}` });
  if (page < totalPages - 1) navButtons.push({ text: '➡ Next', callback_data: `banlist_page_${page + 1}` });
  if (navButtons.length) buttons.push(navButtons);

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
}

// ================= /banlist COMMAND HANDLER =================
bot.onText(/\/banlist/, (msg) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;
  showBanlist(chatId, 0);
});

// ================= INLINE BUTTON HANDLER =================
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data = q.data;

  if (!ADMIN_IDS.includes(chatId)) return;
  await bot.answerCallbackQuery(q.id);

  // Unban button
  if (data.startsWith('unban_')) {
    const [_, userId, __, page] = data.split('_');
    if (users[userId]) {
      users[userId].banned = false;
      saveAll();
      bot.sendMessage(chatId, `✅ User @${users[userId].username || userId} has been unbanned.`);
      bot.deleteMessage(chatId, q.message.message_id).catch(() => {});
      showBanlist(chatId, Number(page)); // Refresh page
    }
  }

  // Navigation buttons
  if (data.startsWith('banlist_page_')) {
    const page = Number(data.split('_')[2]);
    bot.deleteMessage(chatId, q.message.message_id).catch(() => {});
    showBanlist(chatId, page);
  }
});

// ================= /clear COMMAND (BEST POSSIBLE) =================
bot.onText(/\/clear(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;

  if (!ADMIN_IDS.includes(fromId)) {
    return bot.sendMessage(chatId, '❌ Admins only.');
  }

  const limit = Math.min(parseInt(match[1]) || 100, 500); // max 500
  let deleted = 0;
  let failed = 0;

  const statusMsg = await bot.sendMessage(
    chatId,
    `🧹 Clearing last *${limit}* messages...`,
    { parse_mode: 'Markdown' }
  );

  for (let i = 0; i <= limit; i++) {
    try {
      await bot.deleteMessage(chatId, msg.message_id - i);
      deleted++;
    } catch {
      failed++;
    }

    // small delay to avoid flood limits
    await new Promise(r => setTimeout(r, 35));
  }

  await bot.editMessageText(
    `✅ *Clear Complete*\n\n🗑 Deleted: *${deleted}*\n⚠️ Skipped: *${failed}*`,
    {
      chat_id: chatId,
      message_id: statusMsg.message_id,
      parse_mode: 'Markdown'
    }
  );
});

// ================= /feedback  =================
bot.onText(/^\/feedback(?:\s+([\s\S]+))?$/i, (msg, match) => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  const text = match[1]?.trim();
  if (!text || text.length < 5) {
    return bot.sendMessage(id, '❌ Usage:\n/feedback <at least 5 characters>');
  }

  feedback.push({
    id: Date.now(),
    userId: id,
    username: users[id].username || '',
    text,
    date: Date.now()
  });

  saveAll();

  bot.sendMessage(id, '✅ *Feedback received!* Thanks for helping improve the bot.', {
    parse_mode: 'Markdown'
  });
});

// ================= /userfeedback =================
const FEEDBACK_PAGE_SIZE = 5;

function showFeedback(chatId, page = 0, filterUser = null) {
  let list = [...feedback].reverse();

  if (filterUser) {
    list = list.filter(f =>
      f.username?.toLowerCase() === filterUser.toLowerCase() ||
      String(f.userId) === filterUser
    );
  }

  const totalPages = Math.ceil(list.length / FEEDBACK_PAGE_SIZE) || 1;
  page = Math.max(0, Math.min(page, totalPages - 1));

  if (!list.length) {
    return bot.sendMessage(chatId, '📭 No feedback found.');
  }

  const slice = list.slice(
    page * FEEDBACK_PAGE_SIZE,
    (page + 1) * FEEDBACK_PAGE_SIZE
  );

  let text = `📬 *User Feedback*\n_Page ${page + 1}/${totalPages}_\n\n`;

  slice.forEach(f => {
    text +=
`👤 @${f.username || 'unknown'} (\`${f.userId}\`)
💬 ${f.text}
🕒 ${new Date(f.date).toLocaleString()}

`;
  });

  const buttons = [];
  if (page > 0) buttons.push({ text: '⬅ Prev', callback_data: `fb_${page - 1}_${filterUser || ''}` });
  if (page < totalPages - 1) buttons.push({ text: '➡ Next', callback_data: `fb_${page + 1}_${filterUser || ''}` });

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons.length ? [buttons] : [] }
  });
}

// ================= /userfeedback handler =================
bot.onText(/\/userfeedback(?:\s+@?(\w+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  if (!ADMIN_IDS.includes(chatId)) return;

  const filter = match[1] || null;
  showFeedback(chatId, 0, filter);
});

// ================= /clearfeedback =================
bot.onText(/\/clearfeedback/, msg => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return;

  feedback = [];
  saveAll();

  bot.sendMessage(id, '🗑 *All feedback cleared*', { parse_mode: 'Markdown' });
});

// ================= /daily WITH STREAK =================
bot.onText(/\/daily/, (msg) => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  const u = users[id];
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // ⏳ Cooldown check
  if (now - u.lastDaily < DAY) {
    const remaining = DAY - (now - u.lastDaily);
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

    return bot.sendMessage(
      id,
      `⏳ *Daily already claimed*\n\nCome back in *${hours}h ${mins}m*`,
      { parse_mode: 'Markdown' }
    );
  }

  // 🔁 Streak logic
  if (now - u.lastDaily <= DAY * 2) {
    u.dailyStreak += 1; // streak continues
  } else {
    u.dailyStreak = 1; // streak reset
  }

  // 🎁 Reward calculation
  const baseXP = 10;
  const streakBonus = Math.min(u.dailyStreak * 2, 30); // cap bonus
  const totalXP = baseXP + streakBonus;

  giveXP(id, totalXP);

  u.lastDaily = now;
  saveAll();

  // 🧾 Message
  bot.sendMessage(
    id,
`🎁 *Daily Reward Claimed!*

🔥 Streak: *${u.dailyStreak} day${u.dailyStreak > 1 ? 's' : ''}*
✨ Base XP: *+${baseXP}*
🚀 Streak Bonus: *+${streakBonus}*
📊 Total Gained: *+${totalXP} XP*

🏆 Level: *${u.level}*

Come back tomorrow to keep the streak alive!`,
    { parse_mode: 'Markdown' }
  );
});

// ================= /spin =================
bot.onText(/\/spin/, async (msg) => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);
  const u = users[id];

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  // ⏳ Cooldown check
  if (now - u.lastSpin < DAY) {
    const remaining = DAY - (now - u.lastSpin);
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    const secs = Math.floor((remaining % (60 * 1000)) / 1000);

    return bot.sendMessage(
      id,
      `⏳ You already spun today! Come back in *${hours}h ${mins}m ${secs}s*`,
      { parse_mode: 'Markdown' }
    );
  }

  u.lastSpin = now;

  // 🎡 Spin options
  const rewards = [
    { emoji: '💎', xp: 50 },
    { emoji: '⭐', xp: 20 },
    { emoji: '🍀', xp: 15 },
    { emoji: '🔹', xp: 10 },
    { emoji: '⚪', xp: 5 }
  ];

  // 🎞 Animation frames
  const frames = [
    '🎡 Spinning... | ⚪ ⚪ ⚪',
    '🎡 Spinning... | 🔹 ⚪ ⚪',
    '🎡 Spinning... | ⭐ 🔹 ⚪',
    '🎡 Spinning... | 🍀 ⭐ 🔹',
    '🎡 Spinning... | 💎 🍀 ⭐'
  ];

  const spinMsg = await bot.sendMessage(id, frames[0], { parse_mode: 'Markdown' });

  // Animate spin
  for (let i = 1; i < frames.length; i++) {
    await new Promise(r => setTimeout(r, 400)); // 0.4s per frame
    await bot.editMessageText(frames[i], { chat_id: id, message_id: spinMsg.message_id });
  }

  // Final reward
  const reward = rewards[Math.floor(Math.random() * rewards.length)];
  giveXP(id, reward.xp);
  saveAll();

  await bot.editMessageText(
    `🎉 The wheel stopped at ${reward.emoji}!\nYou won *${reward.xp} XP* 🚀\n📊 Current XP: *${u.xp}*`,
    { chat_id: id, message_id: spinMsg.message_id, parse_mode: 'Markdown' }
  );
});

// ================= BROADCAST =================
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const adminId = msg.chat.id;
  if (!ADMIN_IDS.includes(adminId)) return;

  const text = match[1];
  if (!text || text.length < 1) {
    return bot.sendMessage(adminId, '❌ Usage: /broadcast your message here');
  }

  let success = 0;
  let failed = 0;

  await bot.sendMessage(adminId, `📣 Broadcasting to ${Object.keys(users).length} users...`);

  for (const uid of Object.keys(users)) {
    const user = users[uid];
    if (!user || user.banned) continue;

    try {
      await bot.sendMessage(uid, text, { parse_mode: 'Markdown' });
      success++;
    } catch (err) {
      failed++;
    }

    // small delay to avoid Telegram flood limits
    await new Promise(r => setTimeout(r, 35));
  }

  bot.sendMessage(
    adminId,
    `✅ *Broadcast finished*\n\n📬 Sent: *${success}*\n❌ Failed: *${failed}*`,
    { parse_mode: 'Markdown' }
  );
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
