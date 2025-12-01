#!/usr/bin/env tsx
/**
 * Backfill missing network fees for WebSocket transactions
 */
import { db } from '../database/index.js';
import { solanaService } from '../services/solana.js';

async function backfillNetworkFees() {
  console.log('\n' + '='.repeat(80));
  console.log('BACKFILL NETWORK FEES');
  console.log('='.repeat(80) + '\n');

  try {
    // Find transactions with network_fee = 0
    console.log('🔍 Finding transactions with missing network fees...');
    const result = await db.query(`
      SELECT signature, slot, block_time, metadata->>'source' as source
      FROM tx_raw
      WHERE network_fee = 0 OR network_fee IS NULL
      ORDER BY block_time DESC
      LIMIT 100
    `);

    const transactions = result.rows;
    console.log(`Found ${transactions.length} transactions with missing network fees\n`);

    if (transactions.length === 0) {
      console.log('✅ No transactions need backfilling!\n');
      process.exit(0);
    }

    console.log('📋 Sample transactions:');
    transactions.slice(0, 5).forEach((tx, i) => {
      console.log(`  ${i + 1}. ${tx.signature.substring(0, 16)}... (${tx.source})`);
    });
    console.log();

    // Process each transaction
    console.log('⚙️  Processing transactions...\n');
    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const progress = `[${i + 1}/${transactions.length}]`;
      
      try {
        // Fetch transaction from blockchain
        const transaction = await solanaService.getTransaction(tx.signature);
        
        if (!transaction) {
          console.log(`${progress} ⚠️  Could not fetch: ${tx.signature.substring(0, 16)}...`);
          skipped++;
          continue;
        }

        const networkFee = transaction.meta?.fee || 0;
        
        if (networkFee === 0) {
          console.log(`${progress} ⏭️  Fee is 0 on blockchain too: ${tx.signature.substring(0, 16)}...`);
          skipped++;
          continue;
        }

        // Update database
        await db.query(`
          UPDATE tx_raw 
          SET network_fee = $1
          WHERE signature = $2
        `, [networkFee, tx.signature]);

        console.log(`${progress} ✅ Updated ${tx.signature.substring(0, 16)}... → ${networkFee} lamports (${(networkFee / 1e9).toFixed(9)} SOL)`);
        updated++;

        // Rate limiting - don't hammer the RPC
        if (i % 10 === 0 && i > 0) {
          console.log(`   💤 Pausing briefly to avoid rate limits...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.log(`${progress} ❌ Error: ${tx.signature.substring(0, 16)}... - ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }

    console.log();
    console.log('─'.repeat(80));
    console.log('📊 Results:');
    console.log('─'.repeat(80));
    console.log(`  ✅ Updated: ${updated}`);
    console.log(`  ⏭️  Skipped: ${skipped} (fee was 0 or tx not found)`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log();

    if (updated > 0) {
      // Verify
      const verifyResult = await db.query(`
        SELECT COUNT(*) as count
        FROM tx_raw
        WHERE network_fee = 0 OR network_fee IS NULL
      `);
      const remaining = parseInt(verifyResult.rows[0].count);
      console.log(`📈 Remaining transactions with network_fee = 0: ${remaining}`);
    }

    console.log();
    console.log('='.repeat(80));
    console.log('✅ Backfill complete!');
    console.log('='.repeat(80));
    console.log();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

backfillNetworkFees();



