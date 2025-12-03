#!/usr/bin/env tsx

/**
 * Monitor WebSocket Transactions - Display FULL transaction objects
 * 
 * This script connects to the WebSocket and displays COMPLETE transaction
 * objects as they arrive in real-time, with beautiful formatting.
 * 
 * Usage:
 *   npx tsx src/scripts/monitor-websocket-transactions.ts
 */

import '../config/index';
import WebSocket from 'ws';
import { config } from '../../config/index';
import { solanaService } from '../../services/solana';
import util from 'util';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function printHeader(text: string) {
  console.log('\n' + '='.repeat(80));
  console.log(`${colors.bright}${colors.cyan}${text}${colors.reset}`);
  console.log('='.repeat(80) + '\n');
}

function printSection(title: string) {
  console.log(`\n${colors.bright}${colors.yellow}━━━ ${title} ━━━${colors.reset}\n`);
}

function formatObject(obj: any, depth: number = 10): string {
  return util.inspect(obj, {
    depth,
    colors: true,
    maxArrayLength: 100,
    breakLength: 100,
    compact: false
  });
}

async function monitorWebSocket() {
  if (!config.websocket.enabled) {
    console.log('❌ WebSocket is disabled in configuration');
    return;
  }

  if (!config.websocket.heliusApiKey) {
    console.log('❌ HELIUS_API_KEY is required');
    return;
  }

  console.log('\n' + '█'.repeat(80));
  console.log(`${colors.bright}${colors.green}     WEBSOCKET TRANSACTION MONITOR - FULL OBJECTS${colors.reset}`);
  console.log('█'.repeat(80));
  console.log(`\n${colors.cyan}📡 Connecting to Helius WebSocket...${colors.reset}`);
  console.log(`${colors.cyan}🎯 Target: ${config.solana.pumpFunToken || config.solana.pumpFunProgram}${colors.reset}`);
  console.log(`${colors.cyan}🌐 Network: ${config.solana.network}${colors.reset}\n`);

  const network = config.solana.network === 'mainnet-beta' ? 'mainnet' : 'devnet';
  const wsUrl = `wss://${network}.helius-rpc.com/?api-key=${config.websocket.heliusApiKey}`;
  
  const ws = new WebSocket(wsUrl);
  let transactionCount = 0;

  ws.on('open', () => {
    console.log(`${colors.green}✅ WebSocket Connected!${colors.reset}\n`);
    console.log(`${colors.yellow}⏳ Waiting for transactions...${colors.reset}\n`);

    // Subscribe to transactions
    const monitorAllPumpFun = process.env.MONITOR_ALL_PUMPFUN === 'true';
    const targetAddress = monitorAllPumpFun 
      ? config.solana.pumpFunProgram 
      : config.solana.pumpFunToken;

    const logsRequest = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "logsSubscribe",
      params: [
        {
          mentions: [targetAddress]
        },
        {
          commitment: config.websocket.commitment || "confirmed"
        }
      ]
    };

    ws.send(JSON.stringify(logsRequest));
  });

  ws.on('message', async (data: Buffer) => {
    try {
      const message = JSON.parse(data.toString('utf8'));

      // Subscription confirmation
      if (message.result && typeof message.result === 'number' && !message.method) {
        console.log(`${colors.green}✅ Subscription confirmed (ID: ${message.result})${colors.reset}\n`);
        console.log(`${colors.bright}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
        return;
      }

      // Log notification
      if (message.method === 'logsNotification') {
        transactionCount++;
        const { result, subscription } = message.params;
        const { signature, err, logs } = result.value;

        printHeader(`TRANSACTION #${transactionCount} - ${new Date().toLocaleString()}`);

        // ============================================================
        // 1. RAW WEBSOCKET NOTIFICATION
        // ============================================================
        printSection('1️⃣  RAW WEBSOCKET NOTIFICATION');
        console.log(formatObject(message.params));

        // Skip if transaction failed
        if (err) {
          console.log(`\n${colors.red}❌ Transaction FAILED - Skipping${colors.reset}`);
          console.log(formatObject(err));
          console.log(`\n${colors.bright}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
          return;
        }

        // ============================================================
        // 2. FULL TRANSACTION FROM RPC
        // ============================================================
        printSection('2️⃣  FETCHING FULL TRANSACTION FROM RPC');
        console.log(`${colors.cyan}Signature: ${signature}${colors.reset}`);
        console.log(`${colors.cyan}Fetching...${colors.reset}\n`);

        const transaction = await solanaService.getTransaction(signature);

        if (!transaction) {
          console.log(`${colors.red}❌ Could not fetch transaction from RPC${colors.reset}`);
          console.log(`\n${colors.bright}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
          return;
        }

        printSection('3️⃣  COMPLETE TRANSACTION OBJECT');
        
        // Convert BigInts to strings for display
        const serializedTx = JSON.parse(JSON.stringify(transaction, (key, value) =>
          typeof value === 'bigint' ? value.toString() + 'n' : value
        ));
        
        console.log(formatObject(serializedTx));

        // ============================================================
        // 4. KEY FIELDS SUMMARY
        // ============================================================
        printSection('4️⃣  KEY FIELDS SUMMARY');
        
        console.log(`${colors.green}Signature:${colors.reset}        ${signature}`);
        console.log(`${colors.green}Slot:${colors.reset}             ${transaction.slot}`);
        console.log(`${colors.green}Block Time:${colors.reset}       ${transaction.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : 'N/A'}`);
        console.log(`${colors.green}Fee:${colors.reset}              ${transaction.meta?.fee ? (transaction.meta.fee).toLocaleString() + ' lamports (' + (transaction.meta.fee / 1e9).toFixed(9) + ' SOL)' : 'N/A'}`);
        console.log(`${colors.green}Compute Units:${colors.reset}    ${transaction.meta?.computeUnitsConsumed || 'N/A'}`);
        console.log(`${colors.green}Status:${colors.reset}           ${transaction.meta?.err ? '❌ Failed' : '✅ Success'}`);
        console.log(`${colors.green}Instructions:${colors.reset}     ${transaction.transaction.message.instructions.length}`);
        console.log(`${colors.green}Accounts:${colors.reset}         ${transaction.transaction.message.accountKeys.length}`);
        console.log(`${colors.green}Signatures:${colors.reset}       ${transaction.transaction.signatures.length}`);

        // Token balances summary
        if (transaction.meta?.preTokenBalances && transaction.meta?.postTokenBalances) {
          console.log(`${colors.green}Token Changes:${colors.reset}    ${transaction.meta.postTokenBalances.length} accounts`);
          
          const uniqueMints = new Set<string>();
          transaction.meta.postTokenBalances.forEach(b => uniqueMints.add(b.mint));
          transaction.meta.preTokenBalances?.forEach(b => uniqueMints.add(b.mint));
          
          console.log(`${colors.green}Token Mints:${colors.reset}      ${uniqueMints.size} unique`);
          uniqueMints.forEach(mint => {
            console.log(`  - ${mint}`);
          });
        }

        // Log messages summary
        if (transaction.meta?.logMessages) {
          console.log(`${colors.green}Log Messages:${colors.reset}     ${transaction.meta.logMessages.length} lines`);
          console.log(`\n${colors.yellow}First 5 log lines:${colors.reset}`);
          transaction.meta.logMessages.slice(0, 5).forEach((log, idx) => {
            console.log(`  ${idx + 1}. ${log}`);
          });
          if (transaction.meta.logMessages.length > 5) {
            console.log(`  ... and ${transaction.meta.logMessages.length - 5} more`);
          }
        }

        // ============================================================
        // 5. PARSED TOKEN TRANSFER
        // ============================================================
        printSection('5️⃣  PARSED TOKEN TRANSFER (Our Logic)');
        
        const transfer = solanaService.parseTokenTransfer(transaction, signature);
        
        if (transfer) {
          console.log(formatObject({
            from: transfer.from,
            to: transfer.to,
            amount: transfer.amount.toString() + ' (raw)',
            amountFormatted: (Number(transfer.amount) / 1e9).toFixed(9) + ' tokens',
            kind: transfer.kind
          }));
        } else {
          console.log(`${colors.red}No token transfer detected${colors.reset}`);
        }

        console.log(`\n${colors.bright}${colors.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
      }

      // Error response
      if (message.error) {
        console.log(`\n${colors.red}❌ WebSocket Error:${colors.reset}`);
        console.log(formatObject(message.error));
      }

    } catch (error) {
      console.error(`${colors.red}Error parsing message:${colors.reset}`, error);
    }
  });

  ws.on('error', (error: Error) => {
    console.error(`\n${colors.red}❌ WebSocket Error:${colors.reset}`, error.message);
  });

  ws.on('close', (code: number, reason: Buffer) => {
    console.log(`\n${colors.yellow}WebSocket closed${colors.reset}`);
    console.log(`Code: ${code}`);
    console.log(`Reason: ${reason.toString()}`);
    console.log(`Total transactions received: ${transactionCount}`);
  });

  // Keep process alive
  process.on('SIGINT', () => {
    console.log(`\n\n${colors.yellow}Shutting down...${colors.reset}`);
    console.log(`Total transactions received: ${transactionCount}`);
    ws.close();
    process.exit(0);
  });
}

console.log(`
${colors.bright}╔════════════════════════════════════════════════════════════════════╗
║                                                                    ║
║          🎯 WebSocket Transaction Monitor - FULL OBJECTS 🎯         ║
║                                                                    ║
║  This will display COMPLETE transaction objects as they arrive    ║
║  Press Ctrl+C to stop                                             ║
║                                                                    ║
╚════════════════════════════════════════════════════════════════════╝${colors.reset}
`);

monitorWebSocket().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});

