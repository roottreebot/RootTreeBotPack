module.exports = {
  apps: [{
    name: 'v1lefarmbot',
    script: './bot.js',
    env: {
      BOT_TOKEN: process.env.BOT_TOKEN,
      ADMIN_IDS: process.env.ADMIN_IDS
    }
  }]
};
