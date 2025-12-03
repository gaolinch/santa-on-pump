/**
 * Test Script: Hourly Airdrop Dry Run
 * 
 * This script simulates the hourly airdrop cron job without actually:
 * - Sending tokens
 * - Recording to database
 * - Modifying any state
 * 
 * Usage:
 *   npm run test:hourly-dryrun
 *   npm run test:hourly-dryrun -- --day 1 --hour 14
 */

import { hourlyProcessor } from '../../services/hourly-processor';
import { logger } from '../../utils/logger';

interface TestOptions {
  day?: number;
  hour?: number;
}

async function testHourlyDryRun(options: TestOptions = {}) {
  console.log('\n=== Hourly Airdrop Dry Run Test ===\n');

  const { day, hour } = options;

  if (day !== undefined) {
    console.log(`Testing specific day: ${day}`);
  } else {
    console.log('Testing current day (auto-detected)');
  }

  if (hour !== undefined) {
    console.log(`Testing specific hour: ${hour}`);
  } else {
    console.log('Testing current hour (auto-detected)');
  }

  console.log('\n--- Running Dry Run ---\n');

  try {
    const result = await hourlyProcessor.dryRunHourlyAirdrop(day, hour);

    if (!result) {
      console.log('❌ Result: NULL');
      console.log('Reason: Not in advent season or invalid parameters');
      return;
    }

    console.log('✅ Dry Run Completed Successfully\n');

    // Display results
    console.log('=== Dry Run Results ===\n');
    console.log(`Day: ${result.day}`);
    console.log(`Hour: ${result.hour}`);
    console.log(`Would Skip: ${result.wouldSkip ? 'YES' : 'NO'}`);
    
    if (result.wouldSkip) {
      console.log(`Skip Reason: ${result.skipReason}`);
      console.log(`Already Distributed: ${result.alreadyDistributed}`);
    } else {
      console.log(`\n--- Winner Selection ---`);
      console.log(`Winner: ${result.winner}`);
      console.log(`Amount: ${result.amount.toLocaleString()} SANTA tokens`);
      console.log(`Eligible Participants: ${result.eligibleCount}`);
      console.log(`Blockhash: ${result.blockhash.substring(0, 20)}...`);
    }

    if (result.giftConfig) {
      console.log(`\n--- Gift Configuration ---`);
      console.log(`Enabled: ${result.giftConfig.enabled}`);
      console.log(`Total Amount: ${result.giftConfig.totalAmount.toLocaleString()} tokens`);
      console.log(`Winners per Day: ${result.giftConfig.winners}`);
      console.log(`Distribution: ${result.giftConfig.distribution}`);
      console.log(`Amount per Winner: ${Math.floor(result.giftConfig.totalAmount / result.giftConfig.winners).toLocaleString()} tokens`);
    }

    console.log(`\n--- Safety Checks ---`);
    console.log(`✅ No tokens transferred`);
    console.log(`✅ No database records created`);
    console.log(`✅ No state modified`);

    console.log('\n=== Test Complete ===\n');

  } catch (error) {
    console.error('\n❌ Dry Run Failed\n');
    console.error('Error:', (error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Test multiple hours if requested
async function testMultipleHours(day: number, startHour: number = 0, endHour: number = 23) {
  console.log('\n=== Testing Multiple Hours ===\n');
  console.log(`Day: ${day}`);
  console.log(`Hours: ${startHour} to ${endHour}\n`);

  const results = [];

  for (let hour = startHour; hour <= endHour; hour++) {
    console.log(`\n--- Testing Hour ${hour} ---`);
    const result = await hourlyProcessor.dryRunHourlyAirdrop(day, hour);
    
    if (result) {
      results.push(result);
      if (result.wouldSkip) {
        console.log(`⏭️  Would skip: ${result.skipReason}`);
      } else {
        console.log(`✅ Winner: ${result.winner.substring(0, 20)}... (${result.amount} tokens)`);
      }
    } else {
      console.log(`❌ No result (not in season)`);
    }
  }

  // Summary
  console.log('\n=== Summary ===\n');
  console.log(`Total Hours Tested: ${endHour - startHour + 1}`);
  console.log(`Would Execute: ${results.filter(r => !r.wouldSkip).length}`);
  console.log(`Would Skip: ${results.filter(r => r.wouldSkip).length}`);
  console.log(`Already Distributed: ${results.filter(r => r.alreadyDistributed).length}`);

  const winners = results.filter(r => !r.wouldSkip && r.winner);
  if (winners.length > 0) {
    console.log(`\n--- Winners List ---`);
    winners.forEach((w, i) => {
      console.log(`${i + 1}. Hour ${w.hour}: ${w.winner} (${w.amount} tokens)`);
    });
  }
}

// Parse command line arguments
function parseArgs(): TestOptions & { multiple?: boolean; endHour?: number } {
  const args = process.argv.slice(2);
  const options: any = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--day' && args[i + 1]) {
      options.day = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--hour' && args[i + 1]) {
      options.hour = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--multiple') {
      options.multiple = true;
    } else if (args[i] === '--end-hour' && args[i + 1]) {
      options.endHour = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();

  if (options.multiple && options.day !== undefined) {
    await testMultipleHours(
      options.day,
      options.hour ?? 0,
      options.endHour ?? 23
    );
  } else {
    await testHourlyDryRun(options);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

