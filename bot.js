// === V1LE FARM BOT (FIXED VERSION) ===
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

// ================= USERS & XP =================
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

function giveXP(id, xp) {
  const u = users[id];
  if (!u || u.banned) return;
  u.xp += xp;
  u.weeklyXp += xp;
  while (u.xp >= u.level * 5) { u.xp -= u.level * 5; u.level++; }
}

function xpBar(xp, lvl) {
  const max = lvl * 5;
  const fill = Math.floor((xp / max) * 10);
  return '🟩'.repeat(fill) + '⬜'.repeat(10 - fill) + ` ${xp}/${max}`;
}

// ================= PRODUCTS =================
const PRODUCTS = { 'God Complex': { price: 10 }, 'Killer Green Budz': { price: 10 } };

// ================= SESSIONS =================
const sessions = {};
const bjSessions = {};

// ================= CLEANUP =================
function cleanupOrders(id) {
  const u = users[id]; if (!u) return;
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
    try { await bot.editMessageText(text, { chat_id: id, message_id: mid, ...opt }); return; }
    catch { sessions[id].mainMsgId = null; }
  }
  const m = await bot.sendMessage(id, text, opt);
  sessions[id].mainMsgId = m.message_id;
}

// ================= MAIN MENU =================
async function showMainMenu(id, lbPage = 0) {
  ensureUser(id); cleanupOrders(id);
  const u = users[id];
  const orders = u.orders.length
    ? u.orders.map(o => `${o.status === '✅ Accepted' ? '🟢' : '⚪'} *${o.product}* — ${o.grams}g — $${o.cash} — *${o.status}*`).join('\n')
    : '_No orders yet_';
  const lb = getLeaderboard(lbPage);
  let kb = [
    ...Object.keys(PRODUCTS).map(p => [{ text: `🪴 ${p}`, callback_data: `product_${p}` }]),
    lb.buttons[0],
    [{ text: '🔄 Reload Menu', callback_data: 'reload' }]
  ];
  if (ADMIN_IDS.includes(id)) {
    const storeBtn = meta.storeOpen ? { text: '🔴 Close Store', callback_data: 'store_close' } : { text: '🟢 Open Store', callback_data: 'store_open' };
    kb.push([storeBtn]);
  }
  const storeStatus = meta.storeOpen ? '🟢 Store Open' : '🔴 Store Closed';
  await sendOrEdit(id,
`${storeStatus}
🎚 Level: *${u.level}*
📊 XP: ${xpBar(u.xp, u.level)}

📦 *Your Orders* (last 5)
${orders}

${lb.text}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: kb } });
}

// ================= START =================
bot.onText(/\/start|\/help/, msg => showMainMenu(msg.chat.id, 0));

// ================= UNIFIED CALLBACK HANDLER =================
bot.on('callback_query', async q => {
  const chatId = q.message.chat.id;
  const fromId = q.from.id;
  const data = q.data;
  ensureUser(fromId, q.from.username);
  if (!sessions[chatId]) sessions[chatId] = {};
  const s = sessions[chatId];
  await bot.answerCallbackQuery(q.id);

  // === MAIN MENU CALLBACKS ===
  if (data === 'reload') return showMainMenu(chatId);
  if (data.startsWith('lb_')) return showMainMenu(chatId, Math.max(0, Number(data.split('_')[1])));
  if (data === 'store_open' && ADMIN_IDS.includes(chatId)) { meta.storeOpen = true; saveAll(); return showMainMenu(chatId); }
  if (data === 'store_close' && ADMIN_IDS.includes(chatId)) { meta.storeOpen = false; saveAll(); return showMainMenu(chatId); }

  // === PRODUCT ORDER ===
  if (data.startsWith('product_')) {
    if (!meta.storeOpen) return bot.answerCallbackQuery(q.id, { text: '🛑 Store is closed!', show_alert: true });
    if (Date.now() - (s.lastClick || 0) < 30000) return bot.answerCallbackQuery(q.id, { text: 'Please wait before clicking again', show_alert: true });
    s.lastClick = Date.now();
    const pendingCount = users[chatId].orders.filter(o => o.status === 'Pending').length;
    if (pendingCount >= 2) return bot.answerCallbackQuery(q.id, { text: '❌ You already have 2 pending orders!', show_alert: true });
    s.product = data.replace('product_', '');
    s.step = 'amount';
    return sendOrEdit(chatId, `✏️ Send grams or $ amount for *${s.product}*`);
  }

  // === CONFIRM ORDER ===
  if (data === 'confirm_order') {
    if (!meta.storeOpen) return bot.answerCallbackQuery(q.id, { text: 'Store is closed!', show_alert: true });
    const xp = Math.floor(2 + s.cash * 0.5);
    const order = { product: s.product, grams: s.grams, cash: s.cash, status: 'Pending', pendingXP: xp, adminMsgs: [] };
    users[chatId].orders.push(order); users[chatId].orders = users[chatId].orders.slice(-5); saveAll();
    for (const admin of ADMIN_IDS) {
      const m = await bot.sendMessage(admin,
`🧾 *NEW ORDER*
User: @${users[chatId].username || chatId}
Product: ${order.product}
Grams: ${order.grams}g
Price: $${order.cash}
Status: ⚪ Pending`,
        { parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [[
            { text: '✅ Accept', callback_data: `admin_accept_${chatId}_${users[chatId].orders.length-1}` },
            { text: '❌ Reject', callback_data: `admin_reject_${chatId}_${users[chatId].orders.length-1}` }
          ]] }
        });
      order.adminMsgs.push({ admin, msgId: m.message_id });
    }
    return showMainMenu(chatId);
  }

  // === ADMIN ORDER ACCEPT/REJECT ===
  if (data.startsWith('admin_')) {
    const [, action, uid, index] = data.split('_'); const userId = Number(uid); const i = Number(index);
    const order = users[userId]?.orders[i]; if (!order || order.status !== 'Pending') return;
    order.status = action === 'accept' ? '✅ Accepted' : '❌ Rejected';
    if (action === 'accept') { giveXP(userId, order.pendingXP); delete order.pendingXP; bot.sendMessage(userId,'✅ Your order accepted!').then(m=>setTimeout(()=>bot.deleteMessage(userId,m.message_id).catch(()=>{}),5000)); }
    else { bot.sendMessage(userId,'❌ Your order rejected!').then(m=>setTimeout(()=>bot.deleteMessage(userId,m.message_id).catch(()=>{}),5000)); users[userId].orders = users[userId].orders.filter(o=>o!==order); }
    const adminText = `🧾 *ORDER UPDATED*\nUser: @${users[userId].username||userId}\nProduct: ${order.product}\nGrams: ${order.grams}g\nPrice: $${order.cash}\nStatus: ${order.status}`;
    for (const { admin, msgId } of order.adminMsgs) bot.editMessageText(adminText,{chat_id:admin,message_id:msgId,parse_mode:'Markdown'}).catch(()=>{});
    saveAll(); return showMainMenu(userId);
  }

  // === RESET WEEKLY ===
  if (data === 'resetweekly_confirm') {
    for (const u of Object.values(users)) u.weeklyXp = 0;
    meta.weeklyReset = Date.now(); saveAll();
    return bot.editMessageText('✅ Weekly XP has been reset for all users.', { chat_id, message_id: q.message.message_id });
  }
  if (data === 'resetweekly_cancel') return bot.editMessageText('❌ Weekly XP reset canceled.', { chat_id, message_id: q.message.message_id });

  // === CASH RESET ===
  if (data === 'cash_reset_display') {
    sessions[chatId].cashTotal = 0;
    return bot.editMessageText('💰 Total Money Made: $0.00', { chat_id, message_id: q.message.message_id, parse_mode: 'Markdown' });
  }

  // === BANLIST ===
  if (data.startsWith('unban_')) {
    const [_, userId, __, page] = data.split('_'); if (users[userId]) { users[userId].banned = false; saveAll(); bot.sendMessage(chatId, `✅ User @${users[userId].username || userId} has been unbanned.`); bot.deleteMessage(chatId, q.message.message_id).catch(()=>{}); showBanlist(chatId, Number(page)); }
  }
  if (data.startsWith('banlist_page_')) { const page = Number(data.split('_')[2]); bot.deleteMessage(chatId,q.message.message_id).catch(()=>{}); showBanlist(chatId,page); }

  // === BLACKJACK INLINE ===
  if (bjSessions[fromId]) {
    const session = bjSessions[fromId]; const user = users[fromId];
    function endGame(resultText){ saveAll(); delete bjSessions[fromId]; bot.editMessageText(resultText,{chat_id, message_id:q.message.message_id, parse_mode:'Markdown'}); }
    if (data === `bj_hit_${fromId}`){ session.userHand.push(drawCardEmoji()); const total = handTotal(session.userHand); if(total>21){ user.xp -= session.bet; return endGame(`💥 Bust!\nYour Hand: ${handString(session.userHand)} — Total: ${total}\n❌ You lost ${session.bet} XP. Current XP: ${user.xp}`); } else{ return bot.editMessageText(`Your Hand: ${handString(session.userHand)} — Total: ${total}\nDealer's Hand: ${handString(session.dealerHand,true)}\n\nBet: ${session.bet} XP`,{chat_id,message_id:q.message.message_id,parse_mode:'Markdown',reply_markup:{inline_keyboard:[[ {text:'🃏 Hit',callback_data:`bj_hit_${fromId}`},{text:'✋ Stand',callback_data:`bj_stand_${fromId}`},{text:'💥 Double Down',callback_data:`bj_double_${fromId}`}]]}}); } }
    if (data === `bj_double_${fromId}`){ if(session.doubled)return;if(user.xp<session.bet*2)return bot.answerCallbackQuery(q.id,{text:'❌ Not enough XP',show_alert:true}); session.bet*=2; session.doubled=true; session.userHand.push(drawCardEmoji()); const total = handTotal(session.userHand); if(total>21){ user.xp -= session.bet; return endGame(`💥 Bust after Double Down!\nYour Hand: ${handString(session.userHand)} — Total: ${total}\n❌ You lost ${session.bet} XP. Current XP: ${user.xp}`); } else data=`bj_stand_${fromId}`; }
    if (data === `bj_stand_${fromId}`){ let dealerTotal=handTotal(session.dealerHand); while(dealerTotal<17){session.dealerHand.push(drawCardEmoji());dealerTotal=handTotal(session.dealerHand);} const userTotal=handTotal(session.userHand); let result=`🃏 *Blackjack Result*\n\nYour Hand: ${handString(session.userHand)} — Total: ${userTotal}\nDealer's Hand: ${handString(session.dealerHand)} — Total: ${dealerTotal}\n\n`; if(dealerTotal>21||userTotal>dealerTotal){user.xp+=session.bet; result+=`🎉 You win! Gained ${session.bet} XP.\nCurrent XP: ${user.xp}`;}else if(userTotal===dealerTotal){result+=`⚖️ Draw! Bet returned. Current XP: ${user.xp}`;}else{user.xp-=session.bet; result+=`💸 You lost ${session.bet} XP.\nCurrent XP: ${user.xp}`;} endGame(result); }
  }
});

