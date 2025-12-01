#!/usr/bin/env tsx
/**
 * Demo: Granular Logging to Database
 * 
 * Demonstrates how execution logs are saved to the database
 * with step-by-step granular details
 */

import { giftEngine } from '../services/gifts';
import { giftLogger } from '../services/gift-logger';
import { giftSpecRepo, HolderSnapshot, giftExecutionLogRepo, giftExecutionSummaryRepo, db } from '../database';
import { logger } from '../utils/logger';

async function demoGranularLogging() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     GRANULAR LOGGING DEMO - Database Storage          ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    const day = 1;

    // 1. Load gift spec
    console.log('📦 Step 1: Loading gift spec from database...\n');
    const giftSpec = await giftSpecRepo.findByDay(day);
    
    if (!giftSpec) {
      console.error(`❌ No gift spec found for Day ${day}`);
      process.exit(1);
    }

    console.log(`✅ Gift spec loaded: ${giftSpec.type}\n`);

    // 2. Start execution (this initializes logging)
    console.log('🚀 Step 2: Starting gift execution...\n');
    giftLogger.startExecution(day, giftSpec.type, {
      demo: true,
      mode: 'granular_logging_test',
    });

    // 3. Generate mock holders
    console.log('👥 Step 3: Generating mock holders...\n');
    const mockHolders: HolderSnapshot[] = [];
    const baseDate = new Date('2025-12-01');
    
    for (let i = 0; i < 20; i++) {
      const balance = BigInt(1000000 - i * 10000);
      mockHolders.push({
        day: baseDate,
        wallet: `wallet_${i.toString().padStart(3, '0')}`,
        balance,
        rank: i + 1,
      });
    }

    console.log(`✅ Created ${mockHolders.length} mock holders\n`);

    // 4. Execute gift (this will log all steps to database)
    console.log('🎁 Step 4: Executing gift with granular logging...\n');
    
    const treasuryBalance = BigInt(5_000_000_000); // 5 SOL
    const mockBlockhash = 'DemoBlockhash' + Date.now();

    const result = await giftEngine.executeGift(
      giftSpec,
      [],
      mockHolders,
      treasuryBalance,
      mockBlockhash
    );

    console.log('\n✅ Gift execution completed!\n');
    console.log(`   Winners: ${result.winners.length}`);
    console.log(`   Total Distributed: ${(Number(result.totalDistributed) / 1e9).toFixed(4)} SOL\n`);

    // 5. Mark execution as successful
    await giftLogger.successExecution(
      day,
      result.winners.length,
      result.totalDistributed,
      {
        demo: true,
        executedAt: new Date().toISOString(),
      }
    );

    // 6. Query and display saved logs
    console.log('📊 Step 5: Querying saved logs from database...\n');

    const summaries = await giftExecutionSummaryRepo.findByDay(day);
    const latestSummary = summaries[0];

    if (!latestSummary) {
      console.error('❌ No summary found in database');
      process.exit(1);
    }

    console.log('✅ Execution Summary from Database:');
    console.log(`   Execution ID: ${latestSummary.execution_id}`);
    console.log(`   Day: ${latestSummary.day}`);
    console.log(`   Gift Type: ${latestSummary.gift_type}`);
    console.log(`   Status: ${latestSummary.status}`);
    console.log(`   Duration: ${latestSummary.duration_ms}ms`);
    console.log(`   Winners: ${latestSummary.winner_count}`);
    console.log(`   Total Distributed: ${(Number(latestSummary.total_distributed) / 1e9).toFixed(4)} SOL\n`);

    // Query granular logs
    const logs = await giftExecutionLogRepo.findByExecutionId(latestSummary.execution_id);

    console.log(`📋 Granular Steps from Database (${logs.length} steps):\n`);

    logs.forEach((log, index) => {
      console.log(`${index + 1}. Step ${log.step_number}: ${log.step_name}`);
      console.log(`   Message: ${log.message}`);
      console.log(`   Status: ${log.step_status}`);
      console.log(`   Level: ${log.log_level}`);
      
      if (log.data) {
        const dataStr = typeof log.data === 'string' ? log.data : JSON.stringify(log.data);
        const data = JSON.parse(dataStr);
        console.log(`   Data:`, JSON.stringify(data, null, 4));
      }
      
      console.log('');
    });

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║     ✅ GRANULAR LOGGING DEMO COMPLETE                  ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('💡 Key Points:');
    console.log('   ✓ High-level summary saved to gift_execution_summary');
    console.log('   ✓ Step-by-step logs saved to gift_execution_logs');
    console.log('   ✓ Each step includes structured data (counts, amounts, etc.)');
    console.log('   ✓ Logs include sample winners for verification');
    console.log('   ✓ All data queryable via SQL or API\n');

    console.log('📝 Query Examples:');
    console.log('   npm run view:logs -- --day 1');
    console.log(`   npm run view:logs -- --execution-id ${latestSummary.execution_id}\n`);

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Demo Failed\n');
    console.error('Error:', (error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await db.close();
  }
}

demoGranularLogging();

