/**
 * Manual Hourly Airdrop Execution Script
 * 
 * This script allows you to manually trigger the hourly airdrop process locally.
 * 
 * Usage:
 *   npm run manual:hourly-airdrop
 * 
 * This will:
 * - Process the hourly airdrop for the current time
 * - Actually transfer tokens (if configured)
 * - Record the distribution in the database
 * 
 * WARNING: This is NOT a dry run - it will perform real operations!
 * For testing without side effects, use: npm run test:hourly-dryrun
 */

import { hourlyProcessor } from '../services/hourly-processor';
import { logger } from '../utils/logger';
import { db } from '../../database';

async function manualHourlyAirdrop() {
  console.log('\n🚀 Manual Hourly Airdrop Execution\n');
  console.log('⚠️  WARNING: This will perform REAL operations:');
  console.log('   - Transfer tokens (if treasury is configured)');
  console.log('   - Record distribution in database');
  console.log('   - Cannot be undone\n');
  
  try {
    console.log('📅 Processing hourly airdrop for current time...\n');
    
    const result = await hourlyProcessor.processHourlyAirdrop();
    
    if (!result) {
      console.log('ℹ️  No hourly airdrop to process');
      console.log('   Possible reasons:');
      console.log('   - Not in advent season');
      console.log('   - Current day does not have hourly airdrops');
      console.log('   - This hour already distributed');
      console.log('   - No eligible participants');
      return;
    }

    if (result.skipped) {
      console.log('⏭️  Hourly airdrop skipped');
      console.log(`   Reason: ${result.skipReason}`);
      console.log(`   Day: ${result.day}`);
      console.log(`   Hour: ${result.hour}`);
      return;
    }
    
    console.log('✅ Hourly airdrop executed successfully!\n');
    console.log('📊 Results:');
    console.log(`   Day: ${result.day}`);
    console.log(`   Hour: ${result.hour}`);
    console.log(`   Winner: ${result.winner}`);
    console.log(`   Amount: ${result.amount.toLocaleString()} tokens`);
    console.log(`   Blockhash: ${result.blockhash}`);
    console.log(`   Timestamp: ${result.timestamp.toISOString()}`);
    
    console.log('\n💾 Distribution recorded in database');
    console.log('   Table: gift_hourly_airdrops');
    console.log(`   Query: SELECT * FROM gift_hourly_airdrops WHERE day = ${result.day} AND hour = ${result.hour};`);
    
  } catch (error) {
    console.error('\n❌ Error executing hourly airdrop:', error);
    logger.error({ error }, 'Manual hourly airdrop failed');
    throw error;
  } finally {
    await db.close();
  }
}

// Run the script
manualHourlyAirdrop().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

