require('dotenv').config();
const { createPublicClient, http, formatUnits } = require('viem');
const { Bot } = require('grammy');
const fs = require('fs');
const path = require('path');

// Config
const ARC_RPC = process.env.ARC_RPC || 'https://rpc.testnet.arc.network';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const SWAP_MIN = Number(process.env.SWAP_MIN_USDC) || 500;
const TRANSFER_MIN = Number(process.env.TRANSFER_MIN_USDC) || 100000;
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

async function isContract(address) {
  if (!address || address === '0x0000000000000000000000000000000000000000') return false;
  try {
    const code = await client.getBytecode({ address });
    return code && code !== '0x';
  } catch {
    return false;
  }
}

async function scanBlock(blockNum) {
  try {
    const block = await client.getBlock({ blockNumber: BigInt(blockNum), includeTransactions: true });

    for (const tx of block.transactions) {
      const valueNum = parseFloat(formatUnits(tx.value, 6));
      if (valueNum <= 0) continue;

      const from = tx.from;
      const to = tx.to || '0x0000000000000000000000000000000000000000';

      // Check if this is a swap (to is a contract)
      const toIsContract = await isContract(to);
      let label, emoji, minThreshold;

      if (toIsContract) {
        // Likely DEX/protocol interaction → swap
        minThreshold = SWAP_MIN;
        label = '🔄 Swap';
        emoji = '🔄';
      } else {
        // Direct transfer
        minThreshold = TRANSFER_MIN;
        label = '🐳 Whale Transfer';
        emoji = '💰';
      }

      if (valueNum >= minThreshold) {
        const typeTag = toIsContract ? 'Swap → Contract' : 'Transfer';

        const msg = [
          emoji + ' *' + label + ' — Arc Network*',
          '',
          '💰 *' + formatUSD(value) + ' USDC*',
          '📋 Type: ' + typeTag,
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
      console.log('🐋 Monitor started at block #' + lastBlock);
      console.log('   Swap alert: > ' + SWAP_MIN + ' USDC');
      console.log('   Transfer alert: > ' + (TRANSFER_MIN / 1000).toFixed(0) + 'K USDC');
    }

    if (currentBlock > lastBlock) {
      const startBlock = lastBlock + 1;
      const endBlock = Math.min(currentBlock, lastBlock + 3);

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
