#!/usr/bin/env tsx
/**
 * Debug Execution Data
 * 
 * Checks if execution data exists in the database and what it contains
 * 
 * Usage:
 *   npm run debug:execution -- --day 1
 */

import { db, giftExecRepo, giftExecutionSummaryRepo, giftExecutionLogRepo } from '../../database';

interface DebugOptions {
  day: number;
}

async function debugExecution(options: DebugOptions) {
  const { day } = options;

  console.log(`\n🔍 Debugging Execution Data for Day ${day}\n`);

  try {
    // Check gift_exec table
    console.log('1️⃣  Checking gift_exec table...');
    const executions = await giftExecRepo.findByDay(day);
    
    if (executions.length === 0) {
      console.log('   ❌ No execution found in gift_exec table\n');
    } else {
      console.log(`   ✅ Found ${executions.length} execution(s)\n`);
      
      for (const exec of executions) {
        console.log(`   Execution ID: ${exec.id}`);
        console.log(`   Status: ${exec.status}`);
        console.log(`   Execution Time: ${exec.execution_time}`);
        console.log(`   Total Distributed: ${exec.total_distributed?.toString() || 'N/A'}`);
        console.log(`   TX Hashes: ${exec.tx_hashes?.length || 0} hash(es)`);
        
        // Check winners
        let winners = [];
        try {
          winners = typeof exec.winners === 'string' 
            ? JSON.parse(exec.winners) 
            : exec.winners || [];
        } catch (error) {
          console.log(`   ⚠️  Could not parse winners: ${(error as Error).message}`);
        }
        
        console.log(`   Winners Count: ${winners.length}`);
        
        if (winners.length > 0) {
          console.log(`   First 3 winners:`);
          winners.slice(0, 3).forEach((w: any, i: number) => {
            console.log(`     ${i + 1}. ${w.wallet} - ${typeof w.amount === 'string' ? w.amount : w.amount?.toString() || 'N/A'}`);
          });
        } else {
          console.log(`   ⚠️  No winners in execution data!`);
        }
        
        console.log();
      }
    }

    // Check execution summary
    console.log('2️⃣  Checking gift_execution_summary table...');
    const summaries = await giftExecutionSummaryRepo.findByDay(day);
    
    if (summaries.length === 0) {
      console.log('   ⚠️  No execution summary found\n');
    } else {
      console.log(`   ✅ Found ${summaries.length} summary(ies)\n`);
      
      for (const summary of summaries) {
        console.log(`   Summary ID: ${summary.execution_id}`);
        console.log(`   Status: ${summary.status}`);
        console.log(`   Winner Count: ${summary.winner_count}`);
        console.log(`   Start Time: ${summary.start_time}`);
        console.log(`   End Time: ${summary.end_time}`);
        console.log(`   Duration: ${summary.duration_ms}ms`);
        console.log(`   Metadata: ${JSON.stringify(summary.metadata, null, 2)}`);
        console.log();
      }
    }

    // Check execution logs
    console.log('3️⃣  Checking gift_execution_logs table...');
    if (summaries.length > 0 && summaries[0].execution_id) {
      const logs = await giftExecutionLogRepo.findByExecutionId(summaries[0].execution_id);
      console.log(`   ✅ Found ${logs.length} log entries\n`);
      
      if (logs.length > 0) {
        console.log(`   Last 5 log entries:`);
        logs.slice(-5).forEach((log, i) => {
          console.log(`     ${i + 1}. [${log.step_name}] ${log.message} (${log.step_status})`);
        });
      }
    } else {
      console.log('   ⚠️  No execution summary found, cannot fetch logs\n');
    }

    // Test API endpoint response
    console.log('4️⃣  Testing API endpoint format...');
    if (executions.length > 0) {
      const exec = executions[0];
      let winners = [];
      try {
        winners = typeof exec.winners === 'string' 
          ? JSON.parse(exec.winners) 
          : exec.winners || [];
      } catch (error) {
        console.log(`   ⚠️  Could not parse winners for API test`);
      }
      
      const apiResponse = {
        day: day,
        execution: {
          id: exec.id,
          execution_time: exec.execution_time,
          status: exec.status,
          total_distributed: exec.total_distributed?.toString(),
          total_distributed_sol: exec.total_distributed ? (Number(exec.total_distributed) / 1e9).toFixed(9) : '0',
          tx_hashes: exec.tx_hashes || [],
        },
        winners: winners.map((winner: any) => ({
          wallet: winner.wallet,
          amount: typeof winner.amount === 'string' ? winner.amount : winner.amount?.toString(),
          amount_sol: (Number(typeof winner.amount === 'string' ? winner.amount : winner.amount?.toString()) / 1e9).toFixed(9),
        })),
      };
      
      console.log(`   ✅ API response would contain:`);
      console.log(`      - Execution: ${apiResponse.execution ? 'Yes' : 'No'}`);
      console.log(`      - Winners: ${apiResponse.winners.length} winner(s)`);
      console.log(`      - Total Distributed: ${apiResponse.execution.total_distributed_sol} SOL`);
      console.log();
      
      if (apiResponse.winners.length === 0) {
        console.log('   ⚠️  WARNING: API response would have 0 winners!');
        console.log('   This is why the frontend is not showing winners.\n');
      }
    }

    // Summary
    console.log('📊 Summary:');
    console.log(`   Executions found: ${executions.length}`);
    console.log(`   Summaries found: ${summaries.length}`);
    console.log(`   Total winners across all executions: ${executions.reduce((sum, e) => {
      try {
        const w = typeof e.winners === 'string' ? JSON.parse(e.winners) : e.winners || [];
        return sum + w.length;
      } catch {
        return sum;
      }
    }, 0)}`);
    console.log();

  } catch (error) {
    console.error('❌ Error debugging execution:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): DebugOptions {
  const args = process.argv.slice(2);
  const options: DebugOptions = { day: 1 };

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
  await debugExecution(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

