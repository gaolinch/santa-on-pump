import fs from 'fs/promises';
import path from 'path';
import { hashGiftList, verifyGiftList } from '../utils/crypto';
import { logger } from '../utils/logger';
import { config } from '../config';
import { GiftSpec, giftSpecRepo, auditLogRepo } from '../database';

export interface GiftListCommitment {
  hash: string;
  timestamp: Date;
  season: string;
}

export interface GiftListReveal {
  gifts: GiftSpec[];
  salt: string;
  hash: string;
  verified: boolean;
}

/**
 * Commit-Reveal Service
 * Handles the cryptographic commitment and revelation of the gift list
 */
export class CommitRevealService {
  /**
   * Commit a gift list (create hash and store publicly)
   */
  async commitGiftList(gifts: GiftSpec[], salt: string): Promise<GiftListCommitment> {
    logger.info({ giftCount: gifts.length }, 'Committing gift list');

    // Validate gifts
    if (gifts.length !== 24) {
      throw new Error('Gift list must contain exactly 24 gifts');
    }

    // Validate each gift has required fields
    for (const gift of gifts) {
      if (!gift.day || gift.day < 1 || gift.day > 24) {
        throw new Error(`Invalid gift day: ${gift.day}`);
      }
      if (!gift.type) {
        throw new Error(`Gift for day ${gift.day} missing type`);
      }
      if (!gift.params) {
        throw new Error(`Gift for day ${gift.day} missing params`);
      }
    }

    // Generate hash
    const hash = hashGiftList(gifts, salt);

    // Create commitment
    const commitment: GiftListCommitment = {
      hash,
      timestamp: new Date(),
      season: '2025-season-1',
    };

    // Save hash publicly (this would be published on website and social media)
    await this.saveCommitment(commitment);

    // Save full list with salt privately (to be revealed later)
    await this.savePrivateList(gifts, salt);

    // Log audit entry
    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'system',
      action: 'commit_gift_list',
      payload: {
        hash,
        gift_count: gifts.length,
      },
    });

    logger.info({ hash }, 'Gift list committed successfully');

    return commitment;
  }

  /**
   * Reveal the gift list and verify against commitment
   */
  async revealGiftList(): Promise<GiftListReveal> {
    logger.info('Revealing gift list');

    // Load commitment
    const commitment = await this.loadCommitment();
    if (!commitment) {
      throw new Error('No commitment found');
    }

    // Load private list
    const privateList = await this.loadPrivateList();
    if (!privateList) {
      throw new Error('Private gift list not found');
    }

    const { gifts, salt } = privateList;

    // Verify hash
    const verified = verifyGiftList(gifts, salt, commitment.hash);

    if (!verified) {
      logger.error('Gift list verification failed!');
      throw new Error('Gift list hash does not match commitment');
    }

    // Store gifts in database
    for (const gift of gifts) {
      await giftSpecRepo.insert({
        ...gift,
        hash: commitment.hash,
      });
    }

    // Log audit entry
    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'system',
      action: 'reveal_gift_list',
      payload: {
        hash: commitment.hash,
        verified,
        gift_count: gifts.length,
      },
    });

    logger.info({ verified }, 'Gift list revealed and verified');

    return {
      gifts,
      salt,
      hash: commitment.hash,
      verified,
    };
  }

  /**
   * Get a specific gift for a day
   */
  async getGiftForDay(day: number): Promise<GiftSpec | null> {
    logger.debug({ day }, 'Getting gift for day');

    // Check if gifts have been revealed
    const gift = await giftSpecRepo.findByDay(day);

    if (!gift) {
      logger.warn({ day }, 'Gift not found or not yet revealed');
      return null;
    }

    return gift;
  }

  /**
   * Verify that a revealed gift matches the commitment
   */
  async verifyGiftForDay(day: number): Promise<boolean> {
    logger.debug({ day }, 'Verifying gift for day');

    const gift = await giftSpecRepo.findByDay(day);
    if (!gift) {
      return false;
    }

    const commitment = await this.loadCommitment();
    if (!commitment) {
      return false;
    }

    // In a full implementation, you'd verify the specific gift
    // against a merkle tree or similar structure
    // For now, we just verify it exists in the database
    return gift.hash === commitment.hash;
  }

  /**
   * Get current commitment status
   */
  async getCommitmentStatus(): Promise<{
    committed: boolean;
    revealed: boolean;
    hash?: string;
    timestamp?: Date;
  }> {
    const commitment = await this.loadCommitment();
    const gifts = await giftSpecRepo.findAll();

    return {
      committed: commitment !== null,
      revealed: gifts.length > 0,
      hash: commitment?.hash,
      timestamp: commitment?.timestamp,
    };
  }

  /**
   * Save commitment to public file
   */
  private async saveCommitment(commitment: GiftListCommitment): Promise<void> {
    const filePath = path.join(process.cwd(), 'data', 'gifts-hash.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(commitment, null, 2), 'utf-8');
    logger.info({ filePath }, 'Commitment saved');
  }

  /**
   * Load commitment from public file
   */
  private async loadCommitment(): Promise<GiftListCommitment | null> {
    try {
      const filePath = path.join(process.cwd(), 'data', 'gifts-hash.json');
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn('Commitment file not found');
      return null;
    }
  }

  /**
   * Save private list (to be revealed later)
   */
  private async savePrivateList(gifts: GiftSpec[], salt: string): Promise<void> {
    const filePath = path.join(process.cwd(), 'data', 'gifts-full.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(
      filePath,
      JSON.stringify({ gifts, salt }, null, 2),
      'utf-8'
    );
    logger.info({ filePath }, 'Private gift list saved');
  }

  /**
   * Load private list
   */
  private async loadPrivateList(): Promise<{ gifts: GiftSpec[]; salt: string } | null> {
    try {
      const filePath = path.join(process.cwd(), 'data', 'gifts-full.json');
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.warn('Private gift list not found');
      return null;
    }
  }

  /**
   * Generate sample gift list for testing
   */
  generateSampleGiftList(): GiftSpec[] {
    const gifts: GiftSpec[] = [];

    for (let day = 1; day <= 24; day++) {
      // Vary gift types throughout the month
      let type: string;
      let params: any;

      if (day % 7 === 0) {
        type = 'full_donation_to_ngo';
        params = {
          ngo_wallet: 'NGO_WALLET_ADDRESS',
          percent: 100,
        };
      } else if (day % 5 === 0) {
        type = 'top_buyers_airdrop';
        params = {
          top_n: 10,
          allocation_percent: 40,
        };
      } else if (day % 3 === 0) {
        type = 'deterministic_random';
        params = {
          winner_count: 20,
          allocation_percent: 40,
          min_balance: 1000,
        };
      } else {
        type = 'proportional_holders';
        params = {
          allocation_percent: 40,
          min_balance: 100,
        };
      }

      gifts.push({
        day,
        type,
        params,
        distribution_source: 'treasury_daily_fees',
        notes: `Day ${day} gift - ${type}`,
        hash: '', // Will be set during commit
      });
    }

    return gifts;
  }
}

export const commitRevealService = new CommitRevealService();

