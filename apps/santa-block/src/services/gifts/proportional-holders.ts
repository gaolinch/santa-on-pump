/**
 * Proportional Holders Gift
 * 
 * Distributes SOL proportionally to all holders based on their balance
 */

import { logger } from '../../utils/logger';
import { giftLogger } from '../gift-logger';
import { config } from '../../config';
import { IGiftHandler, GiftExecutionContext, GiftResult, Winner } from './base-gift';

/**
 * Helper function to normalize balance to BigInt
 * Handles cases where PostgreSQL returns BIGINT as string
 */
function toBigInt(value: string | bigint | number): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'string') return BigInt(value);
  return BigInt(value);
}

/**
 * Check if a wallet is excluded from gifts and airdrops
 */
function isWalletExcluded(wallet: string): boolean {
  return config.santa.excludedWallets.includes(wallet);
}

export class ProportionalHoldersGift implements IGiftHandler {
  getType(): string {
    return 'proportional_holders';
  }

  async execute(context: GiftExecutionContext): Promise<GiftResult> {
    const { spec, holders, treasuryBalance } = context;
    // Note: treasuryBalance is actually the day's creator fees (from day_pool.fees_in)
    const { allocation_percent = 40, min_balance = 0, token_airdrop } = spec.params;

    // Special case for Day 1: select ALL holders with balance > 1000
    const isDay1 = spec.day === 1;
    const day1MinBalance = 1000;
    const filterDescription = isDay1 
      ? `all holders with balance > ${day1MinBalance}` 
      : `minimum balance of ${min_balance}`;

    logger.info({ 
      day: spec.day, 
      type: spec.type,
      totalHolders: holders.length,
      minBalance: isDay1 ? day1MinBalance : min_balance,
      filterType: isDay1 ? 'balance_gt_1000' : 'min_balance_threshold',
      allocationPercent: allocation_percent,
    }, `🔍 Step 1: Filtering eligible holders (${filterDescription})`);

    // Save step to database
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'filter_eligible_holders',
      isDay1 
        ? `Filtering eligible holders: all holders with balance > ${day1MinBalance} (Day 1 special case)`
        : 'Filtering eligible holders based on minimum balance',
      {
        totalHolders: holders.length,
        minBalance: isDay1 ? day1MinBalance : min_balance,
        filterType: isDay1 ? 'balance_gt_1000' : 'min_balance_threshold',
        allocationPercent: allocation_percent,
      }
    );

    // Filter eligible holders (normalize balances to BigInt first, exclude blacklisted wallets)
    const eligible = holders
      .map(h => ({ ...h, balance: toBigInt(h.balance) }))
      .filter((h) => !isWalletExcluded(h.wallet)) // Exclude blacklisted wallets
      .filter((h) => isDay1 
        ? h.balance > BigInt(day1MinBalance)
        : h.balance >= BigInt(min_balance));

    logger.info({ 
      day: spec.day,
      eligibleCount: eligible.length,
      filteredOut: holders.length - eligible.length,
      filterType: isDay1 ? 'balance_gt_1000' : 'min_balance_threshold',
    }, `✅ Found ${eligible.length} eligible holders (filtered ${holders.length - eligible.length} ${isDay1 ? `with balance <= ${day1MinBalance}` : 'below min balance'})`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'eligible_holders_found',
      `Found ${eligible.length} eligible holders`,
      {
        eligibleCount: eligible.length,
        filteredOut: holders.length - eligible.length,
      }
    );

    if (eligible.length === 0) {
      logger.warn({ day: spec.day }, '⚠️  No eligible holders found');
      return {
        winners: [],
        totalDistributed: BigInt(0),
        metadata: { reason: 'no_eligible_holders' },
      };
    }

    // Calculate total balance (for distribution calculation, but don't log it)
    const totalBalance = eligible.reduce((sum, h) => sum + toBigInt(h.balance), BigInt(0));

