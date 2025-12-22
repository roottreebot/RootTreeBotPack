// === V1LE FARM BOT (FINAL – FULL FEATURES + ADMIN SUITE) ===
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
      lastSeen: Date.now()
    };
  }
  users[id].lastSeen = Date.now();
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

// ================= PRODUCTS =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= SESSIONS =================
const sessions = {};

// ================= WEEKLY RESET =================
setInterval(() => {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - meta.weeklyReset >= WEEK) {
    Object.values(users).forEach(u => (u.weeklyXp = 0));
    meta.weeklyReset = Date.now();
    saveAll();
  }
}, 3600000);

// ================= START =================
bot.onText(/\/start|\/help/, msg => {
  showMainMenu(msg.chat.id, 0);
});

// ================= STATS (ADMIN ONLY) =================
bot.onText(/\/stats/, msg => {
  const id = msg.chat.id;
  if (!ADMIN_IDS.includes(id)) return;

  let totalUsers = Object.keys(users).length;
  let banned = 0, active = 0;
  let totalOrders = 0, pending = 0, accepted = 0, money = 0;

  const ACTIVE_MS = 7 * 24 * 60 * 60 * 1000;

  for (const u of Object.values(users)) {
    if (u.banned) banned++;
    if (Date.now() - u.lastSeen < ACTIVE_MS) active++;

    for (const o of u.orders) {
      totalOrders++;
      if (o.status === 'Pending') pending++;
      if (o.status === '✅ Accepted') {
        accepted++;
        money += o.cash;
      }
    }
  }

  bot.sendMessage(
    id,
`📊 *BOT STATS*

👥 Users: *${totalUsers}*
🟢 Active (7d): *${active}*
🚫 Banned: *${banned}*

📦 Orders: *${totalOrders}*
⏳ Pending: *${pending}*
✅ Accepted: *${accepted}*

💰 Total Earned: *$${money.toFixed(2)}*
🏪 Store: *${meta.storeOpen ? 'OPEN' : 'CLOSED'}*`,
    { parse_mode: 'Markdown' }
  );
});

// ================= BROADCAST CORE =================
async function sendBroadcast({ text, photo, onlyActive }, adminId) {
  let sent = 0, failed = 0;
  const ACTIVE_MS = 7 * 24 * 60 * 60 * 1000;

  for (const uid of Object.keys(users)) {
    const u = users[uid];
    if (u.banned) continue;
    if (onlyActive && Date.now() - u.lastSeen > ACTIVE_MS) continue;

    try {
      if (photo) {
        await bot.sendPhoto(uid, photo, { caption: text, parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(uid, text, { parse_mode: 'Markdown' });
      }
      sent++;
    } catch {
      failed++;
    }

    await new Promise(r => setTimeout(r, 35));
  }

  bot.sendMessage(
    adminId,
    `✅ *Broadcast Finished*\n\n📬 Sent: *${sent}*\n❌ Failed: *${failed}*`,
    { parse_mode: 'Markdown' }
  );
}

// ================= BROADCAST TEXT =================
bot.onText(/\/broadcast (.+)/, (msg, match) => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  sessions[msg.chat.id] = {
    type: 'text',
    text: match[1]
  };

  bot.sendMessage(
    msg.chat.id,
`📣 *Broadcast Preview*

${match[1]}`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Send All', callback_data: 'bc_send_all' }],
          [{ text: '🎯 Send Active Only', callback_data: 'bc_send_active' }],
          [{ text: '❌ Cancel', callback_data: 'bc_cancel' }]
        ]
      }
    }
  );
});

// ================= BROADCAST PHOTO =================
bot.onText(/\/broadcastphoto/, msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  sessions[msg.chat.id] = { type: 'photo', step: 'wait_photo' };
  bot.sendMessage(msg.chat.id, '🖼 Send photo now');
});

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  const s = sessions[id];
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (!s) return;

  if (q.data === 'bc_cancel') {
    delete sessions[id];
    return bot.sendMessage(id, '❌ Broadcast cancelled');
  }

  if (q.data.startsWith('bc_send')) {
    await sendBroadcast(
      {
        text: s.text,
        photo: s.photo,
        onlyActive: q.data === 'bc_send_active'
      },
      id
    );
    delete sessions[id];
  }
});

// ================= PHOTO INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;
  ensureUser(id, msg.from.username);

  const s = sessions[id];
  if (!s || s.type !== 'photo') return;

  if (s.step === 'wait_photo' && msg.photo) {
    s.photo = msg.photo[msg.photo.length - 1].file_id;
    s.step = 'wait_caption';
    return bot.sendMessage(id, '✏️ Send caption text (or `skip`)');
  }

  if (s.step === 'wait_caption' && msg.text) {
    s.text = msg.text.toLowerCase() === 'skip' ? '' : msg.text;

    bot.sendMessage(
      id,
      '📣 *Broadcast Preview*',
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Send All', callback_data: 'bc_send_all' }],
            [{ text: '🎯 Send Active Only', callback_data: 'bc_send_active' }],
            [{ text: '❌ Cancel', callback_data: 'bc_cancel' }]
          ]
        }
      }
    );
  }
});
