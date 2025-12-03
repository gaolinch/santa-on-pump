#!/usr/bin/env tsx
/**
 * View Gift Execution Logs
 * 
 * Query and display execution logs from database
 * 
 * Usage:
 *   npm run view:logs
 *   npm run view:logs -- --day 1
 *   npm run view:logs -- --execution-id abc-123
 *   npm run view:logs -- --recent 10
 */

import { db, giftExecutionLogRepo, giftExecutionSummaryRepo } from '../../database';
import { logger } from '../../utils/logger';

interface ViewOptions {
  day?: number;
  executionId?: string;
  recent?: number;
}

async function viewExecutionLogs(options: ViewOptions = {}) {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║         GIFT EXECUTION LOGS VIEWER                     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    if (options.executionId) {
      await viewByExecutionId(options.executionId);
    } else if (options.day) {
      await viewByDay(options.day);
    } else {
      await viewRecent(options.recent || 5);
    }

    console.log('\n✅ Query completed\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Query failed\n');
    console.error('Error:', (error as Error).message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

async function viewByExecutionId(executionId: string) {
  console.log(`📋 Viewing execution: ${executionId}\n`);

  // Get summary
  const summary = await giftExecutionSummaryRepo.findByExecutionId(executionId);
  if (!summary) {
    console.log('❌ Execution not found\n');
    return;
  }

  displaySummary(summary);

  // Get detailed logs
  const logs = await giftExecutionLogRepo.findByExecutionId(executionId);
  
  if (logs.length === 0) {
    console.log('No detailed logs found\n');
    return;
  }

  console.log(`\n📊 Detailed Steps (${logs.length} steps):\n`);
  displayLogs(logs);
}

async function viewByDay(day: number) {
  console.log(`📅 Viewing executions for Day ${day}\n`);

  // Get summaries
  const summaries = await giftExecutionSummaryRepo.findByDay(day);
  
  if (summaries.length === 0) {
    console.log('❌ No executions found for this day\n');
    return;
  }

  console.log(`Found ${summaries.length} execution(s):\n`);
  
  for (const summary of summaries) {
    displaySummary(summary);
    
    // Get detailed logs
    const logs = await giftExecutionLogRepo.findByExecutionId(summary.execution_id);
    if (logs.length > 0) {
      console.log(`\n  📊 Steps (${logs.length}):\n`);
      logs.forEach(log => {
        console.log(`    ${log.step_number}. ${log.step_name}`);
        console.log(`       ${log.message}`);
        if (log.duration_ms) {
          console.log(`       Duration: ${log.duration_ms}ms`);
        }
      });
    }
    console.log('');
  }
}

async function viewRecent(limit: number) {
  console.log(`📋 Viewing ${limit} most recent executions\n`);

  const summaries = await giftExecutionSummaryRepo.findRecent(limit);
  
  if (summaries.length === 0) {
    console.log('❌ No executions found\n');
    return;
  }

  console.log(`Found ${summaries.length} execution(s):\n`);
  
  for (const summary of summaries) {
    displaySummary(summary);
    console.log('');
  }
}

function displaySummary(summary: any) {
  const statusEmoji = getStatusEmoji(summary.status);
  
  console.log(`${statusEmoji} Execution Summary`);
  console.log(`  ID: ${summary.execution_id}`);
  console.log(`  Day: ${summary.day}`);
  console.log(`  Gift Type: ${summary.gift_type}`);
  console.log(`  Status: ${summary.status.toUpperCase()}`);
  console.log(`  Start: ${summary.start_time.toISOString()}`);
  
  if (summary.end_time) {
    console.log(`  End: ${summary.end_time.toISOString()}`);
    console.log(`  Duration: ${summary.duration_ms}ms`);
  }
  
  if (summary.winner_count) {
    console.log(`  Winners: ${summary.winner_count}`);
  }
  
  if (summary.total_distributed) {
    const sol = (Number(summary.total_distributed) / 1e9).toFixed(4);
    console.log(`  Total Distributed: ${summary.total_distributed} lamports (${sol} SOL)`);
  }
  
  if (summary.error_message) {
    console.log(`  Error: ${summary.error_message}`);
  }
}

function displayLogs(logs: any[]) {
  logs.forEach(log => {
    const timestamp = new Date(log.timestamp).toISOString();
    const level = log.log_level.toUpperCase().padEnd(5);
    
    console.log(`[${timestamp}] [${level}] Step ${log.step_number}: ${log.step_name}`);
    console.log(`  Status: ${log.step_status}`);
    console.log(`  ${log.message}`);
    
    if (log.data) {
      const dataStr = typeof log.data === 'string' ? log.data : JSON.stringify(log.data);
      const data = JSON.parse(dataStr);
      console.log(`  Data:`, JSON.stringify(data, null, 4));
    }
    
    if (log.duration_ms) {
      console.log(`  Duration: ${log.duration_ms}ms`);
    }
    
    console.log('');
  });
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'started': return '🚀';
    case 'success': return '✅';
    case 'failed': return '❌';
    case 'skipped': return '⏭️';
    default: return '❓';
  }
}

// Parse command line arguments
function parseArgs(): ViewOptions {
  const args = process.argv.slice(2);
  const options: ViewOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--day' && args[i + 1]) {
      options.day = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--execution-id' && args[i + 1]) {
      options.executionId = args[i + 1];
      i++;
    } else if (args[i] === '--recent' && args[i + 1]) {
      options.recent = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

// Main execution
const options = parseArgs();
viewExecutionLogs(options);