    // Calculate distribution pool from day's creator fees (already capped at daily limit)
    logger.info({ day: spec.day }, '💰 Step 3: Calculating distribution pool from day creator fees');
    
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'calculate_distribution_pool',
      'Calculating distribution pool from day creator fees (capped at daily limit)',
      {
        dayCreatorFees: treasuryBalance.toString(),
        allocationPercent: allocation_percent,
      }
    );
    
    // treasuryBalance is actually the day's creator fees (from day_pool.fees_in, already capped at daily limit)
    const dayCreatorFees = treasuryBalance;
    const distributionPool = (dayCreatorFees * BigInt(allocation_percent)) / BigInt(100);
    
    logger.info({ 
      day: spec.day,
      dayCreatorFees: dayCreatorFees.toString(),
      dayCreatorFeesSOL: (Number(dayCreatorFees) / 1e9).toFixed(9),
      allocationPercent: allocation_percent,
      distributionPool: distributionPool.toString(),
      distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(9),
    }, `✅ Distribution pool: ${distributionPool.toString()} lamports (${(Number(distributionPool) / 1e9).toFixed(9)} SOL) from ${(Number(dayCreatorFees) / 1e9).toFixed(9)} SOL creator fees`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'distribution_pool_calculated',
      `Distribution pool: ${(Number(distributionPool) / 1e9).toFixed(4)} SOL`,
      {
        distributionPool: distributionPool.toString(),
        distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(4),
      }
    );

    // Calculate proportional shares
    logger.info({ day: spec.day }, '📊 Step 4: Calculating proportional shares for each holder');
    
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'calculate_proportional_shares',
      'Calculating proportional shares for each holder',
      {
        holderCount: eligible.length,
      }
    );
    
    const winners: Winner[] = eligible.map((holder, index) => {
      const holderBalance = toBigInt(holder.balance);
      const share = (holderBalance * distributionPool) / totalBalance;
      const percentage = (Number(holderBalance) / Number(totalBalance) * 100).toFixed(4);
      
      // Log first 5 and last 5 for brevity
      if (index < 5 || index >= eligible.length - 5) {
        logger.info({
          day: spec.day,
          wallet: holder.wallet,
          balance: holderBalance.toString(),
          sharePercent: percentage,
          amount: share.toString(),
          amountSOL: (Number(share) / 1e9).toFixed(6),
        }, `  ${index + 1}/${eligible.length}: ${holder.wallet.slice(0, 8)}... gets ${(Number(share) / 1e9).toFixed(6)} SOL (${percentage}% of pool)`);
      } else if (index === 5) {
        logger.info({ day: spec.day }, `  ... (${eligible.length - 10} more holders) ...`);
      }
      
      return {
        wallet: holder.wallet,
        amount: share,
        reason: `proportional_balance_${holderBalance}`,
      };
    });

    const totalDistributed = winners.reduce((sum, w) => sum + w.amount, BigInt(0));

    logger.info({ 
      day: spec.day,
      winnerCount: winners.length,
      totalDistributed: totalDistributed.toString(),
      totalDistributedSOL: (Number(totalDistributed) / 1e9).toFixed(4),
      dustLoss: (distributionPool - totalDistributed).toString(),
    }, `✅ Step 5: Distribution complete - ${winners.length} holders will receive ${(Number(totalDistributed) / 1e9).toFixed(4)} SOL total`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'distribution_complete',
      `Distribution complete - ${winners.length} holders will receive ${(Number(totalDistributed) / 1e9).toFixed(4)} SOL total`,
      {
        winnerCount: winners.length,
        totalDistributed: totalDistributed.toString(),
        totalDistributedSOL: (Number(totalDistributed) / 1e9).toFixed(4),
        dustLoss: (distributionPool - totalDistributed).toString(),
        // Save sample of winners (first 3 and last 3)
        sampleWinners: [
          ...winners.slice(0, 3).map(w => ({
            wallet: w.wallet,
            amount: w.amount.toString(),
            amountSOL: (Number(w.amount) / 1e9).toFixed(6),
          })),
          { wallet: '...', amount: '...', amountSOL: '...' },
          ...winners.slice(-3).map(w => ({
            wallet: w.wallet,
            amount: w.amount.toString(),
            amountSOL: (Number(w.amount) / 1e9).toFixed(6),
          })),
        ],
      }
    );

    // Note: Token airdrops are NOT handled here
    // They are managed independently by the hourly cron job (hourlyProcessor)
    // which selects winners hour-by-hour based on that hour's buyers

    return {
      winners,
      totalDistributed,
      metadata: {
        eligible_count: eligible.length,
        total_balance: totalBalance.toString(),
        has_hourly_airdrops: token_airdrop?.enabled || false,
      },
    };
  }
}

