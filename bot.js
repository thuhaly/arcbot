require('dotenv').config();
const { Bot } = require('grammy');
const fs = require('fs');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MIN_USDC = process.env.MIN_ALERT_USDC || 5000;

if (!BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }

const bot = new Bot(BOT_TOKEN);

// Storage
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ subscribers: [] }));

function readDB() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function writeDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function addSubscriber(chatId) {
  const db = readDB();
  if (!db.subscribers) db.subscribers = [];
  if (!db.subscribers.includes(chatId)) { db.subscribers.push(chatId); writeDB(db); return true; }
  return false;
}
function removeSubscriber(chatId) {
  const db = readDB();
  if (!db.subscribers) db.subscribers = [];
  const idx = db.subscribers.indexOf(chatId);
  if (idx >= 0) { db.subscribers.splice(idx, 1); writeDB(db); return true; }
  return false;
}
function getSubscribers() { return (readDB().subscribers || []); }

// Commands
bot.command('start', async (ctx) => {
  await ctx.reply(
    '🐋 *ArcWhale — Whale Alert Bot*\n\n' +
    'Theo dõi giao dịch USDC lớn trên Arc Network.\n\n' +
    'Ngưỡng alert: *' + MIN_USDC + ' USDC*\n\n' +
    '/sub — Đăng ký nhận alert\n' +
    '/unsub — Hủy đăng ký\n' +
    '/status — Xem trạng thái\n' +
    '/help — Hướng dẫn',
    { parse_mode: 'Markdown' }
  );
});

bot.command('sub', async (ctx) => {
  if (addSubscriber(ctx.chat.id)) {
    await ctx.reply('✅ Đã đăng ký whale alert! Sẽ báo khi có giao dịch > ' + MIN_USDC + ' USDC trên Arc.');
  } else {
    await ctx.reply('Bạn đã đăng ký rồi. /unsub để hủy.');
  }
});

bot.command('unsub', async (ctx) => {
  if (removeSubscriber(ctx.chat.id)) {
    await ctx.reply('Đã hủy whale alert.');
  } else {
    await ctx.reply('Bạn chưa đăng ký.');
  }
});

bot.command('status', async (ctx) => {
  const subs = getSubscribers();
  const isSubbed = subs.includes(ctx.chat.id);
  await ctx.reply(
    '🐋 *ArcWhale Status*\n\n' +
    'Ngưỡng: *' + MIN_USDC + ' USDC*\n' +
    'Trạng thái: ' + (isSubbed ? '🟢 Đang theo dõi' : '⚪ Chưa đăng ký') + '\n' +
    'Tổng subscribers: ' + subs.length,
    { parse_mode: 'Markdown' }
  );
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    '🐋 *ArcWhale Commands*\n\n' +
    '/start — Giới thiệu\n' +
    '/sub — Đăng ký whale alert\n' +
    '/unsub — Hủy whale alert\n' +
    '/status — Trạng thái\n\n' +
    'Bot quét Arc Network mỗi 10s, báo khi có giao dịch > ' + MIN_USDC + ' USDC.',
    { parse_mode: 'Markdown' }
  );
});

bot.catch(err => console.error('Bot error:', err));
bot.start({ onStart: () => console.log('🐋 ArcWhale started!') });
process.on('SIGINT', () => bot.stop());
process.on('SIGTERM', () => bot.stop());
