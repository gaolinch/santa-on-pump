/**
 * Gift Scheduler - Simplified scheduling for gift execution
 * 
 * Manages:
 * - Daily gift execution timing
 * - Retry logic for failed executions
 * - Manual trigger support
 * - Execution status tracking
 */

import cron from 'node-cron';
import { logger } from '../utils/logger';
import { giftLogger } from './gift-logger';
import { hourlyProcessor } from './hourly-processor';
import { dayPoolRepo, giftSpecRepo, giftExecRepo, holderSnapshotRepo, txRawRepo } from '../database';
import { solanaService } from './solana';
import { giftEngine } from './gifts';
import { transactionBuilder } from './transaction-builder';
import { getPreviousUTCDate, getAdventDay } from '../utils/date';
import { config } from '../config';
import { priceService } from './price-service';
import { twitterService } from './twitter-service';

export interface ScheduleConfig {
  dailyCloseCron: string;
  enabled: boolean;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface ExecutionStatus {
  day: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

export class GiftScheduler {
  private scheduleConfig: ScheduleConfig;
  private cronJob?: cron.ScheduledTask;
  private executionStatus: Map<number, ExecutionStatus> = new Map();
  private isRunning: boolean = false;

  constructor(config: ScheduleConfig) {
    this.scheduleConfig = config;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (!this.scheduleConfig.enabled) {
      logger.info('Gift scheduler is disabled');
      return;
    }

    logger.info({
      cron: this.scheduleConfig.dailyCloseCron,
      retryAttempts: this.scheduleConfig.retryAttempts,
    }, '📅 Starting gift scheduler');

    // Daily gift execution (00:05 UTC)
    this.cronJob = cron.schedule(this.scheduleConfig.dailyCloseCron, async () => {
      await this.executeDaily();
    });

    // Hourly airdrop distribution (every hour at :00)
    cron.schedule('0 * * * *', async () => {
      await this.executeHourlyAirdrop();
    });

    logger.info('✅ Gift scheduler started (daily + hourly)');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Gift scheduler stopped');
    }
  }

  /**
   * Execute daily gift (scheduled or manual)
   */
  async executeDaily(force: boolean = false): Promise<void> {
    if (this.isRunning && !force) {
      logger.warn('Gift execution already in progress, skipping');
      return;
    }

    this.isRunning = true;

    try {
      const targetDay = getPreviousUTCDate();
      const adventDay = getAdventDay(targetDay);

      if (!adventDay && !force) {
        logger.info('Not in advent season, skipping gift execution');
        this.isRunning = false;
        return;
      }

      const effectiveAdventDay = adventDay || 1;

      logger.info({
        targetDay: targetDay.toISOString(),
        adventDay: effectiveAdventDay,
        force,
      }, '🎁 Starting daily gift execution');

      // Initialize execution status
      this.executionStatus.set(effectiveAdventDay, {
        day: effectiveAdventDay,
        status: 'running',
        attempts: 0,
        lastAttempt: new Date(),
      });

      // Execute with retry logic
      await this.executeWithRetry(effectiveAdventDay, targetDay);

    } catch (error) {
      logger.error({ error }, 'Fatal error in daily gift execution');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute gift with retry logic
   */
  private async executeWithRetry(adventDay: number, targetDay: Date): Promise<void> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < this.scheduleConfig.retryAttempts) {
      attempts++;

      try {
        logger.info({ adventDay, attempt: attempts }, 'Attempting gift execution');

        await this.executeGiftPipeline(adventDay, targetDay);

        // Success - update status
        this.executionStatus.set(adventDay, {
          day: adventDay,
          status: 'completed',
          attempts,
          lastAttempt: new Date(),
        });

        logger.info({ adventDay, attempts }, '✅ Gift execution completed successfully');
        return;

      } catch (error) {
        lastError = error as Error;
        
        logger.error({
          adventDay,
          attempt: attempts,
          error: lastError.message,
        }, `❌ Gift execution failed (attempt ${attempts}/${this.scheduleConfig.retryAttempts})`);

        // Update status
        this.executionStatus.set(adventDay, {
          day: adventDay,
          status: attempts < this.scheduleConfig.retryAttempts ? 'retrying' : 'failed',
          attempts,
          lastAttempt: new Date(),
          error: lastError.message,
        });

        // Wait before retry (except on last attempt)
        if (attempts < this.scheduleConfig.retryAttempts) {
          logger.info({ delayMs: this.scheduleConfig.retryDelayMs }, 'Waiting before retry...');
          await this.sleep(this.scheduleConfig.retryDelayMs);
        }
      }
    }

    // All retries failed
    logger.error({
      adventDay,
      attempts,
      error: lastError?.message,
    }, '❌ Gift execution failed after all retry attempts');

    throw lastError || new Error('Gift execution failed');
  }

  /**
   * Execute the complete gift pipeline
   */
  private async executeGiftPipeline(adventDay: number, targetDay: Date): Promise<void> {
    giftLogger.startExecution(adventDay, 'unknown');

    try {
      // Phase 1: Close day pool
      giftLogger.logPhase(adventDay, 'close_day_pool');
      const poolId = await dayPoolRepo.closeDay(targetDay);
      logger.info({ poolId }, 'Day pool closed');

      // Phase 1.5: Create holder snapshot (if not exists)
      giftLogger.logPhase(adventDay, 'create_holder_snapshot');
      let holders = await holderSnapshotRepo.findByDay(targetDay);
      
      if (holders.length === 0) {
        logger.info('No holder snapshot found, creating snapshot...');
        const snapshotCount = await holderSnapshotRepo.createSnapshot(targetDay);
        logger.info({ snapshotCount }, 'Holder snapshot created');
        holders = await holderSnapshotRepo.findByDay(targetDay);
      } else {
        logger.info({ count: holders.length }, 'Holder snapshot already exists');
      }

      // Phase 2: Get gift specification
      giftLogger.logPhase(adventDay, 'load_gift_spec');
      const giftSpec = await giftSpecRepo.findByDay(adventDay);
      
      if (!giftSpec) {
        await giftLogger.skipExecution(adventDay, 'No gift specification found');
        return;
      }

      giftLogger.startExecution(adventDay, giftSpec.type);
      logger.info({ type: giftSpec.type }, 'Gift specification loaded');

      // Phase 3: Fetch data
      giftLogger.logPhase(adventDay, 'fetch_data');
      
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
      
      // Apply daily fee cap (5000 USD default, convert to lamports assuming 1 SOL = $1)
      // TODO: Use actual SOL price if available
      const dailyFeeLimit = BigInt(Math.floor(config.gifts.dailyFeeLimitUSD * 1e9));
      const dayCreatorFees = dayCreatorFeesRaw > dailyFeeLimit ? dailyFeeLimit : dayCreatorFeesRaw;
      
      const wasCapped = dayCreatorFeesRaw > dailyFeeLimit;
      
      logger.info({ 
        feesInRaw: dayCreatorFeesRaw.toString(),
        feesInRawSOL: (Number(dayCreatorFeesRaw) / 1e9).toFixed(9),
        dailyFeeLimit: dailyFeeLimit.toString(),
        dailyFeeLimitSOL: (Number(dailyFeeLimit) / 1e9).toFixed(0),
        feesInCapped: dayCreatorFees.toString(),
        feesInCappedSOL: (Number(dayCreatorFees) / 1e9).toFixed(9),
        wasCapped,
      }, wasCapped 
        ? `Day creator fees capped at ${(Number(dailyFeeLimit) / 1e9).toFixed(0)} SOL (raw: ${(Number(dayCreatorFeesRaw) / 1e9).toFixed(9)} SOL)`
        : 'Day creator fees loaded (this is what will be distributed)');

      const lastSlot = await solanaService.getLastSlotForDate(targetDay);
      const blockhash = lastSlot ? await solanaService.getBlockhashForSlot(lastSlot) : null;
      
      if (!blockhash) {
        throw new Error('Failed to get blockhash for day');
      }

      // Phase 4: Execute gift rule
      giftLogger.logPhase(adventDay, 'execute_gift_rule');
      const result = await giftEngine.executeGift(
        giftSpec,
        transactions,
        holders,
        dayCreatorFees, // Use day's creator fees instead of treasury balance
        blockhash
      );

      giftLogger.logDistribution(adventDay, {
        winnerCount: result.winners.length,
        totalAmount: result.totalDistributed,
      });

      // Phase 5: Build transaction bundle
      giftLogger.logPhase(adventDay, 'build_transactions');
      const bundle = await transactionBuilder.buildTransferBundle(result.winners);
      logger.info({ transactionCount: bundle.transactions.length }, 'Transaction bundle built');

      // Phase 6: Simulate transactions
      giftLogger.logPhase(adventDay, 'simulate_transactions');
      const simulationPassed = await transactionBuilder.simulateTransactions(bundle.transactions);
      
      giftLogger.logValidation(adventDay, 'transaction_simulation', simulationPassed);
      
      if (!simulationPassed) {
        throw new Error('Transaction simulation failed');
      }

      // Phase 7: Submit for multi-sig
      giftLogger.logPhase(adventDay, 'submit_multisig');
      const proposalIds = await transactionBuilder.submitForMultiSig(bundle);
      logger.info({ proposalIds }, 'Multi-sig proposals created');

      // Phase 8: Record execution
      giftLogger.logPhase(adventDay, 'record_execution');
      await giftExecRepo.insert({
        day: adventDay,
        gift_spec_id: giftSpec.id!,
        winners: result.winners,
        tx_hashes: proposalIds,
        total_distributed: result.totalDistributed,
        execution_time: new Date(),
        status: 'pending',
      });

      // Success
      await giftLogger.successExecution(
        adventDay,
        result.winners.length,
        result.totalDistributed,
        {
          giftType: giftSpec.type,
          transactionCount: bundle.transactions.length,
          proposalIds,
        }
      );

      // Post to Twitter/X
      try {
        const frontendUrl = process.env.FRONTEND_URL || 'https://santa-pump.fun';
        const pageUrl = `${frontendUrl}/day/${adventDay.toString().padStart(2, '0')}`;
        const totalDistributedSOL = (Number(result.totalDistributed) / 1e9).toFixed(9);
        
        const tweetId = await twitterService.postExecutionResults({
          day: adventDay,
          giftType: giftSpec.type,
          winnerCount: result.winners.length,
          totalDistributedSOL,
          pageUrl,
          txHashes: proposalIds,
        });
        
        if (tweetId) {
          logger.info({ tweetId, day: adventDay }, '✅ Posted execution results to Twitter/X');
        }
      } catch (error) {
        logger.error({ error, day: adventDay }, '⚠️  Failed to post to Twitter/X (non-fatal)');
        // Don't fail the execution if Twitter posting fails
      }

    } catch (error) {
      await giftLogger.failExecution(adventDay, error as Error);
      throw error;
    }
  }

  /**
   * Get execution status for a day
   */
  getExecutionStatus(day: number): ExecutionStatus | undefined {
    return this.executionStatus.get(day);
  }

  /**
   * Get all execution statuses
   */
  getAllExecutionStatuses(): ExecutionStatus[] {
    return Array.from(this.executionStatus.values());
  }

  /**
   * Check if scheduler is running
   */
  isSchedulerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Execute hourly airdrop
   */
  private async executeHourlyAirdrop(): Promise<void> {
    try {
      logger.info('⏰ Starting hourly airdrop processing');

      const result = await hourlyProcessor.processHourlyAirdrop();

      if (result) {
        logger.info('✅ Hourly airdrop distributed', {
          day: result.day,
          hour: result.hour,
          winner: result.winner,
          amount: result.amount,
        });
      } else {
        logger.debug('No hourly airdrop to distribute');
      }

    } catch (error) {
      logger.error({ error }, '❌ Hourly airdrop processing failed');
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Create singleton instance
export const giftScheduler = new GiftScheduler({
  dailyCloseCron: process.env.DAILY_CLOSE_CRON || '5 0 * * *', // 00:05 UTC
  enabled: process.env.GIFT_SCHEDULER_ENABLED !== 'false', // Enabled by default
  retryAttempts: parseInt(process.env.GIFT_RETRY_ATTEMPTS || '3', 10),
  retryDelayMs: parseInt(process.env.GIFT_RETRY_DELAY_MS || '60000', 10), // 1 minute
});

