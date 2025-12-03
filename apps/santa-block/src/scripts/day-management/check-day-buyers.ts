#!/usr/bin/env tsx
/**
 * Check buyers for a specific day
 * 
 * Usage:
 *   npm run check:buyers -- --day 2
 *   npm run check:buyers -- --date 2025-12-02
 */

import { db } from '../../database';
import { getAdventDay } from '../../utils/date';

interface CheckOptions {
  date?: string; // YYYY-MM-DD format
  day?: number; // Advent day (1-24)
}

async function checkDayBuyers(options: CheckOptions) {
  try {
    let targetDate: Date;
    
    if (options.date) {
      targetDate = new Date(options.date + 'T00:00:00Z');
      if (isNaN(targetDate.getTime())) {
        console.error(`❌ Invalid date format: ${options.date}. Use YYYY-MM-DD`);
        process.exit(1);
      }
    } else if (options.day) {
      // Calculate date from advent day (Dec 1, 2025 = Day 1)
      const dec1 = new Date('2025-12-01T00:00:00Z');
      targetDate = new Date(dec1);
      targetDate.setUTCDate(dec1.getUTCDate() + (options.day - 1));
      targetDate.setUTCHours(0, 0, 0, 0);
    } else {
      console.error('❌ Please provide either --date or --day');
      process.exit(1);
    }
    
    const adventDay = getAdventDay(targetDate);
    
    console.log(`\n📊 Day ${adventDay || options.day} Buy Transactions Analysis`);
    console.log(`📅 Date: ${targetDate.toISOString().split('T')[0]}\n`);
    
    // Get all buy transactions grouped by wallet
    // CRITICAL: For BUY transactions, use to_wallet (the buyer receives tokens)
    const result = await db.query(`
      SELECT 
        to_wallet as buyer_wallet,
        COUNT(*) as tx_count,
        SUM(amount) as total_amount,
        SUM(creator_fee) as total_creator_fee
      FROM tx_raw
      WHERE DATE(block_time) = $1
        AND kind = 'buy'
        AND status IN ('confirmed', 'finalized')
        AND to_wallet IS NOT NULL
      GROUP BY to_wallet
      ORDER BY total_amount DESC
    `, [targetDate]);
    
    if (result.rows.length === 0) {
      console.log('❌ No buy transactions found for this day\n');
      await db.close();
      return;
    }
    
    console.log('Buyer Wallet                              | TX Count | Total Amount (SOL)    | Creator Fees (SOL)');
    console.log('─'.repeat(100));
    
    for (const row of result.rows) {
      const amount = typeof row.total_amount === 'string' ? BigInt(row.total_amount) : BigInt(String(row.total_amount));
      const fees = typeof row.total_creator_fee === 'string' ? BigInt(row.total_creator_fee) : (row.total_creator_fee ? BigInt(String(row.total_creator_fee)) : 0n);
      const amountSOL = Number(amount) / 1e9;
      const feesSOL = Number(fees) / 1e9;
      
      const wallet = row.buyer_wallet.length > 40 ? row.buyer_wallet.substring(0, 37) + '...' : row.buyer_wallet.padEnd(40);
      console.log(`${wallet} | ${String(row.tx_count).padStart(8)} | ${amountSOL.toFixed(9).padStart(20)} | ${feesSOL.toFixed(9).padStart(20)}`);
    }
    
    console.log('─'.repeat(100));
    console.log(`\n📈 Summary:`);
    console.log(`   Total unique buyers: ${result.rows.length}`);
    
    // Get total buy count
    const totalResult = await db.query(`
      SELECT COUNT(*) as total_buys
      FROM tx_raw
      WHERE DATE(block_time) = $1
        AND kind = 'buy'
        AND status IN ('confirmed', 'finalized')
    `, [targetDate]);
    
    console.log(`   Total buy transactions: ${totalResult.rows[0].total_buys}`);
    
    // Get total sell count for comparison
    const sellResult = await db.query(`
      SELECT COUNT(*) as total_sells
      FROM tx_raw
      WHERE DATE(block_time) = $1
        AND kind = 'sell'
        AND status IN ('confirmed', 'finalized')
    `, [targetDate]);
    
    console.log(`   Total sell transactions: ${sellResult.rows[0].total_sells}`);
    
    // Calculate total volume
    const totalVolume = result.rows.reduce((sum, row) => {
      const amount = typeof row.total_amount === 'string' ? BigInt(row.total_amount) : BigInt(String(row.total_amount));
      return sum + amount;
    }, 0n);
    
    console.log(`   Total buy volume: ${(Number(totalVolume) / 1e9).toFixed(9)} SOL\n`);
    
  } catch (error) {
    console.error('❌ Error:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Parse command line arguments
function parseArgs(): CheckOptions {
  const args = process.argv.slice(2);
  const options: CheckOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      options.date = args[i + 1];
      i++;
    } else if (args[i] === '--day' && args[i + 1]) {
      options.day = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  await checkDayBuyers(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

