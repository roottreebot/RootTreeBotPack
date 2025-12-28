// === ROOTTREE BOT (FINAL: V2.00.02 ) ===
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

// ================= PRODUCT IMAGES =================
const PRODUCT_IMAGES = {
  "Sprite Popperz": "AgACAgUAAxkBAAEZvctpUPlkGuG0WnP2yvNA0zJokGMlzQACQxdrG33PiFYuCnIBzcfl2QEAAwIAA3kAAzYE",
  "Killer Green Budz": "AgACAgUAAxkBAAEZvc1pUPnAAAFN5xCcAg5FQDtJEZwJDokAAkwXaxt9z4hW8gu2BS4FC-ABAAMCAAN5AAM2BA"
};

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

if (!meta.lottery) {
  meta.lottery = {
    active: false,
    role: null,
    entries: []
  };
}

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
  return `🔥 /daily *Streak*: ${u.dailyStreak} day${u.dailyStreak === 1 ? '' : 's'}`;
}

// ================= PRODUCTS =================
const PRODUCTS = {
  'Sprite Popperz': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= ROLE SHOP =================
const ROLE_SHOP = {
  "🌟 Starter": { price: 50 },
  "🌀 New": { price: 50 },
  "💨 Smoke": { price: 100 },
  "🔥 Joint": { price: 120 },
  "💠 TrustedCustomer": { price: 180 },
  "🫩 BongHead": { price: 200 },
  "❤️ BudLover": { price: 260 },
  "💸 HighBuyer": { price: 350 },
  "❗️ Stacked": { price: 350 },
  "👑 Best": { price: 450 },
  "🔥 High": { price: 550 },
  "🚀 Rocked": { price: 600 },
  "🫩 Sesh": { price: 750 },
  "👴 Junky": { price: 800 },
  "🍃 420": { price: 950 },
  "🚀 LegendaryHit": { price: 1200 },
  "🥱 Lazy": { price: 1200 },
  "👤 Dealer": { price: 1500 },
  "👼 StonedForLife": { price: 1700 },
  "🔥 TokeUp": { price: 1800 },
  "🚬 Queen": { price: 2100 },
  "🚬 King": { price: 2300 },
  "🛋 Couch": { price: 2500 },
  "🤢 GreenOut": { price: 2900 },
  "💠 Terps": { price: 3000 }, 
  "👑 Dope": { price: 3400 },
  "🚀 Addicted": { price: 4000 },
  "🚬 CantStop": { price: 4700 },
  "🍃 TopPeople": { price: 5500 },
  "🏆 CantFeelAnything": { price: 6500 },
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

function getLotteryMenuText() {
  if (!meta.lottery || !meta.lottery.active || !meta.lottery.role) {
    return '🎟 /lottery Reward: None';
  }
  return `🎟 /lottery Reward: ${meta.lottery.role}`;
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
    ? u.orders.map(o =>
        `${o.status === '✅ Accepted' ? '🟢' : '⚪'} *${o.product}* — ${o.grams}g — $${o.cash} — *${o.status}*`
      ).join('\n')
    : '_No orders yet_';

  const lb = getLeaderboard(lbPage);

  let kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `📦 ${p}`, callback_data: `product_${p}` }]),
    lb.buttons[0],

  ];

  if (ADMIN_IDS.includes(id)) {
    const storeBtn = meta.storeOpen
      ? { text: '🔴 Close Store', callback_data: 'store_close' }
      : { text: '🟢 Open Store', callback_data: 'store_open' };
    kb.push([storeBtn]);
  }

  const storeStatus = meta.storeOpen ? '🟢 *Store Open*' : '🔴 *Store Closed*';

  const lotteryLine = getLotteryMenuText();

