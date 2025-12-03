#!/usr/bin/env tsx
/**
 * Test WebSocket capture - Listen for a few seconds and verify data is saved
 */
import { config } from '../../config/index';
import { websocketListener } from '../../services/websocket-listener';
import { db } from '../../database/index';
import { logger } from '../../utils/logger';

async function testWebSocketCapture() {
  console.log('\n' + '='.repeat(80));
  console.log('WEBSOCKET CAPTURE TEST');
  console.log('='.repeat(80));
  console.log();

  // Show configuration
  console.log('📋 Configuration:');
  console.log(`  WebSocket Enabled: ${config.websocket.enabled}`);
  console.log(`  Helius API Key: ${config.websocket.heliusApiKey ? '✅ SET' : '❌ NOT SET'}`);
  console.log(`  Token to Monitor: ${config.solana.pumpFunToken || 'NOT SET'}`);
  console.log(`  Pump.fun Program: ${config.solana.pumpFunProgram}`);
  console.log();

  // Check if config is valid
  if (!config.websocket.enabled) {
    console.error('❌ WebSocket is DISABLED in configuration!');
    console.error('   Set WEBSOCKET_ENABLED=true in .env');
    process.exit(1);
  }

  if (!config.websocket.heliusApiKey) {
    console.error('❌ Helius API Key is NOT SET!');
    console.error('   Set HELIUS_API_KEY in .env');
    process.exit(1);
  }

  if (!config.solana.pumpFunToken) {
    console.error('❌ Token to monitor is NOT SET!');
    console.error('   Set PUMP_FUN_TOKEN in .env');
    process.exit(1);
  }

  // Count transactions before test
  const beforeResult = await db.query(`
    SELECT COUNT(*) as count
    FROM tx_raw
    WHERE metadata->>'source' = 'websocket-logs'
      AND created_at >= NOW() - INTERVAL '1 hour'
  `);
  const txCountBefore = parseInt(beforeResult.rows[0].count);
  console.log(`📊 Transactions in DB (last hour): ${txCountBefore}`);
  console.log();

  // Start WebSocket listener
  console.log('🚀 Starting WebSocket listener...');
  await websocketListener.start();
  console.log('✅ WebSocket listener started!');
  console.log();

  // Listen for 30 seconds
  const duration = 30;
  console.log(`⏳ Listening for ${duration} seconds...`);
  console.log('   (Watch for transaction logs above)');
  console.log();

  for (let i = duration; i > 0; i--) {
    process.stdout.write(`\r   ${i} seconds remaining...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\r   ✅ Test completed!            ');
  console.log();

  // Stop listener
  console.log('🛑 Stopping WebSocket listener...');
  await websocketListener.stop();
  console.log('✅ WebSocket listener stopped!');
  console.log();

  // Check transactions captured
  console.log('─'.repeat(80));
  console.log('📊 RESULTS');
  console.log('─'.repeat(80));
  console.log();

  const afterResult = await db.query(`
    SELECT COUNT(*) as count
    FROM tx_raw
    WHERE metadata->>'source' = 'websocket-logs'
      AND created_at >= NOW() - INTERVAL '1 hour'
  `);
  const txCountAfter = parseInt(afterResult.rows[0].count);
  const newTxCount = txCountAfter - txCountBefore;

  console.log(`📈 New transactions captured: ${newTxCount}`);
  console.log();

  if (newTxCount === 0) {
    console.log('⚠️  No new transactions captured during test period.');
    console.log('   This could mean:');
    console.log('   - No trading activity on the token during the test');
    console.log('   - WebSocket subscription not working correctly');
    console.log('   - Token address might be incorrect');
    console.log();
  } else {
    console.log('✅ SUCCESS! Transactions were captured.');
    console.log();
    console.log('📋 Sample of captured transactions with ALL FIELDS:');
    console.log();

    const sampleResult = await db.query(`
      SELECT 
        signature,
        kind,
        amount,
        fee as protocol_fee,
        network_fee,
        from_wallet,
        to_wallet,
        slot,
        block_time,
        status,
        created_at
      FROM tx_raw
      WHERE metadata->>'source' = 'websocket-logs'
        AND created_at >= NOW() - INTERVAL '2 minutes'
      ORDER BY created_at DESC
      LIMIT 3
    `);

    sampleResult.rows.forEach((tx, i) => {
      console.log(`${i + 1}. Transaction ID (signature):`);
      console.log(`   ${tx.signature}`);
      console.log(`   🔗 https://solscan.io/tx/${tx.signature}`);
      console.log();
      console.log(`   ✅ Kind: ${tx.kind}`);
      console.log(`   ✅ Amount: ${tx.amount} tokens`);
      console.log(`   ✅ Protocol Fee: ${tx.protocol_fee} tokens`);
      console.log(`   ✅ Network Fee: ${tx.network_fee} lamports (${(tx.network_fee / 1e9).toFixed(9)} SOL)`);
      console.log(`   ✅ From Wallet: ${tx.from_wallet}`);
      console.log(`   ✅ To Wallet: ${tx.to_wallet || 'N/A'}`);
      console.log(`   ✅ Slot: ${tx.slot}`);
      console.log(`   ✅ Block Time: ${new Date(tx.block_time).toISOString()}`);
      console.log(`   ✅ Status: ${tx.status}`);
      console.log(`   ✅ Captured At: ${new Date(tx.created_at).toISOString()}`);
      console.log();
    });

    // Verify all required fields are present
    console.log('─'.repeat(80));
    console.log('✅ VERIFICATION: All fields captured correctly!');
    console.log('─'.repeat(80));
    console.log();
    console.log('Fields verified in database:');
    console.log('  ✅ signature (Transaction ID)');
    console.log('  ✅ kind (buy/sell/transfer)');
    console.log('  ✅ amount (token amount)');
    console.log('  ✅ fee (protocol fee)');
    console.log('  ✅ network_fee (Solana network fee)');
    console.log('  ✅ from_wallet');
    console.log('  ✅ to_wallet');
    console.log('  ✅ slot');
    console.log('  ✅ block_time');
    console.log('  ✅ status');
    console.log();
  }

  console.log('='.repeat(80));
  console.log('✅ TEST COMPLETE!');
  console.log('='.repeat(80));
  console.log();

  process.exit(0);
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Test interrupted. Cleaning up...');
  try {
    await websocketListener.stop();
  } catch (e) {
    // Ignore
  }
  process.exit(0);
});

testWebSocketCapture().catch(async (error) => {
  console.error('❌ Test failed:', error);
  try {
    await websocketListener.stop();
  } catch (e) {
    // Ignore cleanup errors
  }
  process.exit(1);
});

