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

// --- Callback Query Handler ---
bot.on('callback_query', async query => {
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

    // Confirm order
    if(data === 'confirm_order'){
        session.step = 'done';

        // Send order to all admins and store message IDs
        session.adminMsgIds = [];
        for(const adminId of ADMIN_IDS){
            const sentMsg = await bot.sendMessage(
                adminId,
                `📩 New Order from [${query.from.username || query.from.first_name}](tg://user?id=${chatId})\n`+
                `*Product:* ${session.product}\n*Grams:* ${session.grams}g\n*Price:* $${session.cash}`,
                { parse_mode:'Markdown', reply_markup:{
                    inline_keyboard:[
                        [
                            { text:'✅ Accept', callback_data:`admin_accept_${chatId}_${session.product}_${session.grams}_${session.cash}` },
                            { text:'❌ Reject', callback_data:`admin_reject_${chatId}_${session.product}_${session.grams}_${session.cash}` }
                        ]
                    ]
                }}
            );
            session.adminMsgIds.push({ adminId, msgId: sentMsg.message_id });
        }

        bot.sendMessage(chatId, `📝 Your order has been sent to admins.`);

        // Give XP
        const leveled = addXP(chatId, 2);
        bot.sendMessage(chatId,
            `Level: ${users[chatId].level} ${xpBar(users[chatId].xp, users[chatId].level)}` +
            (leveled ? `\n🎉 You leveled up!` : '')
        );
        return;
    }

    // Cancel order
    if(data === 'cancel_order'){
        sessions[chatId] = {}; // reset session
        bot.sendMessage(chatId, `❌ Your order has been canceled.`);
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

        const userSession = sessions[userId];
        if(!userSession) return;

        // Notify user
        bot.sendMessage(userId,
            action==='accept'
            ? `✅ Your order for ${grams}g ${productName} has been ACCEPTED by an admin.`
            : `❌ Your order for ${grams}g ${productName} has been REJECTED by an admin.`
        );

        // Update all admin messages
        if(userSession.adminMsgIds){
            for(const { adminId, msgId } of userSession.adminMsgIds){
                bot.editMessageText(
                    `📩 Order from [tg://user?id=${userId}](tg://user?id=${userId})\n`+
                    `*Product:* ${productName}\n*Grams:* ${grams}g\n*Price:* $${cash}\n`+
                    (action==='accept' ? '✅ Accepted' : '❌ Rejected'),
                    { chat_id: adminId, message_id: msgId, parse_mode:'Markdown' }
                ).catch(()=>{});
            }
        }

        // Reset user's session
        sessions[userId] = {};
        return;
    }
});

// --- Message handler for $ or grams ---
bot.on('message', msg => {
    const chatId = msg.chat.id;

    // Ignore messages that are callback queries or non-order context
    if(!sessions[chatId] || sessions[chatId].step!=='amount') return;
    if(msg.text.startsWith('/')) return; // ignore commands

    const session = sessions[chatId];
    const product = PRODUCTS[session.product];
    const text = msg.text.trim();
    let grams, cash;

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

    session.grams = grams;
    session.cash = cash;
    session.step = 'confirm';

    // Ask user to confirm
    const confirmKeyboard = [
        [{ text:'✅ Confirm Order', callback_data:'confirm_order' }],
        [{ text:'❌ Cancel', callback_data:'cancel_order' }]
    ];
    bot.sendMessage(chatId,
        `You are ordering ${grams}g ${session.product} ($${cash}).\n`+
        `Do you want to confirm your order?`,
        { reply_markup:{ inline_keyboard: confirmKeyboard } }
    );
});
