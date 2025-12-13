// === V1LE FARM BOT ===
// High-traffic | Clean UI | Orders | Leaderboards | Full Admin Suite

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

function ensureUser(id) {
    if (!users[id]) {
        users[id] = {
            xp: 0,
            weeklyXp: 0,
            level: 1,
            orders: [],
            banned: false
        };
    }
    if (users[id].weeklyXp === undefined) users[id].weeklyXp = 0;
    if (users[id].banned === undefined) users[id].banned = false;
    if (!users[id].orders) users[id].orders = [];
}

let saveTimer;
function saveAll() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
        fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
    }, 500);
}

// ================= HELPERS =================
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function checkWeeklyReset() {
    if (Date.now() - meta.weeklyReset >= WEEK_MS) {
        for (const id in users) users[id].weeklyXp = 0;
        meta.weeklyReset = Date.now();
        saveAll();
    }
}

function isAdmin(id) {
    return ADMIN_IDS.includes(id);
}

function banGuard(id) {
    ensureUser(id);
    if (users[id].banned) {
        bot.sendMessage(id, '🚫 You are banned from using this bot.');
        return true;
    }
    return false;
}

// ================= CONFIG =================
const PRODUCTS = {
    'God Complex': { price: 10 },
    'Killer Green Budz': { price: 10 }
};

// ================= XP =================
function addXP(id, xp) {
    ensureUser(id);
    users[id].xp += xp;
    users[id].weeklyXp += xp;

    while (users[id].xp >= users[id].level * 5) {
        users[id].xp -= users[id].level * 5;
        users[id].level++;
    }
    saveAll();
}

function xpBar(xp, lvl) {
    const max = lvl * 5;
    const fill = Math.floor((xp / max) * 10);
    return '🟥'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

// ================= ASCII =================
const HEADER = `
\`\`\`
██╗   ██╗ ██╗██╗     ███████╗
██║   ██║ ██║██║     ██╔════╝
██║   ██║ ██║██║     █████╗  
╚██╗ ██╔╝ ██║██║     ██╔══╝  
 ╚████╔╝  ██║███████╗███████╗
  ╚═══╝   ╚═╝╚══════╝╚══════╝
        V 1 L E   F A R M
\`\`\`
`;

// ================= CLEAN MESSAGES =================
const lastMsg = {};
async function sendClean(id, text, opt = {}) {
    if (lastMsg[id]) try { await bot.deleteMessage(id, lastMsg[id]); } catch {}
    const m = await bot.sendMessage(id, text, opt);
    lastMsg[id] = m.message_id;
}

// ================= START =================
bot.onText(/\/start/, msg => {
    const id = msg.chat.id;
    if (banGuard(id)) return;

    ensureUser(id);

    const kb = Object.keys(PRODUCTS).map(p => [{ text: `🌿 ${p}`, callback_data: `product_${p}` }]);

    sendClean(id,
        `${HEADER}
🎚 Level: *${users[id].level}*
📊 XP: ${xpBar(users[id].xp, users[id].level)}

Commands:
/profile /top /help`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } }
    );
});

// ================= PROFILE =================
bot.onText(/\/profile/, msg => {
    const id = msg.chat.id;
    if (banGuard(id)) return;

    ensureUser(id);

    const orders = users[id].orders.slice(-5).reverse()
        .map(o => `• ${o.product} ${o.grams}g $${o.cash} *${o.status}*`)
        .join('\n') || '_No orders_';

    sendClean(id,
        `${HEADER}
🎚 Level: *${users[id].level}*
📊 XP: ${xpBar(users[id].xp, users[id].level)}

📦 Orders
${orders}`,
        { parse_mode: 'Markdown' }
    );
});

// ================= LEADERBOARD =================
bot.onText(/\/top/, msg => {
    checkWeeklyReset();
    const id = msg.chat.id;
    if (banGuard(id)) return;

    const top = Object.entries(users)
        .filter(([, u]) => !u.banned)
        .sort((a, b) => b[1].weeklyXp - a[1].weeklyXp)
        .slice(0, 10);

    let txt = `${HEADER}\n🏆 *Weekly Top Farmers*\n\n`;
    top.forEach(([uid, u], i) => {
        txt += `#${i + 1} Level ${u.level} — XP ${u.weeklyXp}\n`;
    });

    sendClean(id, txt, { parse_mode: 'Markdown' });
});

