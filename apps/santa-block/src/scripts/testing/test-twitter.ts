#!/usr/bin/env tsx
/**
 * Test Twitter/X Integration
 * 
 * Tests the Twitter service to verify posting works correctly
 * 
 * Usage:
 *   npm run test:twitter                    # Preview message only (dry run)
 *   npm run test:twitter -- --post          # Actually post to Twitter
 *   npm run test:twitter -- --day 1         # Test with specific day
 */

import { twitterService } from '../../services/twitter-service';
import { logger } from '../../utils/logger';
import { config } from '../../config';

interface TestOptions {
  post?: boolean;
  day?: number;
}

async function testTwitter(options: TestOptions = {}) {
  const { post = false, day = 1 } = options;

  console.log('\n🧪 Testing Twitter/X Integration\n');

  // Check if credentials are configured
  if (!config.twitter.apiKey || !config.twitter.apiSecret || 
      !config.twitter.accessToken || !config.twitter.accessSecret) {
    console.error('❌ Twitter credentials not configured!');
    console.error('\nPlease set the following environment variables:');
    console.error('  - X_API_KEY');
    console.error('  - X_API_SECRET');
    console.error('  - X_ACCESS_TOKEN');
    console.error('  - X_ACCESS_SECRET');
    console.error('\nYou can get these from: https://developer.twitter.com/en/portal/dashboard\n');
    process.exit(1);
  }

  console.log('✅ Twitter credentials found\n');

  // Test data
  const frontendUrl = process.env.FRONTEND_URL || 'https://santa-pump.fun';
  const pageUrl = `${frontendUrl}/day/${day.toString().padStart(2, '0')}`;
  
  const testData = {
    day,
    giftType: 'proportional_holders',
    winnerCount: 32,
    totalDistributedSOL: '0.5452',
    pageUrl,
    txHashes: ['5j7xK9mP2nQ8rT4vW1yZ3aB6cD9eF2gH5iJ8kL1mN4oP7qR0sT3uV6wX9yZ'],
  };

  // Generate test message (fun message about elves)
  const testMessage = `Hey, Elves have been drinking all night long and they could not wake up on time. Santa is wrapping final gifts 🎄🎁\n\n#SantaOnPump #Solana #OnChainAdvent $SANTA`;

  console.log('📝 Generated Tweet Message:\n');
  console.log('─'.repeat(60));
  console.log(testMessage);
  console.log('─'.repeat(60));
  console.log(`\nCharacter count: ${testMessage.length} / 280\n`);

  if (!post) {
    console.log('ℹ️  This is a DRY RUN - message not posted to Twitter');
    console.log('   Run with --post to actually post the tweet\n');
    process.exit(0);
  }

  // Actually post to Twitter
  console.log('🚀 Posting to Twitter/X...\n');
  
  try {
    const tweetId = await twitterService.postTweet(testMessage);
    
    if (tweetId) {
      console.log(`✅ Tweet posted successfully!`);
      console.log(`   Tweet ID: ${tweetId}`);
      console.log(`   View at: https://twitter.com/i/web/status/${tweetId}\n`);
    } else {
      console.error('❌ Tweet posting returned no ID');
      console.error('   Check the logs above for error details\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Failed to post tweet\n');
    console.error('Error:', (error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): TestOptions {
  const args = process.argv.slice(2);
  const options: TestOptions = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--post') {
      options.post = true;
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
  await testTwitter(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

