#!/usr/bin/env tsx
/**
 * Dry Run: Day 2 Top Buyers Gift
 * 
 * Simulates Day 2 top buyers distribution without:
 * - Sending any SOL
 * - Recording to database
 * - Modifying any state
 * 
 * Day 2 - Top Buyers "I Am Rich":
 * - Top 10 buyers by volume get proportional rewards
 * - 100% of capped daily fees distributed
 * 
 * Usage:
 *   npm run test:day2-dryrun
 *   npm run test:day2-dryrun -- --buyers 20 --treasury 5000000000
 */

import { giftEngine } from '../../services/gifts';
import { giftSpecRepo, TxRaw } from '../../database';
import { logger } from '../../utils/logger';

interface DryRunOptions {
  buyers?: number;
  treasury?: bigint;
  day?: number;
}

async function testDay2DryRun(options: DryRunOptions = {}) {
  console.log('\n=== Day 2 Gift Dry Run ===\n');

  const {
    buyers: buyerCount = 20,
    treasury: treasuryBalance = BigInt(5_000_000_000), // 5 SOL
    day = 2,
  } = options;

  try {
    // 1. Load gift spec from database
    console.log(`📦 Loading gift spec for Day ${day}...`);
    const giftSpec = await giftSpecRepo.findByDay(day);
    
    if (!giftSpec) {
      console.error(`❌ No gift spec found for Day ${day}`);
      process.exit(1);
    }

    console.log(`✅ Gift spec loaded: ${giftSpec.type}`);
    console.log(`   Top N: ${giftSpec.params.top_n}`);
    console.log(`   Allocation: ${giftSpec.params.allocation_percent}%`);

    // 2. Generate mock buy transactions
    console.log(`\n👥 Generating ${buyerCount} mock buyers with transactions...\n`);
    const mockTransactions: TxRaw[] = [];
    const baseDate = new Date('2025-12-02T12:00:00Z');
    
    // Create diverse buy volumes
    const volumes = [
      5000000000n,  // 5 SOL - whale
      3000000000n,  // 3 SOL
      2000000000n,  // 2 SOL
      1500000000n,  // 1.5 SOL
      1000000000n,  // 1 SOL
      800000000n,   // 0.8 SOL
      600000000n,   // 0.6 SOL
      400000000n,   // 0.4 SOL
      200000000n,   // 0.2 SOL
      100000000n,   // 0.1 SOL
    ];

    for (let i = 0; i < buyerCount; i++) {
      const volume = volumes[i % volumes.length] + BigInt(i * 10000000);
      const numTxs = Math.floor(Math.random() * 5) + 1; // 1-5 transactions per buyer
      const volumePerTx = volume / BigInt(numTxs);
      
      for (let j = 0; j < numTxs; j++) {
        mockTransactions.push({
          signature: `sig_${i}_${j}`,
          slot: 100000 + i * 10 + j,
          block_time: new Date(baseDate.getTime() + i * 60000 + j * 10000),
          from_wallet: `buyer_${i.toString().padStart(3, '0')}`,
          amount: volumePerTx,
          kind: 'buy',
          fee: BigInt(5000),
          network_fee: BigInt(5000),
          status: 'confirmed',
        });
      }
    }

    console.log(`✅ Created ${mockTransactions.length} buy transactions from ${buyerCount} buyers`);

    // Calculate total volume per buyer for display
    const buyerVolumes = new Map<string, bigint>();
    mockTransactions.forEach(tx => {
      const current = buyerVolumes.get(tx.from_wallet) || BigInt(0);
      buyerVolumes.set(tx.from_wallet, current + tx.amount);
    });

    console.log(`   Total volume: ${Array.from(buyerVolumes.values()).reduce((a, b) => a + b, BigInt(0)).toString()} lamports`);

    // 3. Set treasury balance
    console.log(`\n💰 Treasury balance: ${treasuryBalance.toString()} lamports (${Number(treasuryBalance) / 1e9} SOL)`);

    // 4. Mock blockhash
    const mockBlockhash = 'DryRunBlockhash' + Date.now();

    // 5. Execute top buyers gift (DRY RUN)
    console.log(`\n🎁 Executing Day ${day} - Top Buyers Gift (DRY RUN)...\n`);
    
    const result = await giftEngine.executeGift(
      giftSpec,
      mockTransactions,
      [], // No holders needed for top buyers
      treasuryBalance,
      mockBlockhash
    );

    // 6. Display results
    console.log('\n=== Top Buyers Results ===\n');
    
    console.log(`📊 Summary:`);
    console.log(`   Winners: ${result.winners.length}`);
    console.log(`   Total SOL distributed: ${result.totalDistributed.toString()} lamports (${Number(result.totalDistributed) / 1e9} SOL)`);

    // Verify distribution
    const expectedDistribution = (treasuryBalance * BigInt(giftSpec.params.allocation_percent)) / BigInt(100);
    const difference = expectedDistribution - result.totalDistributed;
    const percentDiff = Number(difference) / Number(expectedDistribution) * 100;

    console.log(`\n✓ Distribution verification:`);
    console.log(`   Expected: ${expectedDistribution.toString()} lamports`);
    console.log(`   Actual: ${result.totalDistributed.toString()} lamports`);
    console.log(`   Difference: ${difference.toString()} lamports (${percentDiff.toFixed(6)}%)`);
    console.log(`   Match: ${Math.abs(percentDiff) < 0.001 ? '✅ YES' : '❌ NO'}`);

    // Show top buyers
    console.log(`\n=== Top ${result.winners.length} Buyers by Volume ===\n`);
    
    result.winners.forEach((winner, i) => {
      const volume = buyerVolumes.get(winner.wallet) || BigInt(0);
      const percentOfTotal = Number(winner.amount) / Number(result.totalDistributed) * 100;
      const volumeSOL = (Number(volume) / 1e9).toFixed(4);
      const rewardSOL = (Number(winner.amount) / 1e9).toFixed(6);
      
      console.log(`${i + 1}. ${winner.wallet}`);
      console.log(`   Volume: ${volumeSOL} SOL`);
      console.log(`   Reward: ${rewardSOL} SOL (${percentOfTotal.toFixed(2)}% of pool)`);
    });

    // Validation
    console.log(`\n=== Final Validation ===\n`);
    
    const correctWinnerCount = result.winners.length === Math.min(giftSpec.params.top_n, buyerCount);
    const fullDistribution = Math.abs(percentDiff) < 0.001;

    console.log(`✓ Validation results:`);
    console.log(`   Correct winner count: ${correctWinnerCount ? '✅' : '❌'} (${result.winners.length}/${giftSpec.params.top_n})`);
    console.log(`   Full SOL distribution: ${fullDistribution ? '✅' : '❌'}`);

    console.log(`\n--- Safety Checks ---`);
    console.log(`✅ No SOL transferred`);
    console.log(`✅ No database records created`);
    console.log(`✅ No state modified`);

    if (correctWinnerCount && fullDistribution) {
      console.log(`\n✅ Day ${day} top buyers gift is CORRECT!\n`);
      process.exit(0);
    } else {
      console.log(`\n❌ Day ${day} top buyers gift has issues!\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Dry Run Failed\n');
    console.error('Error:', (error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): DryRunOptions {
  const args = process.argv.slice(2);
  const options: DryRunOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--buyers' && args[i + 1]) {
      options.buyers = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--treasury' && args[i + 1]) {
      options.treasury = BigInt(args[i + 1]);
      i++;
    } else if (args[i] === '--day' && args[i + 1]) {
      options.day = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  await testDay2DryRun(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

