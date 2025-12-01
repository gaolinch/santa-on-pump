#!/usr/bin/env tsx

import { db, dayPoolRepo, txRawRepo, giftSpecRepo, giftExecRepo, auditLogRepo } from '../database';
import { solanaService } from '../services/solana';
import { giftEngine } from '../services/gifts';
import { transactionBuilder } from '../services/transaction-builder';
import { logger } from '../utils/logger';
import { getPreviousUTCDate, getAdventDay } from '../utils/date';

/**
 * Daily close script - executes at 00:05 UTC
 * 
 * Pipeline:
 * 1. Close previous day's pool
 * 2. Get gift specification for the day
 * 3. Fetch transactions and holders
 * 4. Execute gift rule
 * 5. Build transaction bundle
 * 6. Submit for multi-sig approval
 * 7. Publish proof
 */
async function closeDayPipeline(force: boolean = false) {
  logger.info('Starting daily close pipeline');

  try {
    // Get previous day (the day we're closing)
    const targetDay = getPreviousUTCDate();
    const adventDay = getAdventDay(targetDay);

    logger.info({ targetDay, adventDay, force }, 'Closing day');

    if (!adventDay && !force) {
      logger.info('Not in advent season, skipping (use --force to override)');
      return;
    }
    
    // For testing outside advent season, use day 1
    const effectiveAdventDay = adventDay || 1;

    // Step 1: Close the day
    logger.info('Step 1: Closing day pool');
    const poolId = await dayPoolRepo.closeDay(targetDay);
    logger.info({ poolId }, 'Day pool closed');

    // Step 2: Get gift specification
    logger.info('Step 2: Getting gift specification');
    const giftSpec = await giftSpecRepo.findByDay(effectiveAdventDay);
    
    if (!giftSpec) {
      logger.warn({ day: effectiveAdventDay }, 'No gift specification found for day');
      return;
    }

    logger.info({ type: giftSpec.type, day: effectiveAdventDay }, 'Gift specification loaded');

    // Step 3: Fetch data
    logger.info('Step 3: Fetching transactions and holders');
    
    const transactions = await txRawRepo.findByDay(targetDay);
    logger.info({ count: transactions.length }, 'Transactions loaded');

    // Get holders snapshot (in production, this would be more sophisticated)
    const holdersResult = await db.query(`
      SELECT day, wallet, balance, rank
      FROM holders_snapshot
      WHERE day = $1
      ORDER BY balance DESC
    `, [targetDay]);
    const holders = holdersResult.rows;
    logger.info({ count: holders.length }, 'Holders loaded');

    // Get treasury balance
    const treasuryBalance = await solanaService.getTreasuryBalance();
    logger.info({ balance: treasuryBalance.toString() }, 'Treasury balance loaded');

    // Get blockhash for deterministic randomness
    const lastSlot = await solanaService.getLastSlotForDate(targetDay);
    const blockhash = lastSlot ? await solanaService.getBlockhashForSlot(lastSlot) : null;
    
    if (!blockhash) {
      throw new Error('Failed to get blockhash for day');
    }

    // Step 4: Execute gift rule
    logger.info('Step 4: Executing gift rule');
    const result = await giftEngine.executeGift(
      giftSpec,
      transactions,
      holders,
      treasuryBalance,
      blockhash
    );

    logger.info(
      {
        winnerCount: result.winners.length,
        totalDistributed: result.totalDistributed.toString(),
      },
      'Gift rule executed'
    );

    // Step 5: Build transaction bundle
    logger.info('Step 5: Building transaction bundle');
    const bundle = await transactionBuilder.buildTransferBundle(result.winners);
    logger.info({ transactionCount: bundle.transactions.length }, 'Transaction bundle built');

    // Simulate transactions
    const simulationPassed = await transactionBuilder.simulateTransactions(bundle.transactions);
    if (!simulationPassed) {
      throw new Error('Transaction simulation failed');
    }

    // Step 6: Submit for multi-sig approval
    logger.info('Step 6: Submitting for multi-sig approval');
    const proposalIds = await transactionBuilder.submitForMultiSig(bundle);
    logger.info({ proposalIds }, 'Multi-sig proposals created');

    // Step 7: Record execution
    logger.info('Step 7: Recording execution');
    await giftExecRepo.insert({
      day: effectiveAdventDay,
      gift_spec_id: giftSpec.id!,
      winners: result.winners,
      tx_hashes: proposalIds, // In production, these would be actual tx hashes after multi-sig
      total_distributed: result.totalDistributed,
      execution_time: new Date(),
      status: 'pending', // Will be updated after multi-sig approval
    });

    // Log audit entry
    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'system',
      action: 'daily_close',
      payload: {
        day: targetDay,
        advent_day: effectiveAdventDay,
        pool_id: poolId,
        winner_count: result.winners.length,
        total_distributed: result.totalDistributed.toString(),
      },
    });

    logger.info('Daily close pipeline completed successfully');

    // Step 8: Publish proof (would trigger X bot here)
    logger.info('Step 8: Proof published (trigger X bot here)');

  } catch (error) {
    logger.error({ error }, 'Daily close pipeline failed');
    
    // Log failure
    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'system',
      action: 'daily_close_failed',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    throw error;
  }
}

// Run if called directly
if (typeof require !== 'undefined' && require.main === module) {
  const force = process.argv.includes('--force');
  
  closeDayPipeline(force)
    .then(() => {
      logger.info('Close day script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Close day script failed');
      process.exit(1);
    });
}

export { closeDayPipeline };