// ================= ADMIN STATS =================
bot.onText(/\/stats/, msg => {
    if (!isAdmin(msg.chat.id)) return;

    let total = 0, banned = 0, orders = 0;
    let pending = 0, accepted = 0, rejected = 0;

    for (const u of Object.values(users)) {
        total++;
        if (u.banned) banned++;
        orders += u.orders.length;
        u.orders.forEach(o => {
            if (o.status === 'Pending') pending++;
            if (o.status === 'Accepted') accepted++;
            if (o.status === 'Rejected') rejected++;
        });
    }

    bot.sendMessage(msg.chat.id,
        `📊 *Bot Stats*
Users: ${total}
Active: ${total - banned}
Banned: ${banned}

Orders: ${orders}
⏳ Pending: ${pending}
✅ Accepted: ${accepted}
❌ Rejected: ${rejected}`,
        { parse_mode: 'Markdown' }
    );
});

// ================= ADMIN BAN / UNBAN =================
bot.onText(/\/ban (\d+)/, msg => {
    if (!isAdmin(msg.chat.id)) return;
    const id = Number(msg.match[1]);
    ensureUser(id);
    users[id].banned = true;
    saveAll();
    bot.sendMessage(msg.chat.id, `🚫 User ${id} banned`);
});

bot.onText(/\/unban (\d+)/, msg => {
    if (!isAdmin(msg.chat.id)) return;
    const id = Number(msg.match[1]);
    ensureUser(id);
    users[id].banned = false;
    saveAll();
    bot.sendMessage(msg.chat.id, `✅ User ${id} unbanned`);
});

// ================= ORDER FLOW =================
const sessions = {};

bot.on('callback_query', async q => {
    const id = q.message.chat.id;
    if (banGuard(id)) return;

    ensureUser(id);
    if (!sessions[id]) sessions[id] = {};
    const s = sessions[id];

    if (q.data.startsWith('product_')) {
        s.product = q.data.replace('product_', '');
        s.step = 'amount';
        return bot.editMessageText(
            `${HEADER}\nSend grams or $ amount`,
            { chat_id: id, message_id: q.message.message_id, parse_mode: 'Markdown' }
        );
    }

    if (q.data === 'confirm_order') {
        const price = PRODUCTS[s.product].price;
        const order = { ...s, status: 'Pending', time: Date.now() };
        users[id].orders.push(order);
        saveAll();

        for (const a of ADMIN_IDS) {
            await bot.sendMessage(a,
                `📦 ORDER
User: ${id}
${order.product} ${order.grams}g $${order.cash}`,
                {
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '✅ Accept', callback_data: `admin_accept_${id}` },
                            { text: '❌ Reject', callback_data: `admin_reject_${id}` }
                        ]]
                    }
                }
            );
        }

        addXP(id, 2);
        sendClean(id, `${HEADER}\n📨 Order sent`, { parse_mode: 'Markdown' });
    }

    if (q.data.startsWith('admin_')) {
        const [, act, uid] = q.data.split('_');
        const o = users[uid].orders.at(-1);
        if (!o || o.status !== 'Pending') return;

        o.status = act === 'accept' ? 'Accepted' : 'Rejected';
        saveAll();

        bot.sendMessage(uid,
            act === 'accept' ? '✅ Order accepted' : '❌ Order rejected'
        );

        bot.editMessageText(
            `${q.message.text}\n\n${act === 'accept' ? '✅ ACCEPTED' : '❌ REJECTED'}`,
            { chat_id: q.message.chat.id, message_id: q.message.message_id }
        );
    }
});

// ================= USER INPUT =================
bot.on('message', msg => {
    const id = msg.chat.id;
    if (!sessions[id] || sessions[id].step !== 'amount') return;
    if (msg.text.startsWith('/')) return;

    bot.deleteMessage(id, msg.message_id).catch(() => {});
    const s = sessions[id];
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

    if (!grams || grams < 2) return sendClean(id, '❌ Minimum 2g');

    s.grams = grams;
    s.cash = cash;

    sendClean(id,
        `${HEADER}
🧾 ${s.product}
${grams}g — $${cash}`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '✅ Confirm', callback_data: 'confirm_order' }]
                ]
            }
        }
    );
});
