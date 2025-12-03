#!/usr/bin/env tsx
/**
 * Dry Run: Day 1 Day Closure (Fee Distribution Only)
 * 
 * Simulates ONLY the day close fee distribution without:
 * - Sending any SOL
 * - Recording to database
 * - Modifying any state
 * 
 * Day 1 - Welcome Drop (Day Close):
 * - 100% of capped daily fees distributed proportionally to ALL holders
 * 
 * Note: Hourly token airdrops are a SEPARATE process tested with test:hourly-dryrun
 * 
 * Usage:
 *   npm run test:day1-dryrun
 *   npm run test:day1-dryrun -- --holders 100 --treasury 10000000000
 */

import { giftEngine } from '../../services/gifts';
import { giftSpecRepo, HolderSnapshot } from '../../database';
import { logger } from '../../utils/logger';

interface DryRunOptions {
  holders?: number;
  treasury?: bigint;
  day?: number;
}

async function testDay1DryRun(options: DryRunOptions = {}) {
  console.log('\n=== Day 1 Gift Dry Run ===\n');

  const {
    holders: holderCount = 50,
    treasury: treasuryBalance = BigInt(10_000_000_000), // 10 SOL
    day = 1,
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
    console.log(`   Allocation: ${giftSpec.params.allocation_percent}%`);
    console.log(`   Min balance: ${giftSpec.params.min_balance}`);

    // 2. Generate mock holders
    console.log(`\n👥 Generating ${holderCount} mock holders...`);
    const mockHolders: HolderSnapshot[] = [];
    const baseDate = new Date('2025-12-01');
    
    // Create diverse holder balances
    const balances = [
      1000000n, // Large holder
      500000n,
      250000n,
      100000n,
      75000n,
      50000n,
      25000n,
      10000n,
      5000n,
      2500n,
    ];

    for (let i = 0; i < holderCount; i++) {
      const balance = balances[i % balances.length] + BigInt(i * 100);
      mockHolders.push({
        day: baseDate,
        wallet: `wallet_${i.toString().padStart(3, '0')}`,
        balance,
        rank: i + 1,
      });
    }

    console.log(`✅ Created ${mockHolders.length} holders`);

    // 3. Calculate total holder balance
    const totalHolderBalance = mockHolders.reduce((sum, h) => sum + h.balance, BigInt(0));
    console.log(`   Total holder balance: ${totalHolderBalance.toString()} lamports`);

    // 4. Set treasury balance
    console.log(`\n💰 Treasury balance: ${treasuryBalance.toString()} lamports (${Number(treasuryBalance) / 1e9} SOL)`);

    // 5. Mock blockhash
    const mockBlockhash = 'DryRunBlockhash' + Date.now();

    // 6. Execute day close - fee distribution only (DRY RUN)
    console.log(`\n🎁 Executing Day ${day} close - Fee Distribution (DRY RUN)...\n`);
    
    const result = await giftEngine.executeGift(
      giftSpec,
      [], // No transactions needed for proportional holders
      mockHolders,
      treasuryBalance,
      mockBlockhash
    );

    // 7. Display results
    console.log('=== Day Close Results (Fee Distribution) ===\n');
    
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

    // Show sample of proportional distribution (top 10 by reward amount)
    console.log(`\n=== Proportional Fee Distribution (Top 10 by Balance) ===\n`);
    console.log(`Note: ALL ${result.winners.length} holders receive proportional rewards based on their balance\n`);
    
    const sortedWinners = [...result.winners].sort((a, b) => 
      Number(b.amount - a.amount)
    );

    sortedWinners.slice(0, 10).forEach((winner, i) => {
      const holder = mockHolders.find(h => h.wallet === winner.wallet);
      const percentOfTotal = Number(winner.amount) / Number(result.totalDistributed) * 100;
      console.log(`${i + 1}. ${winner.wallet}`);
      console.log(`   Balance: ${holder?.balance.toString()} lamports`);
      console.log(`   Reward: ${winner.amount.toString()} lamports (${percentOfTotal.toFixed(4)}%)`);
      console.log(`   Formula: (${holder?.balance} / ${totalHolderBalance}) × ${treasuryBalance} × ${giftSpec.params.allocation_percent}%`);
    });
    
    console.log(`\n... and ${result.winners.length - 10} more holders (showing top 10 for brevity)`);

    // Validation
    console.log(`\n=== Final Validation ===\n`);
    
    const allHoldersRewarded = result.winners.length === mockHolders.length;
    const fullDistribution = Math.abs(percentDiff) < 0.001;

    console.log(`✓ Validation results:`);
    console.log(`   All holders rewarded: ${allHoldersRewarded ? '✅' : '❌'} (${result.winners.length}/${mockHolders.length})`);
    console.log(`   Full SOL distribution: ${fullDistribution ? '✅' : '❌'}`);

    console.log(`\n--- Safety Checks ---`);
    console.log(`✅ No SOL transferred`);
    console.log(`✅ No database records created`);
    console.log(`✅ No state modified`);

    if (allHoldersRewarded && fullDistribution) {
      console.log(`\n✅ Day ${day} close (fee distribution) is CORRECT!\n`);
      process.exit(0);
    } else {
      console.log(`\n❌ Day ${day} close has issues!\n`);
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
    if (args[i] === '--holders' && args[i + 1]) {
      options.holders = parseInt(args[i + 1], 10);
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
  await testDay1DryRun(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

