#!/usr/bin/env tsx
/**
 * Interactive Gift Execution Script
 * 
 * Executes gift distribution step by step with confirmation prompts
 * before sending transactions
 * 
 * Usage:
 *   npm run execute:gift -- --day 1
 *   npm run execute:gift -- --day 1 --date 2024-12-01
 *   npm run execute:gift -- --day 1 --dry-run
 */

import * as readline from 'readline';
import { db, dayPoolRepo, txRawRepo, giftSpecRepo, giftExecRepo, auditLogRepo, holderSnapshotRepo } from '../../database';
import { solanaService } from '../../services/solana';
import { giftEngine } from '../../services/gifts';
import { transactionBuilder } from '../../services/transaction-builder';
import { logger } from '../../utils/logger';
import { getAdventDay } from '../../utils/date';
import { config } from '../../config';
import { priceService } from '../../services/price-service';
import { twitterService } from '../../services/twitter-service';
import { Connection, Keypair, sendAndConfirmTransaction, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { Winner } from '../../services/gifts';

interface ExecutionOptions {
  day?: number;
  date?: string; // YYYY-MM-DD format
  dryRun?: boolean; // If true, don't actually send transactions
}

/**
 * Prompt user for confirmation
 */
function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${question} (yes/no): `, (answer) => {
      rl.close();
      const confirmed = answer.toLowerCase().trim() === 'yes' || answer.toLowerCase().trim() === 'y';
      resolve(confirmed);
    });
  });
}

/**
 * Display transaction summary
 */
function displayTransactionSummary(transactions: Transaction[], winners: Winner[], totalAmount: bigint) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 TRANSACTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`\nTotal Transactions: ${transactions.length}`);
  console.log(`Total Winners: ${winners.length}`);
  console.log(`Total Amount: ${(Number(totalAmount) / 1e9).toFixed(9)} SOL`);
  console.log(`\nTransaction Breakdown:`);
  
  transactions.forEach((tx, idx) => {
    const txWinners = winners.slice(idx * 5, (idx + 1) * 5);
    const txAmount = txWinners.reduce((sum: bigint, w: any) => sum + w.amount, BigInt(0));
    console.log(`\n  Transaction ${idx + 1}/${transactions.length}:`);
    console.log(`    Winners: ${txWinners.length}`);
    console.log(`    Amount: ${(Number(txAmount) / 1e9).toFixed(9)} SOL`);
    console.log(`    Recipients:`);
    txWinners.forEach((w: any, i: number) => {
      console.log(`      ${i + 1}. ${w.wallet.slice(0, 8)}...${w.wallet.slice(-8)} - ${(Number(w.amount) / 1e9).toFixed(9)} SOL`);
    });
  });
  
  console.log('\n' + '='.repeat(80) + '\n');
}

/**
 * Execute transactions with confirmation
 */
async function executeTransactionsWithConfirmation(
  transactions: Transaction[],
  winners: Winner[],
  totalAmount: bigint,
  isDryRun: boolean = false
): Promise<string[]> {
  const signatures: string[] = [];
  
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
  const totalAmountSOL = Number(totalAmount) / 1e9;
  
  console.log(`\n💰 Treasury Balance: ${treasuryBalanceSOL.toFixed(9)} SOL`);
  console.log(`📤 Total to Send: ${totalAmountSOL.toFixed(9)} SOL`);
  console.log(`💸 Estimated Fees: ~${(transactions.length * 0.000005).toFixed(9)} SOL (${transactions.length} tx × ~5000 lamports)`);
  console.log(`💵 Remaining After: ~${(treasuryBalanceSOL - totalAmountSOL - transactions.length * 0.000005).toFixed(9)} SOL\n`);
  
  if (treasuryBalance < totalAmount + BigInt(transactions.length * 5000)) {
    throw new Error('Insufficient treasury balance');
  }
  
  // Show summary and ask for confirmation
  displayTransactionSummary(transactions, winners, totalAmount);
  
  const confirmed = await askConfirmation('⚠️  Do you want to proceed with sending these transactions?');
  
  if (!confirmed) {
    console.log('\n❌ Transaction execution cancelled by user\n');
    process.exit(0);
  }
  
  // Track failed transactions for summary
  const failedTransactions: Array<{ index: number; winners: Winner[]; amount: bigint; error: string }> = [];
  
  // Execute each transaction with individual confirmation
  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    const txWinners = winners.slice(i * 5, (i + 1) * 5);
    const txAmount = txWinners.reduce((sum: bigint, w: Winner) => sum + w.amount, BigInt(0));
    
    console.log(`\n📤 Transaction ${i + 1}/${transactions.length}:`);
    console.log(`   Recipients: ${txWinners.length}`);
    console.log(`   Amount: ${(Number(txAmount) / 1e9).toFixed(9)} SOL`);
    console.log(`   Recipients:`);
    txWinners.forEach((w: Winner, idx: number) => {
      console.log(`     ${idx + 1}. ${w.wallet} - ${(Number(w.amount) / 1e9).toFixed(9)} SOL`);
    });
    
    const txConfirmed = await askConfirmation(`\n   Send transaction ${i + 1}/${transactions.length}?`);
    
    if (!txConfirmed) {
      console.log(`\n⏭️  Skipping transaction ${i + 1}/${transactions.length}`);
      failedTransactions.push({
        index: i + 1,
        winners: txWinners,
        amount: txAmount,
        error: 'User skipped'
      });
      continue;
    }
    
    try {
      console.log(`\n🚀 Sending transaction ${i + 1}/${transactions.length}...`);
      
      // CRITICAL: Rebuild transaction with fresh blockhash before sending
      // This ensures each transaction is independent and won't fail due to expired blockhash
      const freshBlockhash = await connection.getLatestBlockhash('finalized');
      tx.recentBlockhash = freshBlockhash.blockhash;
      tx.lastValidBlockHeight = freshBlockhash.lastValidBlockHeight;
      
      const signature = await sendAndConfirmTransaction(
        connection,
        tx,
        [treasuryKeypair],
        {
          commitment: 'confirmed',
          maxRetries: 3,
        }
      );
      
      signatures.push(signature);
      console.log(`✅ Transaction ${i + 1}/${transactions.length} confirmed!`);
      console.log(`   Signature: ${signature}`);
      console.log(`   View: https://solscan.io/tx/${signature}\n`);
      
      // Small delay between transactions to avoid rate limiting
      if (i < transactions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      const errorMessage = (error as Error).message;
      console.error(`\n❌ Transaction ${i + 1}/${transactions.length} failed:`);
      console.error(`   Error: ${errorMessage}`);
      console.error(`   Stack: ${(error as Error).stack}\n`);
      
      // CRITICAL: Always continue with remaining transactions
      // Each transaction is independent - failure of one should not stop others
      console.log(`⏭️  Continuing with remaining transactions...\n`);
      
      // Track failed transaction for summary
      failedTransactions.push({
        index: i + 1,
        winners: txWinners,
        amount: txAmount,
        error: errorMessage
      });
    }
  }
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TRANSACTION EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Successful: ${signatures.length}/${transactions.length}`);
  console.log(`❌ Failed/Skipped: ${failedTransactions.length}/${transactions.length}`);
  
  if (signatures.length > 0) {
    console.log('\n✅ Successful Transactions:');
    signatures.forEach((sig, idx) => {
      console.log(`   ${idx + 1}. ${sig}`);
      console.log(`      View: https://solscan.io/tx/${sig}`);
    });
  }
  
  if (failedTransactions.length > 0) {
    console.log('\n❌ Failed/Skipped Transactions:');
    failedTransactions.forEach(failed => {
      console.log(`   Transaction ${failed.index}:`);
      console.log(`      Error: ${failed.error}`);
      console.log(`      Amount: ${(Number(failed.amount) / 1e9).toFixed(9)} SOL`);
      console.log(`      Recipients: ${failed.winners.map(w => w.wallet).join(', ')}`);
    });
    console.log('\n💡 You can retry failed transactions using the process-individual-transactions script');
  }
  
  console.log('='.repeat(80) + '\n');
  
  return signatures;
}

