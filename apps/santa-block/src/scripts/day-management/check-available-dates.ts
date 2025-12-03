#!/usr/bin/env tsx
/**
 * Check Available Dates
 * 
 * Shows which dates have transactions and holders in the database
 * 
 * Usage:
 *   npm run check:dates
 */

import { db } from '../../database';

async function checkAvailableDates() {
  console.log('\n📅 Checking Available Dates in Database\n');

  try {
    // Get dates with transactions
    const txDatesResult = await db.query<{ date: Date; tx_count: number; holder_count: number }>(`
      SELECT 
        DATE(block_time) as date,
        COUNT(*) as tx_count,
        COUNT(DISTINCT from_wallet) as holder_count
      FROM tx_raw
      WHERE status = 'finalized'
      GROUP BY DATE(block_time)
      ORDER BY date DESC
      LIMIT 30
    `);

    if (txDatesResult.rows.length === 0) {
      console.log('❌ No transactions found in database\n');
      return;
    }

    console.log('📊 Dates with Transactions:');
    console.log('─'.repeat(80));
    console.log('Date       | Transactions | Unique Wallets');
    console.log('─'.repeat(80));
    
    for (const row of txDatesResult.rows) {
      const date = new Date(row.date).toISOString().split('T')[0];
      console.log(`${date} | ${String(row.tx_count).padStart(12)} | ${String(row.holder_count).padStart(14)}`);
    }
    
    console.log('─'.repeat(80));
    console.log(`\nTotal dates: ${txDatesResult.rows.length}\n`);

    // Get dates with holder snapshots
    const snapshotDatesResult = await db.query<{ date: Date; holder_count: number }>(`
      SELECT 
        DATE(snapshot_date) as date,
        COUNT(*) as holder_count
      FROM holder_snapshot
      GROUP BY DATE(snapshot_date)
      ORDER BY date DESC
      LIMIT 30
    `);

    if (snapshotDatesResult.rows.length > 0) {
      console.log('📸 Dates with Holder Snapshots:');
      console.log('─'.repeat(50));
      console.log('Date       | Holders');
      console.log('─'.repeat(50));
      
      for (const row of snapshotDatesResult.rows) {
        const date = new Date(row.date).toISOString().split('T')[0];
        console.log(`${date} | ${String(row.holder_count).padStart(7)}`);
      }
      
      console.log('─'.repeat(50));
      console.log(`\nTotal snapshots: ${snapshotDatesResult.rows.length}\n`);
    } else {
      console.log('📸 No holder snapshots found\n');
    }

    // Get latest transaction date
    const latestResult = await db.query<{ latest_date: Date; latest_tx: string }>(`
      SELECT 
        DATE(MAX(block_time)) as latest_date,
        MAX(signature) as latest_tx
      FROM tx_raw
      WHERE status = 'finalized'
    `);

    if (latestResult.rows[0]?.latest_date) {
      const latestDate = new Date(latestResult.rows[0].latest_date).toISOString().split('T')[0];
      console.log(`📌 Latest Transaction Date: ${latestDate}`);
      console.log(`   Latest TX: ${latestResult.rows[0].latest_tx?.substring(0, 16)}...\n`);
    }

  } catch (error) {
    console.error('❌ Error checking dates:', (error as Error).message);
    process.exit(1);
  }
}

checkAvailableDates()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

