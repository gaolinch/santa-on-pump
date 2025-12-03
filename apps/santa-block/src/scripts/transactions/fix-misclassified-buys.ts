#!/usr/bin/env ts-node

/**
 * Fix Misclassified BUY Transactions
 * 
 * This script identifies and fixes transactions that were incorrectly classified as SELL
 * when they should have been BUY. This happens when the bonding curve account wasn't
 * properly detected.
 * 
 * The fix:
 * - Detects bonding curve accounts by their large balance (> 100,000 tokens)
 * - When bonding curve balance DECREASES = BUY (tokens going out to buyers)
 * - When bonding curve balance INCREASES = SELL (tokens coming in from sellers)
 */

import { solanaService } from '../../services/solana';
import { db } from '../../database';
import { logger } from '../../utils/logger';

interface FixResult {
  signature: string;
  oldKind: string;
  newKind: string;
  success: boolean;
  error?: string;
}

async function fixMisclassifiedTransactions(dryRun: boolean = true): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🔧 Fix Misclassified BUY Transactions');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (no changes)' : '✍️  LIVE (will update database)'}\n`);

  try {
    // Get all SELL transactions from the database
    const result = await db.query<{ signature: string; kind: string }>(
      `SELECT signature, kind FROM tx_raw WHERE kind = 'sell' ORDER BY block_time DESC`
    );

    const transactions = result.rows;
    console.log(`Found ${transactions.length} SELL transactions to check\n`);

    if (transactions.length === 0) {
      console.log('No transactions to fix.\n');
      return;
    }

    const fixes: FixResult[] = [];
    let checked = 0;
    let needsFixing = 0;
    let fixed = 0;
    let errors = 0;

    console.log('Checking transactions...\n');

    for (const tx of transactions) {
      checked++;
      
      if (checked % 10 === 0) {
        console.log(`Progress: ${checked}/${transactions.length} checked...`);
      }

      try {
        // Fetch transaction from blockchain
        const parsedTx = await solanaService.getParsedTransaction(tx.signature);
        
        if (!parsedTx) {
          logger.warn({ signature: tx.signature }, 'Transaction not found on blockchain');
          continue;
        }

        // Re-parse with the fixed logic
        const transfer = solanaService.parseTokenTransfer(parsedTx, tx.signature);
        
        if (!transfer) {
          logger.warn({ signature: tx.signature }, 'Could not parse transfer');
          continue;
        }

        // Check if classification changed
        if (transfer.kind !== tx.kind) {
          needsFixing++;
          
          console.log(`\n❌ Misclassified: ${tx.signature}`);
          console.log(`   Old: ${tx.kind.toUpperCase()}`);
          console.log(`   New: ${transfer.kind.toUpperCase()}`);

          if (!dryRun) {
            // Update the database
            await db.query(
              `UPDATE tx_raw SET kind = $1 WHERE signature = $2`,
              [transfer.kind, tx.signature]
            );
            
            console.log(`   ✅ Fixed!`);
            fixed++;
          }

          fixes.push({
            signature: tx.signature,
            oldKind: tx.kind,
            newKind: transfer.kind,
            success: true,
          });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        errors++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ error, signature: tx.signature }, 'Error processing transaction');
        
        fixes.push({
          signature: tx.signature,
          oldKind: tx.kind,
          newKind: 'error',
          success: false,
          error: errorMessage,
        });
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  📊 Summary');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Total checked:        ${checked}`);
    console.log(`Needs fixing:         ${needsFixing}`);
    console.log(`Fixed:                ${fixed}`);
    console.log(`Errors:               ${errors}`);
    console.log(`Correct:              ${checked - needsFixing - errors}`);

    if (dryRun && needsFixing > 0) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log('   Run with --live to apply fixes:\n');
      console.log('   npm run fix-misclassified-buys -- --live\n');
    } else if (!dryRun && fixed > 0) {
      console.log('\n✅ Database updated successfully!\n');
    }

    if (fixes.length > 0) {
      console.log('\nTransactions that need fixing:');
      console.log('─────────────────────────────────────────────────────────────');
      fixes.forEach(fix => {
        if (fix.success) {
          console.log(`${fix.signature}: ${fix.oldKind} → ${fix.newKind}`);
        } else {
          console.log(`${fix.signature}: ERROR - ${fix.error}`);
        }
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = !args.includes('--live');

fixMisclassifiedTransactions(dryRun)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });

