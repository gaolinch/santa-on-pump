#!/usr/bin/env tsx

import { db, giftSpecRepo } from '../../database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Populate merkle data (salt, leaf, proof) into gift_spec table
 * Reads from private-merkle-data.json and updates the database
 */
async function populateMerkleData() {
  console.log('🔄 Populating Merkle data into database...\n');

  try {
    // 1. Load private merkle data
    const privateMerklePath = path.join(__dirname, '../../data/private-merkle-data.json');
    
    if (!fs.existsSync(privateMerklePath)) {
      console.error('❌ private-merkle-data.json not found at:', privateMerklePath);
      console.log('💡 Run generate-merkle-commitment.ts first to create this file');
      process.exit(1);
    }

    const privateMerkleData = JSON.parse(fs.readFileSync(privateMerklePath, 'utf8'));
    console.log(`📦 Loaded private merkle data (root: ${privateMerkleData.root.substring(0, 16)}...)\n`);

    // 2. Check if reveal files exist (they contain proof data)
    const revealsDir = path.join(__dirname, '../../data/reveals');
    const revealsExist = fs.existsSync(revealsDir);
    
    if (!revealsExist) {
      console.warn('⚠️  Reveal files not found. Only salt and leaf will be populated.');
      console.log('💡 Run generate-merkle-commitment.ts to create reveal files with proofs\n');
    }

    // 3. Update each gift spec with merkle data
    let updatedCount = 0;
    
    for (let day = 1; day <= 24; day++) {
      // Get gift from database
      const giftSpec = await giftSpecRepo.findByDay(day);
      
      if (!giftSpec) {
        console.warn(`⚠️  Day ${day}: Gift spec not found in database, skipping`);
        continue;
      }

      // Find merkle data for this day
      let salt: string | undefined;
      let leaf: string | undefined;
      let proof: string[] | undefined;

      // Try to load from reveal file first (has proof)
      if (revealsExist) {
        const revealPath = path.join(revealsDir, `day-${String(day).padStart(2, '0')}.json`);
        if (fs.existsSync(revealPath)) {
          const revealData = JSON.parse(fs.readFileSync(revealPath, 'utf8'));
          salt = revealData.salt;
          leaf = revealData.leaf;
          proof = revealData.proof;
        }
      }

      // Fallback to private-merkle-data.json (no proof)
      if (!salt || !leaf) {
        if (privateMerkleData.gifts && privateMerkleData.salts && privateMerkleData.leaves) {
          const giftIndex = privateMerkleData.gifts.findIndex((g: any) => g.day === day);
          if (giftIndex !== -1) {
            salt = privateMerkleData.salts[giftIndex];
            leaf = privateMerkleData.leaves[giftIndex];
          }
        }
      }

      if (!salt || !leaf) {
        console.warn(`⚠️  Day ${day}: Merkle data not found, skipping`);
        continue;
      }

      // Update database
      await db.query(
        `UPDATE gift_spec 
         SET salt = $1, leaf = $2, proof = $3
         WHERE day = $4`,
        [salt, leaf, proof ? JSON.stringify(proof) : null, day]
      );

      console.log(`✅ Day ${day}: Updated merkle data (leaf: ${leaf.substring(0, 16)}...)`);
      updatedCount++;
    }

    console.log(`\n✅ Successfully populated merkle data for ${updatedCount} gifts!`);
    console.log(`📊 Root hash: ${privateMerkleData.root}`);
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error populating merkle data:', error);
    process.exit(1);
  }
}

populateMerkleData();

