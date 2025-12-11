// V1LEFarm Bot (GitHub-safe)
const TOKEN = process.env.BOT_TOKEN;  
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(x=>Number(x)) : [];

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const bot = new TelegramBot(TOKEN, { polling: true });
console.log('✅ Bot started');

// Users DB
const DB_FILE = 'users.json';
let users = {};
if (fs.existsSync(DB_FILE)) users = JSON.parse(fs.readFileSync(DB_FILE));
function saveUsers(){ fs.writeFileSync(DB_FILE, JSON.stringify(users,null,2)); }

const sessions = {};
const PRODUCTS = [
  { name: 'God Complex', emoji: '🟢', price: 10 },
  { name: 'Killer Green Budz', emoji: '🌿', price: 10 }
];

function sendToAdmins(msg, options={}){
  ADMIN_IDS.forEach(id => bot.sendMessage(id, msg, options).catch(()=>{}));
}

function numberToEmoji(n){
  const base = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
  if(Number.isInteger(n)) return base[n] || n.toString();
  const whole = Math.floor(n), frac = n - whole;
  if(frac === 0.5) return (base[whole]||whole.toString()) + '➕';
  return n.toString();
}

function showProducts(chatId){
  const keyboard = PRODUCTS.map(p => [{ text: `${p.emoji} ${p.name}`, callback_data: `product_${p.name}` }]);
  bot.sendMessage(chatId, 'Select a product:', { reply_markup: { inline_keyboard: keyboard } }).catch(console.error);
}

function showGrams(chatId, productName, msgId){
  const product = PRODUCTS.find(p => p.name === productName);
  if(!product) return;
  const buttons = [];
  for(let g=2; g<=10; g+=0.5) buttons.push({ text: `${numberToEmoji(g)}g $${g*product.price}`, callback_data: `qty_${productName}_${g}` });
  const keyboard = [];
  for(let i=0;i<buttons.length;i+=3) keyboard.push(buttons.slice(i,i+3));
  bot.editMessageText(`Select quantity for ${product.emoji} ${product.name}:`, { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: keyboard } }).catch(console.error);
}

// /start handler
bot.onText(/\/start/, msg => {
  const chatId = msg.chat.id;
  if(!sessions[chatId]) sessions[chatId] = {};
  sessions[chatId].state = 'products';

  // XP/Level system
  if(!users[chatId]) users[chatId] = { xp: 0, level: 1 };
  users[chatId].xp += 1;
  if(users[chatId].xp >= users[chatId].level * 5){
    users[chatId].level += 1;
    users[chatId].xp = 0;
    bot.sendMessage(chatId, `🎉 Congrats! You reached Level ${users[chatId].level}!`);
  }
  saveUsers();

  showProducts(chatId);
});

// Callback queries
bot.on('callback_query', query => {
  const chatId = query.message.chat.id;
  const msgId = query.message.message_id;
  const data = query.data;

  if(!sessions[chatId]) sessions[chatId] = {};
  const session = sessions[chatId];

  const username = query.from.username ? `@${query.from.username}` : (query.from.first_name || 'User');
  const userLink = `[${username}](tg://user?id=${chatId})`;

  if(data.startsWith('product_') && session.state === 'products'){
    const productName = data.replace('product_','');
    session.state = 'grams'; session.product = productName;
    showGrams(chatId, productName, msgId);
    return;
  }

  if(data.startsWith('qty_') && session.state === 'grams'){
    const parts = data.split('_');
    const productName = parts[1];
    const grams = parseFloat(parts[2]);
    session.state = 'summary';
    session.grams = grams;
    const product = PRODUCTS.find(p=>p.name===productName);
    const total = grams * product.price;
    const summaryKeyboard = [[{ text: '✅ Confirm', callback_data: `confirm_${productName}_${grams}` }, { text: '❌ Cancel', callback_data: 'back_to_products' }]];
    bot.editMessageText(`📝 Order Summary:\nProduct: ${product.emoji} ${product.name}\nQuantity: ${grams}g\nTotal: $${total}`, { chat_id: chatId, message_id: msgId, reply_markup: { inline_keyboard: summaryKeyboard } }).catch(console.error);
    return;
  }

  if(data.startsWith('confirm_') && session.state === 'summary'){
    const parts = data.split('_');
    const productName = parts[1];
    const grams = parseFloat(parts[2]);
    const product = PRODUCTS.find(p=>p.name===productName);
    const total = grams * product.price;
    sendToAdmins(`✅ New Order:\nUser: ${userLink}\nProduct: ${product.emoji} ${product.name}\nGrams: ${grams}\nTotal: $${total}`, { parse_mode: 'Markdown' });
    session.state = 'done';
    bot.editMessageText(`✅ Your order for ${grams}g of ${product.emoji} ${product.name} ($${total}) has been sent to admins.\n\n🎉 Thank you!`, { chat_id: chatId, message_id: msgId, reply_markup: [[ { text: '🔄 Order Again', callback_data: 'repeat_order' } ]] }).catch(console.error);
    return;
  }

  if(data === 'repeat_order' || data === 'back_to_products'){
    session.state = 'products';
    showProducts(chatId, msgId);
    return;
  }
});
