require('dotenv').config();
const { createPublicClient, http, formatUnits } = require('viem');
const { Bot } = require('grammy');

// Config
const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ALERT_CHAT_ID = process.env.ALERT_CHAT_ID || ''; // Telegram chat ID nhận alert
const MIN_USDC = Number(process.env.MIN_ALERT_USDC) || 5000; // Ngưỡng alert (USDC)
const POLL_INTERVAL = Number(process.env.POLL_INTERVAL) || 10; // Giây

const arc = {
  id: 5042002, name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
  rpcUrls: { default: { http: [ARC_RPC] } },
  testnet: true,
};

const client = createPublicClient({ chain: arc, transport: http(ARC_RPC) });
const bot = new Bot(BOT_TOKEN);

// Track last processed block
let lastBlock = 0;

function fmtAddr(a) { return a.slice(0, 6) + '...' + a.slice(-4); }

function formatUSD(amount) {
  const num = Number(amount);
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

async function sendAlert(msg) {
  // Gửi đến ALERT_CHAT_ID (nếu có)
  if (ALERT_CHAT_ID) {
    try {
      await bot.api.sendMessage(ALERT_CHAT_ID, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
    } catch (e) { console.error('Alert channel error:', e.message); }
  }

  // Gửi đến tất cả subscribers
  try {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, 'data', 'db.json');
    if (fs.existsSync(dbPath)) {
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      const subs = db.subscribers || [];
      for (const chatId of subs) {
        try {
          await bot.api.sendMessage(chatId, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
        } catch (e) { /* subscriber might have blocked bot */ }
      }
    }
  } catch (e) { console.error('Subscriber broadcast error:', e.message); }
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

        const msg = [
          '🐋 *Whale Alert — Arc Network*',
          '',
          `💰 *${formatUSD(value)} USDC* transferred`,
          '',
          `📤 From: \`${fmtAddr(from)}\``,
          `📥 To: \`${fmtAddr(to)}\``,
          '',
          `🔗 [View Tx](https://testnet.explorer.arc.network/tx/${tx.hash})`,
          `📦 Block: #${blockNum}`,
        ].join('\n');

        console.log(`🐋 ${formatUSD(value)} USDC | #${blockNum} | ${fmtAddr(from)} → ${fmtAddr(to)}`);
        await sendAlert(msg);
      }
    }
  } catch (e) {
    console.error(`Block ${blockNum} error:`, e.message);
  }
}

async function poll() {
  try {
    const currentBlock = Number(await client.getBlockNumber());

    if (lastBlock === 0) {
      lastBlock = currentBlock - 1;
      console.log(`🚀 Monitor started at block #${lastBlock} | Threshold: ${MIN_USDC} USDC`);
    }

    if (currentBlock > lastBlock) {
      const startBlock = lastBlock + 1;
      const endBlock = Math.min(currentBlock, lastBlock + 5); // Max 5 blocks per poll

      for (let b = startBlock; b <= endBlock; b++) {
        await scanBlock(b);
      }

      lastBlock = endBlock;
    }
  } catch (e) {
    console.error('Poll error:', e.message);
  }
}

// Start
async function start() {
  await bot.api.getMe();
  console.log('🤖 Whale Monitor connected to Telegram');

  poll(); // Initial
  setInterval(poll, POLL_INTERVAL * 1000);
}

start().catch(e => { console.error(e); process.exit(1); });
