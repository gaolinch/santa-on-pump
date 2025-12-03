#!/usr/bin/env tsx
/**
 * Process individual transactions for gift execution
 * 
 * This script allows you to:
 * - Retry failed transactions by index
 * - Process specific transaction indices
 * - Rebuild transactions with fresh blockhashes to avoid expiration
 * - Continue from where a previous execution left off
 */

import { Connection, Keypair, Transaction, sendAndConfirmTransaction, SystemProgram, PublicKey } from '@solana/web3.js';
import * as bs58 from 'bs58';
import { config } from '../../config';
import { solanaService } from '../../services/solana';
import { transactionBuilder } from '../../services/transaction-builder';
import { db, giftExecRepo, giftSpecRepo } from '../../database';
import { Winner } from '../../services/gifts';

interface TransactionInfo {
  index: number;
  winners: Winner[];
  amount: bigint;
}

/**
 * Load winners from database for a specific day
 */
async function loadWinnersFromDatabase(day: number): Promise<Winner[]> {
  const executions = await giftExecRepo.findByDay(day);
  if (!executions || executions.length === 0) {
    throw new Error(`No execution found for day ${day}`);
  }

  // Get the most recent execution
  const execution = executions[0];
  if (!execution.winners) {
    throw new Error(`No winners found in execution for day ${day}`);
  }

  const winners = typeof execution.winners === 'string' 
    ? JSON.parse(execution.winners) 
    : execution.winners;

  return winners.map((w: any) => ({
    wallet: w.wallet,
    amount: typeof w.amount === 'string' ? BigInt(w.amount) : BigInt(w.amount),
    reason: w.reason || 'gift_winner',
    ...(w.balance !== undefined && { balance: typeof w.balance === 'string' ? BigInt(w.balance) : BigInt(w.balance) }),
  }));
}

/**
 * Rebuild a single transaction with fresh blockhash
 */
async function rebuildTransaction(
  winners: Winner[],
  treasuryKeypair: Keypair,
  connection: Connection
): Promise<Transaction> {
  const transaction = new Transaction();
  
  // Get fresh blockhash
  const { blockhash } = await connection.getLatestBlockhash('finalized');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = treasuryKeypair.publicKey;

  // Add transfer instructions for each winner
  for (const winner of winners) {
    const recipientPubkey = new PublicKey(winner.wallet);
    const amount = winner.amount;

    const transferInstruction = SystemProgram.transfer({
      fromPubkey: treasuryKeypair.publicKey,
      toPubkey: recipientPubkey,
      lamports: Number(amount),
    });

    transaction.add(transferInstruction);
  }

  return transaction;
}

/**
 * Process a single transaction by index
 */
async function processSingleTransaction(
  day: number,
  transactionIndex: number,
  winners: Winner[],
  treasuryKeypair: Keypair,
  connection: Connection,
  batchSize: number = 5
): Promise<string | null> {
  const startIdx = transactionIndex * batchSize;
  const endIdx = Math.min(startIdx + batchSize, winners.length);
  const txWinners = winners.slice(startIdx, endIdx);
  const txAmount = txWinners.reduce((sum, w) => sum + w.amount, BigInt(0));

  console.log(`\n📤 Processing Transaction ${transactionIndex + 1}:`);
  console.log(`   Recipients: ${txWinners.length}`);
  console.log(`   Amount: ${(Number(txAmount) / 1e9).toFixed(9)} SOL`);
  console.log(`   Recipients:`);
  txWinners.forEach((w, idx) => {
    console.log(`     ${idx + 1}. ${w.wallet} - ${(Number(w.amount) / 1e9).toFixed(9)} SOL`);
  });

  try {
    // Rebuild transaction with fresh blockhash
    console.log(`\n🔄 Rebuilding transaction with fresh blockhash...`);
    const transaction = await rebuildTransaction(txWinners, treasuryKeypair, connection);

    console.log(`\n🚀 Sending transaction ${transactionIndex + 1}...`);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [treasuryKeypair],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    console.log(`✅ Transaction ${transactionIndex + 1} confirmed!`);
    console.log(`   Signature: ${signature}`);
    console.log(`   View: https://solscan.io/tx/${signature}\n`);

    return signature;
  } catch (error) {
    console.error(`\n❌ Transaction ${transactionIndex + 1} failed:`);
    console.error(`   Error: ${(error as Error).message}\n`);
    return null;
  }
}

/**
 * Process multiple transactions by indices
 */
