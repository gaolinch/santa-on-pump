#!/usr/bin/env tsx

import { db, dayPoolRepo, txRawRepo, giftSpecRepo, giftExecRepo, auditLogRepo, holderSnapshotRepo } from '../../database';
import { solanaService } from '../services/solana';
import { giftEngine } from '../services/gifts';
import { transactionBuilder } from '../services/transaction-builder';
import { logger } from '../utils/logger';
import { getPreviousUTCDate, getAdventDay } from '../utils/date';
import { config } from '../../config';
import { priceService } from '../services/price-service';
import { twitterService } from '../services/twitter-service';

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
    // Get the latest block date from finalized transactions
    logger.info('Determining target day from block dates...');
    const latestDateResult = await db.query<{ latest_date: Date }>(`
      SELECT DATE(MAX(block_time)) as latest_date
      FROM tx_raw
      WHERE status = 'finalized'
    `);

    let targetDay: Date;
    
    if (latestDateResult.rows[0]?.latest_date) {
      // Use the latest date from transactions
      const latestDateStr = latestDateResult.rows[0].latest_date;
      targetDay = new Date(latestDateStr);
      // Ensure it's at start of day in UTC
      targetDay.setUTCHours(0, 0, 0, 0);
      logger.info({ targetDay: targetDay.toISOString().split('T')[0] }, 'Using latest block date from transactions');
    } else {
      // Fallback to previous UTC date if no transactions found
      targetDay = getPreviousUTCDate();
      logger.warn({ targetDay: targetDay.toISOString().split('T')[0] }, 'No finalized transactions found, using previous UTC date');
    }

    const adventDay = getAdventDay(targetDay);

    logger.info({ targetDay: targetDay.toISOString().split('T')[0], adventDay, force }, 'Closing day');

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

    // Step 3: Create holder snapshot (if not exists)
    logger.info('Step 3: Creating holder snapshot');
    let holders = await holderSnapshotRepo.findByDay(targetDay);
    
    if (holders.length === 0) {
      logger.info('No holder snapshot found, creating snapshot...');
      const snapshotCount = await holderSnapshotRepo.createSnapshot(targetDay);
      logger.info({ snapshotCount }, 'Holder snapshot created');
      holders = await holderSnapshotRepo.findByDay(targetDay);
    } else {
      logger.info({ count: holders.length }, 'Holder snapshot already exists');
    }

    // Step 4: Fetch transactions
    logger.info('Step 4: Fetching transactions');
    const transactions = await txRawRepo.findByDay(targetDay);
    logger.info({ count: transactions.length }, 'Transactions loaded');
    logger.info({ count: holders.length }, 'Holders loaded from snapshot');

    // Get day pool to use creator fees (not treasury balance)
    const dayPool = await dayPoolRepo.findByDay(targetDay);
    if (!dayPool) {
      throw new Error(`Day pool not found for ${targetDay.toISOString().split('T')[0]}. Close the day pool first.`);
    }

    // Use day's creator fees as the distribution source (capped at daily limit)
    const dayCreatorFeesRaw = typeof dayPool.fees_in === 'string' 
      ? BigInt(dayPool.fees_in) 
      : typeof dayPool.fees_in === 'bigint' 
        ? dayPool.fees_in 
        : BigInt(String(dayPool.fees_in));
    
    // Convert USD limit to SOL (lamports) using current SOL price
    const dailyFeeLimitUSD = config.gifts.dailyFeeLimitUSD;
    const dailyFeeLimitLamports = await priceService.convertUSDToSOL(dailyFeeLimitUSD);
    const solPrice = await priceService.getSOLPrice();
    
    const dayCreatorFees = dayCreatorFeesRaw > dailyFeeLimitLamports ? dailyFeeLimitLamports : dayCreatorFeesRaw;
    
    const wasCapped = dayCreatorFeesRaw > dailyFeeLimitLamports;
    
    logger.info({ 
      feesInRaw: dayCreatorFeesRaw.toString(),
      feesInRawSOL: (Number(dayCreatorFeesRaw) / 1e9).toFixed(9),
      feesInRawUSD: (Number(dayCreatorFeesRaw) / 1e9 * solPrice).toFixed(2),
      dailyFeeLimitUSD: dailyFeeLimitUSD.toFixed(2),
      dailyFeeLimitSOL: (Number(dailyFeeLimitLamports) / 1e9).toFixed(9),
      solPrice: solPrice.toFixed(2),
      feesInCapped: dayCreatorFees.toString(),
      feesInCappedSOL: (Number(dayCreatorFees) / 1e9).toFixed(9),
      feesInCappedUSD: (Number(dayCreatorFees) / 1e9 * solPrice).toFixed(2),
      wasCapped,
    }, wasCapped 
      ? `Day creator fees capped at $${dailyFeeLimitUSD.toFixed(2)} USD (${(Number(dailyFeeLimitLamports) / 1e9).toFixed(9)} SOL @ $${solPrice.toFixed(2)}/SOL). Raw fees: ${(Number(dayCreatorFeesRaw) / 1e9).toFixed(9)} SOL ($${(Number(dayCreatorFeesRaw) / 1e9 * solPrice).toFixed(2)})`
      : `Day creator fees loaded: ${(Number(dayCreatorFees) / 1e9).toFixed(9)} SOL ($${(Number(dayCreatorFees) / 1e9 * solPrice).toFixed(2)})`);

    // Get blockhash for deterministic randomness
    const lastSlot = await solanaService.getLastSlotForDate(targetDay);
    const blockhash = lastSlot ? await solanaService.getBlockhashForSlot(lastSlot) : null;
    
    if (!blockhash) {
      throw new Error('Failed to get blockhash for day');
    }

    // Step 5: Execute gift rule
    logger.info('Step 5: Executing gift rule');
    const result = await giftEngine.executeGift(
      giftSpec,
      transactions,
      holders,
      dayCreatorFees, // Use day's creator fees instead of treasury balance
      blockhash
    );

    logger.info(
      {
        winnerCount: result.winners.length,
        totalDistributed: result.totalDistributed.toString(),
      },
      'Gift rule executed'
    );

    // Step 6: Build transaction bundle
    logger.info('Step 6: Building transaction bundle');
    const bundle = await transactionBuilder.buildTransferBundle(result.winners);
    logger.info({ transactionCount: bundle.transactions.length }, 'Transaction bundle built');

    // Simulate transactions
    const simulationPassed = await transactionBuilder.simulateTransactions(bundle.transactions);
    if (!simulationPassed) {
      throw new Error('Transaction simulation failed');
    }

    // Step 7: Submit for multi-sig approval
    logger.info('Step 7: Submitting for multi-sig approval');
    const proposalIds = await transactionBuilder.submitForMultiSig(bundle);
    logger.info({ proposalIds }, 'Multi-sig proposals created');

    // Step 8: Record execution
    logger.info('Step 8: Recording execution');
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

    // Step 9: Post to Twitter/X
    logger.info('Step 9: Posting execution results to Twitter/X');
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://santa-pump.fun';
      const pageUrl = `${frontendUrl}/day/${effectiveAdventDay.toString().padStart(2, '0')}`;
      const totalDistributedSOL = (Number(result.totalDistributed) / 1e9).toFixed(9);
      
      const tweetId = await twitterService.postExecutionResults({
        day: effectiveAdventDay,
        giftType: giftSpec.type,
        winnerCount: result.winners.length,
        totalDistributedSOL,
        pageUrl,
        txHashes: proposalIds,
      });
      
      if (tweetId) {
        logger.info({ tweetId, day: effectiveAdventDay }, '✅ Posted execution results to Twitter/X');
      } else {
        logger.warn({ day: effectiveAdventDay }, '⚠️  Twitter post returned no tweet ID (may not have posted)');
      }
    } catch (error) {
      logger.error({ error, day: effectiveAdventDay }, '⚠️  Failed to post to Twitter/X (non-fatal)');
      // Don't fail the execution if Twitter posting fails
    }

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

