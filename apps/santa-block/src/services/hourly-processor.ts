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
import { tokenTransferService } from './gifts/token-transfer';

export interface HourlyAirdropConfig {
  enabled: boolean;
  totalAmount: number;
  winners: number;
  distribution: string;
}

export interface HourlyAirdropResult {
  day: number;
  hour: number;
  winner?: string; // Single winner (for backward compatibility)
  winners?: Array<{ wallet: string; amount: number; txSignature?: string }>; // Multiple recipients
  amount?: number; // Single amount (for backward compatibility)
  blockhash: string;
  txSignature?: string; // Single signature (for backward compatibility)
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

export interface ManualAirdropRecipient {
  wallet: string;
  amount: number; // Amount in tokens (will be converted to base units)
}

export interface ProcessHourlyAirdropOptions {
  day?: number;
  hour?: number;
  manualRecipients?: ManualAirdropRecipient[]; // If provided, skip selection and use this list
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
  async processHourlyAirdrop(options?: ProcessHourlyAirdropOptions): Promise<HourlyAirdropResult | null> {
    const { day, hour, manualRecipients } = options || {};
    
    // Determine target day and hour
    let targetDay: number;
    let targetHour: number;
    
    if (day !== undefined && hour !== undefined) {
      // Use provided day/hour
      targetDay = day;
      targetHour = hour;
    } else {
      // Auto-detect from current time
      const now = new Date();
      const currentHour = now.getUTCHours();
      const currentDay = this.getCurrentAdventDay();

      if (!currentDay) {
        logger.debug('Not in advent season, skipping hourly airdrop');
        return null;
      }

      // Determine which hour to process (previous hour)
      targetDay = currentDay;
      targetHour = currentHour - 1;

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
    }

    const traceId = `hourly-${targetDay}-${targetHour}-${Date.now()}`;
    const hourlyLogger = giftLogger.withContext({
      day: targetDay,
      giftType: 'hourly_airdrop',
      phase: 'hourly_distribution',
      metadata: { hour: targetHour, manual: !!manualRecipients },
    });

    // Start execution logging (like gifts)
    giftLogger.startExecution(targetDay, 'hourly_airdrop', {
      hour: targetHour,
      manual: !!manualRecipients,
      recipientCount: manualRecipients?.length || 0,
    });

    try {
      await giftLogger.logStep(
        targetDay,
        'hourly_airdrop',
        'start',
        `Starting hourly airdrop processing for day ${targetDay}, hour ${targetHour}`,
        { day: targetDay, hour: targetHour, manual: !!manualRecipients }
      );

      hourlyLogger.info('Starting hourly airdrop processing', {
        day: targetDay,
        hour: targetHour,
        manual: !!manualRecipients,
      });

      // Get blockhash for logging
      const slot = await solanaService.getCurrentSlot();
      const blockhash = await solanaService.getBlockhashForSlot(slot) || 'fallback-blockhash-' + Date.now();

      let recipients: Array<{ wallet: string; amount: number }> = [];

      // If manual recipients provided, use them (skip selection)
      if (manualRecipients && manualRecipients.length > 0) {
        await giftLogger.logStep(
          targetDay,
          'hourly_airdrop',
          'manual_recipients',
          `Using manual recipients list (${manualRecipients.length} recipients)`,
          { recipientCount: manualRecipients.length }
        );

        hourlyLogger.info('Using manual recipients list', {
          count: manualRecipients.length,
        });

        // Get actual token decimals from blockchain or config
        let tokenDecimals = config.solana.pumpFunDecimals || config.santa.decimals || 9;
        try {
          const tokenMintAddress = config.solana.pumpFunToken || config.santa.tokenMint;
          if (tokenMintAddress) {
            const { PublicKey } = await import('@solana/web3.js');
            const tokenMint = new PublicKey(tokenMintAddress);
            const connection = await solanaService.getConnection();
            const mintInfo = await connection.getParsedAccountInfo(tokenMint);
            if (mintInfo.value && 'parsed' in mintInfo.value.data) {
              const parsedData = mintInfo.value.data as any;
              if (parsedData.parsed?.info?.decimals !== undefined) {
                tokenDecimals = parsedData.parsed.info.decimals;
                hourlyLogger.info({
                  decimals: tokenDecimals,
                  source: 'blockchain',
                }, 'Detected token decimals from blockchain');
              }
            }
          }
        } catch (error: any) {
          hourlyLogger.warn({
            error: error.message,
            decimals: tokenDecimals,
            source: 'config',
          }, 'Could not fetch decimals from blockchain, using config value');
        }

        // Convert token amounts to base units using actual token decimals
        recipients = manualRecipients.map(r => ({
          wallet: r.wallet,
          amount: Math.floor(r.amount * (10 ** tokenDecimals)), // Convert to base units
        }));
        
        hourlyLogger.info({
          tokenDecimals,
          exampleAmount: manualRecipients[0]?.amount,
          exampleBaseUnits: recipients[0]?.amount,
        }, 'Converted token amounts to base units');
      } else {
        // Normal flow: check config and select winners
        // 1. Check if this day has hourly airdrops
        const giftSpec = await giftSpecRepo.findByDay(targetDay);
        if (!giftSpec) {
          await giftLogger.logStep(
            targetDay,
            'hourly_airdrop',
            'check_config',
            'No gift spec found for day',
            { day: targetDay },
            'warn'
          );
          hourlyLogger.debug('No gift spec found for day', { day: targetDay });
          await giftLogger.failExecution(targetDay, new Error('No gift spec found'), { day: targetDay });
          return null;
        }

        const airdropConfig = this.getAirdropConfig(giftSpec.params);
        if (!airdropConfig.enabled) {
          await giftLogger.logStep(
            targetDay,
            'hourly_airdrop',
            'check_config',
            'Day does not have hourly airdrops enabled',
            { day: targetDay },
            'warn'
          );
          hourlyLogger.debug('Day does not have hourly airdrops', { day: targetDay });
          await giftLogger.failExecution(targetDay, new Error('Hourly airdrops not enabled'), { day: targetDay });
          return null;
        }

        await giftLogger.logStep(
          targetDay,
          'hourly_airdrop',
          'check_config',
          'Airdrop configuration loaded',
          { 
            enabled: airdropConfig.enabled,
            totalAmount: airdropConfig.totalAmount,
            winners: airdropConfig.winners,
          }
        );

        // 2. Check if this hour already distributed (skip for manual recipients)
        if (!manualRecipients) {
          const alreadyDistributed = await this.isHourAlreadyDistributed(targetDay, targetHour);
          if (alreadyDistributed) {
            await giftLogger.logStep(
              targetDay,
              'hourly_airdrop',
              'check_distributed',
              'Hourly airdrop already distributed',
              { day: targetDay, hour: targetHour },
              'warn'
            );
            hourlyLogger.info('Hourly airdrop already distributed', {
              day: targetDay,
              hour: targetHour,
            });
            await giftLogger.skipExecution(targetDay, 'Already distributed');
            return null;
          }
        }

        // 3. Get eligible participants (buyers from target hour)
        await giftLogger.logStep(
          targetDay,
          'hourly_airdrop',
          'get_participants',
          'Loading eligible participants',
          { day: targetDay, hour: targetHour }
        );

        const eligibleParticipants = await this.getEligibleParticipants(targetDay, targetHour);
        
        if (eligibleParticipants.length === 0) {
          await giftLogger.logStep(
            targetDay,
            'hourly_airdrop',
            'get_participants',
            'No eligible participants found',
            { day: targetDay, hour: targetHour },
            'warn'
          );
          
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
          
          await giftLogger.skipExecution(targetDay, 'No eligible participants');
          return null;
        }

        await giftLogger.logStep(
          targetDay,
          'hourly_airdrop',
          'get_participants',
          `Found ${eligibleParticipants.length} eligible participants`,
          { eligibleCount: eligibleParticipants.length }
        );

        hourlyLogger.info('Eligible participants loaded', {
          count: eligibleParticipants.length,
        });

        // 4. Select winner using deterministic RNG
        await giftLogger.logStep(
          targetDay,
          'hourly_airdrop',
          'select_winner',
          'Selecting winner using deterministic RNG',
          { blockhash: blockhash.substring(0, 20) + '...' }
        );

        const seed = generateRandomSeed(blockhash, `day${targetDay}-hour${targetHour}-${config.gifts.salt}`);
        const shuffled = deterministicShuffle(eligibleParticipants, seed);
        const winner = shuffled[0];

        await giftLogger.logStep(
          targetDay,
          'hourly_airdrop',
          'select_winner',
          `Winner selected: ${winner.wallet}`,
          { winner: winner.wallet }
        );

        hourlyLogger.info('Winner selected', {
          winner: winner.wallet,
          hour: targetHour,
        });

        // 5. Calculate airdrop amount
        const amountPerWinner = Math.floor(airdropConfig.totalAmount / airdropConfig.winners);
        
        recipients = [{
          wallet: winner.wallet,
          amount: amountPerWinner,
        }];
      }

      // Process all recipients
      await giftLogger.logStep(
        targetDay,
        'hourly_airdrop',
        'process_recipients',
        `Processing ${recipients.length} recipient(s)`,
        { recipientCount: recipients.length }
      );

      const winners: Array<{ wallet: string; amount: number; txSignature?: string }> = [];
      let totalDistributed = BigInt(0);

      for (let i = 0; i < recipients.length; i++) {
        const recipient = recipients[i];
        // For manual recipients, use sequential hours to avoid unique constraint conflicts
        // For normal flow, all use the same hour
        // Ensure hour doesn't exceed 23 (wrap around if needed)
        const recipientHour = manualRecipients ? Math.min(targetHour + i, 23) : targetHour;
        
        await giftLogger.logStep(
          targetDay,
          'hourly_airdrop',
          'record_distribution',
          `Recording distribution for ${recipient.wallet}`,
          { 
            wallet: recipient.wallet,
            amount: recipient.amount,
            index: i + 1,
            total: recipients.length,
          }
        );

        // Record distribution (before transfer for safety)
        await this.recordHourlyDistribution(
          targetDay,
          recipientHour,
          recipient.wallet,
          recipient.amount,
          blockhash,
          traceId
        );

        // Execute token transfer (always call transferTokens - it handles dry run mode internally)
        let txSignature: string | undefined;
        try {
          await giftLogger.logStep(
            targetDay,
            'hourly_airdrop',
            'transfer_tokens',
            `Transferring ${recipient.amount} tokens to ${recipient.wallet}`,
            { wallet: recipient.wallet, amount: recipient.amount }
          );

          txSignature = await this.transferTokens(recipient.wallet, recipient.amount);
          
          await giftLogger.logStep(
            targetDay,
            'hourly_airdrop',
            'transfer_tokens',
            `Tokens transferred successfully${config.santa.transferMode === 'dryrun' ? ' (DRY RUN)' : ''}`,
            { 
              wallet: recipient.wallet,
              amount: recipient.amount,
              txSignature,
              dryRun: config.santa.transferMode === 'dryrun',
            }
          );

          hourlyLogger.info('Tokens transferred', {
            winner: recipient.wallet,
            amount: recipient.amount,
            txSignature,
            dryRun: config.santa.transferMode === 'dryrun',
          });

          // Update the database record with transaction signature (only if real transfer)
          if (txSignature && config.santa.transferMode === 'real' && config.env === 'production') {
            await this.updateHourlyDistributionSignature(targetDay, recipientHour, txSignature);
          }
        } catch (error) {
          await giftLogger.logStep(
            targetDay,
            'hourly_airdrop',
            'transfer_tokens',
            `Token transfer failed: ${(error as Error).message}`,
            { 
              wallet: recipient.wallet,
              amount: recipient.amount,
              error: (error as Error).message,
            },
            'error'
          );

          hourlyLogger.error('Token transfer failed', {
            winner: recipient.wallet,
            amount: recipient.amount,
            error: (error as Error).message,
          });
          throw error;
        }

        winners.push({
          wallet: recipient.wallet,
          amount: recipient.amount,
          txSignature,
        });

        totalDistributed += BigInt(recipient.amount);
      }

      await giftLogger.logStep(
        targetDay,
        'hourly_airdrop',
        'complete',
        `Hourly airdrop completed successfully - ${winners.length} recipient(s)`,
        { 
          winnerCount: winners.length,
          totalDistributed: totalDistributed.toString(),
        }
      );

      const result: HourlyAirdropResult = {
        day: targetDay,
        hour: targetHour,
        winners: winners,
        // Backward compatibility: set winner and amount for single recipient
        winner: winners.length === 1 ? winners[0].wallet : undefined,
        amount: winners.length === 1 ? winners[0].amount : undefined,
        txSignature: winners.length === 1 ? winners[0].txSignature : undefined,
        blockhash,
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
          winners: winners,
          winnerCount: winners.length,
          totalDistributed: totalDistributed.toString(),
          blockhash,
        },
        resource_type: 'hourly_airdrop',
        resource_id: `${targetDay}-${targetHour}`,
      });

