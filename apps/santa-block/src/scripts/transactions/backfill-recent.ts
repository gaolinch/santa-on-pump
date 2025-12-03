import { transactionListener } from '../../services/listener';
import { db } from '../../database';
import { logger } from '../../utils/logger';

/**
 * Backfill recent transactions (configurable time range)
 */

async function backfillRecent() {
  try {
    // Get minutes from command line argument, default to 10
    const minutes = parseInt(process.argv[2]) || 10;
    
    logger.info(`Starting backfill for last ${minutes} minutes...`);
    
    const now = new Date();
    const startTime = new Date(now.getTime() - minutes * 60 * 1000);
    
    logger.info({ from: startTime, to: now }, 'Backfilling date range');
    
    console.log(`\n⏰ Backfilling transactions from last ${minutes} minutes...`);
    console.log(`   From: ${startTime.toISOString()}`);
    console.log(`   To:   ${now.toISOString()}\n`);
    
    await transactionListener.backfillRange(startTime, now);
    
    logger.info('Backfill complete!');
    console.log('\n✅ Backfill complete!\n');
    console.log('Run "yarn diagnostic" to see updated transaction count.\n');
  } catch (error) {
    logger.error({ error }, 'Backfill failed');
    console.error('❌ Backfill failed:', error);
  } finally {
    await db.close();
  }
}

backfillRecent();
