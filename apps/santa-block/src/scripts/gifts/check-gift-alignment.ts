#!/usr/bin/env tsx

import { db, giftSpecRepo } from '../../database';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Check if gifts in database are aligned with gifts in Merkle tree
 */
async function checkGiftAlignment() {
  console.log('🔍 Checking gift alignment between database and Merkle tree...\n');

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

    // 2. Load gifts from database
    const dbGifts = await giftSpecRepo.findAll();
    console.log(`📦 Loaded ${dbGifts.length} gifts from database\n`);

    // 3. Load private merkle data
    const privateMerklePath = path.join(__dirname, '../../data/private-merkle-data.json');
    let privateMerkleData: any = null;
    
    if (fs.existsSync(privateMerklePath)) {
      privateMerkleData = JSON.parse(fs.readFileSync(privateMerklePath, 'utf8'));
      console.log(`📦 Loaded private merkle data (root: ${privateMerkleData.root?.substring(0, 16)}...)\n`);
    } else {
      console.warn('⚠️  private-merkle-data.json not found\n');
    }

    // 4. Compare each gift
    console.log('═'.repeat(80));
    console.log('COMPARISON RESULTS');
    console.log('═'.repeat(80));
    console.log();

    let allAligned = true;
    let missingInDb = 0;
    let missingInJson = 0;
    let mismatches = 0;

    // Check all days 1-24
    for (let day = 1; day <= 24; day++) {
      const jsonGift = jsonGifts.find((g: any) => g.day === day);
      const dbGift = dbGifts.find((g: any) => g.day === day);

      console.log(`Day ${day.toString().padStart(2, '0')}:`);

      if (!jsonGift && !dbGift) {
        console.log('  ⚠️  Missing in both JSON and database');
        continue;
      }

      if (!jsonGift) {
        console.log('  ❌ Missing in JSON file');
        missingInJson++;
        allAligned = false;
        continue;
      }

      if (!dbGift) {
        console.log('  ❌ Missing in database');
        missingInDb++;
        allAligned = false;
        continue;
      }

      // Compare fields
      const issues: string[] = [];

      if (jsonGift.type !== dbGift.type) {
        issues.push(`type: JSON="${jsonGift.type}" vs DB="${dbGift.type}"`);
      }

      // Compare params with sorted keys for accurate comparison
      const jsonParamsStr = JSON.stringify(jsonGift.params, Object.keys(jsonGift.params).sort());
      const dbParamsStr = JSON.stringify(dbGift.params, Object.keys(dbGift.params || {}).sort());
      
      if (jsonParamsStr !== dbParamsStr) {
        // Try to find specific differences
        const jsonParams = jsonGift.params || {};
        const dbParams = dbGift.params || {};
        
        const paramIssues: string[] = [];
        const allKeys = new Set([...Object.keys(jsonParams), ...Object.keys(dbParams)]);
        
        for (const key of allKeys) {
          const jsonVal = jsonParams[key];
          const dbVal = dbParams[key];
          
          if (JSON.stringify(jsonVal) !== JSON.stringify(dbVal)) {
            paramIssues.push(`${key}: JSON=${JSON.stringify(jsonVal)} vs DB=${JSON.stringify(dbVal)}`);
          }
        }
        
        if (paramIssues.length > 0) {
          issues.push(`params: ${paramIssues.join(', ')}`);
        } else {
          issues.push(`params: structural mismatch`);
        }
      }

      if (jsonGift.distribution_source !== dbGift.distribution_source) {
        issues.push(`distribution_source: JSON="${jsonGift.distribution_source}" vs DB="${dbGift.distribution_source}"`);
      }

      if (jsonGift.hint !== dbGift.hint) {
        issues.push(`hint: JSON="${jsonGift.hint}" vs DB="${dbGift.hint || 'null'}"`);
      }

      if (jsonGift.sub_hint !== dbGift.sub_hint) {
        issues.push(`sub_hint: JSON="${jsonGift.sub_hint}" vs DB="${dbGift.sub_hint || 'null'}"`);
      }

      if (jsonGift.notes !== dbGift.notes) {
        issues.push(`notes: mismatch`);
      }

      // Check merkle data
      let merkleLeaf: string | undefined;
      let merkleSalt: string | undefined;

      if (privateMerkleData) {
        if (privateMerkleData.gifts && privateMerkleData.salts && privateMerkleData.leaves) {
          const giftIndex = privateMerkleData.gifts.findIndex((g: any) => g.day === day);
          if (giftIndex !== -1) {
            merkleSalt = privateMerkleData.salts[giftIndex];
            merkleLeaf = privateMerkleData.leaves[giftIndex];
          }
        }
      }

      if (merkleLeaf && !dbGift.leaf) {
        issues.push(`leaf: missing in DB (exists in merkle tree)`);
      } else if (merkleLeaf && dbGift.leaf && merkleLeaf !== dbGift.leaf) {
        issues.push(`leaf: mismatch with merkle tree`);
      } else if (!merkleLeaf && dbGift.leaf) {
        issues.push(`leaf: exists in DB but not in merkle tree`);
      }

      if (merkleSalt && !dbGift.salt) {
        issues.push(`salt: missing in DB (exists in merkle tree)`);
      } else       if (merkleSalt && dbGift.salt && merkleSalt !== dbGift.salt) {
        issues.push(`salt: mismatch with merkle tree`);
      }

      // Check proof
      let proofArray: string[] | null = null;
      if (dbGift.proof) {
        try {
          proofArray = typeof dbGift.proof === 'string' ? JSON.parse(dbGift.proof) : dbGift.proof;
        } catch (e) {
          // Ignore parse errors
        }
      }

      if (!proofArray || proofArray.length === 0) {
        // Try to get proof from reveal file
        const revealsDir = path.join(__dirname, '../../data/reveals');
        const revealPath = path.join(revealsDir, `day-${String(day).padStart(2, '0')}.json`);
        if (fs.existsSync(revealPath)) {
          const revealData = JSON.parse(fs.readFileSync(revealPath, 'utf8'));
          if (revealData.proof && !proofArray) {
            issues.push(`proof: missing in DB (exists in reveal file)`);
          }
        }
      }

      if (issues.length > 0) {
        console.log(`  ❌ MISMATCH:`);
        issues.forEach(issue => console.log(`     - ${issue}`));
        mismatches++;
        allAligned = false;
      } else {
        const merkleStatus = dbGift.leaf ? '✓ merkle' : '✗ no merkle';
        console.log(`  ✅ Aligned (${merkleStatus})`);
      }
    }

    // 5. Summary
    console.log();
    console.log('═'.repeat(80));
    console.log('SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total gifts in JSON: ${jsonGifts.length}`);
    console.log(`Total gifts in DB: ${dbGifts.length}`);
    console.log(`Missing in DB: ${missingInDb}`);
    console.log(`Missing in JSON: ${missingInJson}`);
    console.log(`Mismatches: ${mismatches}`);
    console.log();

    if (allAligned && missingInDb === 0 && missingInJson === 0 && mismatches === 0) {
      console.log('✅ All gifts are aligned!');
    } else {
      console.log('❌ Gifts are not fully aligned. See details above.');
    }

    // 6. Show merkle data status
    if (privateMerkleData) {
      console.log();
      console.log('═'.repeat(80));
      console.log('MERKLE DATA STATUS');
      console.log('═'.repeat(80));
      
      let withLeaf = 0;
      let withSalt = 0;
      let withProof = 0;
      
      for (const dbGift of dbGifts) {
        if (dbGift.leaf) withLeaf++;
        if (dbGift.salt) withSalt++;
        if (dbGift.proof && Array.isArray(dbGift.proof) && dbGift.proof.length > 0) withProof++;
      }
      
      console.log(`Gifts with leaf hash: ${withLeaf}/24`);
      console.log(`Gifts with salt: ${withSalt}/24`);
      console.log(`Gifts with proof: ${withProof}/24`);
      console.log();
      
      if (withLeaf < 24 || withSalt < 24) {
        console.log('⚠️  Some merkle data is missing. Run: npm run populate:merkle');
      }
    }

    process.exit(allAligned && missingInDb === 0 && missingInJson === 0 && mismatches === 0 ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Error checking alignment:', error);
    process.exit(1);
  }
}

checkGiftAlignment();