await sendOrEdit(
  id,
`${storeStatus}


📊 *Level System*

👑 *Highest Role*: *${highestRole}*
🎚 Level: *${u.level}*
📊 *XP*: ${xpBar(u.xp, u.level)}

📦 *Your Orders* (*Last 5*)

${orders}

🌟 *Extra*

${streakText(u)}
${lotteryLine}

📦 *Product*

🥤 *Sprite Popperz* - Amazing Crystally Buds
🍃 *Killer Green Budz* - Amazing Green Buds

${lb.text}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }
  );
}

// START handler
bot.onText(/\/start|\/help/, async msg => {
  await showMainMenu(msg.chat.id, 0);
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  const s = sessions[id] || (sessions[id] = {});
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (q.data === 'clearpending_confirm') {
    if (!ADMIN_IDS.includes(id)) return;

    let cleared = 0;

    for (const uid of Object.keys(users)) {
      if (!users[uid].orders) continue;

      const before = users[uid].orders.length;
      users[uid].orders = users[uid].orders.filter(
        o => o.status !== 'Pending'
      );
      cleared += before - users[uid].orders.length;
    }

    saveAll();

    return bot.editMessageText(
      `✅ Cleared ${cleared} pending orders.`,
      {
        chat_id: id,
        message_id: q.message.message_id
      }
    );
  }

  if (q.data === 'clearpending_cancel') {
    return bot.editMessageText(
      '❌ Clear pending cancelled.',
      {
        chat_id: id,
        message_id: q.message.message_id
      }
    );
  }

  if (q.data === 'reload') return showMainMenu(id);
  if (q.data.startsWith('lb_')) return showMainMenu(id, Math.max(0, Number(q.data.split('_')[1])));

  if (q.data === 'store_open' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = true; saveAll(); return showMainMenu(id);
  }
  if (q.data === 'store_close' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = false; saveAll(); return showMainMenu(id);
  }

  if (q.data.startsWith('product_')) {
  if (!meta.storeOpen)
    return bot.answerCallbackQuery(q.id, { text: '🛑 Store is closed! Orders disabled.', show_alert: true });

  if (Date.now() - (s.lastClick || 0) < 30000)
    return bot.answerCallbackQuery(q.id, { text: 'Please wait before clicking again', show_alert: true });

  s.lastClick = Date.now();

  // ✅ Max 2 pending orders
  const pendingCount = users[id].orders.filter(o => o.status === 'Pending').length;
  if (pendingCount >= 2)
    return bot.answerCallbackQuery(q.id, { text: '❌ You already have 2 pending orders!', show_alert: true });

  s.product = q.data.replace('product_', '');
  s.step = 'amount';

  const img = PRODUCT_IMAGES[s.product];

  if (img) {
    const sent = await bot.sendPhoto(id, img, {
      caption:
        `🪴 *${s.product}*\n` +
        `💲 Price per gram: $${PRODUCTS[s.product].price}\n\n` +
        `✏️ Send grams or $ amount for *${s.product}*`,
      parse_mode: 'Markdown'
    });

    // OPTIONAL auto-delete after 30s (remove if you want it to stay)
    setTimeout(() => {
      bot.deleteMessage(id, sent.message_id).catch(() => {});
    }, 30000);

  } else {
    // Fallback to text prompt if no image is defined
    sendOrEdit(id, `✏️ Send grams or $ amount for *${s.product}*`);
  }

  return;
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
bot.onText(/\/resetweekly (@\w+)/, async (msg, match) => {
  const adminId = msg.chat.id;
  if (!ADMIN_IDS.includes(adminId)) return bot.sendMessage(adminId, '❌ You are not authorized.');

  const username = match[1].replace('@', '').toLowerCase();

  // Find user by username
  const userId = Object.keys(users).find(id => users[id].username?.toLowerCase() === username);
  if (!userId) return bot.sendMessage(adminId, `❌ User @${username} not found.`);

  ensureUser(userId, users[userId].username);

  // RESET leaderboard XP (weeklyXp in your bot)
  users[userId].weeklyXp = 0;
  saveAll();

  // Notify admin
  bot.sendMessage(adminId, `✅ Reset weekly leaderboard XP for @${username}.`);

  // Flashy animation for the user
  const emojis = ['✨', '🎉', '💫', '🌟', '🎁', '🍀', '🔥', '🚀'];
  let display = await bot.sendMessage(userId, '✨ Resetting your weekly leaderboard XP...');
  for (let i = 0; i < 10; i++) {
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    await bot.editMessageText(`${randomEmoji} Resetting... ${randomEmoji}`, {
      chat_id: userId,
      message_id: display.message_id
    });
    await new Promise(r => setTimeout(r, 100));
  }

  await bot.editMessageText('⚠️ Your weekly leaderboard XP has been reset by an admin.', {
    chat_id: userId,
    message_id: display.message_id
  });

  setTimeout(() => {
    bot.deleteMessage(userId, display.message_id).catch(() => {});
  }, 8000);
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

// ================= /clearpending =================
bot.onText(/\/clearpending(?:\s+(@?\w+))?/, (msg, match) => {
  const chatId = msg.chat.id;

  if (!ADMIN_IDS.includes(chatId)) {
    return bot.sendMessage(chatId, '❌ You are not authorized.');
  }

  const targetUsername = match[1]; // Optional @username

  if (!targetUsername) {
    // No username → clear ALL pending orders
    bot.sendMessage(chatId, '⚠️ This will clear ALL pending orders.\nAre you sure?', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ YES, CLEAR ALL', callback_data: 'clearpending_confirm' }],
          [{ text: '❌ Cancel', callback_data: 'clearpending_cancel' }]
        ]
      }
    });
  } else {
    // Clear pending orders for a specific user
    const cleanUsername = targetUsername.replace(/^@/, '').toLowerCase();
    const userId = Object.keys(users).find(id => {
      const u = users[id];
      return u.username && u.username.toLowerCase() === cleanUsername;
    });

    if (!userId || !users[userId]) {
      return bot.sendMessage(chatId, `❌ User @${cleanUsername} not found.`);
    }

    const pendingOrders = users[userId].orders?.filter(o => o.status === 'Pending') || [];

    if (pendingOrders.length === 0) {
      return bot.sendMessage(chatId, `ℹ️ @${cleanUsername} has no pending orders.`);
    }

    users[userId].orders = users[userId].orders.filter(o => o.status !== 'Pending');
    saveAll();

    return bot.sendMessage(chatId, `✅ Cleared ${pendingOrders.length} pending order(s) for @${cleanUsername}.`);
  }
});

// ================= /removerole =================
bot.onText(/\/removerole (@\w+)\s+(.+)/, (msg, match) => {
  const adminId = msg.chat.id;
  if (!ADMIN_IDS.includes(adminId)) return bot.sendMessage(adminId, '❌ You are not authorized.');

  const username = match[1].replace('@', '');
  const roleToRemove = match[2].trim();

  // Find user by username
  const userId = Object.keys(users).find(id => users[id].username === username);
  if (!userId) return bot.sendMessage(adminId, `❌ User @${username} not found.`);

  ensureUser(userId, username);
  users[userId].roles = users[userId].roles || [];

  if (!users[userId].roles.includes(roleToRemove)) {
    return bot.sendMessage(adminId, `ℹ️ User @${username} does not have the role: ${roleToRemove}`);
  }

  // Remove role
  users[userId].roles = users[userId].roles.filter(r => r !== roleToRemove);
  saveAll();

  bot.sendMessage(adminId, `✅ Removed role '${roleToRemove}' from @${username}`);
  bot.sendMessage(userId, `⚠️ The admin removed your role: ${roleToRemove}`);
});

// ================= /rank COMMAND (with XP bars) =================
bot.onText(/\/rank(?:\s+@?(\w+))?/, async (msg, match) => {
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
      const sentMsg = await bot.sendMessage(chatId, `❌ User @${targetUsername} not found`);
      return setTimeout(() => bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {}), 10000);
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

    const sentMsg = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    return setTimeout(() => bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {}), 10000);

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

    const sentMsg = await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    setTimeout(() => bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {}), 10000);
  }
});

// ================= /reward =================
bot.onText(/\/reward (@\w+)\s+(.+)/, async (msg, match) => {
  const adminId = msg.chat.id;
  if (!ADMIN_IDS.includes(adminId)) return bot.sendMessage(adminId, '❌ You are not authorized.');

  const username = match[1].replace('@', '');
  const rewardInput = match[2].trim();

  // Find user by username
  const userId = Object.keys(users).find(id => users[id].username === username);
  if (!userId) return bot.sendMessage(adminId, `❌ User @${username} not found.`);

  ensureUser(userId, username);

  let adminMessage = '';
  let userMessage = '';

  // Check if reward is XP
  const xpMatch = rewardInput.match(/^(\d+)\s*xp$/i);
  if (xpMatch) {
    const xpAmount = parseInt(xpMatch[1]);
    users[userId].xp = (users[userId].xp || 0) + xpAmount;
    adminMessage = `✅ Gave @${username} ${xpAmount} XP.`;
    userMessage = `🎉 You received ${xpAmount} XP from the admin!`;
  }
  // Check if reward is Level
  else if (rewardInput.match(/^(\d+)\s*level$/i)) {
    const levelAmount = parseInt(rewardInput.match(/^(\d+)\s*level$/i)[1]);
    users[userId].level = (users[userId].level || 0) + levelAmount;
    adminMessage = `✅ Gave @${username} ${levelAmount} level(s).`;
    userMessage = `🎉 You received ${levelAmount} level(s) from the admin!`;
  }
  // Otherwise, assume reward is a role
  else {
    const role = rewardInput;
    users[userId].roles = users[userId].roles || [];
    if (!users[userId].roles.includes(role)) {
      users[userId].roles.push(role);
      adminMessage = `✅ Gave @${username} the role: ${role}`;
      userMessage = `🎉 You received a new role: ${role}!`;
    } else {
      adminMessage = `ℹ️ User @${username} already has the role: ${role}`;
      userMessage = '';
    }
  }

  saveAll();

  // Notify admin
  bot.sendMessage(adminId, adminMessage);

  // Flashy animation for user
  if (userMessage) {
    const emojis = ['🎉', '✨', '💫', '🌟', '🎁', '🍀', '🚀', '🔥'];
    let displayMsg = await bot.sendMessage(userId, '✨ Receiving your reward...');
    for (let i = 0; i < 8; i++) {
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      await bot.editMessageText(`${randomEmoji} Receiving your reward... ${randomEmoji}`, {
        chat_id: userId,
        message_id: displayMsg.message_id
      });
      await new Promise(res => setTimeout(res, 150));
    }
    // Final message
    await bot.editMessageText(userMessage, {
      chat_id: userId,
      message_id: displayMsg.message_id
    });

    // Auto-delete after 7 seconds
    setTimeout(() => {
      bot.deleteMessage(userId, displayMsg.message_id).catch(() => {});
    }, 7000);
  }
});

// ================= /USERPROFILE COMMAND =================
bot.onText(/\/userprofile(?:\s+(.+))?/i, async (msg, match) => {
  const chatId = msg.chat.id;

  let targetId;
  let targetUsername;

  // If no argument → show own profile
  if (!match[1]) {
    targetId = msg.from.id;
    targetUsername = msg.from.username;
  } else {
    // Must be a reply or @username
    if (msg.reply_to_message) {
      targetId = msg.reply_to_message.from.id;
      targetUsername = msg.reply_to_message.from.username;
    } else if (match[1].startsWith('@')) {
      targetUsername = match[1].replace('@', '').toLowerCase();

      // Find user by username in DB
      const found = Object.entries(users).find(
        ([, u]) => u.username?.toLowerCase() === targetUsername
      );

      if (!found) {
        return bot.sendMessage(chatId, '❌ User not found in database.');
      }

      targetId = Number(found[0]);
    } else {
      return bot.sendMessage(chatId, '❌ Use `/userprofile @username` or reply to a user.', {
        parse_mode: 'Markdown'
      });
    }
  }

  ensureUser(targetId, targetUsername);
  const u = users[targetId];

  const roles = u.roles?.length ? u.roles.join(', ') : '_No roles owned yet_';

  const profileText = `
👤 *User Profile*

🆔 ID: \`${targetId}\`
👑 Level: *${u.level}*
📊 XP: ${xpBar(u.xp, u.level)}
📅 Weekly XP: *${u.weeklyXp}*

🎭 Roles: ${roles}

📦 Orders: *${u.orders?.length || 0}*
🚫 Banned: *${u.banned ? 'Yes' : 'No'}*
`;

  try {
    const photos = await bot.getUserProfilePhotos(targetId, { limit: 1 });

    if (photos.total_count > 0) {
      const fileId = photos.photos[0][photos.photos[0].length - 1].file_id;

      const sentMsg = await bot.sendPhoto(chatId, fileId, {
        caption: profileText,
        parse_mode: 'Markdown'
      });

      // Auto-delete after 10 seconds
      setTimeout(() => bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {}), 10000);
      return;
    }
  } catch (err) {
    console.error('User profile photo fetch failed:', err.message);
  }

  // Fallback if no photo
  const sentMsg = await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
  setTimeout(() => bot.deleteMessage(chatId, sentMsg.message_id).catch(() => {}), 10000);
});

