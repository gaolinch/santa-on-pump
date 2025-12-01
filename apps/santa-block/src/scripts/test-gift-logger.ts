#!/usr/bin/env tsx
/**
 * Test Gift Logger Implementation
 * 
 * This script demonstrates and tests all gift logger features:
 * - Execution tracking (start, success, fail, skip)
 * - Phase logging
 * - Validation logging
 * - Distribution logging
 * - Context-based logging
 * - Audit log integration
 * 
 * Usage:
 *   npm run test:logger
 *   npm run test:logger -- --scenario success
 *   npm run test:logger -- --scenario failure
 *   npm run test:logger -- --scenario skip
 */

import { giftLogger } from '../services/gift-logger';
import { logger } from '../utils/logger';
import { auditLogRepo } from '../database';

interface TestScenario {
  name: string;
  description: string;
  execute: () => Promise<void>;
}

/**
 * Simulate a successful gift execution
 */
async function testSuccessScenario(): Promise<void> {
  const day = 1;
  const giftType = 'proportional_holders';

  console.log('\n🎯 Testing SUCCESS scenario\n');

  // Start execution
  giftLogger.startExecution(day, giftType, {
    testMode: true,
    scenario: 'success',
  });

  // Simulate phases
  await simulatePhase('load_gift_spec', 100);
  await simulatePhase('fetch_data', 200);
  await simulatePhase('execute_gift_rule', 300);

  // Log validation
  giftLogger.logValidation(day, 'min_balance_check', true, {
    minBalance: 1000,
    eligibleHolders: 50,
  });

  giftLogger.logValidation(day, 'treasury_balance_check', true, {
    required: '1000000000',
    available: '10000000000',
  });

  // Log distribution
  giftLogger.logDistribution(day, {
    winnerCount: 50,
    totalAmount: BigInt(5000000000),
    averageAmount: BigInt(100000000),
    minAmount: BigInt(50000000),
    maxAmount: BigInt(200000000),
  });

  await simulatePhase('build_transactions', 150);
  await simulatePhase('simulate_transactions', 100);

  giftLogger.logValidation(day, 'transaction_simulation', true, {
    transactionCount: 5,
    allPassed: true,
  });

  await simulatePhase('submit_multisig', 200);
  await simulatePhase('record_execution', 50);

  // Success
  await giftLogger.successExecution(
    day,
    50,
    BigInt(5000000000),
    {
      giftType,
      transactionCount: 5,
      proposalIds: ['prop_1', 'prop_2', 'prop_3', 'prop_4', 'prop_5'],
    }
  );

  console.log('\n✅ Success scenario completed\n');
}

/**
 * Simulate a failed gift execution
 */
async function testFailureScenario(): Promise<void> {
  const day = 2;
  const giftType = 'top_holders';

  console.log('\n🎯 Testing FAILURE scenario\n');

  // Start execution
  giftLogger.startExecution(day, giftType, {
    testMode: true,
    scenario: 'failure',
  });

  // Simulate phases
  await simulatePhase('load_gift_spec', 100);
  await simulatePhase('fetch_data', 200);
  await simulatePhase('execute_gift_rule', 300);

  // Log validation - some pass, some fail
  giftLogger.logValidation(day, 'min_balance_check', true, {
    minBalance: 1000,
    eligibleHolders: 25,
  });

  giftLogger.logValidation(day, 'treasury_balance_check', false, {
    required: '10000000000',
    available: '5000000000',
    shortfall: '5000000000',
  });

  // Log distribution (partial)
  giftLogger.logDistribution(day, {
    winnerCount: 25,
    totalAmount: BigInt(2500000000),
    averageAmount: BigInt(100000000),
  });

  await simulatePhase('build_transactions', 150);
  await simulatePhase('simulate_transactions', 100);

  giftLogger.logValidation(day, 'transaction_simulation', false, {
    transactionCount: 3,
    failedCount: 1,
    error: 'Insufficient funds for transaction',
  });

  // Fail execution
  await giftLogger.failExecution(
    day,
    new Error('Transaction simulation failed: Insufficient funds'),
    {
      giftType,
      phase: 'simulate_transactions',
      attemptedAmount: '2500000000',
      availableBalance: '2000000000',
    }
  );

  console.log('\n❌ Failure scenario completed\n');
}

/**
 * Simulate a skipped gift execution
 */
async function testSkipScenario(): Promise<void> {
  const day = 3;
  const giftType = 'random_participants';

  console.log('\n🎯 Testing SKIP scenario\n');

  // Start execution
  giftLogger.startExecution(day, giftType, {
    testMode: true,
    scenario: 'skip',
  });

  // Simulate phases
  await simulatePhase('load_gift_spec', 100);
  await simulatePhase('fetch_data', 200);

  // Log validation - no eligible participants
  giftLogger.logValidation(day, 'participant_check', false, {
    required: 1,
    found: 0,
    reason: 'No transactions found for the day',
  });

  // Skip execution
  await giftLogger.skipExecution(day, 'No eligible participants found');

  console.log('\n⏭️  Skip scenario completed\n');
}

/**
 * Test context-based logging
 */
async function testContextLogging(): Promise<void> {
  console.log('\n🎯 Testing CONTEXT-BASED logging\n');

  const contextLogger = giftLogger.withContext({
    day: 4,
    giftType: 'fee_contributors',
    phase: 'validation',
    metadata: { testMode: true },
  });

  contextLogger.info('Starting validation phase');
  contextLogger.debug('Checking holder balances', { holderCount: 100 });
  contextLogger.warn('Low treasury balance detected', { balance: '1000000000' });
  contextLogger.error('Validation failed', { error: 'Insufficient funds' });

  console.log('\n✅ Context logging completed\n');
}

