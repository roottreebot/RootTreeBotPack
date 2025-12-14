require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const { Parser } = require('json2csv');

// ================== ENV ==================
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(Number) : [];
if (!TOKEN || !ADMIN_IDS.length) { console.error('❌ Missing BOT_TOKEN or ADMIN_IDS'); process.exit(1); }

// ================== BOT ==================
const bot = new TelegramBot(TOKEN, { polling: true });
bot.deleteWebHook({ drop_pending_updates: true }).catch(() => {});
console.log('✅ Bot running');

// ================== FILES ==================
const DB_FILE = 'users.json';
const META_FILE = 'meta.json';
const SESSIONS_FILE = 'sessions.json';

let users = fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE)) : {};
let sessions = fs.existsSync(SESSIONS_FILE) ? JSON.parse(fs.readFileSync(SESSIONS_FILE)) : {};
let meta = fs.existsSync(META_FILE)
  ? JSON.parse(fs.readFileSync(META_FILE))
  : { weeklyReset: Date.now(), sales: { totalOrders: 0, totalRevenue: 0 } };

// ================== SAVE ==================
let saveTimer;
function saveAll() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
  }, 300);
}

// ================== HELPERS ==================
function ensureUser(id, username) {
  if (!users[id]) users[id] = { xp:0, weeklyXp:0, level:1, orders:[], banned:false, username: username||'' };
  if (username) users[id].username = username;
}
function isAdmin(id) { return ADMIN_IDS.includes(id); }
function banGuard(id) { ensureUser(id); if(users[id].banned){ bot.sendMessage(id,'🚫 You are banned.'); return true;} return false; }

// ================== CONFIG ==================
const PRODUCTS = { 'God Complex': { price: 10 }, 'Killer Green Budz': { price: 10 } };
const WEEK_MS = 7*24*60*60*1000;
const RATE_LIMIT_MS = 1200;
const lastAction = {};

// ================== XP ==================
function addXP(id, amount){ users[id].xp+=amount; users[id].weeklyXp+=amount; while(users[id].xp>=users[id].level*5){ users[id].xp-=users[id].level*5; users[id].level++; } saveAll(); }
function xpBar(xp,lvl){ const max=lvl*5; const fill=Math.floor(xp/max*10); return '🟥'.repeat(fill)+'⬜'.repeat(10-fill)+` ${xp}/${max}`; }

// ================== ASCII ==================
const HEADER=`
\`\`\`
█████▄   ▄██▄   ▄██▄ ██████
██▄▄██▄ ██  ██ ██  ██  ██
██   ██    ▀██▀   ▀██▀   ██
        V 1 L E   F A R M
\`\`\`
`;

// ================== WEEKLY RESET ==================
function checkWeeklyReset(){ if(Date.now()-meta.weeklyReset>=WEEK_MS){ for(const u of Object.values(users)) u.weeklyXp=0; meta.weeklyReset=Date.now(); saveAll(); } }

// ================== RATE LIMIT ==================
function isRateLimited(id){ const now=Date.now(); if(!lastAction[id]){ lastAction[id]=now; return false;} if(now-lastAction[id]<RATE_LIMIT_MS) return true; lastAction[id]=now; return false; }

// ================== SEND OR EDIT ==================
async function sendOrEdit(id,text,opt={}){ if(!sessions[id]) sessions[id]={}; const mid=sessions[id].mainMsgId; try{ if(mid){ await bot.editMessageText(text,{chat_id:id,message_id:mid,...opt}); return;} }catch{} const m=await bot.sendMessage(id,text,opt); sessions[id].mainMsgId=m.message_id; saveAll(); }

// ================== DELETE USER MESSAGES ==================
bot.on('message', msg=>{ const id=msg.chat.id; if(!msg.from.is_bot){ setTimeout(()=>bot.deleteMessage(id,msg.message_id).catch(()=>{}),3000); } });

