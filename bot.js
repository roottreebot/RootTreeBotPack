// === V1LE FARM BOT — FINAL FULL BUILD ===
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || !ADMIN_IDS.length) {
  console.error('BOT_TOKEN or ADMIN_IDS missing');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// ================= FILES =================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : {
      weeklyReset: Date.now(),
      storeOpen: true,
      totalMoney: 0,
      totalOrders: 0
    };

function saveAll() {
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// ================= USERS =================
function ensureUser(id, username) {
  if (!users[id]) {
    users[id] = {
      username: username || '',
      xp: 0,
      weeklyXp: 0,
      level: 1,
      orders: [],
      banned: false
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
  const fill = Math.min(10, Math.floor((xp / max) * 10));
  return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

// ================= PRODUCTS =================
const PRODUCTS = {
  'God Complex': { price: 10 },
  'Killer Green Budz': { price: 10 }
};

// ================= SESSIONS =================
const sessions = {};

// ================= WEEKLY RESET =================
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
setInterval(() => {
  if (Date.now() - meta.weeklyReset >= WEEK_MS) {
    Object.values(users).forEach(u => (u.weeklyXp = 0));
    meta.weeklyReset = Date.now();
    saveAll();
  }
}, 60 * 60 * 1000);

// ================= LEADERBOARD =================
function getLeaderboard(page = 0) {
  const size = 5;
  const list = Object.entries(users)
    .filter(([, u]) => !u.banned)
    .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp);

  const totalPages = Math.ceil(list.length / size);
  page = Math.max(0, Math.min(page, totalPages - 1));

  let text = '📊 Weekly Leaderboard\n\n';
  list.slice(page * size, page * size + size).forEach(([id, u], i) => {
    text += `#${page * size + i + 1} @${u.username || id} — Lv ${u.level} — XP ${u.weeklyXp}\n`;
  });

  const buttons = [];
  if (totalPages > 1) {
    buttons.push([
      { text: '⬅ Prev', callback_data: `lb_${page - 1}` },
      { text: '➡ Next', callback_data: `lb_${page + 1}` }
    ]);
  }

  return { text, buttons };
}

// ================= MAIN MENU =================
async function showMenu(id, lbPage = 0) {
  ensureUser(id);
  const u = users[id];
  const session = sessions[id] || (sessions[id] = {});

  const orders = u.orders.length
    ? u.orders.map(o => `${o.product} ${o.grams}g — $${o.cash} — ${o.status}`).join('\n')
    : 'No orders';

  const lb = getLeaderboard(lbPage);

  const kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: p, callback_data: `product_${p}` }]),
    ...lb.buttons,
    [{ text: '🔄 Reload Menu', callback_data: 'reload' }]
  ];

  if (ADMIN_IDS.includes(id)) {
    kb.push([
      {
        text: meta.storeOpen ? 'Close Store' : 'Open Store',
        callback_data: meta.storeOpen ? 'store_close' : 'store_open'
      }
    ]);
  }

  const text =
`Store: ${meta.storeOpen ? 'OPEN' : 'CLOSED'}
Level: ${u.level}
XP: ${xpBar(u.xp, u.level)}

Your Orders:
${orders}

${lb.text}`;

  if (session.menuMsg) {
    try {
      await bot.editMessageText(text, {
        chat_id: id,
        message_id: session.menuMsg,
        reply_markup: { inline_keyboard: kb }
      });
      return;
    } catch {}
  }

  const m = await bot.sendMessage(id, text, { reply_markup: { inline_keyboard: kb } });
  session.menuMsg = m.message_id;
}

// ================= START =================
bot.onText(/\/start|\/help/, msg => showMenu(msg.chat.id));

