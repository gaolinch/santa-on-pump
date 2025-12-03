#!/usr/bin/env tsx

/**
 * Show COMPLETE transaction object from Helius RPC
 * 
 * Usage:
 *   npx tsx src/scripts/show-helius-transaction.ts <signature>
 */

import '../config/index';
import { solanaService } from '../../services/solana';
import util from 'util';

async function main() {
  const signature = process.argv[2];

  if (!signature) {
    console.log('❌ Please provide a transaction signature');
    console.log('Usage: npx tsx src/scripts/show-helius-transaction.ts <signature>');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(100));
  console.log(`COMPLETE TRANSACTION OBJECT FROM HELIUS`);
  console.log('='.repeat(100));
  console.log(`\nSignature: ${signature}\n`);
  console.log('Fetching from Helius RPC...\n');

  const transaction = await solanaService.getTransaction(signature);

  if (!transaction) {
    console.log('❌ Transaction not found\n');
    process.exit(1);
  }

  console.log('='.repeat(100));
  console.log('FULL TRANSACTION OBJECT (with all nested fields expanded)');
  console.log('='.repeat(100));
  console.log('\n');

  // Display with maximum depth and no truncation
  console.log(util.inspect(transaction, {
    depth: 20,           // Show all nested levels
    colors: true,        // Colorize output
    maxArrayLength: null, // Show all array elements
    breakLength: 120,    // Line wrapping
    compact: false       // Expanded format
  }));

  console.log('\n' + '='.repeat(100));
  console.log('TRANSACTION OBJECT AS JSON (for copy/paste)');
  console.log('='.repeat(100));
  console.log('\n');

  // Convert to JSON (handling BigInt)
  const jsonString = JSON.stringify(transaction, (key, value) => {
    if (typeof value === 'bigint') {
      return value.toString() + 'n';
    }
    // Convert PublicKey objects to strings
    if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'PublicKey') {
      return value.toString();
    }
    return value;
  }, 2);

  console.log(jsonString);

  console.log('\n' + '='.repeat(100));
  console.log('KEY STRUCTURE OVERVIEW');
  console.log('='.repeat(100));
  console.log(`
Root Level Fields:
  - slot: ${transaction.slot}
  - blockTime: ${transaction.blockTime}
  - version: ${transaction.version}
  
  - meta: (Transaction metadata)
    ├─ fee: ${transaction.meta?.fee}
    ├─ err: ${JSON.stringify(transaction.meta?.err)}
    ├─ computeUnitsConsumed: ${transaction.meta?.computeUnitsConsumed}
    ├─ preBalances: Array[${transaction.meta?.preBalances?.length}]
    ├─ postBalances: Array[${transaction.meta?.postBalances?.length}]
    ├─ preTokenBalances: Array[${transaction.meta?.preTokenBalances?.length}]
    ├─ postTokenBalances: Array[${transaction.meta?.postTokenBalances?.length}]
    ├─ logMessages: Array[${transaction.meta?.logMessages?.length}]
    ├─ innerInstructions: Array[${transaction.meta?.innerInstructions?.length}]
    ├─ rewards: ${(transaction.meta as any)?.rewards || 'N/A'}
    └─ loadedAddresses: ${JSON.stringify(transaction.meta?.loadedAddresses)}
  
  - transaction: (Transaction details)
    ├─ signatures: Array[${transaction.transaction.signatures.length}]
    └─ message:
       ├─ accountKeys: Array[${transaction.transaction.message.accountKeys.length}]
       ├─ instructions: Array[${transaction.transaction.message.instructions.length}]
       ├─ recentBlockhash: ${transaction.transaction.message.recentBlockhash}
       └─ addressTableLookups: ${transaction.transaction.message.addressTableLookups}
`);

  console.log('='.repeat(100));
  console.log('\n');

  process.exit(0);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

