require('dotenv').config();
const { Bot } = require('grammy');
const { createWalletClient, http, parseUnits, formatUnits, createPublicClient } = require('viem');
const { privateKeyToAccount, generatePrivateKey } = require('viem/accounts');
const fs = require('fs');
const path = require('path');

// Config
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const MAX_SEND = Number(process.env.MAX_SEND) || 100;
const DAILY_CAP = Number(process.env.DAILY_CAP) || 300;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR) || 5;

if (!BOT_TOKEN) { console.error('BOT_TOKEN not set'); process.exit(1); }

// Arc chain
const arc = {
  id: 5042002, name: 'Arc Testnet', network: 'arc-testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [ARC_RPC] }, public: { http: [ARC_RPC] } },
  blockExplorers: { default: { name: 'Explorer', url: 'https://testnet.explorer.arc.network' } },
  testnet: true,
};

const publicClient = createPublicClient({ chain: arc, transport: http(ARC_RPC) });
const bot = new Bot(BOT_TOKEN);

// Storage
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], transactions: [] }));

function readDB() { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
function writeDB(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }

function getUser(userId) { return readDB().users.find(u => u.userId === userId); }
function getUserByName(uname) { return readDB().users.find(u => u.username.toLowerCase() === uname.toLowerCase()); }

function createUser(userId, username, address, privateKey) {
  const db = readDB();
  const user = { userId, username, address, privateKey, createdAt: new Date().toISOString() };
  db.users.push(user); writeDB(db);
  return user;
}

function ensureUser(userId, username) {
  let u = getUser(userId);
  if (!u) { const w = genWallet(); u = createUser(userId, username, w.address, w.privateKey); }
  return u;
}

function addTx(tx) {
  const db = readDB();
  db.transactions.unshift(tx);
  if (db.transactions.length > 1000) db.transactions = db.transactions.slice(0, 1000);
  writeDB(db);
}

function getUserTxs(userId, limit = 5) {
  return readDB().transactions.filter(t => t.fromUserId === userId).slice(0, limit);
}

function dailyTotal(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return readDB().transactions.filter(t => t.fromUserId === userId && t.timestamp.startsWith(today)).reduce((s, t) => s + parseFloat(t.amount), 0);
}

function hourlyCount(userId) {
  const h = Date.now() - 3600000;
  return readDB().transactions.filter(t => t.fromUserId === userId && new Date(t.timestamp).getTime() > h).length;
}

// Wallet
function genWallet() {
  const pk = generatePrivateKey();
  const acc = privateKeyToAccount(pk);
  return { address: acc.address, privateKey: pk };
}

function createWallet(pk) {
  return createWalletClient({ account: privateKeyToAccount(pk), chain: arc, transport: http(ARC_RPC) });
}

async function getBalance(addr) {
  try { const b = await publicClient.getBalance({ address: addr }); return formatUnits(b, 6); }
  catch { return '0.00'; }
}

async function sendUSDC(fromPK, to, amount) {
  const wallet = createWallet(fromPK);
  return wallet.sendTransaction({ account: privateKeyToAccount(fromPK), to, value: parseUnits(amount, 6) });
}

function fmtAddr(a) { return a.slice(0,6) + '...' + a.slice(-4); }

// Bot commands
bot.command('start', async (ctx) => {
  const uid = ctx.from.id;
  const uname = ctx.from.username || ctx.from.first_name || 'user_' + uid;
  const user = ensureUser(uid, uname);
  const bal = await getBalance(user.address);
  await ctx.reply(
    '👛 *ArcBot — USDC Wallet*\n\n' +
    'Địa chỉ: `' + user.address + '`\n' +
    'Số dư: *' + Number(bal).toFixed(2) + ' USDC*\n\n' +
    '📥 Nạp: gửi USDC vào địa chỉ trên\n' +
    '📤 Gửi: /send @user 50\n' +
    '📊 /history — lịch sử\n\n' +
    '⚠️ Bot giữ private key, max ' + MAX_SEND + ' USDC/lần',
    { parse_mode: 'Markdown' }
  );
});

bot.command('balance', async (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) return ctx.reply('Dùng /start trước.');
  const bal = await getBalance(user.address);
  await ctx.reply('💰 *' + Number(bal).toFixed(2) + ' USDC*\n`' + user.address + '`', { parse_mode: 'Markdown' });
});