// ================= /shop COMMAND =================
const SHOP_PAGE_SIZE = 5;

function showShop(chatId, page = 0) {
  const allRoles = Object.entries(ROLE_SHOP);
  const totalPages = Math.ceil(allRoles.length / SHOP_PAGE_SIZE) || 1;
  page = Math.max(0, Math.min(page, totalPages - 1));

  const slice = allRoles.slice(page * SHOP_PAGE_SIZE, (page + 1) * SHOP_PAGE_SIZE);

  let text = `🛒 *Role Shop*\n_Page ${page + 1}/${totalPages}_\n\n`;
  slice.forEach(([name, { price }], i) => {
    text += `${i + 1}. ${name} — ${price} XP\n`;
  });

  const buttons = [];
  if (page > 0) buttons.push({ text: '⬅ Prev', callback_data: `shop_page_${page - 1}` });
  if (page < totalPages - 1) buttons.push({ text: '➡ Next', callback_data: `shop_page_${page + 1}` });

  bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons.length ? [buttons] : [] }
  });
}

// Command
bot.onText(/\/shop/, (msg) => {
  showShop(msg.chat.id, 0);
});

// Pagination handler
bot.on('callback_query', async q => {
  const data = q.data;
  if (!data.startsWith('shop_page_')) return;
  const page = Number(data.split('_')[2]);
  bot.deleteMessage(q.message.chat.id, q.message.message_id).catch(() => {});
  showShop(q.message.chat.id, page);
});

