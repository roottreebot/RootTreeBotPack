// === V1LE FARM BOT FULL VERSION ===
// Mobile-optimized ASCII, fast response, XP, orders, leaderboard
const TelegramBot = require('node-telegram-bot-api');

// Load environment variables
const TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(',').map(Number)
  : [];

if (!TOKEN || ADMIN_IDS.length === 0) {
  console.error('❌ BOT_TOKEN or ADMIN_IDS not set!');
  process.exit(1);
}

// Fast polling for quick response
const bot = new TelegramBot(TOKEN, { polling: { interval: 100, timeout: 10 } });

// In-memory storage for users
const users = new Map(); // userId -> { level, exp, orders }

// XP system
const XP_PER_MESSAGE = 1;
const XP_TO_LEVEL_UP = 100;

// Helper to delete messages safely
const deleteMessage = (chatId, messageId, delay = 2000) => {
  setTimeout(() => bot.deleteMessage(chatId, messageId).catch(() => {}), delay);
};

// Helper to send bot messages and auto-delete
const sendTempMessage = async (chatId, text, delay = 5000, parse_mode = 'HTML') => {
  const msg = await bot.sendMessage(chatId, text, { parse_mode });
  deleteMessage(chatId, msg.message_id, delay);
  return msg;
};

// Leaderboard
const getLeaderboard = () => {
  const arr = Array.from(users.entries())
    .sort((a, b) => b[1].level - a[1].level || b[1].exp - a[1].exp)
    .slice(0, 10);
  let text = '🏆 <b>Top 10 Users</b>\n\n';
  arr.forEach(([id, u], i) => {
    text += `${i + 1}. User ${id} - Level ${u.level} (${u.exp} XP)\n`;
  });
  return text;
};

// Mobile-friendly ASCII recipe/order menu
const getRecipeMenu = () => {
  return `
╔═════════════════╗
║   V1LE FARM 🍀   ║
╠═════════════════╣
║ $1   -> Item A  ║
║ $5   -> Item B  ║
║ $10  -> Item C  ║
║ $50  -> Item D  ║
╠═════════════════╣
║ Use $<amount>   ║
║ to place order! ║
╚═════════════════╝
`;
};

// Handle all messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Ignore bots
  if (msg.from.is_bot) return;

  // Initialize user data
  if (!users.has(userId)) {
    users.set(userId, { level: 1, exp: 0, orders: [] });
  }
  const user = users.get(userId);

  // Add XP
  user.exp += XP_PER_MESSAGE;
  if (user.exp >= XP_TO_LEVEL_UP) {
    user.level += 1;
    user.exp = 0;
    await sendTempMessage(chatId, `🎉 Congrats <b>${msg.from.first_name}</b>, you reached level ${user.level}!`);
  }

  // Handle order input
  if (msg.text && msg.text.startsWith('$')) {
    const value = msg.text.slice(1).trim();
    if (!value || isNaN(value)) {
      await sendTempMessage(chatId, `❌ Invalid input. Enter a number after $`);
    } else {
      user.orders.push({ value: Number(value), date: new Date() });
      await sendTempMessage(chatId, `✅ Order received: $${value}`);
    }
  }

  // Show leaderboard command
  if (msg.text && msg.text.toLowerCase() === '!leaderboard') {
    const lb = getLeaderboard();
    await sendTempMessage(chatId, lb, 10000); // show leaderboard for 10s
  }

  // Show recipe/menu command
  if (msg.text && msg.text.toLowerCase() === '!menu') {
    const menu = getRecipeMenu();
    await sendTempMessage(chatId, menu, 10000);
  }

  // Delete user message after 2 seconds
  deleteMessage(chatId, msg.message_id, 2000);
});

// Admin broadcast
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const userId = msg.from.id;
  if (!ADMIN_IDS.includes(userId)) return;
  const text = match[1];
  for (const [uid] of users) {
    await sendTempMessage(uid, `📢 Admin broadcast:\n${text}`);
  }
});

// Admin clear all orders
bot.onText(/\/clear_orders/, async (msg) => {
  const userId = msg.from.id;
  if (!ADMIN_IDS.includes(userId)) return;
  users.forEach(u => (u.orders = []));
  for (const [uid] of users) {
    await sendTempMessage(uid, '🗑️ All orders have been cleared by admin');
  }
});

// Error handling
bot.on('polling_error', (err) => console.error('Polling error:', err));
bot.on('error', (err) => console.error('Bot error:', err));

console.log('✅ V1LE FARM BOT FULL VERSION is running...');
