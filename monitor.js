require('dotenv').config();
const { createPublicClient, http, formatUnits } = require('viem');
const { Bot } = require('grammy');
const fs = require('fs');
const path = require('path');

// Config
const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const MIN_USDC = Number(process.env.MIN_ALERT_USDC) || 5000;
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL) || 10;

const arc = {
  id: 5042002, name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [ARC_RPC] } },
  testnet: true,
};

const client = createPublicClient({ chain: arc, transport: http(ARC_RPC) });
const bot = new Bot(BOT_TOKEN);
const DB_PATH = path.join(__dirname, 'data', 'db.json');

let lastBlock = 0;

function fmtAddr(a) { return a.slice(0, 6) + '...' + a.slice(-4); }

function formatUSD(amount) {
  const num = Number(amount);
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

function getSubscribers() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
      return db.subscribers || [];
    }
  } catch {}
  return [];
}

async function broadcast(msg) {
  const subs = getSubscribers();
  for (const chatId of subs) {
    try {
      await bot.api.sendMessage(chatId, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } catch {}
  }
}

async function scanBlock(blockNum) {
  try {
    const block = await client.getBlock({ blockNumber: BigInt(blockNum), includeTransactions: true });

    for (const tx of block.transactions) {
      const value = formatUnits(tx.value, 6);
      const valueNum = parseFloat(value);

      if (valueNum >= MIN_USDC) {
        const from = tx.from;
        const to = tx.to || '0x0000000000000000000000000000000000000000';

        // Phân loại giao dịch
        const isContract = to && to.length === 42 && !tx.to;
        const label = valueNum >= 100000 ? '🐳 Whale' : '🐋 Large';

        const msg = [
          label + ' *Alert — Arc Network*',
          '',
          '💰 *' + formatUSD(value) + ' USDC* transferred',
          '',
          '📤 From: `' + fmtAddr(from) + '`',
          '📥 To: `' + fmtAddr(to) + '`',
          '',
          '🔗 [View Tx](https://testnet.explorer.arc.network/tx/' + tx.hash + ')',
          '📦 Block: #' + blockNum,
        ].join('\n');

        console.log(label + ' ' + formatUSD(value) + ' USDC | #' + blockNum + ' | ' + fmtAddr(from) + ' → ' + fmtAddr(to));
        await broadcast(msg);
      }
    }
  } catch (e) {
    console.error('Block ' + blockNum + ' error:', e.message);
  }
}

async function poll() {
  try {
    const currentBlock = Number(await client.getBlockNumber());

    if (lastBlock === 0) {
      lastBlock = currentBlock - 1;
      console.log('🐋 Monitor started at block #' + lastBlock + ' | Threshold: ' + MIN_USDC + ' USDC');
    }

    if (currentBlock > lastBlock) {
      const startBlock = lastBlock + 1;
      const endBlock = Math.min(currentBlock, lastBlock + 5);

      for (let b = startBlock; b <= endBlock; b++) {
        await scanBlock(b);
      }

      lastBlock = endBlock;
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
}

async function start() {
  await bot.api.getMe();
  console.log('🐋 ArcWhale monitor connected');
  poll();
  setInterval(poll, POLL_INTERVAL * 1000);
}

start().catch(e => { console.error(e); process.exit(1); });