// ================== MAIN MENU ==================
async function showMainMenu(id){
  ensureUser(id);
  sessions[id].step=null;
  const kb=Object.keys(PRODUCTS).map(p=>[{text:`🌿 ${p}`,callback_data:`product_${p}`}]);
  const pending=users[id].orders.filter(o=>o.status==='Pending');
  const pendingTxt=pending.length?'📦 Pending Orders:\n'+pending.map(o=>`• ${o.product} — ${o.grams}g — $${o.cash}`).join('\n')+'\n\n':'';
  await sendOrEdit(id,`${HEADER}
🎚 Level: *${users[id].level}*
📊 XP: ${xpBar(users[id].xp,users[id].level)}

${pendingTxt}🛒 Select a product`,{parse_mode:'Markdown', reply_markup:{inline_keyboard:kb}});
}

// ================== COMMANDS ==================
bot.onText(/\/start/, msg=>{ const id=msg.chat.id; if(banGuard(id)||isRateLimited(id)) return; showMainMenu(id); });
bot.onText(/\/help/, msg=>{ const id=msg.chat.id; if(banGuard(id)) return; showMainMenu(id); });
bot.onText(/\/profile/, msg=>{
  const id=msg.chat.id; if(banGuard(id)||isRateLimited(id)) return; ensureUser(id,msg.from.username);
  const orders=users[id].orders.slice(-5).reverse().map(o=>`• ${o.product} — ${o.grams}g — $${o.cash} — *${o.status}*`).join('\n')||'_No orders yet_';
  sendOrEdit(id,`${HEADER}
🎚 Level: *${users[id].level}*
📊 XP: ${xpBar(users[id].xp,users[id].level)}

📦 Recent Orders:
${orders}`,{parse_mode:'Markdown', reply_markup:{inline_keyboard:[[ {text:'🏠 Back to Menu', callback_data:'back_main'} ]]}} );
});
bot.onText(/\/top/, msg=>{
  const id=msg.chat.id; if(banGuard(id)||isRateLimited(id)) return; checkWeeklyReset();
  const top=Object.entries(users).filter(([,u])=>!u.banned).sort((a,b)=>b[1].weeklyXp-a[1].weeklyXp).slice(0,10);
  let txt=`${HEADER}\n🏆 *Weekly Top Farmers*\n\n`;
  top.forEach(([uid,u],i)=>{ const uname=u.username?`@${u.username}`:'User'; const link=`[${uname}](tg://user?id=${uid})`; txt+=`#${i+1} — ${link} — Level ${u.level} — XP ${u.weeklyXp}\n`; });
  sendOrEdit(id,txt,{parse_mode:'Markdown', reply_markup:{inline_keyboard:[[ {text:'🏠 Back to Menu', callback_data:'back_main'} ]]});
});

// ================== ADMIN / STATS / CSV ==================
bot.onText(/\/stats/, msg=>{
  if(!isAdmin(msg.chat.id)) return;
  let total=0, banned=0, orders=0, pending=0, accepted=0, rejected=0;
  for(const u of Object.values(users)){
    total++; if(u.banned)banned++; orders+=u.orders.length;
    u.orders.forEach(o=>{ if(o.status==='Pending') pending++; if(o.status==='✅ Accepted') accepted++; if(o.status==='❌ Rejected') rejected++; });
  }
  bot.sendMessage(msg.chat.id,`📊 *Bot Stats*
Users: ${total}
Active: ${total-banned}
Banned: ${banned}

Orders: ${orders}
⏳ Pending: ${pending}
✅ Accepted: ${accepted}
❌ Rejected: ${rejected}
💰 Total Revenue: $${meta.sales.totalRevenue}`,{parse_mode:'Markdown'});
});
bot.onText(/\/export/, msg=>{
  if(!isAdmin(msg.chat.id)) return;
  const orders=[];
  for(const [uid,u] of Object.entries(users)){
    u.orders.forEach(o=>{ orders.push({user:uid,username:u.username,product:o.product,grams:o.grams,cash:o.cash,status:o.status,time:o.time}); });
  }
  const parser=new Parser(); const csv=parser.parse(orders);
  fs.writeFileSync('sales.csv',csv);
  bot.sendDocument(msg.chat.id,'sales.csv');
});

// ================== CALLBACK QUERY (ORDER FLOW + ADMIN) ==================
bot.on('callback_query', async q=>{
  const id=q.message.chat.id;
  const username=q.from.username;
  if(banGuard(id)) return;
  ensureUser(id,username);
  if(!sessions[id]) sessions[id]={};
  const s=sessions[id];

  // Back to menu
  if(q.data==='back_main') return showMainMenu(id);

  // Product selected
  if(q.data.startsWith('product_')){
    s.product=q.data.replace('product_','');
    s.step='amount';
    return sendOrEdit(id,`${HEADER}\n🌿 *${s.product}*\n▫️ Minimum: 2g\n▫️ Price: $${PRODUCTS[s.product].price}/g\n\n✏️ Send grams or $ amount`,{parse_mode:'Markdown'});
  }

  // Confirm order
  if(q.data==='confirm_order'){
    const order={ product:s.product, grams:s.grams, cash:s.cash, status:'Pending', time:Date.now() };
    users[id].orders.push(order);
    meta.sales.totalOrders++; meta.sales.totalRevenue+=s.cash;
    saveAll();
    addXP(id,2);

    // Notify admins
    const uname=username?`@${username}`:q.from.first_name;
    const link=`[${uname}](tg://user?id=${id})`;
    for(const adminId of ADMIN_IDS){
      const m=await bot.sendMessage(adminId,`${HEADER}
📦 *New Order Received*
👤 User: ${link}
🌿 Product: *${order.product}*
⚖️ Grams: *${order.grams}g*
💲 Price: *$${order.cash}*`,{parse_mode:'Markdown', reply_markup:{inline_keyboard:[[ {text:'✅ Accept',callback_data:`admin_accept_${id}`},{text:'❌ Reject',callback_data:`admin_reject_${id}`} ]] }});
      if(!s.adminMsgIds) s.adminMsgIds=[]; s.adminMsgIds.push({adminId,msgId:m.message_id});
    }
    return showMainMenu(id);
  }

  // Admin action
  if(q.data.startsWith('admin_')){
    const [,act,uid]=q.data.split('_'); ensureUser(uid);
    const lastOrder=users[uid].orders.at(-1);
    if(!lastOrder||lastOrder.status!=='Pending') return;
    lastOrder.status=act==='accept'?'✅ Accepted':'❌ Rejected';
    saveAll();
    const uname=users[uid].username?`@${users[uid].username}`:'User';
    const link=`[${uname}](tg://user?id=${uid})`;
    bot.sendMessage(uid, act==='accept'?`✅ Your order for *${lastOrder.product}* has been accepted!`:`❌ Your order for *${lastOrder.product}* has been rejected.`,{parse_mode:'Markdown'});
    if(sessions[uid]) showMainMenu(uid);
    if(s.adminMsgIds){
      for(const {adminId,msgId} of s.adminMsgIds){
        bot.editMessageText(`${HEADER}\n📦 *Order Processed*\n👤 User: ${link}\n🌿 Product: *${lastOrder.product}*\n⚖️ Grams: *${lastOrder.grams}g*\n💲 Price: *$${lastOrder.cash}*\n\n*${act==='accept'?'✅ ACCEPTED':'❌ REJECTED'}*`,{chat_id:adminId,message_id:msgId,parse_mode:'Markdown'}).catch(()=>{});
      }
    }
  }
});

// ================== USER MESSAGE INPUT (GRAMS/$) ==================
bot.on('message', msg=>{
  const id=msg.chat.id;
  const username=msg.from.username;
  if(!sessions[id]||sessions[id].step!=='amount') return;
  ensureUser(id,username);
  const s=sessions[id];
  const price=PRODUCTS[s.product].price;
  const t=msg.text.trim();
  let grams,cash;
  if(t.startsWith('$')){ cash=parseFloat(t.slice(1)); grams=+(cash/price).toFixed(1); }
  else{ grams=Math.round(parseFloat(t)*2)/2; cash=+(grams*price).toFixed(2); }
  if(!grams||grams<2) return sendOrEdit(id,'❌ Minimum 2g');
  s.grams=grams; s.cash=cash;
  sendOrEdit(id,`${HEADER}\n🧾 *Order Summary*\n🌿 ${s.product}\n⚖️ ${grams}g\n💲 $${cash}`,{parse_mode:'Markdown', reply_markup:{inline_keyboard:[[ {text:'✅ Confirm',callback_data:'confirm_order'} ],[ {text:'🏠 Back to Menu',callback_data:'back_main'} ]] }});
});