// ================= /BUY COMMAND (STRICT XP ENFORCEMENT) =================
bot.onText(/\/buy (.+)/i, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  ensureUser(userId, msg.from.username);
  const u = users[userId];

  // HARD GUARDS
  if (!u || typeof u.xp !== 'number') {
    return bot.sendMessage(chatId, '❌ User data error. XP missing.');
  }

  const normalize = s =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const input = normalize(match[1]);

  const matches = Object.entries(ROLE_SHOP).filter(([name]) =>
    normalize(name).includes(input)
  );

  // ❌ No match
  if (matches.length === 0) {
    return bot.sendMessage(
      chatId,
      `❌ No role found matching *${match[1]}*`,
      { parse_mode: 'Markdown' }
    );
  }

  // ⚠ Multiple matches
  if (matches.length > 1) {
    let text = `🤔 *Multiple roles found*\n\n`;
    for (const [name, data] of matches) {
      text += `• ${name} — *${data.price} XP*\n`;
    }
    text += `\nPlease type a more specific name.`;

    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  const [roleName, roleData] = matches[0];
  const price = Number(roleData.price);

  // 🔒 OWNERSHIP CHECK
  u.roles ||= [];
  if (u.roles.includes(roleName)) {
    return bot.sendMessage(chatId, `⚠️ You already own *${roleName}*.`);
  }

  // 🔥 HARD XP CHECK (NO LEVEL XP, NO BORROWING)
  if (u.xp < price) {
    return bot.sendMessage(
      chatId,
      `❌ *Not enough XP*\n\nYou have *${u.xp} XP*\nRequired: *${price} XP*`,
      { parse_mode: 'Markdown' }
    );
  }

  // ✅ DEDUCT FIRST (CRITICAL)
  u.xp -= price;

  // ✅ THEN GRANT ROLE
  u.roles.push(roleName);

  // 💾 SAVE IMMEDIATELY
  saveAll();

  bot.sendMessage(
    chatId,
    `✅ *Purchase successful!*\n\nYou bought *${roleName}* for *${price} XP*.\nRemaining XP: *${u.xp}*`,
    { parse_mode: 'Markdown' }
  );
});