async function processTransactions(
  day: number,
  indices: number[],
  skipExisting: boolean = true
): Promise<void> {
  console.log(`🎁 Processing transactions for Day ${day}\n`);

  // Load treasury keypair
  if (!config.santa.treasuryPrivateKey) {
    throw new Error('SANTA_TREASURY_PRIVATE_KEY not configured');
  }

  const privateKeyBytes = bs58.decode(config.santa.treasuryPrivateKey);
  const treasuryKeypair = Keypair.fromSecretKey(privateKeyBytes);
  const connection = await solanaService.getConnection();

  // Check treasury balance
  const treasuryBalance = await connection.getBalance(treasuryKeypair.publicKey);
  const treasuryBalanceSOL = treasuryBalance / 1e9;
  console.log(`💰 Treasury Balance: ${treasuryBalanceSOL.toFixed(9)} SOL\n`);

  // Load winners from database
  console.log('📦 Loading winners from database...');
  const winners = await loadWinnersFromDatabase(day);
  console.log(`✅ Loaded ${winners.length} winners\n`);

  // Check existing execution for already sent transactions
  const executions = await giftExecRepo.findByDay(day);
  const execution = executions.length > 0 ? executions[0] : null;
  const existingSignatures = execution?.tx_hashes || [];
  console.log(`📋 Found ${existingSignatures.length} existing transaction signatures\n`);

  // Calculate total transactions needed
  const batchSize = 5;
  const totalTransactions = Math.ceil(winners.length / batchSize);
  console.log(`📊 Total transactions needed: ${totalTransactions}`);
  console.log(`📊 Processing indices: ${indices.join(', ')}\n`);

  const signatures: string[] = [];
  const failedIndices: number[] = [];

  // Process each requested transaction index
  for (const index of indices) {
    if (index < 0 || index >= totalTransactions) {
      console.warn(`⚠️  Invalid transaction index ${index + 1} (valid range: 1-${totalTransactions})`);
      continue;
    }

    // Check if already sent (if skipExisting is true)
    if (skipExisting && existingSignatures[index]) {
      console.log(`⏭️  Transaction ${index + 1} already sent: ${existingSignatures[index]}`);
      signatures.push(existingSignatures[index]);
      continue;
    }

    const signature = await processSingleTransaction(
      day,
      index,
      winners,
      treasuryKeypair,
      connection,
      batchSize
    );

    if (signature) {
      signatures.push(signature);
    } else {
      failedIndices.push(index);
    }

    // Small delay between transactions
    if (index < indices[indices.length - 1]) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Successful: ${signatures.length}`);
  console.log(`❌ Failed: ${failedIndices.length}`);
  
  if (signatures.length > 0) {
    console.log('\n✅ Successful Signatures:');
    signatures.forEach((sig, idx) => {
      const txIndex = indices[idx];
      console.log(`   Transaction ${txIndex + 1}: ${sig}`);
      console.log(`   View: https://solscan.io/tx/${sig}`);
    });
  }

  if (failedIndices.length > 0) {
    console.log('\n❌ Failed Transaction Indices:');
    failedIndices.forEach(idx => {
      console.log(`   Transaction ${idx + 1}`);
    });
    console.log('\n💡 Retry failed transactions by running:');
    console.log(`   npx tsx src/scripts/process-individual-transactions.ts ${day} ${failedIndices.map(i => i + 1).join(' ')}`);
  }

  // Update database if we have new signatures
  if (signatures.length > 0 && execution) {
    const allSignatures = [...existingSignatures];
    indices.forEach((idx, sigIdx) => {
      if (signatures[sigIdx]) {
        allSignatures[idx] = signatures[sigIdx];
      }
    });

    // Update execution record directly
    await db.query(
      `UPDATE gift_exec SET tx_hashes = $1 WHERE id = $2`,
      [allSignatures.filter(Boolean), execution.id]
    );

    console.log(`\n✅ Updated execution record with ${allSignatures.filter(Boolean).length} transaction signatures`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: npx tsx src/scripts/process-individual-transactions.ts <day> [transaction_indices...]');
    console.log('');
    console.log('Examples:');
    console.log('  # Process transaction 2 (index 1) for day 1:');
    console.log('  npx tsx src/scripts/process-individual-transactions.ts 1 2');
    console.log('');
    console.log('  # Process transactions 2, 4, and 6 for day 1:');
    console.log('  npx tsx src/scripts/process-individual-transactions.ts 1 2 4 6');
    console.log('');
    console.log('  # Process all transactions for day 1:');
    console.log('  npx tsx src/scripts/process-individual-transactions.ts 1 all');
    process.exit(1);
  }

  const day = parseInt(args[0], 10);
  if (isNaN(day) || day < 1 || day > 24) {
    console.error('❌ Invalid day. Must be between 1 and 24');
    process.exit(1);
  }

  let indices: number[];
  if (args.length === 1) {
    // If only day provided, default to "all" transactions
    console.log('ℹ️  No transaction indices provided, processing all transactions...\n');
    const winners = await loadWinnersFromDatabase(day);
    const batchSize = 5;
    const totalTransactions = Math.ceil(winners.length / batchSize);
    indices = Array.from({ length: totalTransactions }, (_, i) => i);
  } else if (args[1] === 'all') {
    // Load winners to calculate total transactions
    const winners = await loadWinnersFromDatabase(day);
    const batchSize = 5;
    const totalTransactions = Math.ceil(winners.length / batchSize);
    indices = Array.from({ length: totalTransactions }, (_, i) => i);
  } else {
    // Convert 1-based indices to 0-based
    indices = args.slice(1).map(arg => parseInt(arg, 10) - 1).filter(idx => !isNaN(idx));
  }

  if (indices.length === 0) {
    console.error('❌ No valid transaction indices provided');
    console.error('💡 Usage: npx tsx src/scripts/process-individual-transactions.ts <day> [transaction_indices...]');
    console.error('💡 Example: npx tsx src/scripts/process-individual-transactions.ts 1 2 4 6');
    process.exit(1);
  }

  try {
    await processTransactions(day, indices);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

main();

