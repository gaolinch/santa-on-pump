#!/usr/bin/env tsx
/**
 * Clean Dry Run Logs
 * 
 * Removes execution logs, summaries, and execution records for a specific day
 * that were created by the full-dryrun:day1 --save-db script.
 * 
 * Usage:
 *   npm run clean-dryrun-logs -- --day 1
 *   npm run clean-dryrun-logs -- --day 1 --confirm
 */

import { db, giftExecRepo, giftExecutionSummaryRepo, giftExecutionLogRepo } from '../../database';
import { logger } from '../../utils/logger';

interface CleanOptions {
  day: number;
  confirm?: boolean;
}

async function cleanDryRunLogs(options: CleanOptions) {
  const { day, confirm = false } = options;

  if (day < 1 || day > 24) {
    console.error('❌ Day must be between 1 and 24');
    process.exit(1);
  }

  console.log(`\n🧹 Cleaning dry run logs for Day ${day}\n`);

  try {
    // Step 1: Find execution records for this day
    console.log(`📋 Step 1: Finding execution records for Day ${day}...`);
    const executions = await giftExecRepo.findByDay(day);
    
    // Filter for dry run executions (check error_message for "DRY RUN")
    const dryRunExecutions = executions.filter(exec => 
      exec.error_message?.includes('DRY RUN') || 
      exec.status === 'pending' // Dry runs are typically marked as pending
    );

    if (dryRunExecutions.length === 0) {
      console.log(`✅ No dry run execution records found for Day ${day}`);
      console.log(`   Total executions found: ${executions.length}`);
      if (executions.length > 0) {
        console.log(`   Note: Found ${executions.length} execution(s), but none appear to be dry runs.`);
        console.log(`   Use --force to clean all executions for this day.`);
      }
      process.exit(0);
    }

    console.log(`✅ Found ${dryRunExecutions.length} dry run execution record(s)`);
    dryRunExecutions.forEach((exec, idx) => {
      console.log(`   ${idx + 1}. ID: ${exec.id}, Status: ${exec.status}, Time: ${exec.execution_time}`);
    });

    // Step 2: Find execution summaries
    console.log(`\n📋 Step 2: Finding execution summaries for Day ${day}...`);
    const summaries = await giftExecutionSummaryRepo.findByDay(day);
    
    // Filter for dry run summaries (check metadata for dryRun flag)
    const dryRunSummaries = summaries.filter(summary => {
      if (!summary.metadata) return false;
      const metadata = typeof summary.metadata === 'string' 
        ? JSON.parse(summary.metadata) 
        : summary.metadata;
      return metadata.dryRun === true;
    });

    console.log(`✅ Found ${dryRunSummaries.length} dry run execution summary/summaries`);
    if (dryRunSummaries.length > 0) {
      dryRunSummaries.forEach((summary, idx) => {
        console.log(`   ${idx + 1}. Execution ID: ${summary.execution_id}, Status: ${summary.status}`);
      });
    }

    // Step 3: Count execution logs
    console.log(`\n📋 Step 3: Counting execution logs...`);
    const allLogs = await giftExecutionLogRepo.findByDay(day);
    
    // Filter logs that belong to dry run executions
    const dryRunExecutionIds = new Set([
      ...dryRunExecutions.map(e => e.id),
      ...dryRunSummaries.map(s => s.execution_id),
    ]);

    const dryRunLogs = allLogs.filter(log => 
      log.execution_id && dryRunExecutionIds.has(log.execution_id)
    );

    console.log(`✅ Found ${dryRunLogs.length} execution log(s) from dry runs`);
    console.log(`   Total logs for day: ${allLogs.length}`);

    // Summary
    console.log(`\n📊 Summary:`);
    console.log(`   Execution records to delete: ${dryRunExecutions.length}`);
    console.log(`   Execution summaries to delete: ${dryRunSummaries.length}`);
    console.log(`   Execution logs to delete: ${dryRunLogs.length}`);

    if (!confirm) {
      console.log(`\n⚠️  This will permanently delete the above records from the database.`);
      console.log(`   Run with --confirm to proceed.`);
      console.log(`   Example: npm run clean-dryrun-logs -- --day ${day} --confirm\n`);
      process.exit(0);
    }

    // Step 4: Delete execution logs first (they reference execution_id)
    console.log(`\n🗑️  Step 4: Deleting execution logs...`);
    let deletedLogs = 0;
    for (const log of dryRunLogs) {
      try {
        await db.query(
          `DELETE FROM gift_execution_logs WHERE id = $1`,
          [log.id]
        );
        deletedLogs++;
      } catch (error) {
        logger.error({ error, logId: log.id }, 'Failed to delete log');
      }
    }
    console.log(`✅ Deleted ${deletedLogs} execution log(s)`);

    // Step 5: Delete execution summaries
    console.log(`\n🗑️  Step 5: Deleting execution summaries...`);
    let deletedSummaries = 0;
    for (const summary of dryRunSummaries) {
      try {
        await db.query(
          `DELETE FROM gift_execution_summary WHERE execution_id = $1`,
          [summary.execution_id]
        );
        deletedSummaries++;
      } catch (error) {
        logger.error({ error, executionId: summary.execution_id }, 'Failed to delete summary');
      }
    }
    console.log(`✅ Deleted ${deletedSummaries} execution summary/summaries`);

    // Step 6: Delete execution records
    console.log(`\n🗑️  Step 6: Deleting execution records...`);
    let deletedExecutions = 0;
    for (const exec of dryRunExecutions) {
      try {
        await db.query(
          `DELETE FROM gift_exec WHERE id = $1`,
          [exec.id]
        );
        deletedExecutions++;
      } catch (error) {
        logger.error({ error, execId: exec.id }, 'Failed to delete execution record');
      }
    }
    console.log(`✅ Deleted ${deletedExecutions} execution record(s)`);

    console.log(`\n✅ Cleanup complete!`);
    console.log(`   Deleted:`);
    console.log(`   - ${deletedLogs} execution log(s)`);
    console.log(`   - ${deletedSummaries} execution summary/summaries`);
    console.log(`   - ${deletedExecutions} execution record(s)\n`);

  } catch (error) {
    console.error('\n❌ Cleanup failed\n');
    console.error('Error:', (error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): CleanOptions {
  const args = process.argv.slice(2);
  const options: CleanOptions = {
    day: 1,
    confirm: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--day' && args[i + 1]) {
      options.day = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--confirm') {
      options.confirm = true;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  await cleanDryRunLogs(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

