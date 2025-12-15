// === V1LE FARM BOT (FULL VERSION WITH CHAT + ORDER XP) ===
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
let meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE)) : { weeklyReset: Date.now() };

function ensureUser(id, username) {
  if (!users[id]) users[id] = { xp:0, weeklyXp:0, level:1, orders:[], banned:false, username: username||'' };
  if (users[id].weeklyXp===undefined) users[id].weeklyXp=0;
  if (users[id].banned===undefined) users[id].banned=false;
  if (!users[id].orders) users[id].orders=[];
  if (username) users[id].username=username;
}

let saveTimer;
function saveAll() {
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    fs.writeFileSync(DB_FILE,JSON.stringify(users,null,2));
    fs.writeFileSync(META_FILE,JSON.stringify(meta,null,2));
  },100);
}

// ================= HELPERS =================
const WEEK_MS = 7*24*60*60*1000;

function checkWeeklyReset() {
  if(Date.now()-meta.weeklyReset>=WEEK_MS){
    for(const id in users) users[id].weeklyXp=0;
    meta.weeklyReset=Date.now();
    saveAll();
  }
}

function isAdmin(id){ return ADMIN_IDS.includes(id); }

function banGuard(id){
  ensureUser(id);
  if(users[id].banned){
    bot.sendMessage(id,'🚫 You are banned from using this bot.');
    return true;
  }
  return false;
}

const COMMANDS_TEXT="📜 *Strains*\n*God Complex* – Dirty Strong Buds\n*Killer Green Budz* – Strong Green Buds";

// ================= CONFIG =================
const PRODUCTS={
  'God Complex':{price:10},
  'Killer Green Budz':{price:10}
};

// ================= XP =================
// Complex XP system: base XP + scaled by order value + optional bonus
function addXP(id, baseXP=2, cash=0) {
  ensureUser(id);
  
  // XP from order value (cash multiplier)
  const orderXP = cash * 0.5; // $1 = 0.5 XP
  // Bonus XP for large orders
  const bonus = cash >= 50 ? 10 : cash >= 20 ? 5 : 0;
  const totalXP = Math.floor(baseXP + orderXP + bonus);
  
  users[id].xp += totalXP;
  users[id].weeklyXp += totalXP;
  
  // Level up
  while(users[id].xp >= users[id].level * 5){
    users[id].xp -= users[id].level * 5;
    users[id].level++;
  }
  
  saveAll();
  return totalXP;
}

// Chat XP (per message)
function addChatXP(id, baseXP=1) {
  ensureUser(id);
  
  users[id].xp += baseXP;
  users[id].weeklyXp += baseXP;
  
  while(users[id].xp >= users[id].level * 5){
    users[id].xp -= users[id].level * 5;
    users[id].level++;
  }
  
  saveAll();
  return baseXP;
}

function xpBar(xp,lvl){
  const max=lvl*5;
  const fill=Math.floor((xp/max)*10);
  return '🟩'.repeat(fill)+'⬜'.repeat(10-fill)+` ${xp}/${max}`;
}

// ================= ASCII =================
const ASCII_MAIN=`
╔═════════╗
║  ROOTTREE
╚═════════╝
V1LE FARM
`;

const ASCII_PROFILE=`
╔═══════════╗
║   YOUR ORDER
╚═══════════╝
PROFILE
`;

const ASCII_LEADERBOARD=`
╔═══════════╗
║  TOP FARMERS
╚═══════════╝
LEADERBOARD
`;

// ================= SESSIONS =================
const sessions={};
const lastAction={};
const RATE_LIMIT_MS=1000;

function isRateLimited(id){
  const now=Date.now();
  if(!lastAction[id]){ lastAction[id]=now; return false; }
  if(now-lastAction[id]<RATE_LIMIT_MS) return true;
  lastAction[id]=now;
  return false;
}

async function sendOrEdit(id,text,opt={}){
  if(!sessions[id]) sessions[id]={};
  const mainMsgId=sessions[id].mainMsgId;
  if(mainMsgId){
    try{ await bot.editMessageText(text,{chat_id:id,message_id:mainMsgId,...opt}); return; }catch{}
  }
  const m=await bot.sendMessage(id,text,opt);
  sessions[id].mainMsgId=m.message_id;
}

