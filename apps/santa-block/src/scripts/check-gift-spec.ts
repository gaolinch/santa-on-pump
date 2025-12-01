#!/usr/bin/env tsx

import { giftSpecRepo } from '../database';
import { logger } from '../utils/logger';

async function checkGiftSpec() {
  console.log('Checking gift spec for Day 1...\n');

  const giftSpec = await giftSpecRepo.findByDay(1);

  if (!giftSpec) {
    console.log('❌ No gift spec found for Day 1');
    process.exit(1);
  }

  console.log('✅ Gift spec found for Day 1\n');
  console.log('Day:', giftSpec.day);
  console.log('Type:', giftSpec.type);
  console.log('Params type:', typeof giftSpec.params);
  console.log('Params:', JSON.stringify(giftSpec.params, null, 2));
  
  if (giftSpec.params.token_airdrop) {
    console.log('\n✅ token_airdrop exists');
    console.log('Enabled:', giftSpec.params.token_airdrop.enabled);
    console.log('Total amount:', giftSpec.params.token_airdrop.total_amount);
    console.log('Winners:', giftSpec.params.token_airdrop.winners);
  } else {
    console.log('\n❌ token_airdrop NOT found in params');
  }

  process.exit(0);
}

checkGiftSpec().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