      // Complete execution logging (like gifts)
      await giftLogger.successExecution(
        targetDay,
        winners.length,
        totalDistributed,
        {
          hour: targetHour,
          manual: !!manualRecipients,
          blockhash,
        }
      );

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

    // Filter out excluded wallets
    return result.rows
      .filter(row => !config.santa.excludedWallets.includes(row.wallet))
      .map(row => ({
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
   * Update transaction signature for hourly distribution
   */
  private async updateHourlyDistributionSignature(
    day: number,
    hour: number,
    txSignature: string
  ): Promise<void> {
    await db.query(
      `UPDATE gift_hourly_airdrops 
       SET tx_signature = $1
       WHERE day = $2 AND hour = $3`,
      [txSignature, day, hour]
    );

    logger.info('Transaction signature updated', {
      day,
      hour,
      txSignature,
    });
  }

  /**
   * Transfer tokens to winner
   */
  private async transferTokens(wallet: string, amount: number): Promise<string> {
    logger.info('Transferring tokens from airdrop wallet', { wallet, amount });

    // Check if token transfer service is available (skip check in dry run mode)
    const transferMode = config.santa.transferMode;
    const isDryRun = transferMode === 'dryrun';
    
    if (!isDryRun && !tokenTransferService.isAvailable()) {
      throw new Error('Token transfer service not available. Check AIRDROP_WALLET_PRIVATE_KEY configuration.');
    }

    // Validate recipient wallet (skip in dry run mode)
    if (!isDryRun) {
      const isValid = await tokenTransferService.validateRecipient(wallet);
      if (!isValid) {
        throw new Error(`Invalid recipient wallet: ${wallet}`);
      }
    }

    // Execute transfer with retries (works in both dry run and real mode)
    const result = await tokenTransferService.transferTokens(wallet, amount, 3);

    if (!result.success) {
      throw new Error(`Token transfer failed: ${result.error}`);
    }

    return result.signature;
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
