/**
 * Top Buyers Gift
 * 
 * Rewards top N buyers proportionally based on their buy volume
 */

import { logger } from '../../utils/logger';
import { giftLogger } from '../gift-logger';
import { config } from '../../config';
import { IGiftHandler, GiftExecutionContext, GiftResult, Winner } from './base-gift';

/**
 * Check if a wallet is excluded from gifts and airdrops
 */
function isWalletExcluded(wallet: string): boolean {
  return config.santa.excludedWallets.includes(wallet);
}

export class TopBuyersGift implements IGiftHandler {
  getType(): string {
    return 'top_buyers_airdrop';
  }

  async execute(context: GiftExecutionContext): Promise<GiftResult> {
    const { spec, transactions, treasuryBalance } = context;
    // Note: treasuryBalance is actually the day's creator fees (from day_pool.fees_in)
    const { top_n = 10, allocation_percent = 40 } = spec.params;

    logger.info({ 
      day: spec.day, 
      type: spec.type,
      totalTransactions: transactions.length,
      topN: top_n,
    }, '🔍 Step 1: Filtering buy transactions');

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'filter_buy_transactions',
      'Filtering buy transactions only',
      {
        totalTransactions: transactions.length,
        topN: top_n,
      }
    );

    // Get buy transactions only
    const buyTxs = transactions.filter((tx) => tx.kind === 'buy');

    logger.info({ 
      day: spec.day,
      buyTxCount: buyTxs.length,
      filteredOut: transactions.length - buyTxs.length,
    }, `✅ Found ${buyTxs.length} buy transactions`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'buy_transactions_found',
      `Found ${buyTxs.length} buy transactions`,
      {
        buyTxCount: buyTxs.length,
        filteredOut: transactions.length - buyTxs.length,
      }
    );

    // Aggregate by wallet
    logger.info({ day: spec.day }, '📊 Step 2: Aggregating volume by wallet');
    
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'aggregate_volume',
      'Aggregating buy volume by wallet',
      {}
    );
    
    const walletVolumes = new Map<string, bigint>();
    for (const tx of buyTxs) {
      // Exclude blacklisted wallets
      if (isWalletExcluded(tx.from_wallet)) {
        continue;
      }
      const current = walletVolumes.get(tx.from_wallet) || BigInt(0);
      walletVolumes.set(tx.from_wallet, current + tx.amount);
    }

    logger.info({ 
      day: spec.day,
      uniqueBuyers: walletVolumes.size,
    }, `✅ Found ${walletVolumes.size} unique buyers`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'unique_buyers_found',
      `Found ${walletVolumes.size} unique buyers`,
      {
        uniqueBuyers: walletVolumes.size,
      }
    );

    // Sort by volume
    logger.info({ day: spec.day }, `🏆 Step 3: Ranking top ${top_n} buyers by volume`);
    
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'rank_top_buyers',
      `Ranking top ${top_n} buyers by volume`,
      {
        topN: top_n,
      }
    );
    
    const sorted = Array.from(walletVolumes.entries())
      .sort((a, b) => (a[1] > b[1] ? -1 : 1))
      .slice(0, top_n);

    if (sorted.length === 0) {
      logger.warn({ day: spec.day }, '⚠️  No buyers found');
      return {
        winners: [],
        totalDistributed: BigInt(0),
        metadata: { reason: 'no_buyers' },
      };
    }

    logger.info({ 
      day: spec.day,
      topBuyersCount: sorted.length,
    }, `✅ Selected top ${sorted.length} buyers`);

    // Show top buyers
    sorted.forEach(([wallet, volume], index) => {
      logger.info({
        day: spec.day,
        rank: index + 1,
        wallet,
        volume: volume.toString(),
        volumeSOL: (Number(volume) / 1e9).toFixed(6),
      }, `  #${index + 1}: ${wallet.slice(0, 8)}... bought ${(Number(volume) / 1e9).toFixed(6)} SOL`);
    });

    // Calculate total volume of top buyers
    logger.info({ day: spec.day }, '💰 Step 4: Calculating proportional distribution');
    
    const totalVolume = sorted.reduce((sum, [_, vol]) => sum + vol, BigInt(0));

    logger.info({ 
      day: spec.day,
      totalVolume: totalVolume.toString(),
      totalVolumeSOL: (Number(totalVolume) / 1e9).toFixed(4),
    }, `✅ Total volume of top buyers: ${(Number(totalVolume) / 1e9).toFixed(4)} SOL`);

    // Calculate distribution amount
    const distributionPool = (treasuryBalance * BigInt(allocation_percent)) / BigInt(100);

    logger.info({ 
      day: spec.day,
      distributionPool: distributionPool.toString(),
      distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(4),
    }, `✅ Distribution pool: ${(Number(distributionPool) / 1e9).toFixed(4)} SOL`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'calculate_distribution',
      'Calculating proportional distribution based on volume',
      {
        totalVolume: totalVolume.toString(),
        totalVolumeSOL: (Number(totalVolume) / 1e9).toFixed(4),
        distributionPool: distributionPool.toString(),
        distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(4),
      }
    );

    logger.info({ day: spec.day }, '📋 Step 5: Calculating rewards for each buyer');

    const winners: Winner[] = sorted.map(([wallet, volume], index) => {
      const share = (volume * distributionPool) / totalVolume;
      const percentage = (Number(volume) / Number(totalVolume) * 100).toFixed(2);
      
      logger.info({
        day: spec.day,
        rank: index + 1,
        wallet,
        volume: volume.toString(),
        sharePercent: percentage,
        reward: share.toString(),
        rewardSOL: (Number(share) / 1e9).toFixed(6),
      }, `  #${index + 1}: ${wallet.slice(0, 8)}... gets ${(Number(share) / 1e9).toFixed(6)} SOL (${percentage}% of pool)`);
      
      return {
        wallet,
        amount: share,
        reason: `top_buyer_volume_${volume}`,
      };
    });

    const totalDistributed = winners.reduce((sum, w) => sum + w.amount, BigInt(0));

    logger.info({ 
      day: spec.day,
      winnerCount: winners.length,
      totalDistributed: totalDistributed.toString(),
      totalDistributedSOL: (Number(totalDistributed) / 1e9).toFixed(4),
    }, `✅ Step 6: Distribution complete - ${winners.length} buyers will receive ${(Number(totalDistributed) / 1e9).toFixed(4)} SOL total`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'distribution_complete',
      `Distribution complete - ${winners.length} buyers will receive ${(Number(totalDistributed) / 1e9).toFixed(4)} SOL total`,
      {
        winnerCount: winners.length,
        totalDistributed: totalDistributed.toString(),
        totalDistributedSOL: (Number(totalDistributed) / 1e9).toFixed(4),
        topBuyers: sorted.slice(0, 3).map(([wallet, volume]) => ({
          wallet,
          volume: volume.toString(),
          volumeSOL: (Number(volume) / 1e9).toFixed(6),
        })),
      }
    );

    return {
      winners,
      totalDistributed,
      metadata: {
        top_n,
        total_volume: totalVolume.toString(),
        unique_buyers: walletVolumes.size,
      },
    };
  }
}

