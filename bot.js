// === V1LEFarm Bot ===
// GitHub-safe version: BOT_TOKEN and ADMIN_IDS from environment

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(x=>Number(x)) : [];

if(!TOKEN || ADMIN_IDS.length === 0) {
    console.error('ERROR: BOT_TOKEN or ADMIN_IDS missing!');
    process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('✅ Bot started');

// Users database
const DB_FILE = 'users.json';
let users = {};
if(fs.existsSync(DB_FILE)) users = JSON.parse(fs.readFileSync(DB_FILE));
function saveUsers(){ fs.writeFileSync(DB_FILE, JSON.stringify(users,null,2)); }

// Products
const PRODUCTS = {
    'God Complex': { name:'God Complex', price:10 },
    'Killer Green Budz': { name:'Killer Green Budz', price:10 }
};

// Sessions per chat
const sessions = {};

// --- XP System ---
function addXP(chatId, xp) {
    if(!users[chatId]) users[chatId] = { xp:0, level:1 };
    users[chatId].xp += xp;
    let leveledUp = false;
    while(users[chatId].xp >= users[chatId].level*5){
        users[chatId].xp -= users[chatId].level*5;
        users[chatId].level++;
        leveledUp = true;
    }
    saveUsers();
    return leveledUp;
}

function xpBar(xp, level) {
    const max = level*5;
    const percent = Math.floor((xp/max)*10);
    return '🟥'.repeat(percent) + '⬜'.repeat(10-percent) + ` (${xp}/${max})`;
}

// --- Send to admins ---
function sendToAdmins(msg, options={}) {
    ADMIN_IDS.forEach(id => bot.sendMessage(id, msg, options).catch(()=>{}));
}

// --- Show product selection ---
function showProducts(chatId){
    const keyboard = Object.keys(PRODUCTS).map(p => [{ text: p, callback_data:`product_${p}` }]);
    bot.sendMessage(chatId, "RootTree💥 Select a product to order:", { reply_markup:{ inline_keyboard: keyboard } }).catch(()=>{});
}

// --- Start command ---
bot.onText(/\/start/, msg => {
    const chatId = msg.chat.id;
    if(!users[chatId]) users[chatId] = { xp:0, level:1 };
    if(!sessions[chatId]) sessions[chatId] = {};

    showProducts(chatId);
    bot.sendMessage(chatId, `Your Level: ${users[chatId].level}  XP: ${xpBar(users[chatId].xp, users[chatId].level)}`);
});

// --- Inline button handler ---
bot.on('callback_query', query => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const data = query.data;

    if(!sessions[chatId]) sessions[chatId] = {};
    const session = sessions[chatId];

    // Product selection
    if(data.startsWith('product_')){
        const productName = data.replace('product_','');
        session.product = productName;
        session.step = 'amount';
        bot.editMessageText(
            `You chose: ${productName}\n\n🛒 Minimum 2g,\n✏️ Type $ price you want to spend or grams (e.g., 3 or 2.5):`,
            { chat_id: chatId, message_id: msgId }
        );
        return;
    }

    // Admin accept/reject
    if(data.startsWith('admin_accept_') || data.startsWith('admin_reject_')){
        const parts = data.split('_');
        const action = parts[1]; // accept or reject
        const userId = Number(parts[2]);
        const productName = parts[3];
        const grams = parseFloat(parts[4]);
        const cash = parseFloat(parts[5]);

        if(action==='accept'){
            bot.sendMessage(userId, `✅ Your order for ${grams}g ${productName} has been ACCEPTED by an admin.`);
            // Update other admins
            sendToAdmins(`✅ Order for [tg://user?id=${userId}](tg://user?id=${userId}) accepted.`, { parse_mode:'Markdown' });
        } else {
            bot.sendMessage(userId, `❌ Your order for ${grams}g ${productName} has been REJECTED by an admin.`);
            sendToAdmins(`❌ Order for [tg://user?id=${userId}](tg://user?id=${userId}) rejected.`, { parse_mode:'Markdown' });
        }
        return;
    }
});

// --- Message handler for $ or grams ---
bot.on('message', msg => {
    const chatId = msg.chat.id;
    if(!sessions[chatId] || sessions[chatId].step!=='amount') return;
    const session = sessions[chatId];
    const product = PRODUCTS[session.product];

    let grams, cash;
    const text = msg.text.trim();

    if(text.startsWith('$')){
        cash = parseFloat(text.replace('$',''));
        if(isNaN(cash) || cash<product.price*2){
            return bot.sendMessage(chatId, `❌ Minimum $${product.price*2}`);
        }
        grams = +(cash / product.price).toFixed(1);
    } else {
        grams = parseFloat(text);
        if(isNaN(grams) || grams<2) return bot.sendMessage(chatId, `❌ Minimum 2g`);
        grams = Math.round(grams*2)/2;
        cash = +(grams * product.price).toFixed(2);
    }

    // Save session
    session.grams = grams;
    session.cash = cash;
    session.step = 'confirm';

    // Send order to admins with inline accept/reject buttons
    const adminKeyboard = [
        [{ text:'✅ Accept', callback_data:`admin_accept_${chatId}_${session.product}_${grams}_${cash}` },
         { text:'❌ Reject', callback_data:`admin_reject_${chatId}_${session.product}_${grams}_${cash}` }]
    ];

    sendToAdmins(
        `📩 New Order from [${msg.from.username || msg.from.first_name}](tg://user?id=${chatId})\n`+
        `*Product:* ${session.product}\n*Grams:* ${grams}g\n*Price:* $${cash}`,
        { parse_mode:'Markdown', reply_markup:{ inline_keyboard: adminKeyboard } }
    );

    // Give XP
    const leveled = addXP(chatId, 2);

    bot.sendMessage(chatId,
        `📝 Your order for ${grams}g ${session.product} ($${cash}) has been sent to admins.\n`+
        `Level: ${users[chatId].level} ${xpBar(users[chatId].xp, users[chatId].level)}` +
        (leveled ? `\n🎉 You leveled up!` : '')
    );
});
