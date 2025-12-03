#!/usr/bin/env tsx
/**
 * Test Creator Fee Extraction
 * 
 * This script helps test and debug creatorFee extraction from transactions.
 * Run it with a transaction signature to see detailed logs about where
 * creatorFee is found (or not found).
 * 
 * Usage:
 *   npm run test-creator-fee <signature>
 *   or
 *   npx tsx src/scripts/test-creator-fee-extraction.ts <signature>
 */

import { solanaService } from '../../services/solana';
import { logger } from '../../utils/logger';

async function testCreatorFeeExtraction(signature: string) {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 TESTING CREATOR FEE EXTRACTION');
  console.log('='.repeat(80));
  console.log(`Signature: ${signature}\n`);

  try {
    // Fetch the transaction
    console.log('📥 Fetching transaction from RPC...');
    const tx = await solanaService.getParsedTransaction(signature);
    
    if (!tx) {
      console.error('❌ Transaction not found');
      return;
    }

    console.log('✅ Transaction fetched successfully\n');

    // Display basic transaction info
    console.log('─'.repeat(80));
    console.log('📊 TRANSACTION OVERVIEW');
    console.log('─'.repeat(80));
    console.log(`Slot: ${tx.slot}`);
    console.log(`Block Time: ${tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : 'N/A'}`);
    console.log(`Status: ${tx.meta?.err ? '❌ FAILED' : '✅ SUCCESS'}`);
    console.log(`Network Fee: ${tx.meta?.fee || 0} lamports (${((tx.meta?.fee || 0) / 1e9).toFixed(9)} SOL)`);
    console.log('');

    // Parse the token transfer (this will trigger all the logging)
    console.log('─'.repeat(80));
    console.log('🔄 PARSING TOKEN TRANSFER (check logs below for details)');
    console.log('─'.repeat(80));
    console.log('');

    const transfer = solanaService.parseTokenTransfer(tx, signature);

    console.log('');
    console.log('─'.repeat(80));
    console.log('📋 PARSING RESULTS');
    console.log('─'.repeat(80));

    if (transfer) {
      console.log('✅ Token transfer parsed successfully\n');
      console.log(`From: ${transfer.from}`);
      console.log(`To: ${transfer.to || 'N/A'}`);
      console.log(`Amount: ${transfer.amount.toString()}`);
      console.log(`Kind: ${transfer.kind.toUpperCase()}`);
      console.log('');
      
      if (transfer.protocolFee !== undefined || transfer.creatorFee !== undefined) {
        console.log('✅ PUMP.FUN FEES FOUND!');
        console.log('');
        
        if (transfer.protocolFee !== undefined) {
          console.log('📊 Protocol Fee (0.95%):');
          console.log(`   Value: ${transfer.protocolFee.toString()} lamports`);
          console.log(`   In SOL: ${(Number(transfer.protocolFee) / 1e9).toFixed(9)} SOL`);
          console.log(`   In USD (at $140/SOL): $${((Number(transfer.protocolFee) / 1e9) * 140).toFixed(4)}`);
          console.log('');
        }
        
        if (transfer.creatorFee !== undefined) {
          console.log(`🎨 Creator Fee (${transfer.creatorFeeBps || 30} basis points = ${((transfer.creatorFeeBps || 30) / 100).toFixed(1)}%):`);
          console.log(`   Value: ${transfer.creatorFee.toString()} lamports`);
          console.log(`   In SOL: ${(Number(transfer.creatorFee) / 1e9).toFixed(9)} SOL`);
          console.log(`   In USD (at $140/SOL): $${((Number(transfer.creatorFee) / 1e9) * 140).toFixed(4)}`);
        }
      } else {
        console.log('⚠️  PUMP.FUN FEES NOT FOUND');
      }
    } else {
      console.log('❌ Could not parse token transfer');
    }

    console.log('');
    console.log('─'.repeat(80));
    console.log('💡 TIP: Check the logs above for detailed extraction process');
    console.log('─'.repeat(80));
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Get signature from command line
const signature = process.argv[2];

if (!signature) {
  console.error('❌ Error: Please provide a transaction signature');
  console.log('\nUsage:');
  console.log('  npm run test-creator-fee <signature>');
  console.log('  or');
  console.log('  npx tsx src/scripts/test-creator-fee-extraction.ts <signature>');
  process.exit(1);
}

testCreatorFeeExtraction(signature)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