// ================= /userhelp =============
bot.onText(/\/userhelp/, async (msg) => {
  const id = msg.chat.id;
  const cmdMsgId = msg.message_id;

  const text = `
👤 *USER COMMANDS*

🏅 /rank — View your rank & XP

🍀 /lottery — Enter Free Lottery & Possibly Win A Role
🃏 /blackjack (10) — Play Blackjack (10 XP)
🎰 /slots (10) — Play Slots (10 XP)
🎡 /spin — Spin The Daily Wheel

🎁 /daily — Claim daily Reward

🧹 /clear — Clear Your Messages / session 42H

💬 /feedback <text> — Send Feedback To Admins

🧾 /userprofile — View Your Profile

🛒 /shop — View Role Shop
🛍 /buy — Buy From Role Shop
`;

  const sent = await bot.sendMessage(id, text, { parse_mode: 'Markdown' });

  // ⏳ Auto-delete BOTH messages after 10s
  setTimeout(() => {
    bot.deleteMessage(id, sent.message_id).catch(() => {});
    bot.deleteMessage(id, cmdMsgId).catch(() => {});
  }, 10000);
});

// ================= /adminhelp =============
bot.onText(/\/adminhelp/, async (msg) => {
  const id = msg.chat.id;

  if (!ADMIN_IDS.includes(id)) {
    return bot.sendMessage(id, '❌ You are not authorized.');
  }

  const text = `
🏆 *ADMIN COMMANDS*

📦 /exportdb — Export Database
📥 /importdb — Import Database

🚫 /ban @user — Ban A User
✅ /unban @user — Unban A User
📋 /banlist — View Banned Users

📢 /broadcast <msg> — Message All Users

🔄 /resetweekly @user — Reset Weekly XP
👥 /activeusers — Show Active Users

🍀 /makelottery <role> — Make A Lottery
🎰 /drawlottery — Draw The Lottery
💬 /userfeedback — View Feedback
🧹 /clearfeedback — Clear Feedback
❌️ /removerole @user <rolename> — Remove Users Role
🎁 /reward @user <e.g. 10, level, XP, rolename> — Reward A User Something
📊 /givewxp @user <e.g. 10 XP> — Give User Weekly XP

⏱ /uptime — Bot Uptime
🗑 /clearpending <Optional @user> — Clear ALL Pending Orders
`;

  const sent = await bot.sendMessage(id, text, { parse_mode: 'Markdown' });

  // ⏳ Auto-hide after 10 seconds
  setTimeout(() => {
    bot.deleteMessage(id, sent.message_id).catch(() => {});
  }, 10000);
});

