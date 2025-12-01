/**
 * Proportional Holders Gift
 * 
 * Distributes SOL proportionally to all holders based on their balance
 */

import { logger } from '../../utils/logger';
import { giftLogger } from '../gift-logger';
import { IGiftHandler, GiftExecutionContext, GiftResult, Winner } from './base-gift';

export class ProportionalHoldersGift implements IGiftHandler {
  getType(): string {
    return 'proportional_holders';
  }

  async execute(context: GiftExecutionContext): Promise<GiftResult> {
    const { spec, holders, treasuryBalance } = context;
    const { allocation_percent = 40, min_balance = 0, token_airdrop } = spec.params;

    logger.info({ 
      day: spec.day, 
      type: spec.type,
      totalHolders: holders.length,
      minBalance: min_balance,
      allocationPercent: allocation_percent,
    }, '🔍 Step 1: Filtering eligible holders');

    // Save step to database
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'filter_eligible_holders',
      'Filtering eligible holders based on minimum balance',
      {
        totalHolders: holders.length,
        minBalance: min_balance,
        allocationPercent: allocation_percent,
      }
    );

    // Filter eligible holders
    const eligible = holders.filter((h) => h.balance >= BigInt(min_balance));

    logger.info({ 
      day: spec.day,
      eligibleCount: eligible.length,
      filteredOut: holders.length - eligible.length,
    }, `✅ Found ${eligible.length} eligible holders (filtered ${holders.length - eligible.length} below min balance)`);

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

    // Calculate total balance
    logger.info({ day: spec.day }, '🧮 Step 2: Calculating total holder balance');
    
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'calculate_total_balance',
      'Calculating total holder balance',
      {}
    );
    
    const totalBalance = eligible.reduce((sum, h) => sum + h.balance, BigInt(0));
    
    logger.info({ 
      day: spec.day,
      totalBalance: totalBalance.toString(),
      totalBalanceSOL: (Number(totalBalance) / 1e9).toFixed(4),
    }, `✅ Total balance: ${totalBalance.toString()} lamports (${(Number(totalBalance) / 1e9).toFixed(4)} SOL)`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'total_balance_calculated',
      `Total balance: ${totalBalance.toString()} lamports`,
      {
        totalBalance: totalBalance.toString(),
        totalBalanceSOL: (Number(totalBalance) / 1e9).toFixed(4),
      }
    );

    // Calculate distribution pool
    logger.info({ day: spec.day }, '💰 Step 3: Calculating distribution pool');
    
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'calculate_distribution_pool',
      'Calculating distribution pool from treasury',
      {
        treasuryBalance: treasuryBalance.toString(),
        allocationPercent: allocation_percent,
      }
    );
    
    const distributionPool = (treasuryBalance * BigInt(allocation_percent)) / BigInt(100);
    
    logger.info({ 
      day: spec.day,
      treasuryBalance: treasuryBalance.toString(),
      allocationPercent: allocation_percent,
      distributionPool: distributionPool.toString(),
      distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(4),
    }, `✅ Distribution pool: ${distributionPool.toString()} lamports (${(Number(distributionPool) / 1e9).toFixed(4)} SOL)`);

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
      const share = (holder.balance * distributionPool) / totalBalance;
      const percentage = (Number(holder.balance) / Number(totalBalance) * 100).toFixed(4);
      
      // Log first 5 and last 5 for brevity
      if (index < 5 || index >= eligible.length - 5) {
        logger.info({
          day: spec.day,
          wallet: holder.wallet,
          balance: holder.balance.toString(),
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
        reason: `proportional_balance_${holder.balance}`,
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

