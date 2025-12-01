#!/usr/bin/env tsx
/**
 * Backfill creator fees for existing transactions
 * 
 * This script re-processes transactions that have creator_fee = 0
 * and updates them with the correct creator fee extracted from the blockchain.
 */

import { solanaService } from '../services/solana';
import { db } from '../database';
import { logger } from '../utils/logger';

interface BackfillStats {
  total: number;
  updated: number;
  failed: number;
  skipped: number;
}

async function backfillCreatorFees(limit: number = 100, dryRun: boolean = true): Promise<BackfillStats> {
  const stats: BackfillStats = {
    total: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
  };

  try {
    logger.info({ limit, dryRun }, 'Starting creator fee backfill');

    // Get transactions with creator_fee = 0
    const transactions = await db.query(
      `SELECT signature, block_time, creator_fee 
       FROM tx_raw 
       WHERE creator_fee = 0 
       AND status = 'finalized'
       ORDER BY block_time DESC
       LIMIT $1`,
      [limit]
    );

    stats.total = transactions.rows.length;
    logger.info({ count: stats.total }, 'Found transactions to backfill');

    for (const tx of transactions.rows) {
      const { signature } = tx;
      
      try {
        logger.info({ signature }, 'Processing transaction');

        // Fetch transaction from blockchain
        const parsedTx = await solanaService.getParsedTransaction(signature);
        
        if (!parsedTx) {
          logger.warn({ signature }, 'Transaction not found on blockchain');
          stats.skipped++;
          continue;
        }

        // Parse token transfer to extract fees
        const transfer = solanaService.parseTokenTransfer(parsedTx, signature);
        
        if (!transfer) {
          logger.warn({ signature }, 'Could not parse token transfer');
          stats.skipped++;
          continue;
        }

        if (!transfer.creatorFee || transfer.creatorFee === BigInt(0)) {
          logger.info({ signature }, 'No creator fee found in transaction');
          stats.skipped++;
          continue;
        }

        const protocolFee = transfer.protocolFee || BigInt(0);
        const creatorFee = transfer.creatorFee;
        const creatorFeeBps = transfer.creatorFeeBps || 30;

        logger.info({
          signature,
          protocolFee: protocolFee.toString(),
          creatorFee: creatorFee.toString(),
          creatorFeeBps,
        }, 'Extracted fees from transaction');

        if (!dryRun) {
          // Update database
          await db.query(
            `UPDATE tx_raw 
             SET fee = $1, 
                 creator_fee = $2, 
                 creator_fee_bps = $3
             WHERE signature = $4`,
            [protocolFee.toString(), creatorFee.toString(), creatorFeeBps, signature]
          );
          
          logger.info({ signature }, '✅ Updated transaction in database');
        } else {
          logger.info({ signature }, '🔍 DRY RUN - Would update transaction');
        }

        stats.updated++;

      } catch (error) {
        logger.error({ signature, error }, '❌ Failed to process transaction');
        stats.failed++;
      }

      // Rate limiting - wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info(stats, 'Backfill complete');
    
    return stats;

  } catch (error) {
    logger.error({ error }, 'Backfill failed');
    throw error;
  }
}

// Main execution
const args = process.argv.slice(2);
const limit = args[0] ? parseInt(args[0]) : 100;
const dryRun = !args.includes('--execute');

if (dryRun) {
  console.log('\n⚠️  DRY RUN MODE - No changes will be made to the database');
  console.log('   Run with --execute flag to actually update transactions\n');
}

console.log('═'.repeat(80));
console.log('🔄 BACKFILL CREATOR FEES');
console.log('═'.repeat(80));
console.log(`Limit: ${limit} transactions`);
console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
console.log('');

backfillCreatorFees(limit, dryRun)
  .then((stats) => {
    console.log('');
    console.log('═'.repeat(80));
    console.log('📊 BACKFILL RESULTS');
    console.log('═'.repeat(80));
    console.log(`Total transactions: ${stats.total}`);
    console.log(`✅ Updated: ${stats.updated}`);
    console.log(`⏭️  Skipped: ${stats.skipped}`);
    console.log(`❌ Failed: ${stats.failed}`);
    console.log('');
    
    if (dryRun) {
      console.log('⚠️  This was a DRY RUN - no changes were made');
      console.log('   Run with --execute to actually update the database');
    } else {
      console.log('✅ Database updated successfully');
    }
    
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  });

