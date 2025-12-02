#!/usr/bin/env node
/**
 * Generate Merkle commitment for gift list
 * Plain JavaScript version for easy execution
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// Merkle Tree Utilities
// ============================================================================

function sha256(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hashGiftLeaf(gift, salt) {
  // Remove the hash field if present (it's added after Merkle tree creation)
  const { hash, ...giftWithoutHash } = gift;
  
  // Create canonical JSON (sorted keys)
  const canonicalGift = JSON.stringify(giftWithoutHash, Object.keys(giftWithoutHash).sort());
  const data = canonicalGift + salt;
  return sha256(data);
}

function hashPair(left, right) {
  return sha256(left + right);
}

function buildMerkleTree(leaves) {
  if (leaves.length === 0) {
    throw new Error('Cannot build Merkle tree from empty leaves');
  }

  const tree = [leaves];
  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const nextLevel = [];
    
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        nextLevel.push(hashPair(currentLevel[i], currentLevel[i + 1]));
      } else {
        // Odd number of nodes - duplicate the last one
        nextLevel.push(hashPair(currentLevel[i], currentLevel[i]));
      }
    }
    
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }

  return tree;
}

function getMerkleRoot(tree) {
  return tree[tree.length - 1][0];
}

function generateMerkleProof(tree, leafIndex) {
  const proof = [];
  let index = leafIndex;

  for (let level = 0; level < tree.length - 1; level++) {
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;

    if (siblingIndex < tree[level].length) {
      proof.push(tree[level][siblingIndex]);
    } else {
      proof.push(tree[level][index]);
    }

    index = Math.floor(index / 2);
  }

  return proof;
}

function verifyMerkleProof(leaf, proof, root, leafIndex) {
  let hash = leaf;
  let index = leafIndex;

  for (const sibling of proof) {
    const isRightNode = index % 2 === 1;
    
    if (isRightNode) {
      hash = hashPair(sibling, hash);
    } else {
      hash = hashPair(hash, sibling);
    }

    index = Math.floor(index / 2);
  }

  return hash === root;
}

function generateSalt() {
  return crypto.randomBytes(32).toString('hex');
}

function generateSaltsForAllGifts() {
  const salts = [];
  for (let i = 0; i < 24; i++) {
    salts.push(generateSalt());
  }
  return salts;
}

// ============================================================================
// Main Script
// ============================================================================

async function generateMerkleCommitment() {
  console.log('🎄 Generating Merkle commitment for Santa gifts...\n');

  // 1. Read gifts data
  const giftsPath = path.join(__dirname, 'data/gifts-full.json');
  const giftsData = JSON.parse(fs.readFileSync(giftsPath, 'utf8'));
  
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
  const leaves = [];
  for (let i = 0; i < sortedGifts.length; i++) {
    const leaf = hashGiftLeaf(sortedGifts[i], salts[i]);
    leaves.push(leaf);
  }

  const tree = buildMerkleTree(leaves);
  const root = getMerkleRoot(tree);

  console.log(`✓ Merkle root: ${root}`);
  console.log(`✓ Tree depth: ${tree.length} levels\n`);

  // 4. Create commitment file (PUBLIC - to be published before Dec 1)
  const timestamp = new Date().toISOString();
  const commitment = {
    season: '2025-season-1',
    root: root,
    num_days: 24,
    hash_algo: 'sha256',
    canonical: 'JSON.stringify with sorted keys, UTF-8 encoding',
    created_at_utc: timestamp,
    note: 'Daily reveal with Merkle proofs. Each day publishes gift + salt + proof.'
  };

  // Save commitment (backend)
  const backendCommitmentPath = path.join(__dirname, 'data/commitment.json');
  fs.writeFileSync(backendCommitmentPath, JSON.stringify(commitment, null, 2));
  console.log(`✓ Saved public commitment to: ${backendCommitmentPath}`);

  // For frontend, use simpler format
  const frontendCommitment = {
    hash: root,
    timestamp: timestamp,
    season: '2025-season-1'
  };
  const frontendCommitmentPath = path.join(__dirname, '../santa-web/lib/commitment-hash.json');
  fs.writeFileSync(frontendCommitmentPath, JSON.stringify(frontendCommitment, null, 2));
  console.log(`✓ Saved frontend commitment to: ${frontendCommitmentPath}\n`);

  // 5. Save private data (PRIVATE - keep secure until reveals)
  const privateData = {
    season: '2025-season-1',
    gifts: sortedGifts,
    salts: salts,
    leaves: leaves,
    root: root,
    created_at_utc: timestamp
  };

  const privatePath = path.join(__dirname, 'data/private-merkle-data.json');
  fs.writeFileSync(privatePath, JSON.stringify(privateData, null, 2));
  console.log(`✓ Saved private data to: ${privatePath}`);
  console.log('  ⚠️  KEEP THIS FILE SECURE - it contains all salts and gifts!\n');

  // 6. Generate all daily reveal files
  const revealsDir = path.join(__dirname, 'data/reveals');
  if (!fs.existsSync(revealsDir)) {
    fs.mkdirSync(revealsDir, { recursive: true });
  }

  console.log('✓ Generating daily reveal files...');
  for (let day = 1; day <= 24; day++) {
    const giftIndex = sortedGifts.findIndex(g => g.day === day);
    const gift = sortedGifts[giftIndex];
    const salt = salts[giftIndex];
    const leaf = leaves[giftIndex];
    const proof = generateMerkleProof(tree, giftIndex);

    const dayReveal = {
      day,
      gift,
      salt,
      leaf,
      proof,
      root
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
  console.log(`   Root: ${root}`);
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
  const day1Leaf = leaves[0];
  const day1Proof = generateMerkleProof(tree, 0);
  const isValid = verifyMerkleProof(day1Leaf, day1Proof, root, 0);
  console.log(`✓ Day 1 proof verification: ${isValid ? 'PASSED ✓' : 'FAILED ✗'}\n`);
}

// Run the script
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


