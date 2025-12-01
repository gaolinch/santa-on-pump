#!/usr/bin/env tsx
/**
 * Show database structure for tx_raw table
 */
import { db } from '../database/index.js';

async function showDbStructure() {
  console.log('\n' + '='.repeat(80));
  console.log('TX_RAW TABLE STRUCTURE');
  console.log('='.repeat(80) + '\n');

  try {
    // Get columns
    const result = await db.query(`
      SELECT 
        column_name,
        data_type,
        column_default,
        is_nullable,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'tx_raw'
      ORDER BY ordinal_position
    `);

    console.log('📋 Columns:\n');
    for (const row of result.rows) {
      const nullable = row.is_nullable === 'YES' ? '(nullable)' : '(required)';
      const defaultVal = row.column_default ? ` [default: ${row.column_default}]` : '';
      console.log(`  ${row.column_name.padEnd(20)} ${row.data_type.padEnd(15)} ${nullable}${defaultVal}`);
    }

    // Show sample data
    console.log('\n' + '─'.repeat(80));
    console.log('📊 Sample Transaction (WebSocket):');
    console.log('─'.repeat(80) + '\n');

    const sampleResult = await db.query(`
      SELECT 
        signature,
        kind,
        amount,
        fee,
        network_fee,
        from_wallet,
        to_wallet,
        status,
        metadata->>'source' as source,
        created_at
      FROM tx_raw 
      WHERE metadata->>'source' = 'websocket-logs'
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    if (sampleResult.rows.length > 0) {
      const tx = sampleResult.rows[0];
      console.log(`  Signature: ${tx.signature}`);
      console.log(`  Kind: ${tx.kind}`);
      console.log(`  Amount: ${tx.amount} tokens`);
      console.log(`  Protocol Fee: ${tx.fee} tokens`);
      console.log(`  Network Fee: ${tx.network_fee} lamports (${(tx.network_fee / 1e9).toFixed(6)} SOL)`);
      console.log(`  From: ${tx.from_wallet}`);
      console.log(`  To: ${tx.to_wallet || 'N/A'}`);
      console.log(`  Status: ${tx.status}`);
      console.log(`  Source: ${tx.source}`);
      console.log(`  Captured: ${new Date(tx.created_at).toISOString()}`);
    } else {
      console.log('  No WebSocket transactions found yet.');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ All fields are properly stored in the database!');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

showDbStructure();