// ------------------- Initialize Lottery -------------------
if (!meta.lottery) {
  meta.lottery = {
    active: false,
    role: null,
    entries: []
  };
}

// ------------------- Admin Command: /makelottery -------------------
bot.onText(/\/makelottery (.+)/, (msg, match) => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return bot.sendMessage(id, '❌ You are not authorized.');

  const role = match[1].trim();
  if (!role) return bot.sendMessage(id, '❌ You must specify a role for the lottery.');

  meta.lottery = {
    active: true,
    role,
    entries: []
  };

  saveAll();
  bot.sendMessage(id, `🎟 Lottery created! Role: ${role}\nUsers can now enter with /lottery`);
});

// ------------------- User Command: /lottery -------------------
bot.onText(/\/lottery/, async (msg) => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  if (!meta.lottery || !meta.lottery.active) {
    return bot.sendMessage(id, 'ℹ️ No lottery is currently active. The next lottery will start soon!');
  }

  if (meta.lottery.entries.includes(id)) {
    return bot.sendMessage(id, '❌ You have already entered this lottery.');
  }

  meta.lottery.entries.push(id);
  saveAll();

  // Flashy entry animation
  const emojis = ['🎉', '✨', '💫', '🌟', '🎁', '🍀', '🚀', '🔥'];
  let displayMsg = await bot.sendMessage(id, '🎲 Entering lottery...');

  for (let i = 0; i < 8; i++) {
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    await bot.editMessageText(`${randomEmoji} You are entering the lottery! ${randomEmoji}`, {
      chat_id: id,
      message_id: displayMsg.message_id
    });
    await new Promise(res => setTimeout(res, 150));
  }

  await bot.editMessageText(`✅ You have successfully entered the lottery for role: ${meta.lottery.role}`, {
    chat_id: id,
    message_id: displayMsg.message_id
  });

  // Delete entry confirmation after 5 seconds
  setTimeout(() => {
    bot.deleteMessage(id, displayMsg.message_id).catch(() => {});
  }, 5000);
});

