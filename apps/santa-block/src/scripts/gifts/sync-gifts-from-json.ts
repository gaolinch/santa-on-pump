#!/usr/bin/env tsx

import { db, giftSpecRepo } from '../../database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Sync gift_spec table with gifts-full.json
 * Preserves existing merkle data (salt, leaf, proof) while updating other fields
 */
async function syncGiftsFromJson() {
  console.log('🔄 Syncing database with gifts-full.json...\n');

  try {
    // 1. Load gifts from JSON file
    const giftsPath = path.join(__dirname, '../../data/gifts-full.json');
    
    if (!fs.existsSync(giftsPath)) {
      console.error('❌ gifts-full.json not found at:', giftsPath);
      process.exit(1);
    }

    const giftsData = JSON.parse(fs.readFileSync(giftsPath, 'utf8'));
    const jsonGifts = giftsData.gifts.sort((a: any, b: any) => a.day - b.day);
    console.log(`📦 Loaded ${jsonGifts.length} gifts from JSON\n`);

    // 2. Load existing gifts from database to preserve merkle data
    const dbGifts = await giftSpecRepo.findAll();
    const dbGiftsMap = new Map(dbGifts.map(g => [g.day, g]));
    console.log(`📦 Loaded ${dbGifts.length} gifts from database\n`);

    // 3. Update each gift
    let updated = 0;
    let created = 0;
    let errors = 0;

    console.log('═'.repeat(80));
    console.log('SYNCING GIFTS');
    console.log('═'.repeat(80));
    console.log();

    for (const jsonGift of jsonGifts) {
      const day = jsonGift.day;
      const existingGift = dbGiftsMap.get(day);

      try {
        // Preserve merkle data if it exists
        const salt = existingGift?.salt;
        const leaf = existingGift?.leaf;
        const proof = existingGift?.proof;

        if (existingGift) {
          // Update existing record
          await db.query(
            `UPDATE gift_spec 
             SET type = $1,
                 hint = $2,
                 sub_hint = $3,
                 params = $4,
                 distribution_source = $5,
                 notes = $6,
                 hash = $7
             WHERE day = $8`,
            [
              jsonGift.type,
              jsonGift.hint || null,
              jsonGift.sub_hint || null,
              JSON.stringify(jsonGift.params),
              jsonGift.distribution_source || 'treasury_daily_fees',
              jsonGift.notes || null,
              jsonGift.hash || '',
              day
            ]
          );

          // Check if anything actually changed
          const needsUpdate = 
            existingGift.type !== jsonGift.type ||
            existingGift.hint !== (jsonGift.hint || null) ||
            existingGift.sub_hint !== (jsonGift.sub_hint || null) ||
            JSON.stringify(existingGift.params) !== JSON.stringify(jsonGift.params) ||
            existingGift.distribution_source !== (jsonGift.distribution_source || 'treasury_daily_fees') ||
            existingGift.notes !== (jsonGift.notes || null);

          if (needsUpdate) {
            console.log(`✅ Day ${day.toString().padStart(2, '0')}: Updated (preserved merkle data)`);
            updated++;
          } else {
            console.log(`⏭️  Day ${day.toString().padStart(2, '0')}: Already in sync`);
          }
        } else {
          // Create new record (shouldn't happen if DB is properly seeded)
          await giftSpecRepo.insert({
            day: jsonGift.day,
            type: jsonGift.type,
            hint: jsonGift.hint,
            sub_hint: jsonGift.sub_hint,
            params: jsonGift.params,
            distribution_source: jsonGift.distribution_source || 'treasury_daily_fees',
            notes: jsonGift.notes,
            hash: jsonGift.hash || '',
            salt: salt,
            leaf: leaf,
            proof: proof,
          });
          console.log(`➕ Day ${day.toString().padStart(2, '0')}: Created (no merkle data)`);
          created++;
        }
      } catch (error: any) {
        console.error(`❌ Day ${day.toString().padStart(2, '0')}: Error - ${error.message}`);
        errors++;
      }
    }

    // 4. Summary
    console.log();
    console.log('═'.repeat(80));
    console.log('SYNC SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total gifts in JSON: ${jsonGifts.length}`);
    console.log(`Updated: ${updated}`);
    console.log(`Created: ${created}`);
    console.log(`Errors: ${errors}`);
    console.log();

    // 5. Verify merkle data is still intact
    console.log('🔍 Verifying merkle data preservation...');
    const verifyGifts = await giftSpecRepo.findAll();
    let withLeaf = 0;
    let withSalt = 0;
    let withProof = 0;

    for (const gift of verifyGifts) {
      if (gift.leaf) withLeaf++;
      if (gift.salt) withSalt++;
      if (gift.proof && Array.isArray(gift.proof) && gift.proof.length > 0) {
        withProof++;
      } else if (gift.proof && typeof gift.proof === 'string') {
        try {
          const parsed = JSON.parse(gift.proof);
          if (Array.isArray(parsed) && parsed.length > 0) withProof++;
        } catch (e) {
          // Ignore
        }
      }
    }

    console.log(`Gifts with leaf hash: ${withLeaf}/24`);
    console.log(`Gifts with salt: ${withSalt}/24`);
    console.log(`Gifts with proof: ${withProof}/24`);
    console.log();

    if (withLeaf === 24 && withSalt === 24 && withProof === 24) {
      console.log('✅ All merkle data preserved!');
    } else {
      console.warn('⚠️  Some merkle data may be missing. Run: npm run populate:merkle');
    }

    console.log();
    console.log('✅ Sync completed!');
    process.exit(errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n❌ Error syncing gifts:', error);
    process.exit(1);
  }
}

syncGiftsFromJson();