bot.command('deposit', async (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) return ctx.reply('Dùng /start trước.');
  await ctx.reply('📥 Nạp USDC vào:\n`' + user.address + '`', { parse_mode: 'Markdown' });
});

bot.command('send', async (ctx) => {
  const fromUser = getUser(ctx.from.id);
  if (!fromUser) return ctx.reply('Dùng /start trước.');

  const args = (ctx.match || '').trim().split(/\s+/);
  if (args.length < 2) return ctx.reply('/send @username 50 hoặc /send 0xADDR 50');

  const [target, amtStr] = args;
  const amount = parseFloat(amtStr);
  if (isNaN(amount) || amount <= 0) return ctx.reply('Số tiền không hợp lệ.');
  if (amount > MAX_SEND) return ctx.reply('⚠️ Max ' + MAX_SEND + ' USDC/lần.');

  const daily = dailyTotal(fromUser.userId);
  if (daily + amount > DAILY_CAP) return ctx.reply('⚠️ Vượt hạn mức ' + DAILY_CAP + ' USDC/ngày. Đã gửi ' + daily.toFixed(2) + ' hôm nay.');

  if (hourlyCount(fromUser.userId) >= RATE_LIMIT) return ctx.reply('⚠️ Quá nhiều giao dịch. Đợi 1 tiếng.');

  let toAddr, toUname;
  if (target.startsWith('0x')) {
    toAddr = target;
  } else if (target.startsWith('@')) {
    const toUser = getUserByName(target.slice(1));
    if (!toUser) return ctx.reply('Không tìm thấy @' + target.slice(1) + '. Họ cần /start trước.');
    toAddr = toUser.address; toUname = toUser.username;
  } else {
    return ctx.reply('Người nhận phải @username hoặc 0x...');
  }

  try {
    const hash = await sendUSDC(fromUser.privateKey, toAddr, amount.toFixed(6));
    addTx({ id: hash.slice(0,10), fromUserId: fromUser.userId, toUsername: toUname, toAddress: toAddr, amount: amount.toFixed(2), txHash: hash, timestamp: new Date().toISOString() });
    const newBal = await getBalance(fromUser.address);
    const toLabel = toUname ? '@' + toUname : fmtAddr(toAddr);
    await ctx.reply(
      '✅ Đã gửi *' + amount.toFixed(2) + ' USDC* → ' + toLabel + '\n' +
      '🔗 [Explorer](https://testnet.explorer.arc.network/tx/' + hash + ')\n' +
      '💰 Còn: *' + Number(newBal).toFixed(2) + ' USDC*',
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  } catch (err) {
    console.error(err);
    await ctx.reply('❌ Lỗi: ' + (err.message || 'Không thể gửi'));
  }
});

bot.command('history', async (ctx) => {
  const user = getUser(ctx.from.id);
  if (!user) return ctx.reply('Dùng /start trước.');
  const txs = getUserTxs(user.userId, 5);
  if (!txs.length) return ctx.reply('Chưa có giao dịch nào.');
  const lines = txs.map(t =>
    '📤 *' + t.amount + ' USDC* → ' + (t.toUsername ? '@' + t.toUsername : fmtAddr(t.toAddress || '')) +
    '\n  [tx](https://testnet.explorer.arc.network/tx/' + t.txHash + ')'
  );
  await ctx.reply('📊 *5 giao dịch gần:*\n\n' + lines.join('\n\n'), { parse_mode: 'Markdown', disable_web_page_preview: true });
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    '🤖 *ArcBot*\n\n' +
    '/start — Tạo ví\n' +
    '/balance — Số dư\n' +
    '/deposit — Địa chỉ nạp\n' +
    '/send @user 50 — Gửi USDC\n' +
    '/history — Lịch sử\n\n' +
    '⚙️ Max ' + MAX_SEND + ' USDC/lần, ' + DAILY_CAP + ' USDC/ngày',
    { parse_mode: 'Markdown' }
  );
});

bot.catch(err => console.error('Bot error:', err));
bot.start({ onStart: () => console.log('🤖 ArcBot started!') });
process.on('SIGINT', () => bot.stop());
process.on('SIGTERM', () => bot.stop());