// ------------------- Admin Command: /draw -------------------
bot.onText(/\/draw/, async (msg) => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return bot.sendMessage(id, '❌ You are not authorized.');

  if (!meta.lottery || !meta.lottery.active || meta.lottery.entries.length === 0) {
    return bot.sendMessage(id, 'ℹ️ No active lottery or no entries.');
  }

  const role = meta.lottery.role;
  const entries = meta.lottery.entries;

  // Emoji themes
  let emojis = ['🎉', '✨', '💎', '🚀', '🔥', '🌟', '🎁', '🍀', '💫'];
  if (role.toLowerCase().includes('legendary') || role.toLowerCase().includes('💎')) {
    emojis = ['💎', '✨', '🌟', '🎆', '🚀'];
  } else if (role.toLowerCase().includes('high')) {
    emojis = ['🚀', '🔥', '🌟', '💫', '🎉'];
  } else if (role.toLowerCase().includes('rare')) {
    emojis = ['🎁', '🍀', '✨', '💫', '🌟'];
  }

  const spins = 25; // frames
  const delay = 150; // ms per frame

  let displayMsg = await bot.sendMessage(id, '🎰 Spinning the lottery...');

  // Animate spinning
  for (let i = 0; i < spins; i++) {
    const randomId = entries[Math.floor(Math.random() * entries.length)];
    ensureUser(randomId, users[randomId]?.username || randomId);
    const displayName = `@${users[randomId].username || randomId}`;
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];

    await bot.editMessageText(`🎰 Spinning the lottery...\n${randomEmoji} ${displayName} ${randomEmoji}`, {
      chat_id: id,
      message_id: displayMsg.message_id
    });

    await new Promise(res => setTimeout(res, delay));
  }

  // Pick winner
  const winnerId = entries[Math.floor(Math.random() * entries.length)];
  ensureUser(winnerId, users[winnerId]?.username || winnerId);

  // Assign role
  users[winnerId].roles = users[winnerId].roles || [];
  if (!users[winnerId].roles.includes(role)) users[winnerId].roles.push(role);

  // Clear lottery for next round
  meta.lottery.active = false;
  meta.lottery.entries = [];
  meta.lottery.role = null;
  saveAll();

  // Edit message to announce winner
  await bot.editMessageText(
    `🏆 The lottery is over!\n🎉 Winner: @${users[winnerId].username || winnerId}\nRole won: ${role}`,
    {
      chat_id: id,
      message_id: displayMsg.message_id
    }
  );

  // Delete the announcement after 10 seconds
  setTimeout(() => {
    bot.deleteMessage(id, displayMsg.message_id).catch(() => {});
  }, 10000);

  // Notify winner privately
  bot.sendMessage(winnerId, `🎉 Congratulations! You won the lottery and received the role: ${role}`);
});

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

// ================= /daily WITH STREAK (AUTO DELETE) =================
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
    ).then(sent => {
      setTimeout(() => {
        bot.deleteMessage(id, sent.message_id).catch(() => {});
      }, 10000);
    });
  }

  // 🔁 Streak logic
  if (now - u.lastDaily <= DAY * 2) {
    u.dailyStreak += 1;
  } else {
    u.dailyStreak = 1;
  }

  // 🎁 Reward calculation
  const baseXP = 10;
  const streakBonus = Math.min(u.dailyStreak * 2, 30);
  const totalXP = baseXP + streakBonus;

  giveXP(id, totalXP);

  u.lastDaily = now;
  saveAll();

  // 🧾 Reward message
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
  ).then(sent => {
    setTimeout(() => {
      bot.deleteMessage(id, sent.message_id).catch(() => {});
    }, 10000);
  });
});

// ================= /givewxp =================
bot.onText(/\/givewxp (@\w+) (\d+)/, async (msg, match) => {
  const adminId = msg.chat.id;
  if (!ADMIN_IDS.includes(adminId)) {
    return bot.sendMessage(adminId, '❌ You are not authorized.');
  }

  const username = match[1].replace('@', '').toLowerCase();
  const amount = Number(match[2]);

  if (amount <= 0) {
    return bot.sendMessage(adminId, '❌ XP amount must be greater than 0.');
  }

  // Find user by username
  const userId = Object.keys(users).find(
    id => users[id].username?.toLowerCase() === username
  );

  if (!userId) {
    return bot.sendMessage(adminId, `❌ User @${username} not found.`);
  }

  ensureUser(userId, users[userId].username);

  // ✅ GIVE WEEKLY XP (LEADERBOARD XP)
  users[userId].weeklyXp += amount;
  saveAll();

  // Admin confirmation
  bot.sendMessage(
    adminId,
    `✅ Gave ${amount} weekly XP to @${username}.`
  );

  // Notify user (auto delete)
  const notice = await bot.sendMessage(
    userId,
    `📊 You received **+${amount} Weekly XP**!\n🏆 Your leaderboard score has increased.`,
    { parse_mode: 'Markdown' }
  );

  setTimeout(() => {
    bot.deleteMessage(userId, notice.message_id).catch(() => {});
  }, 8000);
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
