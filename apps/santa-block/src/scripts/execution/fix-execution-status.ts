#!/usr/bin/env tsx
/**
 * Fix Execution Status
 * 
 * Updates execution status from "pending" to "completed" for dry-run executions
 * that should be visible on the frontend
 * 
 * Usage:
 *   npm run fix:execution-status -- --day 1
 */

import { db, giftExecRepo } from '../../database';

interface FixOptions {
  day: number;
}

async function fixExecutionStatus(options: FixOptions) {
  const { day } = options;

  console.log(`\n🔧 Fixing Execution Status for Day ${day}\n`);

  try {
    // Get executions for this day
    const executions = await giftExecRepo.findByDay(day);
    
    if (executions.length === 0) {
      console.log('❌ No executions found for this day\n');
      return;
    }

    for (const exec of executions) {
      console.log(`Found execution: ${exec.id}`);
      console.log(`  Current status: ${exec.status}`);
      console.log(`  Winners: ${typeof exec.winners === 'string' ? JSON.parse(exec.winners).length : exec.winners?.length || 0}`);
      
      if (exec.status === 'pending') {
        // Update to executed (valid statuses: pending, executed, confirmed, failed)
        await db.query(
          `UPDATE gift_exec SET status = 'executed' WHERE id = $1`,
          [exec.id]
        );
        console.log(`  ✅ Updated status to "executed"\n`);
      } else {
        console.log(`  ℹ️  Status is already "${exec.status}"\n`);
      }
    }

    console.log('✅ Done!\n');

  } catch (error) {
    console.error('❌ Error fixing execution status:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): FixOptions {
  const args = process.argv.slice(2);
  const options: FixOptions = { day: 1 };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--day' && args[i + 1]) {
      options.day = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  await fixExecutionStatus(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