/**
 * Main execution function
 */
async function executeGiftInteractive(options: ExecutionOptions) {
  const isDryRun = options.dryRun || false;
  
  console.log('\n🎁 Interactive Gift Execution');
  if (isDryRun) {
    console.log('🧪 DRY RUN MODE - No transactions will be sent\n');
  } else {
    console.log();
  }
  
  try {
    // Determine target day
    let targetDay: Date;
    let effectiveAdventDay: number;
    
    if (options.date) {
      targetDay = new Date(options.date);
      targetDay.setUTCHours(0, 0, 0, 0);
      effectiveAdventDay = options.day || getAdventDay(targetDay) || 1;
    } else if (options.day) {
      effectiveAdventDay = options.day;
      // Calculate target date from advent day (Dec 1, 2025 = Day 1)
      // Use UTC to avoid timezone issues
      const dec1 = new Date('2025-12-01T00:00:00Z');
      targetDay = new Date(dec1);
      targetDay.setUTCDate(dec1.getUTCDate() + (effectiveAdventDay - 1));
      targetDay.setUTCHours(0, 0, 0, 0);
    } else {
      // Use latest date from transactions
      const latestDateResult = await db.query<{ latest_date: Date }>(`
        SELECT DATE(MAX(block_time)) as latest_date
        FROM tx_raw
        WHERE status = 'finalized'
      `);
      
      if (latestDateResult.rows[0]?.latest_date) {
        targetDay = new Date(latestDateResult.rows[0].latest_date);
        targetDay.setUTCHours(0, 0, 0, 0);
        effectiveAdventDay = getAdventDay(targetDay) || 1;
      } else {
        throw new Error('No date specified and no transactions found. Use --day or --date');
      }
    }
    
    console.log(`📅 Target Date: ${targetDay.toISOString().split('T')[0]}`);
    console.log(`🎄 Advent Day: ${effectiveAdventDay}\n`);
    
    // Step 1: Close the day
    console.log('Step 1: Closing day pool...');
    const poolId = await dayPoolRepo.closeDay(targetDay);
    console.log(`✅ Day pool closed (ID: ${poolId})\n`);
    
    // Step 2: Get gift specification
    console.log('Step 2: Getting gift specification...');
    const giftSpec = await giftSpecRepo.findByDay(effectiveAdventDay);
    
    if (!giftSpec) {
      throw new Error(`No gift specification found for day ${effectiveAdventDay}`);
    }
    
    console.log(`✅ Gift specification loaded: ${giftSpec.type}\n`);
    
    // Step 3: Create holder snapshot
    console.log('Step 3: Creating holder snapshot...');
    let holders = await holderSnapshotRepo.findByDay(targetDay);
    
    if (holders.length === 0) {
      console.log('   Creating snapshot...');
      const snapshotCount = await holderSnapshotRepo.createSnapshot(targetDay);
      console.log(`✅ Snapshot created: ${snapshotCount} holders`);
      holders = await holderSnapshotRepo.findByDay(targetDay);
    } else {
      console.log(`✅ Snapshot exists: ${holders.length} holders`);
    }
    console.log();
    
    // Step 4: Fetch transactions
    console.log('Step 4: Fetching transactions...');
    const transactions = await txRawRepo.findByDay(targetDay);
    console.log(`✅ Transactions loaded: ${transactions.length}\n`);
    
    // Get day pool
    const dayPool = await dayPoolRepo.findByDay(targetDay);
    if (!dayPool) {
      throw new Error(`Day pool not found for ${targetDay.toISOString().split('T')[0]}`);
    }
    
    // Calculate creator fees (capped)
    const dayCreatorFeesRaw = typeof dayPool.fees_in === 'string' 
      ? BigInt(dayPool.fees_in) 
      : typeof dayPool.fees_in === 'bigint' 
        ? dayPool.fees_in 
        : BigInt(String(dayPool.fees_in));
    
    const dailyFeeLimitUSD = config.gifts.dailyFeeLimitUSD;
    const dailyFeeLimitLamports = await priceService.convertUSDToSOL(dailyFeeLimitUSD);
    const solPrice = await priceService.getSOLPrice();
    
    const dayCreatorFees = dayCreatorFeesRaw > dailyFeeLimitLamports ? dailyFeeLimitLamports : dayCreatorFeesRaw;
    const wasCapped = dayCreatorFeesRaw > dailyFeeLimitLamports;
    
    console.log(`💰 Creator Fees: ${(Number(dayCreatorFees) / 1e9).toFixed(9)} SOL`);
    if (wasCapped) {
      console.log(`   (Capped at $${dailyFeeLimitUSD.toFixed(2)} USD = ${(Number(dailyFeeLimitLamports) / 1e9).toFixed(9)} SOL)`);
      console.log(`   Raw fees: ${(Number(dayCreatorFeesRaw) / 1e9).toFixed(9)} SOL`);
    }
    console.log();
    
    // Get blockhash
    // Some gift types require blockhash for deterministic randomness (deterministic_random, scatter_airdrop_blockhash)
    // Others don't need it (proportional_top_buyers, proportional_holders, etc.)
    const giftTypesNeedingBlockhash = ['deterministic_random', 'scatter_airdrop_blockhash'];
    const needsBlockhash = giftTypesNeedingBlockhash.includes(giftSpec.type);
    
    let blockhash: string;
    const lastSlot = await solanaService.getLastSlotForDate(targetDay);
    const fetchedBlockhash = lastSlot ? await solanaService.getBlockhashForSlot(lastSlot) : null;
    
    if (!fetchedBlockhash) {
      if (needsBlockhash) {
        throw new Error(`Failed to get blockhash for day (required for ${giftSpec.type} gift type)`);
      } else {
        // Gift type doesn't need blockhash, use dummy value
        if (isDryRun) {
          console.log(`⚠️  Could not fetch blockhash (date may be in future), using dummy value (not used for ${giftSpec.type})`);
        } else {
          console.log(`⚠️  Could not fetch blockhash, using dummy value (not used for ${giftSpec.type})`);
        }
        blockhash = `dummy-blockhash-not-used-for-${giftSpec.type}-${Date.now()}`;
      }
    } else {
      blockhash = fetchedBlockhash;
      if (!needsBlockhash) {
        console.log(`ℹ️  Blockhash fetched (not used for ${giftSpec.type}): ${blockhash.substring(0, 16)}...`);
      } else {
        console.log(`✅ Blockhash fetched: ${blockhash.substring(0, 16)}...`);
      }
    }
    console.log();
    
    // Step 5: Execute gift rule
    console.log('Step 5: Executing gift rule...');
    const result = await giftEngine.executeGift(
      giftSpec,
      transactions,
      holders,
      dayCreatorFees,
      blockhash
    );
    
    console.log(`✅ Gift rule executed:`);
    console.log(`   Winners: ${result.winners.length}`);
    console.log(`   Total: ${(Number(result.totalDistributed) / 1e9).toFixed(9)} SOL\n`);
    
    // Show winners summary
    console.log('🏆 Winners Summary:');
    const topWinners = result.winners.slice(0, 10);
    topWinners.forEach((w, i) => {
      console.log(`   ${i + 1}. ${w.wallet.slice(0, 8)}...${w.wallet.slice(-8)} - ${(Number(w.amount) / 1e9).toFixed(9)} SOL`);
    });
    if (result.winners.length > 10) {
      console.log(`   ... and ${result.winners.length - 10} more`);
    }
    console.log();
    
    // Step 6: Build transaction bundle
    console.log('Step 6: Building transaction bundle...');
    const bundle = await transactionBuilder.buildTransferBundle(result.winners);
    console.log(`✅ Transaction bundle built: ${bundle.transactions.length} transactions\n`);
    
    // Step 7: Simulate transactions
    console.log('Step 7: Simulating transactions...');
    const simulationPassed = await transactionBuilder.simulateTransactions(bundle.transactions);
    
    if (!simulationPassed) {
      throw new Error('Transaction simulation failed');
    }
    
    console.log('✅ All transactions simulated successfully\n');
    
    // Step 8: Execute transactions with confirmation
    let signatures: string[] = [];
    
    if (isDryRun) {
      console.log('Step 8: DRY RUN - Simulating transaction execution...');
      displayTransactionSummary(bundle.transactions, result.winners, result.totalDistributed);
      
      console.log('\n🧪 DRY RUN MODE:');
      console.log('   - Transaction summary displayed above');
      console.log('   - No actual transactions will be sent');
      console.log('   - No database records will be created\n');
      
      const confirmed = await askConfirmation('Proceed with dry run (no actual transactions)?');
      if (!confirmed) {
        console.log('\n❌ Dry run cancelled by user\n');
        return;
      }
      
      // Simulate transaction execution
      console.log('\n📋 Simulated Transaction Execution:');
      for (let i = 0; i < bundle.transactions.length; i++) {
        const txWinners = result.winners.slice(i * 5, (i + 1) * 5);
        const txAmount = txWinners.reduce((sum: bigint, w: Winner) => sum + w.amount, BigInt(0));
        
        console.log(`\n   Transaction ${i + 1}/${bundle.transactions.length}:`);
        console.log(`     Recipients: ${txWinners.length}`);
        console.log(`     Amount: ${(Number(txAmount) / 1e9).toFixed(9)} SOL`);
        console.log(`     Status: ✅ Would be sent (DRY RUN)`);
      }
      
      console.log(`\n✅ Dry run completed: ${bundle.transactions.length} transactions would be sent\n`);
      
      // Don't record to DB in dry run
      console.log('⏭️  Skipping database recording (dry run mode)\n');
    } else {
      console.log('Step 8: Executing transactions...');
      signatures = await executeTransactionsWithConfirmation(
        bundle.transactions,
        result.winners,
        result.totalDistributed,
        false // Not dry run
      );
      
      if (signatures.length === 0) {
        console.log('\n⚠️  No transactions were sent\n');
        return;
      }
      
      console.log(`\n✅ Successfully sent ${signatures.length}/${bundle.transactions.length} transactions\n`);
      
      // Step 9: Record execution
      console.log('Step 9: Recording execution...');
      await giftExecRepo.insert({
        day: effectiveAdventDay,
        gift_spec_id: giftSpec.id!,
        winners: result.winners,
        tx_hashes: signatures,
        total_distributed: result.totalDistributed,
        execution_time: new Date(),
        status: 'executed',
      });
      
      console.log('✅ Execution recorded\n');
    }
    
    // Step 10: Post to Twitter/X (skip in dry run, but show preview)
    const frontendUrl = config.frontendUrl;
    const pageUrl = `${frontendUrl}/day/${effectiveAdventDay.toString().padStart(2, '0')}`;
    const totalDistributedSOL = (Number(result.totalDistributed) / 1e9).toFixed(9);
    
    // Generate and display the Twitter message
    const twitterMessage = twitterService.generateExecutionMessage({
      day: effectiveAdventDay,
      giftType: giftSpec.type,
      winnerCount: result.winners.length,
      totalDistributedSOL,
      pageUrl,
      txHashes: signatures.length > 0 ? signatures : undefined,
    });
    
    console.log('Step 10: Twitter/X Message Preview:');
    console.log('─'.repeat(80));
    console.log(twitterMessage);
    console.log('─'.repeat(80));
    console.log(`Character count: ${twitterMessage.length} / 280\n`);
    
    if (!isDryRun && signatures.length > 0) {
      const confirmed = await askConfirmation('Post this message to Twitter/X?');
      
      if (confirmed) {
        try {
          const tweetId = await twitterService.postTweet(twitterMessage);
          
          if (tweetId) {
            console.log(`✅ Posted to Twitter/X: ${tweetId}\n`);
          } else {
            console.log('⚠️  Twitter post may have failed\n');
          }
        } catch (error) {
          console.error('⚠️  Failed to post to Twitter/X:', (error as Error).message);
          console.error('   (Non-fatal, continuing...)\n');
        }
      } else {
        console.log('⏭️  Skipping Twitter/X post\n');
      }
    } else if (isDryRun) {
      console.log('🧪 DRY RUN MODE: Message preview shown above (not posted)\n');
    } else {
      console.log('⏭️  No transactions sent, skipping Twitter/X post\n');
    }
    
    console.log('🎉 Gift execution completed successfully!\n');
    
  } catch (error) {
    console.error('\n❌ Gift execution failed:\n');
    console.error((error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): ExecutionOptions {
  const args = process.argv.slice(2);
  const options: ExecutionOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--day' && args[i + 1]) {
      options.day = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--date' && args[i + 1]) {
      options.date = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run' || args[i] === '--dryrun') {
      options.dryRun = true;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  await executeGiftInteractive(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