// ================= CALLBACKS =================
bot.on('callback_query', async q => {
  const id = q.message.chat.id;
  ensureUser(id, q.from.username);
  const s = sessions[id] || (sessions[id] = {});
  await bot.answerCallbackQuery(q.id).catch(() => {});

  if (q.data === 'reload') return showMenu(id);
  if (q.data.startsWith('lb_')) return showMenu(id, Number(q.data.split('_')[1]));

  if (q.data === 'store_open' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = true; saveAll(); return showMenu(id);
  }
  if (q.data === 'store_close' && ADMIN_IDS.includes(id)) {
    meta.storeOpen = false; saveAll(); return showMenu(id);
  }

  if (q.data.startsWith('product_')) {
    if (!meta.storeOpen) {
      return bot.answerCallbackQuery(q.id, { text: 'Store is closed', show_alert: true });
    }

    if (Date.now() - (s.lastClick || 0) < 30000) {
      return bot.answerCallbackQuery(q.id, { text: 'Slow down', show_alert: true });
    }

    const pending = users[id].orders.filter(o => o.status === 'Pending').length;
    if (pending >= 2) {
      return bot.answerCallbackQuery(q.id, { text: 'Max 2 pending orders', show_alert: true });
    }

    s.lastClick = Date.now();
    s.product = q.data.replace('product_', '');
    s.step = 'amount';

    return bot.editMessageText(
      `Send grams or $ amount for ${s.product}`,
      { chat_id: id, message_id: s.menuMsg }
    );
  }

  if (q.data === 'confirm') {
    const order = {
      product: s.product,
      grams: s.grams,
      cash: s.cash,
      status: 'Pending',
      adminMsgs: []
    };

    users[id].orders.push(order);
    users[id].orders = users[id].orders.slice(-5);
    saveAll();

    for (const admin of ADMIN_IDS) {
      const m = await bot.sendMessage(
        admin,
        `NEW ORDER\n@${users[id].username}\n${order.product} ${order.grams}g $${order.cash}`,
        {
          reply_markup: {
            inline_keyboard: [[
              { text: 'Accept', callback_data: `admin_accept_${id}_${users[id].orders.length - 1}` },
              { text: 'Reject', callback_data: `admin_reject_${id}_${users[id].orders.length - 1}` }
            ]]
          }
        }
      );
      order.adminMsgs.push({ admin, msg: m.message_id });
    }

    return showMenu(id);
  }

  if (q.data.startsWith('admin_')) {
    const [, action, uid, idx] = q.data.split('_');
    const order = users[uid]?.orders[idx];
    if (!order || order.status !== 'Pending') return;

    order.status = action === 'accept' ? 'Accepted' : 'Rejected';

    if (action === 'accept') {
      giveXP(uid, Math.floor(order.cash * 0.5));
      meta.totalMoney += Number(order.cash);
      meta.totalOrders++;
    } else {
      users[uid].orders.splice(idx, 1);
    }

    saveAll();

    for (const a of order.adminMsgs) {
      bot.editMessageText(
        `ORDER ${order.status}\n${order.product} ${order.grams}g $${order.cash}`,
        { chat_id: a.admin, message_id: a.msg }
      ).catch(() => {});
    }

    showMenu(uid);
  }
});

// ================= USER INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id;
  if (!msg.from.is_bot) {
    setTimeout(() => bot.deleteMessage(id, msg.message_id).catch(() => {}), 2000);
  }

  const s = sessions[id];
  if (!s || s.step !== 'amount') return;

  const price = PRODUCTS[s.product].price;
  let grams, cash;

  if (msg.text.startsWith('$')) {
    cash = Number(msg.text.slice(1));
    grams = cash / price;
  } else {
    grams = Number(msg.text);
    cash = grams * price;
  }

  if (!grams || grams < 1) return;

  s.grams = grams;
  s.cash = Number(cash.toFixed(2));
  s.step = null;

  bot.editMessageText(
    `Order Summary\n${s.product}\n${grams}g — $${s.cash}`,
    {
      chat_id: id,
      message_id: s.menuMsg,
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Confirm', callback_data: 'confirm' }],
          [{ text: 'Back', callback_data: 'reload' }]
        ]
      }
    }
  );
});

// ================= STATS =================
bot.onText(/\/stats/, msg => {
  const id = msg.chat.id;
  const text =
`Total Money: $${meta.totalMoney.toFixed(2)}
Total Orders: ${meta.totalOrders}`;

  const kb = ADMIN_IDS.includes(id)
    ? [[
        { text: 'Reset Money', callback_data: 'reset_money' },
        { text: 'Reset Orders', callback_data: 'reset_orders' }
      ]]
    : [];

  bot.sendMessage(id, text, { reply_markup: kb.length ? { inline_keyboard: kb } : undefined });
});

// ================= EXPORT / IMPORT =================
bot.onText(/\/exportdb/, msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  fs.writeFileSync('dbbackup.json', JSON.stringify({ users, meta }, null, 2));
  bot.sendDocument(msg.chat.id, 'dbbackup.json');
});

bot.onText(/\/importdb/, msg => {
  if (!ADMIN_IDS.includes(msg.chat.id)) return;
  bot.sendMessage(msg.chat.id, 'Send dbbackup.json');

  const handler = m => {
    if (!m.document) return;
    bot.downloadFile(m.document.file_id, './').then(p => {
      const data = JSON.parse(fs.readFileSync(p));
      users = data.users || {};
      meta = data.meta || meta;
      saveAll();
      bot.sendMessage(msg.chat.id, 'DB Imported');
    });
    bot.removeListener('message', handler);
  };

  bot.on('message', handler);
});