// ================= USER INPUT =================
bot.on('message', msg => {
  const id = msg.chat.id; if(msg.from.is_bot) return;
  ensureUser(id, msg.from.username); setTimeout(()=>bot.deleteMessage(id,msg.message_id).catch(()=>{}),2000);
  const s = sessions[id]; if(!s||s.step!=='amount') return;
  const text = msg.text?.trim(); if(!text) return;
  const price = PRODUCTS[s.product].price;
  let grams,cash;
  if(text.startsWith('$')){ cash=parseFloat(text.slice(1)); grams=+(cash/price).toFixed(1);} else{grams=Math.round(parseFloat(text)*2)/2; cash=+(grams*price).toFixed(2);}
  if(!grams||grams<2) return;
  s.grams=grams; s.cash=cash;
  sendOrEdit(id,
`🧾 *Order Summary*
🌿 *${s.product}*
⚖️ ${grams}g
💲 $${cash}`,
    { reply_markup: { inline_keyboard: [ [{ text:'✅ Confirm',callback_data:'confirm_order'}],[{ text:'🏠 Back to Menu',callback_data:'reload'}] ] }, parse_mode:'Markdown' });
});

// ================= HELPER FUNCTIONS =================
const suitsEmoji=['♠️','♥️','♦️','♣️'];
const valuesEmoji=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
function drawCardEmoji(){const suit=suitsEmoji[Math.floor(Math.random()*suitsEmoji.length)];const value=valuesEmoji[Math.floor(Math.random()*valuesEmoji.length)];return {suit,value};}
function cardValue(card){if(['J','Q','K'].includes(card.value))return 10;if(card.value==='A')return 11;return parseInt(card.value);}
function handTotal
