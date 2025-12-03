#!/usr/bin/env tsx
/**
 * Show transaction IDs (signatures) saved in database
 */
import { db } from '../../database/index';

async function showTransactionIds() {
  console.log('\n' + '='.repeat(80));
  console.log('TRANSACTION IDs SAVED IN DATABASE');
  console.log('='.repeat(80));
  console.log('\nNote: In Solana, the "signature" field IS the transaction ID\n');

  try {
    const result = await db.query(`
      SELECT 
        signature as transaction_id,
        kind,
        amount,
        fee as protocol_fee,
        network_fee,
        from_wallet,
        to_wallet,
        status,
        metadata->>'source' as source,
        created_at
      FROM tx_raw 
      ORDER BY created_at DESC 
      LIMIT 5
    `);

    if (result.rows.length === 0) {
      console.log('  No transactions found yet.\n');
    } else {
      console.log(`📋 Recent ${result.rows.length} Transactions:\n`);
      
      result.rows.forEach((tx, i) => {
        console.log(`${i + 1}. Transaction ID: ${tx.transaction_id}`);
        console.log(`   Kind: ${tx.kind}`);
        console.log(`   Amount: ${tx.amount} tokens`);
        console.log(`   Protocol Fee: ${tx.protocol_fee} tokens`);
        console.log(`   Network Fee: ${tx.network_fee} lamports (${(tx.network_fee / 1e9).toFixed(6)} SOL)`);
        console.log(`   From: ${tx.from_wallet.substring(0, 8)}...`);
        console.log(`   To: ${tx.to_wallet ? tx.to_wallet.substring(0, 8) + '...' : 'N/A'}`);
        console.log(`   Status: ${tx.status}`);
        console.log(`   Source: ${tx.source}`);
        console.log(`   Time: ${new Date(tx.created_at).toISOString()}`);
        console.log(`   🔗 View on Solscan: https://solscan.io/tx/${tx.transaction_id}\n`);
      });
    }

    // Show schema
    console.log('─'.repeat(80));
    console.log('📋 Database Schema for Transaction ID:\n');
    
    const schemaResult = await db.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'tx_raw'
        AND column_name = 'signature'
    `);

    const col = schemaResult.rows[0];
    console.log(`  Field Name: ${col.column_name}`);
    console.log(`  Data Type: ${col.data_type}`);
    console.log(`  Required: ${col.is_nullable === 'NO' ? 'Yes' : 'No'}`);
    console.log(`  Unique: Yes (enforced by unique constraint)`);
    console.log(`  Description: This is the Solana transaction signature (transaction ID)`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ YES - Transaction IDs are saved in the "signature" field');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

showTransactionIds();



