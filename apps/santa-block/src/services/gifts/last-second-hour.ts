/**
 * Last Second Hour Gift
 * 
 * Rewards transactions closest to 23:59:59 (last second of the day)
 */

import { logger } from '../../utils/logger';
import { giftLogger } from '../gift-logger';
import { IGiftHandler, GiftExecutionContext, GiftResult, Winner } from './base-gift';

export class LastSecondHourGift implements IGiftHandler {
  getType(): string {
    return 'last_second_hour';
  }

  async execute(context: GiftExecutionContext): Promise<GiftResult> {
    const { spec, transactions, treasuryBalance } = context;
    const { winner_count = 5, allocation_percent = 40 } = spec.params;

    logger.info({
      day: spec.day,
      type: spec.type,
      totalTransactions: transactions.length,
      targetWinners: winner_count,
    }, '🕐 Step 1: Filtering last hour transactions');

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'filter_last_hour',
      'Filtering transactions in last hour (23:00-23:59)',
      {
        totalTransactions: transactions.length,
        targetWinners: winner_count,
      }
    );

    // Filter transactions in last hour
    const lastHourTxs = transactions.filter((tx) => {
      const hour = tx.block_time.getUTCHours();
      return hour === 23;
    });

    logger.info({
      day: spec.day,
      lastHourTxCount: lastHourTxs.length,
      filteredOut: transactions.length - lastHourTxs.length,
    }, `✅ Found ${lastHourTxs.length} transactions in last hour`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'last_hour_transactions_found',
      `Found ${lastHourTxs.length} transactions in last hour`,
      {
        lastHourTxCount: lastHourTxs.length,
        filteredOut: transactions.length - lastHourTxs.length,
      }
    );

    if (lastHourTxs.length === 0) {
      logger.warn({ day: spec.day }, '⚠️  No transactions in last hour');
      return {
        winners: [],
        totalDistributed: BigInt(0),
        metadata: { reason: 'no_last_hour_transactions' },
      };
    }

    // Sort by time (closest to 23:59:59)
    logger.info({ day: spec.day }, '🎯 Step 2: Finding transactions closest to midnight');

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'sort_by_proximity',
      'Sorting transactions by proximity to 23:59:59',
      {}
    );

    const endOfDay = new Date(lastHourTxs[0].block_time);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const sorted = lastHourTxs
      .map((tx) => ({
        wallet: tx.from_wallet,
        time: tx.block_time,
        distance: Math.abs(endOfDay.getTime() - tx.block_time.getTime()),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, winner_count);

    logger.info({
      day: spec.day,
      selectedCount: sorted.length,
    }, `✅ Selected ${sorted.length} closest transactions`);

    // Log closest transactions
    sorted.forEach((entry, index) => {
      const secondsFromMidnight = entry.distance / 1000;
      logger.info({
        day: spec.day,
        rank: index + 1,
        wallet: entry.wallet,
        time: entry.time.toISOString(),
        secondsFromMidnight: secondsFromMidnight.toFixed(3),
      }, `  #${index + 1}: ${entry.wallet.slice(0, 8)}... at ${entry.time.toISOString().split('T')[1]} (${secondsFromMidnight.toFixed(3)}s from midnight)`);
    });

    // Equal distribution among winners
    logger.info({ day: spec.day }, '💰 Step 3: Calculating equal distribution');

    const distributionPool = (treasuryBalance * BigInt(allocation_percent)) / BigInt(100);
    const amountPerWinner = distributionPool / BigInt(sorted.length);

    logger.info({
      day: spec.day,
      distributionPool: distributionPool.toString(),
      distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(4),
      amountPerWinner: amountPerWinner.toString(),
      amountPerWinnerSOL: (Number(amountPerWinner) / 1e9).toFixed(6),
    }, `✅ Each winner gets: ${(Number(amountPerWinner) / 1e9).toFixed(6)} SOL`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'calculate_distribution',
      'Calculating equal distribution among closest transactions',
      {
        distributionPool: distributionPool.toString(),
        distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(4),
        amountPerWinner: amountPerWinner.toString(),
        amountPerWinnerSOL: (Number(amountPerWinner) / 1e9).toFixed(6),
        winnerCount: sorted.length,
      }
    );

    const winners: Winner[] = sorted.map((entry) => ({
      wallet: entry.wallet,
      amount: amountPerWinner,
      reason: `last_second_${entry.time.toISOString()}`,
    }));

    const totalDistributed = winners.reduce((sum, w) => sum + w.amount, BigInt(0));

    logger.info({
      day: spec.day,
      winnerCount: winners.length,
      totalDistributed: totalDistributed.toString(),
      totalDistributedSOL: (Number(totalDistributed) / 1e9).toFixed(4),
    }, `✅ Step 4: Distribution complete - ${winners.length} closest transactions will receive ${(Number(totalDistributed) / 1e9).toFixed(4)} SOL total`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'distribution_complete',
      `Distribution to ${winners.length} transactions closest to midnight`,
      {
        winnerCount: winners.length,
        totalDistributed: totalDistributed.toString(),
        totalDistributedSOL: (Number(totalDistributed) / 1e9).toFixed(4),
        closestTransactions: sorted.map((entry, index) => ({
          rank: index + 1,
          wallet: entry.wallet,
          time: entry.time.toISOString(),
          secondsFromMidnight: (entry.distance / 1000).toFixed(3),
        })),
      }
    );

    return {
      winners,
      totalDistributed,
      metadata: {
        winner_count: sorted.length,
      },
    };
  }
}

