/**
 * Hourly Processor - Distributes token airdrops throughout the day
 * 
 * Flow:
 * 1. Check if current day has hourly airdrops
 * 2. Check if current hour already distributed
 * 3. Get eligible participants
 * 4. Select winner using deterministic RNG (blockhash + hour)
 * 5. Execute token transfer
 * 6. Record distribution
 */

import { logger } from '../utils/logger';
import { giftLogger } from './gift-logger';
import { db, giftSpecRepo, auditLogRepo } from '../database';
import { deterministicShuffle, generateRandomSeed } from '../utils/crypto';
import { solanaService } from './solana';
import { config } from '../config';

export interface HourlyAirdropConfig {
  enabled: boolean;
  totalAmount: number;
  winners: number;
  distribution: string;
}

export interface HourlyAirdropResult {
  day: number;
  hour: number;
  winner: string;
  amount: number;
  blockhash: string;
  txSignature?: string;
  timestamp: Date;
  skipped?: boolean;
  skipReason?: string;
}

export interface DryRunResult extends HourlyAirdropResult {
  dryRun: true;
  eligibleCount: number;
  alreadyDistributed: boolean;
  wouldSkip: boolean;
  skipReason?: string;
  giftConfig?: HourlyAirdropConfig;
}

export interface EligibleParticipant {
  wallet: string;
  balance?: bigint;
  buyVolume?: bigint;
}

