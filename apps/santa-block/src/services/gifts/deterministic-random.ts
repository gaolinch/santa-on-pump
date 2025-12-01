/**
 * Deterministic Random Gift
 * 
 * Randomly selects N winners using deterministic shuffle based on blockhash
 */

import { logger } from '../../utils/logger';
import { giftLogger } from '../gift-logger';
import { deterministicShuffle, generateRandomSeed } from '../../utils/crypto';
import { config } from '../../config';
import { IGiftHandler, GiftExecutionContext, GiftResult, Winner } from './base-gift';

export class DeterministicRandomGift implements IGiftHandler {
  getType(): string {
    return 'deterministic_random';
  }

  async execute(context: GiftExecutionContext): Promise<GiftResult> {
    const { spec, holders, treasuryBalance, blockhash } = context;
    const { winner_count = 10, allocation_percent = 40, min_balance = 0 } = spec.params;

    logger.info({ 
      day: spec.day, 
      type: spec.type,
      totalHolders: holders.length,
      minBalance: min_balance,
      targetWinners: winner_count,
    }, '🔍 Step 1: Filtering eligible holders');

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'filter_eligible_holders',
      'Filtering eligible holders based on minimum balance',
      {
        totalHolders: holders.length,
        minBalance: min_balance,
        targetWinners: winner_count,
      }
    );

    // Filter eligible holders
    const eligible = holders.filter((h) => h.balance >= BigInt(min_balance));

    logger.info({ 
      day: spec.day,
      eligibleCount: eligible.length,
      filteredOut: holders.length - eligible.length,
    }, `✅ Found ${eligible.length} eligible holders`);

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

    // Generate deterministic seed
    logger.info({ 
      day: spec.day,
      blockhash: blockhash.slice(0, 16) + '...',
    }, '🎲 Step 2: Generating deterministic random seed');
    
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'generate_seed',
      'Generating deterministic random seed from blockhash',
      {
        blockhash: blockhash.slice(0, 16) + '...',
      }
    );
    
    const seed = generateRandomSeed(blockhash, config.gifts.salt);
    
    logger.info({ 
      day: spec.day,
      seed: seed.slice(0, 16) + '...',
    }, `✅ Seed generated: ${seed.slice(0, 16)}...`);

    // Shuffle and select winners
    logger.info({ 
      day: spec.day,
      eligibleCount: eligible.length,
      targetWinners: winner_count,
    }, '🔀 Step 3: Shuffling holders deterministically');
    
    await giftLogger.logStep(
      spec.day,
      spec.type,
      'shuffle_holders',
      'Shuffling holders using deterministic algorithm',
      {
        seed: seed.slice(0, 16) + '...',
        eligibleCount: eligible.length,
        targetWinners: winner_count,
      }
    );
    
    const shuffled = deterministicShuffle(eligible, seed);
    const actualWinnerCount = Math.min(winner_count, shuffled.length);
    const selected = shuffled.slice(0, actualWinnerCount);

    logger.info({ 
      day: spec.day,
      selectedCount: selected.length,
    }, `✅ Selected ${selected.length} random winners`);

    // Equal distribution among winners
    logger.info({ day: spec.day }, '💰 Step 4: Calculating equal distribution');
    
    const distributionPool = (treasuryBalance * BigInt(allocation_percent)) / BigInt(100);
    const amountPerWinner = distributionPool / BigInt(selected.length);

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
      'Calculating equal distribution among winners',
      {
        distributionPool: distributionPool.toString(),
        distributionPoolSOL: (Number(distributionPool) / 1e9).toFixed(4),
        amountPerWinner: amountPerWinner.toString(),
        amountPerWinnerSOL: (Number(amountPerWinner) / 1e9).toFixed(6),
        winnerCount: selected.length,
      }
    );

    logger.info({ day: spec.day }, '📋 Step 5: Creating winner list');
    
    const winners: Winner[] = selected.map((holder, index) => {
      if (index < 5 || index >= selected.length - 5) {
        logger.info({
          day: spec.day,
          wallet: holder.wallet,
          amount: amountPerWinner.toString(),
          amountSOL: (Number(amountPerWinner) / 1e9).toFixed(6),
        }, `  ${index + 1}/${selected.length}: ${holder.wallet.slice(0, 8)}... gets ${(Number(amountPerWinner) / 1e9).toFixed(6)} SOL`);
      } else if (index === 5) {
        logger.info({ day: spec.day }, `  ... (${selected.length - 10} more winners) ...`);
      }
      
      return {
        wallet: holder.wallet,
        amount: amountPerWinner,
        reason: 'random_selection',
      };
    });

    const totalDistributed = winners.reduce((sum, w) => sum + w.amount, BigInt(0));

    logger.info({ 
      day: spec.day,
      winnerCount: winners.length,
      totalDistributed: totalDistributed.toString(),
      totalDistributedSOL: (Number(totalDistributed) / 1e9).toFixed(4),
    }, `✅ Step 6: Distribution complete - ${winners.length} winners will receive ${(Number(totalDistributed) / 1e9).toFixed(4)} SOL total`);

    await giftLogger.logStep(
      spec.day,
      spec.type,
      'distribution_complete',
      `Distribution complete - ${winners.length} winners selected randomly`,
      {
        winnerCount: winners.length,
        totalDistributed: totalDistributed.toString(),
        totalDistributedSOL: (Number(totalDistributed) / 1e9).toFixed(4),
        sampleWinners: [
          ...winners.slice(0, 3).map(w => ({ wallet: w.wallet, amount: w.amount.toString() })),
          { wallet: '...', amount: '...' },
          ...winners.slice(-3).map(w => ({ wallet: w.wallet, amount: w.amount.toString() })),
        ],
      }
    );

    return {
      winners,
      totalDistributed,
      metadata: {
        seed,
        eligible_count: eligible.length,
        winner_count: selected.length,
      },
    };
  }
}

