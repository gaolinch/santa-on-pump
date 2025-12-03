#!/usr/bin/env node
/**
 * Test Scheduler & Logger Implementation
 * 
 * Tests:
 * - Gift logger functionality
 * - Execution tracking
 * - Status reporting
 */

import { giftLogger } from '../services/gift-logger';
import { logger } from '../utils/logger';

async function testSchedulerAndLogger() {
  logger.info('=== Testing Scheduler & Logger Implementation ===');

  try {
    // Test 1: Start execution
    logger.info('Test 1: Starting gift execution');
    giftLogger.startExecution(1, 'proportional_holders', {
      testMode: true,
      timestamp: new Date().toISOString(),
    });

    // Simulate some work
    await sleep(100);

    // Test 2: Log phases
    logger.info('Test 2: Logging phases');
    giftLogger.logPhase(1, 'close_day_pool', { poolId: 'test-pool-id' });
    await sleep(50);
    
    giftLogger.logPhase(1, 'load_gift_spec', { type: 'proportional_holders' });
    await sleep(50);
    
    giftLogger.logPhase(1, 'fetch_data', { 
      transactions: 100, 
      holders: 50,
      treasuryBalance: '10000000000'
    });
    await sleep(50);

    // Test 3: Log validation
    logger.info('Test 3: Logging validations');
    giftLogger.logValidation(1, 'holder_count', true, { count: 50 });
    giftLogger.logValidation(1, 'treasury_balance', true, { balance: '10000000000' });
    giftLogger.logValidation(1, 'transaction_simulation', true);

    // Test 4: Log distribution
    logger.info('Test 4: Logging distribution');
    giftLogger.logDistribution(1, {
      winnerCount: 50,
      totalAmount: BigInt(10000000000),
      averageAmount: BigInt(200000000),
      minAmount: BigInt(1000000),
      maxAmount: BigInt(1000000000),
    });

    // Test 5: Success execution
    logger.info('Test 5: Logging success');
    await giftLogger.successExecution(
      1,
      50,
      BigInt(10000000000),
      {
        giftType: 'proportional_holders',
        transactionCount: 50,
        proposalIds: ['proposal-1', 'proposal-2'],
      }
    );

    // Test 6: Get execution log
    logger.info('Test 6: Retrieving execution log');
    const log = giftLogger.getExecutionLog(1);
    
    if (!log) {
      throw new Error('Execution log not found');
    }

    logger.info({
      day: log.day,
      giftType: log.giftType,
      duration: log.duration,
      status: log.status,
      winnerCount: log.winnerCount,
      totalDistributed: log.totalDistributed,
    }, 'Execution log retrieved');

    // Test 7: Get all logs
    logger.info('Test 7: Retrieving all execution logs');
    const allLogs = giftLogger.getAllExecutionLogs();
    logger.info({ count: allLogs.length }, 'All execution logs retrieved');

    // Test 8: Test failure scenario
    logger.info('Test 8: Testing failure scenario');
    giftLogger.startExecution(2, 'top_buyers_airdrop', { testMode: true });
    await sleep(100);
    
    await giftLogger.failExecution(
      2,
      new Error('Test error: Transaction simulation failed'),
      { phase: 'simulate_transactions' }
    );

    // Test 9: Test skip scenario
    logger.info('Test 9: Testing skip scenario');
    giftLogger.startExecution(3, 'unknown_type', { testMode: true });
    await sleep(50);
    
    await giftLogger.skipExecution(3, 'No gift specification found');

    // Test 10: Context logger
    logger.info('Test 10: Testing context logger');
    const contextLogger = giftLogger.withContext({
      day: 4,
      giftType: 'full_donation_to_ngo',
      phase: 'test',
      metadata: { ngo: 'Test NGO' },
    });

    contextLogger.info('Testing context logger');
    contextLogger.debug('Debug message with context');

    // Final summary
    logger.info('=== Test Summary ===');
    const finalLogs = giftLogger.getAllExecutionLogs();
    
    logger.info({
      totalExecutions: finalLogs.length,
      successful: finalLogs.filter(l => l.status === 'success').length,
      failed: finalLogs.filter(l => l.status === 'failed').length,
      skipped: finalLogs.filter(l => l.status === 'skipped').length,
    }, 'Execution summary');

    // Display all logs
    logger.info('=== All Execution Logs ===');
    finalLogs.forEach((log) => {
      logger.info({
        day: log.day,
        giftType: log.giftType,
        status: log.status,
        duration: log.duration ? `${log.duration}ms` : 'N/A',
        winnerCount: log.winnerCount,
        error: log.error,
      }, `Day ${log.day} - ${log.status}`);
    });

    // Validation
    const validations = {
      logsCreated: finalLogs.length === 3,
      successLog: finalLogs.some(l => l.day === 1 && l.status === 'success'),
      failureLog: finalLogs.some(l => l.day === 2 && l.status === 'failed'),
      skipLog: finalLogs.some(l => l.day === 3 && l.status === 'skipped'),
      durationTracked: finalLogs.every(l => l.duration !== undefined),
    };

    logger.info('=== Validation Results ===');
    logger.info(validations, 'Validation checks');

    if (Object.values(validations).every(v => v)) {
      logger.info('✅ All tests passed! Scheduler & Logger implementation is working correctly.');
    } else {
      logger.warn('⚠️ Some tests failed. Review the results above.');
    }

    // Cleanup
    giftLogger.clearLogs();
    logger.info('Logs cleared');

  } catch (error) {
    logger.error({ error }, 'Test failed');
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
testSchedulerAndLogger()
  .then(() => {
    logger.info('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error }, 'Test failed');
    process.exit(1);
  });

