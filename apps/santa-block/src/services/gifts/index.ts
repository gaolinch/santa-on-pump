/**
 * Gift Engine - Main Entry Point
 * 
 * Coordinates all gift types and delegates to appropriate handlers
 */

import { GiftSpec, TxRaw, HolderSnapshot } from '../../database';
import { logger } from '../../utils/logger';
import { IGiftHandler, GiftResult } from './base-gift';
import { ProportionalHoldersGift } from './proportional-holders';
import { TopBuyersGift } from './top-buyers';
import { DeterministicRandomGift } from './deterministic-random';
import { NGODonationGift } from './ngo-donation';
import { LastSecondHourGift } from './last-second-hour';

// Re-export types
export * from './base-gift';

/**
 * Main Gift Engine
 * 
 * Routes gift execution to the appropriate handler based on gift type
 */
export class GiftEngine {
  private handlers: Map<string, IGiftHandler>;

  constructor() {
    // Register all gift handlers
    const ngoGift = new NGODonationGift();
    
    this.handlers = new Map([
      ['proportional_holders', new ProportionalHoldersGift()],
      ['top_buyers_airdrop', new TopBuyersGift()],
      ['deterministic_random', new DeterministicRandomGift()],
      ['full_donation_to_ngo', ngoGift],
      ['ngo_donation', ngoGift], // Alias for full_donation_to_ngo
      ['last_second_hour', new LastSecondHourGift()],
    ]);
  }

  /**
   * Execute a gift specification
   * 
   * @param spec - Gift specification from database
   * @param transactions - Day's transactions
   * @param holders - Day's holder snapshot
   * @param treasuryBalance - Day's creator fees (from day_pool.fees_in), NOT treasury wallet balance
   * @param blockhash - Blockhash for deterministic randomness
   * @returns Gift execution result with winners and amounts
   */
  async executeGift(
    spec: GiftSpec,
    transactions: TxRaw[],
    holders: HolderSnapshot[],
    treasuryBalance: bigint,
    blockhash: string
  ): Promise<GiftResult> {
    logger.info({ day: spec.day, type: spec.type }, 'Executing gift');

    // Get the appropriate handler
    const handler = this.handlers.get(spec.type);
    
    if (!handler) {
      throw new Error(`Unknown gift type: ${spec.type}`);
    }

    // Execute the gift using the handler
    return handler.execute({
      spec,
      transactions,
      holders,
      treasuryBalance,
      blockhash,
    });
  }

  /**
   * Get all registered gift types
   */
  getAvailableGiftTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if a gift type is supported
   */
  isGiftTypeSupported(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get handler for a specific gift type (for testing)
   */
  getHandler(type: string): IGiftHandler | undefined {
    return this.handlers.get(type);
  }
}

// Singleton instance
export const giftEngine = new GiftEngine();

