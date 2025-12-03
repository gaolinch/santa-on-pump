#!/usr/bin/env tsx
/**
 * Check a specific transaction's network fee
 */
import { db } from '../../database/index';
import { solanaService } from '../../services/solana';

const signature = process.argv[2] || '5hM5QfkaQqGAJigxNhRnpVy8GKZd62UMr6RPRJMFy7aowxhDL9Gf2suN9AHnym4hTkQN8M32jZybSPu4uqjeAZoc';

async function checkTransactionFee() {
  console.log('\n' + '='.repeat(80));
  console.log('CHECKING TRANSACTION FEE');
  console.log('='.repeat(80));
  console.log(`\nSignature: ${signature}\n`);

  try {
    // Check database
    console.log('📊 Database Record:');
    console.log('─'.repeat(80));
    const dbResult = await db.query(`
      SELECT 
        signature,
        kind,
        amount,
        fee as protocol_fee,
        network_fee,
        slot,
        block_time,
        status,
        metadata->>'source' as source,
        created_at
      FROM tx_raw 
      WHERE signature = $1
    `, [signature]);

    if (dbResult.rows.length === 0) {
      console.log('❌ Transaction NOT found in database!\n');
    } else {
      const tx = dbResult.rows[0];
      console.log(`  Signature: ${tx.signature}`);
      console.log(`  Kind: ${tx.kind}`);
      console.log(`  Amount: ${tx.amount}`);
      console.log(`  Protocol Fee: ${tx.protocol_fee}`);
      console.log(`  Network Fee: ${tx.network_fee} ← ${tx.network_fee === '0' ? '❌ ZERO!' : '✅'}`);
      console.log(`  Slot: ${tx.slot}`);
      console.log(`  Block Time: ${tx.block_time}`);
      console.log(`  Status: ${tx.status}`);
      console.log(`  Source: ${tx.source}`);
      console.log(`  Created At: ${tx.created_at}`);
      console.log();
    }

    // Fetch from blockchain
    console.log('🔍 Fetching from Blockchain:');
    console.log('─'.repeat(80));
    const transaction = await solanaService.getTransaction(signature);
    
    if (!transaction) {
      console.log('❌ Could not fetch transaction from blockchain!\n');
      process.exit(1);
    }

    console.log(`  Slot: ${transaction.slot}`);
    console.log(`  Block Time: ${transaction.blockTime ? new Date(transaction.blockTime * 1000).toISOString() : 'N/A'}`);
    console.log(`  Success: ${transaction.meta?.err ? 'NO' : 'YES'}`);
    console.log();

    // Check fee
    console.log('💰 Transaction Fee Analysis:');
    console.log('─'.repeat(80));
    
    const fee = transaction.meta?.fee;
    console.log(`  transaction.meta?.fee: ${fee}`);
    console.log(`  Fee in lamports: ${fee || 0}`);
    console.log(`  Fee in SOL: ${fee ? (fee / 1e9).toFixed(9) : '0.000000000'}`);
    console.log();

    if (fee && fee > 0) {
      console.log('✅ Fee exists on blockchain but might not be in DB');
      
      // Check if we can update it
      if (dbResult.rows.length > 0 && dbResult.rows[0].network_fee === '0') {
        console.log('\n🔧 Would you like to update this transaction? (run manually):');
        console.log(`   UPDATE tx_raw SET network_fee = ${fee} WHERE signature = '${signature}';`);
      }
    } else {
      console.log('⚠️  Fee is 0 or null on blockchain too!');
    }

    // Show full meta for debugging
    console.log();
    console.log('🔬 Full Transaction Meta (for debugging):');
    console.log('─'.repeat(80));
    console.log(JSON.stringify(transaction.meta, null, 2));

    console.log();
    console.log('='.repeat(80));
    console.log('✅ Analysis complete!');
    console.log('='.repeat(80));
    console.log();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

checkTransactionFee();



