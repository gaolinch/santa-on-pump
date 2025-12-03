#!/usr/bin/env tsx
/**
 * Close Day Pool for a Specific Date
 * 
 * This script closes a day pool for a given date, which:
 * - Calculates total creator fees from transactions for that day
 * - Creates or updates the day_pool record
 * - Sets status to 'closed'
 * 
 * Usage:
 *   npm run close-day-pool                    (uses latest block date from transactions)
 *   npm run close-day-pool -- --date 2025-12-01
 *   npm run close-day-pool -- --date 2025-12-01 --create-snapshot
 */

import { db, dayPoolRepo, holderSnapshotRepo, txRawRepo } from '../../database';
import { logger } from '../../utils/logger';

interface CloseDayOptions {
  date?: string; // YYYY-MM-DD format (optional - will use latest block date if not provided)
  createSnapshot?: boolean;
}

async function closeDayPool(options: CloseDayOptions) {
  const { date, createSnapshot = false } = options;

  try {
    let targetDay: Date;

    if (date) {
      // Use provided date
      targetDay = new Date(date + 'T00:00:00Z');
      if (isNaN(targetDay.getTime())) {
        console.error(`❌ Invalid date format: ${date}. Use YYYY-MM-DD`);
        process.exit(1);
      }
      console.log(`\n=== Closing Day Pool ===\n`);
      console.log(`📅 Target Date (provided): ${targetDay.toISOString().split('T')[0]}\n`);
    } else {
      // Get the latest block date from finalized transactions
      console.log(`\n=== Closing Day Pool ===\n`);
      console.log(`📅 Determining target day from block dates...\n`);
      
      const latestDateResult = await db.query<{ latest_date: Date }>(`
        SELECT DATE(MAX(block_time)) as latest_date
        FROM tx_raw
        WHERE status = 'finalized'
      `);

      if (latestDateResult.rows[0]?.latest_date) {
        const latestDateStr = latestDateResult.rows[0].latest_date;
        targetDay = new Date(latestDateStr);
        targetDay.setUTCHours(0, 0, 0, 0);
        console.log(`✅ Using latest block date from transactions: ${targetDay.toISOString().split('T')[0]}\n`);
      } else {
        console.error(`❌ No finalized transactions found in database`);
        console.error(`   Please provide a date: npm run close-day-pool -- --date 2025-12-01`);
        process.exit(1);
      }
    }

    // Check if transactions exist for this day
    const targetDateStr = targetDay.toISOString().split('T')[0];
    console.log(`📊 Checking transactions for ${targetDateStr}...`);
    const transactions = await txRawRepo.findByDay(targetDay);
    console.log(`✅ Found ${transactions.length} transactions`);
    
    if (transactions.length > 0) {
      const buyCount = transactions.filter(tx => tx.kind === 'buy').length;
      const sellCount = transactions.filter(tx => tx.kind === 'sell').length;
      
      // Debug: Check first transaction's creator_fee type
      if (transactions.length > 0) {
        const firstTx = transactions[0];
        console.log(`\n   Debug - First transaction creator_fee:`);
        console.log(`     Type: ${typeof firstTx.creator_fee}`);
        console.log(`     Value: ${firstTx.creator_fee}`);
        console.log(`     String representation: ${String(firstTx.creator_fee)}`);
      }
      
      // Convert creator_fee to BigInt (PostgreSQL returns BIGINT as string)
      const totalFees = transactions.reduce((sum, tx) => {
        const fee = tx.creator_fee;
        if (!fee) return sum;
        
        // Handle both string and BigInt types
        let feeBigInt: bigint;
        if (typeof fee === 'string') {
          feeBigInt = BigInt(fee);
        } else if (typeof fee === 'bigint') {
          feeBigInt = fee;
        } else if (typeof fee === 'number') {
          feeBigInt = BigInt(fee);
        } else {
          // Try to convert to string first, then to BigInt
          feeBigInt = BigInt(String(fee));
        }
        
        return sum + feeBigInt;
      }, 0n);
      
      console.log(`\n   Buys: ${buyCount}`);
      console.log(`   Sells: ${sellCount}`);
      console.log(`   Total creator fees: ${totalFees.toString()} lamports`);
      console.log(`   Total creator fees: ${(Number(totalFees) / 1e9).toFixed(9)} SOL`);
      
      // Show sample of individual fees to debug (first 5)
      const sampleSize = Math.min(5, transactions.length);
      console.log(`\n   Sample transaction fees (first ${sampleSize}):`);
      transactions.slice(0, sampleSize).forEach((tx, idx) => {
        const fee = tx.creator_fee;
        const feeBigInt = fee ? (typeof fee === 'string' ? BigInt(fee) : typeof fee === 'bigint' ? fee : BigInt(String(fee))) : 0n;
        console.log(`     ${idx + 1}. ${tx.kind} - ${tx.signature.substring(0, 16)}... - ${feeBigInt.toString()} lamports`);
      });
    } else {
      console.log(`⚠️  No transactions found for this day`);
      console.log(`   The day pool will be created with 0 fees`);
    }

    // Check if day pool already exists
    const existingPool = await dayPoolRepo.findByDay(targetDay);
    if (existingPool) {
      console.log(`\n⚠️  Day pool already exists:`);
      console.log(`   Status: ${existingPool.status}`);
      console.log(`   Fees in: ${existingPool.fees_in.toString()} lamports`);
      console.log(`   Transaction count: ${existingPool.tx_count}`);
      console.log(`   Holder count: ${existingPool.holder_count}`);
      console.log(`\n   Closing will update the existing pool...`);
    }

    // Close the day pool
    console.log(`\n🔒 Closing day pool...`);
    const poolId = await dayPoolRepo.closeDay(targetDay);
    console.log(`✅ Day pool closed successfully!`);
    console.log(`   Pool ID: ${poolId}`);

    // Get updated pool info
    const updatedPool = await dayPoolRepo.findByDay(targetDay);
    if (updatedPool) {
      console.log(`\n📊 Updated Day Pool Info:`);
      console.log(`   Status: ${updatedPool.status}`);
      console.log(`   Fees in: ${updatedPool.fees_in.toString()} lamports (${Number(updatedPool.fees_in) / 1e9} SOL)`);
      console.log(`   Transaction count: ${updatedPool.tx_count}`);
      console.log(`   Holder count: ${updatedPool.holder_count}`);
      if (updatedPool.closed_at) {
        console.log(`   Closed at: ${updatedPool.closed_at}`);
      }
    }

    // Optionally create holder snapshot
    if (createSnapshot) {
      console.log(`\n👥 Creating holder snapshot...`);
      const snapshotCount = await holderSnapshotRepo.createSnapshot(targetDay);
      console.log(`✅ Created snapshot with ${snapshotCount} holders`);
    } else {
      console.log(`\n💡 Tip: Use --create-snapshot to also create a holder snapshot`);
    }

    console.log(`\n✅ Day pool closure completed!\n`);
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Failed to close day pool\n');
    console.error('Error:', (error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): CloseDayOptions {
  const args = process.argv.slice(2);
  const options: CloseDayOptions = { date: '' };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      options.date = args[i + 1];
      i++;
    } else if (args[i] === '--create-snapshot') {
      options.createSnapshot = true;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  await closeDayPool(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

