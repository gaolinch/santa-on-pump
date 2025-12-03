#!/usr/bin/env tsx

import { ngoWalletRepo, auditLogRepo } from '../../database';
import { commitRevealService } from '../services/commit-reveal';
import { logger } from '../utils/logger';

/**
 * Seed database with initial data
 */
async function seed() {
  logger.info('Seeding database');

  try {
    // Seed NGO wallets
    logger.info('Seeding NGO wallets');
    
    const ngos = [
      {
        name: 'UNICEF Crypto Fund',
        wallet_address: 'UNICEF_WALLET_ADDRESS_PLACEHOLDER',
        description: 'Supporting children in need worldwide',
        website: 'https://www.unicef.org/cryptocurrency',
        verified: true,
        total_received: BigInt(0),
        tx_count: 0,
      },
      {
        name: 'The Ocean Cleanup',
        wallet_address: 'OCEAN_WALLET_ADDRESS_PLACEHOLDER',
        description: 'Removing plastic from oceans',
        website: 'https://theoceancleanup.com',
        verified: true,
        total_received: BigInt(0),
        tx_count: 0,
      },
      {
        name: 'Save the Children',
        wallet_address: 'STC_WALLET_ADDRESS_PLACEHOLDER',
        description: 'Protecting children worldwide',
        website: 'https://www.savethechildren.org',
        verified: true,
        total_received: BigInt(0),
        tx_count: 0,
      },
    ];

    for (const ngo of ngos) {
      try {
        await ngoWalletRepo.insert(ngo);
        logger.info({ name: ngo.name }, 'NGO wallet seeded');
      } catch (error) {
        logger.warn({ error, name: ngo.name }, 'NGO wallet already exists or failed to seed');
      }
    }

    // Generate and commit sample gift list
    logger.info('Generating sample gift list');
    const sampleGifts = commitRevealService.generateSampleGiftList();
    const salt = `santa-salt-${Date.now()}`;

    logger.info('Committing sample gift list');
    const commitment = await commitRevealService.commitGiftList(sampleGifts, salt);
    logger.info({ hash: commitment.hash }, 'Sample gift list committed');

    // Log audit entry
    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'system',
      action: 'seed_database',
      payload: {
        ngo_count: ngos.length,
        commitment_hash: commitment.hash,
      },
    });

    logger.info('Database seeding completed successfully');
  } catch (error) {
    logger.error({ error }, 'Database seeding failed');
    throw error;
  }
}

// Run if called directly
if (typeof require !== 'undefined' && require.main === module) {
  seed()
    .then(() => {
      logger.info('Seed script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Seed script failed');
      process.exit(1);
    });
}

export { seed };

