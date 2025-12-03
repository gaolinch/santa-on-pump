#!/usr/bin/env tsx

import { db, giftSpecRepo } from '../../database';
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

    // 4. Load merkle data if available
    const privateMerklePath = path.join(__dirname, '../../data/private-merkle-data.json');
    let privateMerkleData: any = null;
    
    if (fs.existsSync(privateMerklePath)) {
      privateMerkleData = JSON.parse(fs.readFileSync(privateMerklePath, 'utf8'));
      console.log('📦 Loaded private merkle data\n');
    } else {
      console.warn('⚠️  private-merkle-data.json not found, merkle fields will be empty\n');
    }

    // 5. Check for reveal files (contain proofs)
    const revealsDir = path.join(__dirname, '../../data/reveals');
    const revealsExist = fs.existsSync(revealsDir);

    // 6. Insert all gift specs with merkle data
    for (const gift of giftsData.gifts) {
      let salt: string | undefined;
      let leaf: string | undefined;
      let proof: string[] | undefined;

      // Try to load from reveal file first (has proof)
      if (revealsExist) {
        const revealPath = path.join(revealsDir, `day-${String(gift.day).padStart(2, '0')}.json`);
        if (fs.existsSync(revealPath)) {
          const revealData = JSON.parse(fs.readFileSync(revealPath, 'utf8'));
          salt = revealData.salt;
          leaf = revealData.leaf;
          proof = revealData.proof;
        }
      }

      // Fallback to private-merkle-data.json
      if (privateMerkleData && (!salt || !leaf)) {
        if (privateMerkleData.gifts && privateMerkleData.salts && privateMerkleData.leaves) {
          const giftIndex = privateMerkleData.gifts.findIndex((g: any) => g.day === gift.day);
          if (giftIndex !== -1) {
            salt = privateMerkleData.salts[giftIndex];
            leaf = privateMerkleData.leaves[giftIndex];
          }
        }
      }

      await giftSpecRepo.insert({
        day: gift.day,
        type: gift.type,
        hint: gift.hint,
        sub_hint: gift.sub_hint,
        params: gift.params,
        distribution_source: gift.distribution_source,
        notes: gift.notes,
        hash: gift.hash || '',
        salt: salt,
        leaf: leaf,
        proof: proof,
      });
      
      const merkleStatus = leaf ? `✓ merkle` : '✗ no merkle';
      console.log(`✅ Day ${gift.day}: ${gift.type} (${merkleStatus})`);
    }

    console.log(`\n✅ Successfully seeded ${giftsData.gifts.length} gift specs!`);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error reseeding gifts:', error);
    process.exit(1);
  }
}

reseedGifts();

