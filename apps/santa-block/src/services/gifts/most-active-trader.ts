/**
 * Most Active Trader Gift
 * 
 * Rewards the wallet with the highest number of transactions (most active trader)
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

export class MostActiveTraderGift implements IGiftHandler {
  getType(): string {
    return 'most_active_trader';
  }

  async execute(context: GiftExecutionContext): Promise<GiftResult> {
    const { spec, transactions, treasuryBalance } = context;
    // Note: treasuryBalance is actually the day's creator fees (from day_pool.fees_in)
    const { allocation_percent = 100, min_trades = 1 } = spec.params;

    logger.info({
      day: spec.day,
      type: spec.type,
      totalTransactions: transactions.length,
      minTrades: min_trades,
    }, '🔍 Step 1: Counting transactions per wallet');

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'count_transactions',
      'Counting all transactions (buy and sell) per wallet',
      {
        totalTransactions: transactions.length,
        minTrades: min_trades,
      }
    );

    // Count transactions per wallet (both buy and sell)
    // For BUY: use to_wallet (buyer receives tokens)
    // For SELL: use from_wallet (seller sends tokens)
    const walletTxCounts = new Map<string, number>();
    
    for (const tx of transactions) {
      let wallet: string | null = null;
      
      if (tx.kind === 'buy') {
        // For BUY transactions, use to_wallet (the buyer receives tokens)
        wallet = tx.to_wallet || null;
      } else if (tx.kind === 'sell') {
        // For SELL transactions, use from_wallet (the seller sends tokens)
        wallet = tx.from_wallet || null;
      } else {
        // For other transaction types, use from_wallet as fallback
        wallet = tx.from_wallet || null;
      }
      
      if (!wallet) {
        logger.warn({ day: spec.day, signature: tx.signature, kind: tx.kind }, 'Transaction missing wallet address');
        continue;
      }
      
      // Exclude blacklisted wallets (including treasury wallet)
      if (isWalletExcluded(wallet)) {
        continue;
      }
      
      const current = walletTxCounts.get(wallet) || 0;
      walletTxCounts.set(wallet, current + 1);
    }

    logger.info({
      day: spec.day,
      uniqueWallets: walletTxCounts.size,
    }, `✅ Found ${walletTxCounts.size} unique wallets with transactions`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'unique_wallets_found',
      `Found ${walletTxCounts.size} unique wallets with transactions`,
      {
        uniqueWallets: walletTxCounts.size,
      }
    );

    // Filter by minimum trades requirement
    const eligibleWallets = Array.from(walletTxCounts.entries())
      .filter(([_, count]) => count >= min_trades);

    if (eligibleWallets.length === 0) {
      logger.warn({ day: spec.day, minTrades: min_trades }, `⚠️  No wallets found with at least ${min_trades} transaction(s)`);
      return {
        winners: [],
        totalDistributed: BigInt(0),
        metadata: { reason: 'no_eligible_traders', minTrades: min_trades },
      };
    }

    logger.info({
      day: spec.day,
      eligibleWallets: eligibleWallets.length,
    }, `✅ Found ${eligibleWallets.length} eligible wallets (>= ${min_trades} trades)`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'filter_eligible',
      `Filtered to ${eligibleWallets.length} eligible wallets (>= ${min_trades} trades)`,
      {
        eligibleWallets: eligibleWallets.length,
        minTrades: min_trades,
      }
    );

    // Sort by transaction count (descending) and select the most active
    logger.info({ day: spec.day }, '🏆 Step 2: Finding most active trader');

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'rank_traders',
      'Ranking traders by transaction count',
      {}
    );

    const sorted = eligibleWallets
      .sort((a, b) => b[1] - a[1]); // Sort by count descending

    const mostActive = sorted[0];
    const [winnerWallet, txCount] = mostActive;

    logger.info({
      day: spec.day,
      winnerWallet,
      txCount,
    }, `✅ Most active trader: ${winnerWallet.slice(0, 8)}... with ${txCount} transactions`);

    // Log top traders for transparency
    const topTraders = sorted.slice(0, 10);
    topTraders.forEach(([wallet, count], index) => {
      logger.info({
        day: spec.day,
        rank: index + 1,
        wallet,
        txCount: count,
      }, `  #${index + 1}: ${wallet.slice(0, 8)}... - ${count} transactions`);
    });

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'most_active_found',
      `Most active trader: ${winnerWallet} with ${txCount} transactions`,
      {
        winnerWallet,
        txCount,
        topTraders: topTraders.map(([wallet, count], index) => ({
          rank: index + 1,
          wallet,
          txCount: count,
        })),
      }
    );

    // Calculate distribution (100% to the most active trader)
    logger.info({ day: spec.day }, '💰 Step 3: Calculating distribution');

    const distributionPool = (treasuryBalance * BigInt(allocation_percent)) / BigInt(100);

    logger.info({
      day: spec.day,
      distributionPool: distributionPool.toString(),
      distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(4),
    }, `✅ Most active trader will receive: ${(Number(distributionPool) / 1e9).toFixed(6)} SOL`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'calculate_distribution',
      'Calculating distribution to most active trader',
      {
        distributionPool: distributionPool.toString(),
        distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(4),
        allocationPercent: allocation_percent,
      }
    );

    const winners: Winner[] = [{
      wallet: winnerWallet,
      amount: distributionPool,
      reason: `most_active_trader_${txCount}_transactions`,
    }];

    logger.info({
      day: spec.day,
      winnerCount: winners.length,
      totalDistributed: distributionPool.toString(),
      totalDistributedSOL: (Number(distributionPool) / 1e9).toFixed(4),
    }, `✅ Step 4: Distribution complete - Most active trader will receive ${(Number(distributionPool) / 1e9).toFixed(4)} SOL`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'distribution_complete',
      `Distribution to most active trader complete`,
      {
        winnerCount: winners.length,
        totalDistributed: distributionPool.toString(),
        totalDistributedSOL: (Number(distributionPool) / 1e9).toFixed(4),
        winner: {
          wallet: winnerWallet,
          txCount,
        },
      }
    );

    return {
      winners,
      totalDistributed: distributionPool,
      metadata: {
        winner_tx_count: txCount,
        total_wallets: walletTxCounts.size,
        eligible_wallets: eligibleWallets.length,
      },
    };
  }
}