// ================= DELETE USER MESSAGES =================
bot.on('message',msg=>{
  const id=msg.chat.id;
  if(!msg.from.is_bot){
    // Give XP for chat messages
    addChatXP(id, 1);
    setTimeout(()=>bot.deleteMessage(id,msg.message_id).catch(()=>{}),3000);
  }
});

// ================= SCROLLABLE LEADERBOARD =================
function getLeaderboardPage(page=0,pageSize=10){
  const sorted=Object.entries(users).filter(([,u])=>!u.banned)
    .sort((a,b)=>b[1].weeklyXp-a[1].weeklyXp);
  const start=page*pageSize;
  const end=start+pageSize;
  const top=sorted.slice(start,end);
  let txt=`${ASCII_LEADERBOARD}\n🏆 *Weekly Top Farmers*\n\n`;
  top.forEach(([uid,u],i)=>{
    const uname=u.username?`@${u.username}`:'User';
    const link=`[${uname}](tg://user?id=${uid})`;
    txt+=`#${start+i+1} — ${link} — Level ${u.level} — XP ${u.weeklyXp}\n`;
  });
  return txt;
}

function getLeaderboardKeyboard(page=0,pageSize=10){
  const totalPages=Math.ceil(Object.keys(users).length/pageSize);
  const kb=[[]];
  if(page>0) kb[0].push({text:'⬅️ Prev',callback_data:`leaderboard_${page-1}`});
  if((page+1)<totalPages) kb[0].push({text:'Next ➡️',callback_data:`leaderboard_${page+1}`});
  return kb.length>0?kb:[];
}

// ================= MAIN MENU =================
async function showMainMenu(id,page=0){
  ensureUser(id);
  sessions[id]=sessions[id]||{};
  sessions[id].step=null;

  const kb=Object.keys(PRODUCTS).map(p=>[{text:`🪴 ${p}`,callback_data:`product_${p}`}]);

  const pendingOrders=users[id].orders;
  const pendingTxt=pendingOrders.length?'📦 *Your Orders:*\n'+
    pendingOrders.map(o=>{
      let statusIcon='⚪';
      if(o.status==='✅ Accepted') statusIcon='🟢';
      else if(o.status==='❌ Rejected') statusIcon='🔴';
      return `${statusIcon} ${o.product} — ${o.grams}g — $${o.cash} — *${o.status}*`;
    }).join('\n')+'\n\n':'';

  await sendOrEdit(id,
`${ASCII_MAIN}
🎚 Level: ${users[id].level}
📊 XP: ${xpBar(users[id].xp,users[id].level)}
${pendingTxt}🛒 Select a product 👇
${COMMANDS_TEXT}

${getLeaderboardPage(page)}`,
  {parse_mode:'Markdown',reply_markup:{inline_keyboard:[...kb,...getLeaderboardKeyboard(page)]}});
}

// ================= PROFILE =================
async function showProfile(id,page=0){
  ensureUser(id);
  const orders=users[id].orders.slice(-10).reverse()
    .map(o=>{
      let statusIcon='⚪';
      if(o.status==='✅ Accepted') statusIcon='🟢';
      else if(o.status==='❌ Rejected') statusIcon='🔴';
      return `${statusIcon} ${o.product} — ${o.grams}g — $${o.cash} — *${o.status}*`;
    }).join('\n')||'_No orders yet_';
  await sendOrEdit(id,
`${ASCII_PROFILE}
🎚 Level: ${users[id].level}
📊 XP: ${xpBar(users[id].xp,users[id].level)}
📦 Recent Orders:
${orders}
${COMMANDS_TEXT}

${getLeaderboardPage(page)}`,
  {parse_mode:'Markdown',reply_markup:{inline_keyboard:[[ {text:'🏠 Back to Menu',callback_data:'back_main'} ],...getLeaderboardKeyboard(page)]}});
}

