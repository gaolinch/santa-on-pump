#!/usr/bin/env tsx
/**
 * Check transactions captured via WebSocket
 */
import { db } from '../../database/index';
import { logger } from '../../utils/logger';

async function checkWebSocketTransactions() {
  console.log('\n' + '='.repeat(80));
  console.log('CHECKING WEBSOCKET TRANSACTIONS IN DATABASE');
  console.log('='.repeat(80));

  try {
    // Count total WebSocket transactions
    const countResult = await db.query(`
      SELECT COUNT(*) as total
      FROM tx_raw 
      WHERE metadata->>'source' = 'websocket-logs'
    `);
    const total = parseInt(countResult.rows[0]?.total || '0');

    console.log(`\n📊 Total WebSocket transactions: ${total}`);

    if (total === 0) {
      console.log('\n⚠️  No transactions captured yet.');
      console.log('   Make sure:');
      console.log('   1. WebSocket listener is running');
      console.log('   2. MONITOR_ALL_PUMPFUN is set correctly in .env');
      console.log('   3. There is activity on the monitored token/program');
      return;
    }

    // Get latest 10 transactions
    console.log('\n📋 Latest 10 WebSocket Transactions:');
    console.log('─'.repeat(80));

    const txResult = await db.query(`
      SELECT 
        signature,
        kind,
        amount,
        from_wallet,
        to_wallet,
        fee,
        status,
        block_time,
        created_at,
        metadata
      FROM tx_raw 
      WHERE metadata->>'source' = 'websocket-logs'
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    for (const tx of txResult.rows) {
      const networkFee = tx.metadata?.transactionFeeSol || 'N/A';
      const kind = tx.kind.toUpperCase();
      const icon = kind === 'BUY' ? '🟢' : kind === 'SELL' ? '🔴' : '🔵';
      
      console.log(`\n${icon} ${kind} Transaction:`);
      console.log(`  Signature: ${tx.signature}`);
      console.log(`  From: ${tx.from_wallet.substring(0, 16)}...`);
      console.log(`  To: ${tx.to_wallet?.substring(0, 16)}...`);
      console.log(`  Amount: ${tx.amount}`);
      console.log(`  Network Fee: ${networkFee} SOL`);
      console.log(`  Status: ${tx.status}`);
      console.log(`  Captured: ${new Date(tx.created_at).toISOString()}`);
    }

    // Get statistics
    console.log('\n' + '─'.repeat(80));
    console.log('📈 STATISTICS:');
    console.log('─'.repeat(80));

    const statsResult = await db.query(`
      SELECT 
        kind,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM tx_raw 
      WHERE metadata->>'source' = 'websocket-logs'
      GROUP BY kind
      ORDER BY count DESC
    `);

    for (const stat of statsResult.rows) {
      console.log(`  ${stat.kind.toUpperCase()}: ${stat.count} transactions`);
    }

    // Get recent activity (last hour)
    const recentResult = await db.query(`
      SELECT COUNT(*) as count
      FROM tx_raw 
      WHERE metadata->>'source' = 'websocket-logs'
        AND created_at > NOW() - INTERVAL '1 hour'
    `);
    const recentCount = parseInt(recentResult.rows[0]?.count || '0');
    console.log(`\n  📅 Last hour: ${recentCount} transactions`);

    // Get average network fee
    const feeResult = await db.query(`
      SELECT 
        AVG((metadata->>'transactionFee')::numeric) / 1e9 as avg_network_fee
      FROM tx_raw 
      WHERE metadata->>'source' = 'websocket-logs'
        AND metadata->>'transactionFee' IS NOT NULL
    `);
    const avgFee = parseFloat(feeResult.rows[0]?.avg_network_fee || '0');
    console.log(`  💰 Avg network fee: ${avgFee.toFixed(6)} SOL`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ Database check complete!');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error checking database:', error);
  } finally {
    process.exit(0);
  }
}

checkWebSocketTransactions();



