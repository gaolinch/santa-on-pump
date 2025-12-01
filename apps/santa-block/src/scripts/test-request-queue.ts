#!/usr/bin/env tsx

/**
 * Test script for RPC request queue
 * Simulates multiple concurrent transaction fetches to verify queueing works
 */

import { solanaService } from '../services/solana.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

async function testRequestQueue() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 TESTING RPC REQUEST QUEUE');
  console.log('='.repeat(80) + '\n');

  console.log('Configuration:');
  console.log(`  - Max Concurrent: ${config.solana.maxConcurrentRequests}`);
  console.log(`  - Request Delay: ${config.solana.requestDelayMs}ms`);
  console.log(`  - Network: ${config.solana.network}\n`);

  // Get some recent transaction signatures
  console.log('📡 Fetching recent signatures...\n');
  
  try {
    const signatures = await solanaService.getSignaturesForAddress(
      undefined,
      undefined,
      50 // Get 50 signatures
    );

    if (signatures.length === 0) {
      console.log('❌ No signatures found. Make sure SANTA_TOKEN_MINT or PUMP_FUN_TOKEN is configured.\n');
      return;
    }

    console.log(`✅ Found ${signatures.length} signatures\n`);
    console.log('🚀 Firing concurrent requests...\n');

    const startTime = Date.now();
    
    // Fire many requests simultaneously to test queue
    const promises = signatures.slice(0, 40).map(async (sig, index) => {
      const requestStart = Date.now();
      
      try {
        const tx = await solanaService.getParsedTransaction(sig.signature);
        const duration = Date.now() - requestStart;
        
        console.log(`  ✓ [${index + 1}/40] ${sig.signature.slice(0, 8)}... (${duration}ms)`);
        
        return { success: true, duration, signature: sig.signature };
      } catch (error: any) {
        const duration = Date.now() - requestStart;
        
        console.log(`  ✗ [${index + 1}/40] ${sig.signature.slice(0, 8)}... FAILED (${duration}ms)`);
        console.log(`    Error: ${error.message || error}`);
        
        return { success: false, duration, signature: sig.signature, error: error.message };
      }
    });

    const results = await Promise.all(promises);
    const totalDuration = Date.now() - startTime;

    // Analyze results
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const maxDuration = Math.max(...results.map(r => r.duration));
    const minDuration = Math.min(...results.map(r => r.duration));

    // Check for rate limit errors
    const rateLimitErrors = results.filter(
      r => !r.success && (r.error?.includes('429') || r.error?.includes('Too Many Requests'))
    );

    console.log('\n' + '='.repeat(80));
    console.log('📊 RESULTS');
    console.log('='.repeat(80) + '\n');
    
    console.log(`Total Time:       ${totalDuration}ms`);
    console.log(`Successful:       ${successful}/${results.length}`);
    console.log(`Failed:           ${failed}/${results.length}`);
    console.log(`Rate Limit (429): ${rateLimitErrors.length}/${results.length}`);
    console.log(`\nRequest Durations:`);
    console.log(`  - Average: ${Math.round(avgDuration)}ms`);
    console.log(`  - Min:     ${minDuration}ms`);
    console.log(`  - Max:     ${maxDuration}ms`);

    // Get final queue stats
    const stats = solanaService.getQueueStats();
    console.log(`\nFinal Queue Stats:`);
    console.log(`  - Queue Length:    ${stats.queueLength}`);
    console.log(`  - Active Requests: ${stats.activeRequests}`);
    console.log(`  - Max Concurrent:  ${stats.maxConcurrent}`);

    // Evaluate results
    console.log('\n' + '='.repeat(80));
    if (rateLimitErrors.length === 0) {
      console.log('✅ SUCCESS: No rate limit errors! Queue is working properly.');
    } else if (rateLimitErrors.length < 5) {
      console.log('⚠️  WARNING: Few rate limit errors. Consider reducing RPC_MAX_CONCURRENT.');
    } else {
      console.log('❌ FAILURE: Many rate limit errors. Reduce RPC_MAX_CONCURRENT or increase RPC_REQUEST_DELAY_MS.');
    }
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
  }
}

// Run the test
testRequestQueue()
  .then(() => {
    console.log('Test completed.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test error:', error);
    process.exit(1);
  });



