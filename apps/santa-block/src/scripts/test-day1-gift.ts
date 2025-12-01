#!/usr/bin/env node
/**
 * Test Day 1 Gift Implementation
 * 
 * Day 1 - Welcome Drop:
 * - Type: Proportional holders
 * - Reward: 100% of capped daily fees
 * - Token Airdrop: 120,000 SANTA to 24 random users (1 per hour)
 */

import { giftEngine } from '../services/gifts';
import { GiftSpec, HolderSnapshot } from '../database';
import { logger } from '../utils/logger';

async function testDay1Gift() {
  logger.info('=== Testing Day 1 Gift Implementation ===');

  // Mock gift specification for Day 1
  const day1Spec: GiftSpec = {
    day: 1,
    type: 'proportional_holders',
    params: {
      allocation_percent: 100,
      min_balance: 0,
      token_airdrop: {
        enabled: true,
        total_amount: 120000,
        winners: 24,
        distribution: 'hourly_random',
      },
    },
    hash: 'test-hash',
  };

  // Mock holder snapshots (simulate 50 holders with various balances)
  const mockHolders: HolderSnapshot[] = [];
  const baseDate = new Date('2025-12-01');
  
  // Create diverse holder balances
  const balances = [
    1000000n, // Large holder
    500000n,
    250000n,
    100000n,
    75000n,
    50000n,
    25000n,
    10000n,
    5000n,
    2500n,
  ];

  // Generate 50 holders
  for (let i = 0; i < 50; i++) {
    const balance = balances[i % balances.length] + BigInt(i * 100);
    mockHolders.push({
      day: baseDate,
      wallet: `wallet_${i.toString().padStart(3, '0')}`,
      balance,
      rank: i + 1,
    });
  }

  logger.info({ holderCount: mockHolders.length }, 'Created mock holders');

  // Mock treasury balance (e.g., 10 SOL = 10,000,000,000 lamports)
  const treasuryBalance = BigInt(10_000_000_000);
  logger.info({ treasuryBalance: treasuryBalance.toString() }, 'Treasury balance');

  // Mock transactions (not needed for proportional holders, but required by interface)
  const mockTransactions: any[] = [];

  // Mock blockhash
  const mockBlockhash = 'test-blockhash-day1';

  try {
    // Execute the gift
    logger.info('Executing Day 1 gift...');
    const result = await giftEngine.executeGift(
      day1Spec,
      mockTransactions,
      mockHolders,
      treasuryBalance,
      mockBlockhash
    );

    // Validate results
    logger.info('=== Gift Execution Results ===');
    logger.info({ 
      winnerCount: result.winners.length,
      totalDistributed: result.totalDistributed.toString(),
      tokenAirdropCount: result.tokenAirdrops?.length || 0,
    }, 'Summary');

    // Verify 100% distribution (allow for rounding errors)
    const expectedDistribution = treasuryBalance;
    const actualDistribution = result.totalDistributed;
    const difference = expectedDistribution - actualDistribution;
    const maxAllowedDifference = BigInt(100); // Allow up to 100 lamports difference due to rounding
    const distributionMatch = difference >= BigInt(0) && difference <= maxAllowedDifference;
    
    logger.info({
      expected: expectedDistribution.toString(),
      actual: actualDistribution.toString(),
      difference: difference.toString(),
      match: distributionMatch,
    }, 'Distribution verification');

    // Show top 10 winners
    logger.info('=== Top 10 Fee Winners ===');
    result.winners.slice(0, 10).forEach((winner, idx) => {
      const holder = mockHolders.find(h => h.wallet === winner.wallet);
      logger.info({
        rank: idx + 1,
        wallet: winner.wallet,
        balance: holder?.balance.toString(),
        reward: winner.amount.toString(),
        percentOfTotal: ((Number(winner.amount) / Number(treasuryBalance)) * 100).toFixed(4) + '%',
      });
    });

    // Show token airdrop winners
    if (result.tokenAirdrops && result.tokenAirdrops.length > 0) {
      logger.info('=== Token Airdrop Winners ===');
      logger.info({ 
        totalWinners: result.tokenAirdrops.length,
        tokensPerWinner: result.tokenAirdrops[0].amount,
        totalTokens: result.tokenAirdrops.reduce((sum, a) => sum + a.amount, 0),
      }, 'Token airdrop summary');

      logger.info('First 10 token airdrop winners:');
      result.tokenAirdrops.slice(0, 10).forEach((airdrop) => {
        logger.info({
          wallet: airdrop.wallet,
          tokens: airdrop.amount,
          hour: airdrop.hour,
        });
      });
    }

    // Verify proportional distribution
    logger.info('=== Proportional Distribution Verification ===');
    const totalHolderBalance = mockHolders.reduce((sum, h) => sum + h.balance, BigInt(0));
    logger.info({ totalHolderBalance: totalHolderBalance.toString() }, 'Total holder balance');

    // Check a few holders to verify proportional calculation
    const sampleHolders = mockHolders.slice(0, 3);
    for (const holder of sampleHolders) {
      const winner = result.winners.find(w => w.wallet === holder.wallet);
      if (winner) {
        const expectedShare = (holder.balance * treasuryBalance) / totalHolderBalance;
        const actualShare = winner.amount;
        const match = expectedShare === actualShare;
        
        logger.info({
          wallet: holder.wallet,
          balance: holder.balance.toString(),
          expectedShare: expectedShare.toString(),
          actualShare: actualShare.toString(),
          match,
        }, 'Proportional share verification');
      }
    }

    // Final validation
    logger.info('=== Final Validation ===');
    const validations = {
      allHoldersRewarded: result.winners.length === mockHolders.length,
      fullDistribution: distributionMatch,
      tokenAirdropCorrect: result.tokenAirdrops?.length === 24,
      totalTokensCorrect: result.tokenAirdrops?.reduce((sum, a) => sum + a.amount, 0) === 120000,
    };

    logger.info(validations, 'Validation results');

    if (Object.values(validations).every(v => v)) {
      logger.info('✅ Day 1 gift implementation is CORRECT!');
    } else {
      logger.warn('⚠️ Some validations failed. Review the results above.');
    }

  } catch (error) {
    logger.error({ error }, 'Error executing Day 1 gift');
    throw error;
  }
}

// Run the test
testDay1Gift()
  .then(() => {
    logger.info('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error }, 'Test failed');
    process.exit(1);
  });

