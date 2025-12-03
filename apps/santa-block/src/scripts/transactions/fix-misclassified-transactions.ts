#!/usr/bin/env tsx
/**
 * Fix misclassified transactions in the database
 * This script identifies transactions that were incorrectly classified as BUY when they should be SELL
 * and updates them in the database.
 */
import { config } from '../../config/index';
import { db, txRawRepo } from '../../database/index';
import { solanaService } from '../../services/solana';
import { logger } from '../../utils/logger';

async function fixMisclassifiedTransactions() {
  console.log('\n='.repeat(80));
  console.log('FIXING MISCLASSIFIED TRANSACTIONS');
  console.log('='.repeat(80));
  console.log();

  try {
    // Get all transactions that might be misclassified
    // These are BUY transactions where the to_wallet is the pool account
    const poolAccount = config.solana.poolTokenAccount;
    
    if (!poolAccount) {
      console.error('❌ POOL_TOKEN_ACCOUNT not configured in environment');
      process.exit(1);
    }
    
    console.log(`🔍 Looking for BUY transactions where to_wallet = pool (${poolAccount})`);
    console.log('   These are likely misclassified SELL transactions...\n');
    
    const result = await db.query(
      `SELECT id, signature, from_wallet, to_wallet, amount, kind, block_time 
       FROM tx_raw 
       WHERE kind = 'buy' 
         AND to_wallet = $1
       ORDER BY block_time DESC`,
      [poolAccount]
    );
    
    console.log(`Found ${result.rows.length} potentially misclassified transactions\n`);
    
    if (result.rows.length === 0) {
      console.log('✅ No misclassified transactions found!');
      return;
    }
    
    // Display them
    console.log('─'.repeat(80));
    for (const row of result.rows) {
      console.log(`Signature: ${row.signature}`);
      console.log(`  Current kind: ${row.kind} (BUY)`);
      console.log(`  From: ${row.from_wallet}`);
      console.log(`  To: ${row.to_wallet} (POOL)`);
      console.log(`  Amount: ${row.amount}`);
      console.log(`  Block Time: ${row.block_time}`);
      console.log(`  → Should be: SELL (user sent tokens TO pool)`);
      console.log();
    }
    console.log('─'.repeat(80));
    
    // Ask for confirmation
    console.log(`\n⚠️  About to update ${result.rows.length} transaction(s) from BUY → SELL`);
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Update each transaction
    let updated = 0;
    for (const row of result.rows) {
      try {
        await db.query(
          `UPDATE tx_raw 
           SET kind = 'sell' 
           WHERE signature = $1`,
          [row.signature]
        );
        console.log(`✅ Updated ${row.signature.substring(0, 16)}... → SELL`);
        updated++;
      } catch (error) {
        console.error(`❌ Failed to update ${row.signature}:`, error);
      }
    }
    
    console.log();
    console.log('='.repeat(80));
    console.log(`✅ Successfully updated ${updated}/${result.rows.length} transactions`);
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

fixMisclassifiedTransactions();