// ================= START / HELP =================
bot.onText(/\/start|\/help/,msg=>{
  const id=msg.chat.id;
  if(banGuard(id)||isRateLimited(id)) return;
  showMainMenu(id);
});

// ================= CALLBACKS =================
bot.on('callback_query',async q=>{
  const id=q.message.chat.id;
  const username=q.from.username;
  if(banGuard(id)) return;
  ensureUser(id,username);
  if(!sessions[id]) sessions[id]={};
  const s=sessions[id];

  if(q.data==='back_main') return showMainMenu(id);
  if(q.data.startsWith('product_')){ s.product=q.data.replace('product_',''); s.step='amount'; return sendOrEdit(id,`${ASCII_MAIN}\n🌿 *${s.product}*\n▫️ Minimum: 2g\n▫️ Price: $10/g\n✏️ Send grams or $ amount`,{parse_mode:'Markdown'});}
  if(q.data==='confirm_order'){
    const order={...s,status:'Pending',time:Date.now()};
    users[id].orders.push(order);
    saveAll();

    // --- Add XP based on order value ---
    const earnedXP = addXP(id,2,s.cash); // complex XP
    sendOrEdit(id,
      `${ASCII_MAIN}\n🧾 Order Summary\n🌿 ${s.product}\n⚖️ ${s.grams}g\n💲 $${s.cash}\n⭐ You earned ${earnedXP} XP!`);

    if(!s.adminMsgIds) s.adminMsgIds=[];
    for(const adminId of ADMIN_IDS){
      const sentMsg=await bot.sendMessage(adminId,
`
       NEW ORDER RECEIVED        
 User: @${username||id}
 Product: ${order.product}
 Grams: ${order.grams}g
 Price: $${order.cash}
 Status: ⚪ Pending
`,
      {parse_mode:'Markdown',
       reply_markup:{inline_keyboard:[[{text:'✅ Accept',callback_data:`admin_accept_${id}_${users[id].orders.length-1}`},{text:'❌ Reject',callback_data:`admin_reject_${id}_${users[id].orders.length-1}`}]]}});
      s.adminMsgIds.push({adminId,msgId:sentMsg.message_id,orderIndex:users[id].orders.length-1});
    }
    return showMainMenu(id);
  }

  if(q.data.startsWith('leaderboard_')){
    const page=Number(q.data.split('_')[1]);
    return showMainMenu(id,page);
  }

  if(q.data.startsWith('admin_')){
    const [_,action,uid,orderIndex]=q.data.split('_');
    const userId=Number(uid);
    const index=Number(orderIndex);
    ensureUser(userId);
    const order=users[userId].orders[index];
    if(!order||order.status!=='Pending') return;
    order.status=action==='accept'?'✅ Accepted':'❌ Rejected';
    saveAll();
    const uname=users[userId].username||userId;
    const statusIcon=order.status==='✅ Accepted'?'🟢':'🔴';
    const orderASCII=`

       ORDER PROCESSING        
 User: ${uname}
 Product: ${order.product}
 Grams: ${order.grams}g
 Price: $${order.cash}
 Status: ${statusIcon} ${order.status}

`;
    bot.sendMessage(userId,
      order.status==='✅ Accepted'
        ?`✅ Your order for *${order.product}* has been accepted!`
        :`❌ Your order for *${order.product}* has been rejected!`,
      {parse_mode:'Markdown'});
    showMainMenu(userId);

    if(s.adminMsgIds){
      for(const {adminId,msgId} of s.adminMsgIds){
        bot.editMessageText(orderASCII,{chat_id:adminId,message_id:msgId,parse_mode:'Markdown'}).catch(()=>{});
      }
    }
  }
});

// ================= USER INPUT =================
bot.on('message',msg=>{
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
  sendOrEdit(id,
`${ASCII_MAIN}\n🧾 Order Summary\n🌿 ${s.product}\n⚖️ ${grams}g\n💲 $${cash}`,
  {parse_mode:'Markdown',
   reply_markup:{inline_keyboard:[[{text:'✅ Confirm',callback_data:'confirm_order'}],[{text:'🏠 Back to Menu',callback_data:'back_main'}]]}});
});
