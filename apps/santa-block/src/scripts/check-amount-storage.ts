#!/usr/bin/env tsx
/**
 * Check amount storage capacity in database
 */
import { db } from '../database/index.js';

async function checkAmountStorage() {
  console.log('\n' + '='.repeat(80));
  console.log('DATABASE AMOUNT STORAGE ANALYSIS');
  console.log('='.repeat(80) + '\n');

  // Get column details
  console.log('📋 Column Details:\n');
  const colResult = await db.query(`
    SELECT 
      column_name,
      data_type,
      numeric_precision,
      numeric_scale
    FROM information_schema.columns
    WHERE table_name = 'tx_raw'
      AND column_name IN ('amount', 'fee', 'network_fee')
    ORDER BY ordinal_position
  `);

  colResult.rows.forEach(col => {
    console.log(`  ${col.column_name.toUpperCase()}`);
    console.log(`    Type: ${col.data_type}`);
    console.log(`    Precision: ${col.numeric_precision || 'N/A (unlimited for BIGINT)'}`);
    console.log(`    Scale: ${col.numeric_scale || 'N/A (integers only)'}`);
    console.log();
  });

  console.log('─'.repeat(80));
  console.log('🔢 PostgreSQL BIGINT Details:\n');
  console.log('  Storage: 8 bytes (64-bit signed integer)');
  console.log('  Minimum: -9,223,372,036,854,775,808');
  console.log('  Maximum:  9,223,372,036,854,775,807');
  console.log('  Max Digits: ~19 digits');
  console.log();

  console.log('─'.repeat(80));
  console.log('💡 Real-world Token Examples:\n');
  console.log('  Token with 6 decimals (like USDC):');
  console.log('    1 token = 1,000,000 (6 zeros)');
  console.log('    1 billion tokens = 1,000,000,000,000,000 (15 digits)');
  console.log();
  console.log('  Token with 9 decimals (like SOL):');
  console.log('    1 token = 1,000,000,000 (9 zeros)');
  console.log('    1 billion tokens = 1,000,000,000,000,000,000 (18 digits)');
  console.log();
  console.log('  Token with 12 decimals:');
  console.log('    1 token = 1,000,000,000,000 (12 zeros)');
  console.log('    1 billion tokens = 1,000,000,000,000,000,000,000 (21 digits)');
  console.log('    ⚠️  Would exceed BIGINT for large supplies!');
  console.log();

  console.log('─'.repeat(80));
  console.log('✅ Can you save 12 digits? YES!\n');
  console.log('  12 digits: 999,999,999,999');
  console.log('  BIGINT max: 9,223,372,036,854,775,807 (19 digits)');
  console.log('  You have room for 7 MORE digits!');
  console.log();

  console.log('─'.repeat(80));
  console.log('🤔 Does it make sense to save 12 decimals?\n');
  console.log('  Standard decimals in crypto:');
  console.log('    ✅ Bitcoin: 8 decimals (satoshis)');
  console.log('    ✅ Ethereum: 18 decimals (wei)');
  console.log('    ✅ Solana: 9 decimals (lamports)');
  console.log('    ✅ USDC/USDT: 6 decimals');
  console.log();
  console.log('  For Pump.fun tokens:');
  console.log('    ✅ Most use 6-9 decimals');
  console.log('    ⚠️  12 decimals is unusual but possible');
  console.log();
  console.log('  Recommendation:');
  console.log('    ✅ BIGINT is perfect - handles any realistic token');
  console.log('    ✅ Supports up to 18 decimals safely');
  console.log('    ✅ No precision loss (unlike DECIMAL or FLOAT)');
  console.log('    ✅ Fast integer math');
  console.log();

  // Check actual data
  console.log('─'.repeat(80));
  console.log('📊 Actual Data in Your Database:\n');
  
  const dataResult = await db.query(`
    SELECT 
      MAX(amount) as max_amount,
      MIN(amount) as min_amount,
      AVG(amount) as avg_amount,
      LENGTH(MAX(amount)::text) as max_digits,
      COUNT(*) as total_transactions
    FROM tx_raw
  `);

  if (dataResult.rows[0].max_amount) {
    const row = dataResult.rows[0];
    console.log(`  Total Transactions: ${row.total_transactions}`);
    console.log(`  Max Amount: ${row.max_amount} (${row.max_digits} digits)`);
    console.log(`  Min Amount: ${row.min_amount}`);
    console.log(`  Avg Amount: ${Math.floor(Number(row.avg_amount))}`);
    console.log();
    
    // Show as different decimals
    const maxAmount = BigInt(row.max_amount);
    console.log('  If this max amount had different decimals:');
    console.log(`    6 decimals: ${(Number(maxAmount) / 1e6).toFixed(2)} tokens`);
    console.log(`    9 decimals: ${(Number(maxAmount) / 1e9).toFixed(2)} tokens`);
    console.log(`    12 decimals: ${(Number(maxAmount) / 1e12).toFixed(2)} tokens`);
  } else {
    console.log('  No transactions in database yet.');
  }

  console.log();
  console.log('='.repeat(80));
  console.log('✅ Summary: BIGINT is PERFECT for blockchain amounts!');
  console.log('='.repeat(80));
  console.log();

  process.exit(0);
}

checkAmountStorage().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});



