#!/usr/bin/env ts-node
/**
 * Generate Merkle commitment for gift list
 * 
 * This script:
 * 1. Reads the gifts from gifts-full.json
 * 2. Generates individual salts for each gift
 * 3. Creates a Merkle tree
 * 4. Outputs the commitment (root hash)
 * 5. Saves private data (gifts + salts + tree) for later reveals
 */

import fs from 'fs';
import path from 'path';
import {
  createMerkleTreeFromGifts,
  generateSaltsForAllGifts,
  generateProofForDay,
  MerkleTreeResult
} from '../utils/merkle';

interface Gift {
  day: number;
  type: string;
  params: Record<string, any>;
  distribution_source: string;
  notes: string;
}

interface GiftsData {
  gifts: Gift[];
}

interface CommitmentOutput {
  season: string;
  root: string;
  num_days: number;
  hash_algo: string;
  canonical: string;
  created_at_utc: string;
  note: string;
}

interface PrivateData {
  season: string;
  gifts: Gift[];
  salts: string[];
  leaves: string[];
  root: string;
  created_at_utc: string;
}

interface DayReveal {
  day: number;
  gift: Gift;
  salt: string;
  leaf: string;
  proof: string[];
  root: string;
}

async function generateMerkleCommitment() {
  console.log('🎄 Generating Merkle commitment for Santa gifts...\n');

  // 1. Read gifts data
  const giftsPath = path.join(__dirname, '../../data/gifts-full.json');
  const giftsData: GiftsData = JSON.parse(fs.readFileSync(giftsPath, 'utf8'));
  
  console.log(`✓ Loaded ${giftsData.gifts.length} gifts`);

  if (giftsData.gifts.length !== 24) {
    throw new Error(`Expected 24 gifts, got ${giftsData.gifts.length}`);
  }

  // Sort gifts by day to ensure correct order
  const sortedGifts = giftsData.gifts.sort((a, b) => a.day - b.day);

  // 2. Generate individual salts for each gift
  console.log('✓ Generating cryptographically secure salts for each gift...');
  const salts = generateSaltsForAllGifts();

  // 3. Create Merkle tree
  console.log('✓ Building Merkle tree...');
  const merkleTree: MerkleTreeResult = createMerkleTreeFromGifts(sortedGifts, salts);

  console.log(`✓ Merkle root: ${merkleTree.root}`);
  console.log(`✓ Tree depth: ${merkleTree.tree.length} levels\n`);

  // 4. Create commitment file (PUBLIC - to be published before Dec 1)
  const timestamp = new Date().toISOString();
  const commitment: CommitmentOutput = {
    season: '2025-season-1',
    root: merkleTree.root,
    num_days: 24,
    hash_algo: 'sha256',
    canonical: 'JSON.stringify with sorted keys, UTF-8 encoding',
    created_at_utc: timestamp,
    note: 'Daily reveal with Merkle proofs. Each day publishes gift + salt + proof.'
  };

  // Save commitment (this goes to both backend and frontend)
  const backendCommitmentPath = path.join(__dirname, '../../data/commitment.json');
  const frontendCommitmentPath = path.join(__dirname, '../../../santa-web/lib/commitment-hash.json');

  fs.writeFileSync(backendCommitmentPath, JSON.stringify(commitment, null, 2));
  console.log(`✓ Saved public commitment to: ${backendCommitmentPath}`);

  // For frontend, use simpler format
  const frontendCommitment = {
    hash: merkleTree.root,
    timestamp: timestamp,
    season: '2025-season-1'
  };
  fs.writeFileSync(frontendCommitmentPath, JSON.stringify(frontendCommitment, null, 2));
  console.log(`✓ Saved frontend commitment to: ${frontendCommitmentPath}\n`);

  // 5. Save private data (PRIVATE - keep secure until reveals)
  const privateData: PrivateData = {
    season: '2025-season-1',
    gifts: sortedGifts,
    salts: salts,
    leaves: merkleTree.leaves,
    root: merkleTree.root,
    created_at_utc: timestamp
  };

  const privatePath = path.join(__dirname, '../../data/private-merkle-data.json');
  fs.writeFileSync(privatePath, JSON.stringify(privateData, null, 2));
  console.log(`✓ Saved private data to: ${privatePath}`);
  console.log('  ⚠️  KEEP THIS FILE SECURE - it contains all salts and gifts!\n');

  // 6. Generate all daily reveal files (pre-generated but not published yet)
  const revealsDir = path.join(__dirname, '../../data/reveals');
  if (!fs.existsSync(revealsDir)) {
    fs.mkdirSync(revealsDir, { recursive: true });
  }

  console.log('✓ Generating daily reveal files...');
  for (let day = 1; day <= 24; day++) {
    const proof = generateProofForDay(merkleTree, day);
    if (!proof) {
      throw new Error(`Failed to generate proof for day ${day}`);
    }

    const giftIndex = sortedGifts.findIndex(g => g.day === day);
    const gift = sortedGifts[giftIndex];
    const salt = salts[giftIndex];

    const dayReveal: DayReveal = {
      day,
      gift,
      salt,
      leaf: proof.leaf,
      proof: proof.proof,
      root: merkleTree.root
    };

    const revealPath = path.join(revealsDir, `day-${String(day).padStart(2, '0')}.json`);
    fs.writeFileSync(revealPath, JSON.stringify(dayReveal, null, 2));
  }
  console.log(`✓ Generated 24 daily reveal files in: ${revealsDir}\n`);

  // 7. Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎅 MERKLE COMMITMENT GENERATED SUCCESSFULLY!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('\n📋 NEXT STEPS:\n');
  console.log('1. PUBLISH the commitment (Merkle root) BEFORE December 1st:');
  console.log(`   Root: ${merkleTree.root}`);
  console.log('   - Post on website');
  console.log('   - Post on social media (X/Twitter)');
  console.log('   - Optionally: Pin to IPFS\n');
  console.log('2. SECURE the private data:');
  console.log(`   - Backup: ${privatePath}`);
  console.log('   - Keep offline/encrypted until reveals\n');
  console.log('3. DAILY REVEALS (Dec 1-24):');
  console.log(`   - Publish files from: ${revealsDir}`);
  console.log('   - Each day, publish the corresponding day-XX.json file');
  console.log('   - Users can verify the Merkle proof against the published root\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Verify a sample proof to ensure everything works
  console.log('🔍 Verifying sample proof (Day 1)...');
  const { verifyMerkleProof } = require('../utils/merkle');
  const day1Proof = generateProofForDay(merkleTree, 1);
  if (day1Proof) {
    const isValid = verifyMerkleProof(
      day1Proof.leaf,
      day1Proof.proof,
      day1Proof.root,
      day1Proof.index
    );
    console.log(`✓ Day 1 proof verification: ${isValid ? 'PASSED ✓' : 'FAILED ✗'}\n`);
  }
}

// Run the script
if (require.main === module) {
  generateMerkleCommitment()
    .then(() => {
      console.log('✨ Done!\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

export { generateMerkleCommitment };


