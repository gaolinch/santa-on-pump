#!/usr/bin/env tsx
/**
 * Check transaction status for a specific day
 * Shows which transactions were sent and which are missing
 */

import { giftExecRepo } from '../../database';

async function checkTransactionStatus(day: number) {
  console.log(`🔍 Checking transaction status for Day ${day}\n`);

  const executions = await giftExecRepo.findByDay(day);
  
  if (executions.length === 0) {
    console.log('❌ No execution found for this day');
    return;
  }

  const execution = executions[0];
  const winners = typeof execution.winners === 'string' 
    ? JSON.parse(execution.winners) 
    : execution.winners;

  const totalWinners = winners.length;
  const batchSize = 5;
  const totalTransactions = Math.ceil(totalWinners / batchSize);

  console.log(`📊 Total winners: ${totalWinners}`);
  console.log(`📊 Total transactions needed: ${totalTransactions}\n`);

  const txHashes = execution.tx_hashes || [];
  console.log(`📋 Transaction signatures in database: ${txHashes.length}\n`);

  // Show status for each transaction
  for (let i = 0; i < totalTransactions; i++) {
    const startIdx = i * batchSize;
    const endIdx = Math.min(startIdx + batchSize, totalWinners);
    const txWinners = winners.slice(startIdx, endIdx);
    const txAmount = txWinners.reduce((sum: bigint, w: any) => {
      const amount = typeof w.amount === 'string' ? BigInt(w.amount) : BigInt(w.amount);
      return sum + amount;
    }, BigInt(0));

    const signature = txHashes[i];
    const status = signature ? '✅ SENT' : '❌ MISSING';
    
    console.log(`Transaction ${i + 1}/${totalTransactions}: ${status}`);
    console.log(`   Recipients: ${txWinners.length}`);
    console.log(`   Amount: ${(Number(txAmount) / 1e9).toFixed(9)} SOL`);
    if (signature) {
      console.log(`   Signature: ${signature}`);
      console.log(`   View: https://solscan.io/tx/${signature}`);
    } else {
      console.log(`   Status: Not sent`);
    }
    console.log('');
  }

  // Summary
  const sentCount = txHashes.filter(Boolean).length;
  const missingCount = totalTransactions - sentCount;
  
  console.log('='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Sent: ${sentCount}/${totalTransactions}`);
  console.log(`❌ Missing: ${missingCount}/${totalTransactions}`);
  
  if (missingCount > 0) {
    const missingIndices: number[] = [];
    for (let i = 0; i < totalTransactions; i++) {
      if (!txHashes[i]) {
        missingIndices.push(i + 1);
      }
    }
    console.log(`\n❌ Missing transactions: ${missingIndices.join(', ')}`);
    console.log(`\n💡 To retry missing transactions, run:`);
    console.log(`   npx tsx src/scripts/transactions/process-individual-transactions.ts ${day} ${missingIndices.join(' ')}`);
  } else {
    console.log(`\n✅ All transactions have been sent!`);
  }
}

// Main
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: npx tsx src/scripts/execution/check-transaction-status.ts <day>');
  process.exit(1);
}

const day = parseInt(args[0], 10);
if (isNaN(day) || day < 1 || day > 24) {
  console.error('❌ Invalid day. Must be between 1 and 24');
  process.exit(1);
}

checkTransactionStatus(day)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });

