#!/usr/bin/env tsx
/**
 * Backfill transactions for a specific date
 * 
 * Usage:
 *   npm run backfill:date -- --date 2025-12-02
 *   npm run backfill:date -- --day 2
 */

import { transactionListener } from '../services/listener';
import { db } from '../../database';
import { logger } from '../utils/logger';
import { getAdventDay } from '../utils/date';

interface BackfillOptions {
  date?: string; // YYYY-MM-DD format
  day?: number; // Advent day (1-24)
}

async function backfillDate(options: BackfillOptions) {
  try {
    let targetDate: Date;
    
    if (options.date) {
      targetDate = new Date(options.date + 'T00:00:00Z');
      if (isNaN(targetDate.getTime())) {
        console.error(`❌ Invalid date format: ${options.date}. Use YYYY-MM-DD`);
        process.exit(1);
      }
    } else if (options.day) {
      // Calculate date from advent day (Dec 1, 2025 = Day 1)
      const dec1 = new Date('2025-12-01T00:00:00Z');
      targetDate = new Date(dec1);
      targetDate.setUTCDate(dec1.getUTCDate() + (options.day - 1));
      targetDate.setUTCHours(0, 0, 0, 0);
    } else {
      console.error('❌ Please provide either --date or --day');
      console.error('   Usage: npm run backfill:date -- --date 2025-12-02');
      console.error('   Usage: npm run backfill:date -- --day 2');
      process.exit(1);
    }
    
    const adventDay = getAdventDay(targetDate);
    
    console.log(`\n📅 Backfilling transactions for:`);
    console.log(`   Date: ${targetDate.toISOString().split('T')[0]}`);
    if (adventDay) {
      console.log(`   Advent Day: ${adventDay}\n`);
    } else {
      console.log();
    }
    
    logger.info({ date: targetDate, adventDay }, 'Starting backfill for date');
    
    // Use backfillRange with the same date for start and end
    // This will backfill just that one day
    const startDate = new Date(targetDate);
    startDate.setUTCHours(0, 0, 0, 0);
    
    const endDate = new Date(targetDate);
    endDate.setUTCHours(23, 59, 59, 999);
    
    await transactionListener.backfillRange(startDate, endDate);
    
    logger.info('Backfill complete!');
    console.log('\n✅ Backfill complete!\n');
    console.log('💡 Run a diagnostic check to see updated transaction count.\n');
  } catch (error) {
    logger.error({ error }, 'Backfill failed');
    console.error('❌ Backfill failed:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Parse command line arguments
function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--date' && args[i + 1]) {
      options.date = args[i + 1];
      i++;
    } else if (args[i] === '--day' && args[i + 1]) {
      options.day = parseInt(args[i + 1], 10);
      i++;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  await backfillDate(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

