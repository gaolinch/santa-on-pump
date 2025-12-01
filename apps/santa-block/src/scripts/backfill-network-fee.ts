#!/usr/bin/env tsx

/**
 * Backfill network_fee for existing transactions
 * 
 * This script fetches the full transaction details from the blockchain
 * for transactions that have network_fee = 0 and updates them with the
 * correct Solana network fee.
 */

import '../config/index.js';
import { db } from '../database/index.js';
import { solanaService } from '../services/solana.js';
import { logger } from '../utils/logger.js';

interface TransactionRow {
  id: string;
  signature: string;
  network_fee: string;
}

async function backfillNetworkFees() {
  try {
    console.log('\n================================================================================');
    console.log('BACKFILLING NETWORK FEES');
    console.log('================================================================================\n');

    // Get all transactions with network_fee = 0
    const result = await db.query<TransactionRow>(`
      SELECT id, signature, network_fee
      FROM tx_raw
      WHERE network_fee = 0 OR network_fee IS NULL
      ORDER BY block_time DESC
    `);

    const transactions = result.rows;
    console.log(`📊 Found ${transactions.length} transactions with network_fee = 0\n`);

    if (transactions.length === 0) {
      console.log('✅ No transactions to backfill!\n');
      return;
    }

    let updated = 0;
    let failed = 0;
    let stillZero = 0;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      
      // Progress indicator
      if (i % 10 === 0) {
        console.log(`Processing ${i + 1}/${transactions.length}...`);
      }

      try {
        // Fetch full transaction from blockchain
        const fullTx = await solanaService.getTransaction(tx.signature);
        
        if (!fullTx || !fullTx.meta) {
          logger.warn({ signature: tx.signature }, 'Could not fetch transaction or meta is missing');
          failed++;
          continue;
        }

        const networkFee = fullTx.meta.fee || 0;
        
        if (networkFee === 0) {
          logger.warn({ signature: tx.signature }, 'Transaction meta.fee is 0');
          stillZero++;
          continue;
        }

        // Update database
        await db.query(
          `UPDATE tx_raw SET network_fee = $1 WHERE id = $2`,
          [networkFee, tx.id]
        );

        updated++;

        // Rate limiting - don't overwhelm the RPC
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between requests

      } catch (error) {
        logger.error({ error, signature: tx.signature }, 'Error processing transaction');
        failed++;
      }
    }

    console.log('\n================================================================================');
    console.log('BACKFILL COMPLETE');
    console.log('================================================================================');
    console.log(`✅ Successfully updated: ${updated} transactions`);
    console.log(`⚠️  Still zero: ${stillZero} transactions (meta.fee was actually 0)`);
    console.log(`❌ Failed: ${failed} transactions`);
    console.log('================================================================================\n');

  } catch (error) {
    logger.error({ error }, 'Failed to backfill network fees');
    throw error;
  } finally {
    await db.close();
  }
}

backfillNetworkFees();