export class HourlyProcessor {
  /**
   * DRY RUN: Simulate hourly airdrop processing without sending tokens or recording to DB
   * 
   * This function performs all the same checks and calculations as processHourlyAirdrop()
   * but does NOT:
   * - Record distribution to database
   * - Transfer tokens
   * - Modify any state
   * 
   * Use this to test the cron job logic safely.
   * 
   * @param day - Optional: specify a day (1-24) to test, defaults to current day
   * @param hour - Optional: specify an hour (0-23) to test, defaults to current hour
   */
  async dryRunHourlyAirdrop(
    day?: number,
    hour?: number
  ): Promise<DryRunResult | null> {
    const now = new Date();
    const currentHour = hour ?? now.getUTCHours();
    let currentDay = day ?? this.getCurrentAdventDay();

    if (!currentDay) {
      logger.info('DRY RUN: Not in advent season, would skip hourly airdrop');
      return null;
    }

    // Determine which hour to process (previous hour)
    let targetDay = currentDay;
    let targetHour = currentHour - 1;

    // Special case: At 00:00, process hour 23 of previous day
    if (currentHour === 0) {
      if (currentDay === 1) {
        // Day 1 at 00:00: no previous hour exists
        logger.debug('DRY RUN: Day 1 hour 0: no previous hour to process');
        return {
          dryRun: true,
          day: currentDay,
          hour: currentHour,
          winner: '',
          amount: 0,
          blockhash: '',
          timestamp: new Date(),
          eligibleCount: 0,
          alreadyDistributed: false,
          wouldSkip: true,
          skipReason: 'Day 1 at hour 0: no previous hour to process',
        };
      }
      targetDay = currentDay - 1;
      targetHour = 23;
    }

    const traceId = `dryrun-hourly-${targetDay}-${targetHour}-${Date.now()}`;
    const hourlyLogger = giftLogger.withContext({
      day: targetDay,
      giftType: 'hourly_airdrop_dryrun',
      phase: 'hourly_distribution',
      metadata: { hour: targetHour, dryRun: true },
    });

    try {
      hourlyLogger.info('DRY RUN: Starting hourly airdrop simulation', {
        day: targetDay,
        hour: targetHour,
      });

      // 1. Check if this day has hourly airdrops
      const giftSpec = await giftSpecRepo.findByDay(targetDay);
      if (!giftSpec) {
        hourlyLogger.info('DRY RUN: No gift spec found for day', { day: targetDay });
        return {
          dryRun: true,
          day: targetDay,
          hour: targetHour,
          winner: '',
          amount: 0,
          blockhash: '',
          timestamp: new Date(),
          eligibleCount: 0,
          alreadyDistributed: false,
          wouldSkip: true,
          skipReason: 'No gift spec found for this day',
        };
      }

      const airdropConfig = this.getAirdropConfig(giftSpec.params);
      if (!airdropConfig.enabled) {
        hourlyLogger.info('DRY RUN: Day does not have hourly airdrops', { day: targetDay });
        return {
          dryRun: true,
          day: targetDay,
          hour: targetHour,
          winner: '',
          amount: 0,
          blockhash: '',
          timestamp: new Date(),
          eligibleCount: 0,
          alreadyDistributed: false,
          wouldSkip: true,
          skipReason: 'Day does not have hourly airdrops enabled',
          giftConfig: airdropConfig,
        };
      }

      // 2. Check if this hour already distributed
      const alreadyDistributed = await this.isHourAlreadyDistributed(targetDay, targetHour);
      if (alreadyDistributed) {
        hourlyLogger.info('DRY RUN: Hourly airdrop already distributed', {
          day: targetDay,
          hour: targetHour,
        });
        return {
          dryRun: true,
          day: targetDay,
          hour: targetHour,
          winner: '',
          amount: 0,
          blockhash: '',
          timestamp: new Date(),
          eligibleCount: 0,
          alreadyDistributed: true,
          wouldSkip: true,
          skipReason: 'Hour already distributed',
          giftConfig: airdropConfig,
        };
      }

      // 3. Get eligible participants (buyers from target hour)
      const eligibleParticipants = await this.getEligibleParticipants(targetDay, targetHour);
      
      if (eligibleParticipants.length === 0) {
        hourlyLogger.info('DRY RUN: No eligible participants for hourly airdrop', {
          day: targetDay,
          hour: targetHour,
        });
        return {
          dryRun: true,
          day: targetDay,
          hour: targetHour,
          winner: '',
          amount: 0,
          blockhash: '',
          timestamp: new Date(),
          eligibleCount: 0,
          alreadyDistributed: false,
          wouldSkip: true,
          skipReason: 'No eligible participants',
          giftConfig: airdropConfig,
        };
      }

      hourlyLogger.info('DRY RUN: Eligible participants loaded', {
        count: eligibleParticipants.length,
      });

      // 4. Select winner using deterministic RNG
      const slot = await solanaService.getCurrentSlot();
      const blockhash = await solanaService.getBlockhashForSlot(slot) || 'fallback-blockhash-' + Date.now();
      const seed = generateRandomSeed(blockhash, `day${targetDay}-hour${targetHour}-${config.gifts.salt}`);
      const shuffled = deterministicShuffle(eligibleParticipants, seed);
      const winner = shuffled[0];

      hourlyLogger.info('DRY RUN: Winner selected', {
        winner: winner.wallet,
        hour: targetHour,
      });

      // 5. Calculate airdrop amount
      const amountPerWinner = Math.floor(airdropConfig.totalAmount / airdropConfig.winners);

      const result: DryRunResult = {
        dryRun: true,
        day: targetDay,
        hour: targetHour,
        winner: winner.wallet,
        amount: amountPerWinner,
        blockhash,
        timestamp: new Date(),
        eligibleCount: eligibleParticipants.length,
        alreadyDistributed: false,
        wouldSkip: false,
        giftConfig: airdropConfig,
      };

      hourlyLogger.info('DRY RUN: Simulation completed successfully', {
        ...result,
        note: 'No tokens transferred, no database records created',
      });

      return result;

    } catch (error) {
      hourlyLogger.error('DRY RUN: Simulation failed', {
        day: targetDay,
        hour: targetHour,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Process hourly airdrop
   * 
   * Runs at :00 of each hour to process the PREVIOUS hour's buyers:
   * - 01:00 → Process hour 0 (00:00-00:59)
   * - 02:00 → Process hour 1 (01:00-01:59)
   * - 00:00 (Day 2) → Process hour 23 (23:00-23:59) of Day 1
   */
  async processHourlyAirdrop(): Promise<HourlyAirdropResult | null> {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentDay = this.getCurrentAdventDay();

    if (!currentDay) {
      logger.debug('Not in advent season, skipping hourly airdrop');
      return null;
    }

    // Determine which hour to process (previous hour)
    let targetDay = currentDay;
    let targetHour = currentHour - 1;

    // Special case: At 00:00, process hour 23 of previous day
    if (currentHour === 0) {
      if (currentDay === 1) {
        // Day 1 at 00:00: no previous hour exists
        logger.debug('Day 1 hour 0: no previous hour to process');
        return null;
      }
      targetDay = currentDay - 1;
      targetHour = 23;
    }

    const traceId = `hourly-${targetDay}-${targetHour}-${Date.now()}`;
    const hourlyLogger = giftLogger.withContext({
      day: targetDay,
      giftType: 'hourly_airdrop',
      phase: 'hourly_distribution',
      metadata: { hour: targetHour },
    });

    try {
      hourlyLogger.info('Starting hourly airdrop processing', {
        day: targetDay,
        hour: targetHour,
      });

      // 1. Check if this day has hourly airdrops
      const giftSpec = await giftSpecRepo.findByDay(targetDay);
      if (!giftSpec) {
        hourlyLogger.debug('No gift spec found for day', { day: targetDay });
        return null;
      }

      const airdropConfig = this.getAirdropConfig(giftSpec.params);
      if (!airdropConfig.enabled) {
        hourlyLogger.debug('Day does not have hourly airdrops', { day: targetDay });
        return null;
      }

      // 2. Check if this hour already distributed
      const alreadyDistributed = await this.isHourAlreadyDistributed(targetDay, targetHour);
      if (alreadyDistributed) {
        hourlyLogger.info('Hourly airdrop already distributed', {
          day: targetDay,
          hour: targetHour,
        });
        return null;
      }

      // 3. Get eligible participants (buyers from target hour)
      const eligibleParticipants = await this.getEligibleParticipants(targetDay, targetHour);
      
      if (eligibleParticipants.length === 0) {
        hourlyLogger.info('No eligible participants for hourly airdrop', {
          day: targetDay,
          hour: targetHour,
        });
        
        // Record in audit log
        await auditLogRepo.insert({
          ts: new Date(),
          actor: 'system',
          action: 'hourly_airdrop_skipped',
          payload: {
            day: targetDay,
            hour: targetHour,
            reason: 'no_eligible_participants',
            eligibleCount: 0,
          },
          resource_type: 'hourly_airdrop',
          resource_id: `${targetDay}-${targetHour}`,
        });
        
        return null;
      }

      hourlyLogger.info('Eligible participants loaded', {
        count: eligibleParticipants.length,
      });

      // 4. Select winner using deterministic RNG
      const slot = await solanaService.getCurrentSlot();
      const blockhash = await solanaService.getBlockhashForSlot(slot) || 'fallback-blockhash-' + Date.now();
      const seed = generateRandomSeed(blockhash, `day${targetDay}-hour${targetHour}-${config.gifts.salt}`);
      const shuffled = deterministicShuffle(eligibleParticipants, seed);
      const winner = shuffled[0];

      hourlyLogger.info('Winner selected', {
        winner: winner.wallet,
        hour: targetHour,
      });

      // 5. Calculate airdrop amount
      const amountPerWinner = Math.floor(airdropConfig.totalAmount / airdropConfig.winners);

      // 6. Record distribution (before transfer for safety)
      await this.recordHourlyDistribution(
        targetDay,
        targetHour,
        winner.wallet,
        amountPerWinner,
        blockhash,
        traceId
      );

      // 7. Execute token transfer (if enabled)
      let txSignature: string | undefined;
      if (config.env === 'production') {
        try {
          txSignature = await this.transferTokens(winner.wallet, amountPerWinner);
          hourlyLogger.info('Tokens transferred', {
            winner: winner.wallet,
            amount: amountPerWinner,
            txSignature,
          });
        } catch (error) {
          hourlyLogger.error('Token transfer failed', {
            winner: winner.wallet,
            amount: amountPerWinner,
            error: (error as Error).message,
          });
          throw error;
        }
      } else {
        hourlyLogger.info('Token transfer skipped (not production)', {
          winner: winner.wallet,
          amount: amountPerWinner,
        });
      }

      const result: HourlyAirdropResult = {
        day: targetDay,
        hour: targetHour,
        winner: winner.wallet,
        amount: amountPerWinner,
        blockhash,
        txSignature,
        timestamp: new Date(),
      };

      hourlyLogger.info('Hourly airdrop completed successfully', result);

      // Record successful execution in audit log
      await auditLogRepo.insert({
        ts: new Date(),
        actor: 'system',
        action: 'hourly_airdrop_executed',
        payload: {
          day: targetDay,
          hour: targetHour,
          winner: winner.wallet,
          amount: amountPerWinner,
          eligibleCount: eligibleParticipants.length,
          txSignature,
          blockhash,
        },
        resource_type: 'hourly_airdrop',
        resource_id: `${targetDay}-${targetHour}`,
      });

      return result;

    } catch (error) {
      hourlyLogger.error('Hourly airdrop processing failed', {
        day: targetDay,
        hour: targetHour,
        error: (error as Error).message,
      });
      
      // Record failure in audit log
      await auditLogRepo.insert({
        ts: new Date(),
        actor: 'system',
        action: 'hourly_airdrop_failed',
        payload: {
          day: targetDay,
          hour: targetHour,
          error: (error as Error).message,
          stack: (error as Error).stack,
        },
        resource_type: 'hourly_airdrop',
        resource_id: `${targetDay}-${targetHour}`,
      });
      
      throw error;
    }
  }

  /**
   * Get airdrop configuration from gift params
   */
  private getAirdropConfig(params: any): HourlyAirdropConfig {
    const tokenAirdrop = params.token_airdrop;
    
    if (!tokenAirdrop || !tokenAirdrop.enabled) {
      return {
        enabled: false,
        totalAmount: 0,
        winners: 0,
        distribution: 'none',
      };
    }

    return {
      enabled: true,
      totalAmount: tokenAirdrop.total_amount || 0,
      winners: tokenAirdrop.winners || 0,
      distribution: tokenAirdrop.distribution || 'hourly_random',
    };
  }

  /**
   * Check if hour already distributed
   */
  private async isHourAlreadyDistributed(day: number, hour: number): Promise<boolean> {
    const result = await db.query(
      `SELECT id FROM gift_hourly_airdrops 
       WHERE day = $1 AND hour = $2`,
      [day, hour]
    );
    return result.rows.length > 0;
  }

  /**
   * Get eligible participants for the CURRENT hour
   * 
   * Each hour's airdrop goes to buyers from the SAME hour (up to now):
   * - Hour 0 (00:00) → buyers from 00:00-00:59
   * - Hour 1 (01:00) → buyers from 01:00-01:59
   * - Hour 23 (23:00) → buyers from 23:00-23:59
   * 
   * This gives 24 airdrops per day (hours 0-23).
   * 
   * Benefits:
   * - Fair: Each hour is independent, 1 chance per hour you buy
   * - Full 24 airdrops as configured
   * - Engagement: Incentivizes buying every hour
   * - No gaming: Can't get multiple chances from one purchase
   * 
   * Note: Airdrop runs at the END of each hour (e.g., 00:59, 01:59, etc.)
   * so all buyers in that hour are included.
   */
  private async getEligibleParticipants(day: number, currentHour: number): Promise<EligibleParticipant[]> {
    // Get the date for this advent day
    const targetDate = this.getDateForAdventDay(day);
    
    // Query buyers from the CURRENT hour only
    const result = await db.query<{ wallet: string; buy_volume: string }>(
      `SELECT 
        from_wallet as wallet,
        SUM(amount) as buy_volume
       FROM tx_raw
       WHERE DATE(block_time) = $1
         AND EXTRACT(HOUR FROM block_time) = $2
         AND kind = 'buy'
         AND status IN ('confirmed', 'finalized')
       GROUP BY from_wallet
       HAVING SUM(amount) > 0
       ORDER BY SUM(amount) DESC`,
      [targetDate, currentHour]
    );

    return result.rows.map(row => ({
      wallet: row.wallet,
      buyVolume: BigInt(row.buy_volume),
    }));
  }

  /**
   * Record hourly distribution in database
   */
  private async recordHourlyDistribution(
    day: number,
    hour: number,
    wallet: string,
    amount: number,
    blockhash: string,
    traceId: string
  ): Promise<void> {
    await db.query(
      `INSERT INTO gift_hourly_airdrops 
       (day, hour, wallet, amount, distributed_at, blockhash, trace_id)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6)
       ON CONFLICT (day, hour) DO NOTHING`,
      [day, hour, wallet, amount, blockhash, traceId]
    );

    logger.info('Hourly distribution recorded', {
      day,
      hour,
      wallet,
      amount,
    });
  }

  /**
   * Transfer tokens to winner
   * (Placeholder - actual implementation depends on your token transfer logic)
   */
  private async transferTokens(wallet: string, amount: number): Promise<string> {
    // TODO: Implement actual token transfer using Solana
    // This should use your existing token transfer logic
    
    logger.info('Transferring tokens', { wallet, amount });
    
    // Example implementation:
    // const signature = await solanaService.transferTokens(
    //   config.santa.tokenMint,
    //   wallet,
    //   amount
    // );
    
    // For now, return a mock signature
    return `mock-tx-${Date.now()}`;
  }

  /**
   * Get current advent day (1-24) or null if not in season
   */
  private getCurrentAdventDay(): number | null {
    const now = new Date();
    const seasonStart = new Date('2025-12-01');
    const seasonEnd = new Date('2025-12-24');

    if (now < seasonStart || now > seasonEnd) {
      return null;
    }

    const daysSinceStart = Math.floor(
      (now.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24)
    );

    const adventDay = daysSinceStart + 1;
    return adventDay >= 1 && adventDay <= 24 ? adventDay : null;
  }

  /**
   * Get date for a specific advent day
   */
  private getDateForAdventDay(day: number): Date {
    const seasonStart = new Date('2025-12-01');
    const targetDate = new Date(seasonStart);
    targetDate.setDate(targetDate.getDate() + (day - 1));
    return targetDate;
  }

  /**
   * Get all hourly airdrops for a day
   */
  async getHourlyAirdropsForDay(day: number): Promise<HourlyAirdropResult[]> {
    const result = await db.query<{
      day: number;
      hour: number;
      wallet: string;
      amount: string;
      distributed_at: Date;
      blockhash: string;
      trace_id: string;
    }>(
      `SELECT day, hour, wallet, amount, distributed_at, blockhash, trace_id
       FROM gift_hourly_airdrops
       WHERE day = $1
       ORDER BY hour ASC`,
      [day]
    );

    return result.rows.map(row => ({
      day: row.day,
      hour: row.hour,
      winner: row.wallet,
      amount: parseFloat(row.amount),
      blockhash: row.blockhash,
      timestamp: row.distributed_at,
    }));
  }

  /**
   * Get hourly airdrops for a specific wallet
   */
  async getHourlyAirdropsForWallet(wallet: string): Promise<HourlyAirdropResult[]> {
    const result = await db.query<{
      day: number;
      hour: number;
      wallet: string;
      amount: string;
      distributed_at: Date;
      blockhash: string;
    }>(
      `SELECT day, hour, wallet, amount, distributed_at, blockhash
       FROM gift_hourly_airdrops
       WHERE wallet = $1
       ORDER BY day ASC, hour ASC`,
      [wallet]
    );

    return result.rows.map(row => ({
      day: row.day,
      hour: row.hour,
      winner: row.wallet,
      amount: parseFloat(row.amount),
      blockhash: row.blockhash,
      timestamp: row.distributed_at,
    }));
  }

  /**
   * Get next hourly airdrop time
   */
  getNextAirdropTime(): { day: number; hour: number; timeUntil: number } | null {
    const currentDay = this.getCurrentAdventDay();
    if (!currentDay) {
      return null;
    }

    const now = new Date();
    const currentHour = now.getUTCHours();
    const nextHour = (currentHour + 1) % 24;
    const nextDay = nextHour === 0 ? currentDay + 1 : currentDay;

    // Calculate time until next hour
    const nextAirdropTime = new Date(now);
    nextAirdropTime.setUTCHours(nextHour, 0, 0, 0);
    if (nextHour === 0) {
      nextAirdropTime.setDate(nextAirdropTime.getDate() + 1);
    }

    const timeUntil = nextAirdropTime.getTime() - now.getTime();

    return {
      day: nextDay,
      hour: nextHour,
      timeUntil,
    };
  }
}

// Singleton instance
export const hourlyProcessor = new HourlyProcessor();
