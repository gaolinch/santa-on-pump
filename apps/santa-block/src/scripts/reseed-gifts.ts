#!/usr/bin/env tsx

import { db, giftSpecRepo } from '../database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function reseedGifts() {
  console.log('🔄 Reseeding gift specifications...\n');

  try {
    // 1. Delete gift executions first (foreign key constraint)
    console.log('Deleting existing gift executions...');
    await db.query('DELETE FROM gift_exec');
    console.log('✅ Deleted all gift executions');

    // 2. Delete all existing gift specs
    console.log('Deleting existing gift specs...');
    await db.query('DELETE FROM gift_spec');
    console.log('✅ Deleted all gift specs\n');

    // 3. Load gifts from JSON
    const giftsPath = path.join(__dirname, '../../data/gifts-full.json');
    
    if (!fs.existsSync(giftsPath)) {
      console.error('❌ gifts-full.json not found at:', giftsPath);
      process.exit(1);
    }

    const giftsData = JSON.parse(fs.readFileSync(giftsPath, 'utf8'));
    console.log(`📦 Loaded ${giftsData.gifts.length} gifts from JSON\n`);

    // 4. Insert all gift specs
    for (const gift of giftsData.gifts) {
      await giftSpecRepo.insert({
        day: gift.day,
        type: gift.type,
        hint: gift.hint,
        sub_hint: gift.sub_hint,
        params: gift.params,
        distribution_source: gift.distribution_source,
        notes: gift.notes,
        hash: gift.hash || '',
      });
      console.log(`✅ Day ${gift.day}: ${gift.type} (hint: ${gift.hint || 'none'})`);
    }

    console.log(`\n✅ Successfully seeded ${giftsData.gifts.length} gift specs!`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error reseeding gifts:', error);
    process.exit(1);
  }
}

reseedGifts();