/**
 * Display execution logs
 */
function displayExecutionLogs(): void {
  console.log('\n📊 === EXECUTION LOGS SUMMARY ===\n');

  const logs = giftLogger.getAllExecutionLogs();

  if (logs.length === 0) {
    console.log('No execution logs found\n');
    return;
  }

  logs.forEach((log, index) => {
    console.log(`${index + 1}. Day ${log.day} - ${log.giftType}`);
    console.log(`   Status: ${getStatusEmoji(log.status)} ${log.status.toUpperCase()}`);
    console.log(`   Start: ${log.startTime.toISOString()}`);
    
    if (log.endTime) {
      console.log(`   End: ${log.endTime.toISOString()}`);
      console.log(`   Duration: ${log.duration}ms`);
    }

    if (log.status === 'success') {
      console.log(`   Winners: ${log.winnerCount}`);
      console.log(`   Total Distributed: ${log.totalDistributed} lamports`);
    }

    if (log.error) {
      console.log(`   Error: ${log.error}`);
    }

    if (log.metadata) {
      console.log(`   Metadata:`, JSON.stringify(log.metadata, null, 2));
    }

    console.log('');
  });
}

/**
 * Display audit logs
 */
async function displayAuditLogs(): Promise<void> {
  console.log('\n📋 === AUDIT LOGS ===\n');

  try {
    // Query recent audit logs for gift executions
    const auditLogs = await auditLogRepo.findRecent(10, {
      resource_type: 'gift_execution',
    });

    if (auditLogs.length === 0) {
      console.log('No audit logs found\n');
      return;
    }

    auditLogs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.action} - ${log.ts.toISOString()}`);
      console.log(`   Actor: ${log.actor}`);
      console.log(`   Resource: ${log.resource_type}/${log.resource_id}`);
      
      if (log.payload) {
        console.log(`   Payload:`);
        console.log(`     Day: ${log.payload.day}`);
        console.log(`     Gift Type: ${log.payload.giftType}`);
        console.log(`     Duration: ${log.payload.duration}ms`);
        
        if (log.payload.winnerCount) {
          console.log(`     Winners: ${log.payload.winnerCount}`);
          console.log(`     Total Distributed: ${log.payload.totalDistributed}`);
        }
        
        if (log.payload.error) {
          console.log(`     Error: ${log.payload.error}`);
        }
      }
      
      console.log('');
    });
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
  }
}

/**
 * Helper: Get status emoji
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'started': return '🚀';
    case 'success': return '✅';
    case 'failed': return '❌';
    case 'skipped': return '⏭️';
    default: return '❓';
  }
}

/**
 * Helper: Simulate phase execution
 */
async function simulatePhase(phase: string, durationMs: number): Promise<void> {
  const day = giftLogger.getAllExecutionLogs()[giftLogger.getAllExecutionLogs().length - 1]?.day || 1;
  giftLogger.logPhase(day, phase, { simulatedDuration: durationMs });
  await sleep(durationMs);
}

/**
 * Helper: Sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main test execution
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║         GIFT LOGGER IMPLEMENTATION TEST                ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Parse command line arguments
  const args = process.argv.slice(2);
  const scenarioArg = args.find(arg => arg === '--scenario');
  const scenarioValue = scenarioArg ? args[args.indexOf(scenarioArg) + 1] : 'all';

  const scenarios: TestScenario[] = [
    {
      name: 'success',
      description: 'Successful gift execution with all phases',
      execute: testSuccessScenario,
    },
    {
      name: 'failure',
      description: 'Failed gift execution with error handling',
      execute: testFailureScenario,
    },
    {
      name: 'skip',
      description: 'Skipped gift execution (no eligible participants)',
      execute: testSkipScenario,
    },
    {
      name: 'context',
      description: 'Context-based logging',
      execute: testContextLogging,
    },
  ];

  try {
    // Run scenarios
    if (scenarioValue === 'all') {
      console.log('Running all scenarios...\n');
      for (const scenario of scenarios) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`  ${scenario.name.toUpperCase()}: ${scenario.description}`);
        console.log('='.repeat(60));
        await scenario.execute();
        await sleep(500); // Brief pause between scenarios
      }
    } else {
      const scenario = scenarios.find(s => s.name === scenarioValue);
      if (!scenario) {
        console.error(`❌ Unknown scenario: ${scenarioValue}`);
        console.log('\nAvailable scenarios:');
        scenarios.forEach(s => console.log(`  - ${s.name}: ${s.description}`));
        process.exit(1);
      }
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`  ${scenario.name.toUpperCase()}: ${scenario.description}`);
      console.log('='.repeat(60));
      await scenario.execute();
    }

    // Display results
    console.log('\n' + '='.repeat(60));
    console.log('  TEST RESULTS');
    console.log('='.repeat(60));

    displayExecutionLogs();
    await displayAuditLogs();

    // Clean up
    console.log('\n🧹 Cleaning up test logs...');
    giftLogger.clearLogs();
    console.log('✅ Cleanup complete\n');

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║         ✅ GIFT LOGGER TEST COMPLETED                  ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    console.log('💡 Tips for viewing logs:');
    console.log('   - Check console output for structured logs');
    console.log('   - Review audit_log table in database for persistence');
    console.log('   - Use --scenario flag to test specific scenarios');
    console.log('   - Logs include emojis for easy visual scanning\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test Failed\n');
    console.error('Error:', (error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Run tests
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

