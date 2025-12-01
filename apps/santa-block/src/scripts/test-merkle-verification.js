#!/usr/bin/env node
/**
 * Test Merkle tree verification
 * This script verifies that all 24 day reveals are valid
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// Merkle Tree Utilities (same as generate-merkle.js)
// ============================================================================

function sha256(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function hashGiftLeaf(gift, salt) {
  // Remove the hash field if present (it's added after Merkle tree creation)
  const { hash, ...giftWithoutHash } = gift;
  
  const canonicalGift = JSON.stringify(giftWithoutHash, Object.keys(giftWithoutHash).sort());
  const data = canonicalGift + salt;
  return sha256(data);
}

function hashPair(left, right) {
  return sha256(left + right);
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

// ============================================================================
// Test Script
// ============================================================================

async function testMerkleVerification() {
  console.log('🧪 Testing Merkle Tree Verification\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Load commitment
  const commitmentPath = path.join(__dirname, '../../data/commitment.json');
  const commitment = JSON.parse(fs.readFileSync(commitmentPath, 'utf8'));
  
  console.log('📋 Commitment Details:');
  console.log(`   Season: ${commitment.season}`);
  console.log(`   Root: ${commitment.root}`);
  console.log(`   Created: ${commitment.created_at_utc}`);
  console.log(`   Days: ${commitment.num_days}\n`);

  // Test each day's reveal
  const revealsDir = path.join(__dirname, '../../data/reveals');
  let passCount = 0;
  let failCount = 0;
  const failures = [];

  for (let day = 1; day <= 24; day++) {
    const revealPath = path.join(revealsDir, `day-${String(day).padStart(2, '0')}.json`);
    
    if (!fs.existsSync(revealPath)) {
      console.log(`❌ Day ${day}: Reveal file not found`);
      failCount++;
      failures.push({ day, reason: 'File not found' });
      continue;
    }

    const reveal = JSON.parse(fs.readFileSync(revealPath, 'utf8'));

    // Verify 1: Root matches commitment
    const rootMatches = reveal.root === commitment.root;
    
    // Verify 2: Leaf hash matches gift + salt
    const computedLeaf = hashGiftLeaf(reveal.gift, reveal.salt);
    const leafMatches = computedLeaf === reveal.leaf;
    
    // Verify 3: Merkle proof is valid
    const leafIndex = day - 1; // 0-indexed
    const proofValid = verifyMerkleProof(reveal.leaf, reveal.proof, reveal.root, leafIndex);
    
    const allValid = rootMatches && leafMatches && proofValid;
    
    if (allValid) {
      console.log(`✅ Day ${String(day).padStart(2, ' ')}: PASS`);
      passCount++;
    } else {
      console.log(`❌ Day ${String(day).padStart(2, ' ')}: FAIL`);
      const reasons = [];
      if (!rootMatches) reasons.push('Root mismatch');
      if (!leafMatches) reasons.push('Leaf mismatch');
      if (!proofValid) reasons.push('Proof invalid');
      console.log(`   Reasons: ${reasons.join(', ')}`);
      failCount++;
      failures.push({ day, reasons });
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${passCount}/24`);
  console.log(`   ❌ Failed: ${failCount}/24`);
  
  if (failCount === 0) {
    console.log('\n🎉 All tests passed! The Merkle tree is valid.\n');
    console.log('✨ All 24 gifts can be verified against the commitment.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Details:\n');
    failures.forEach(({ day, reason, reasons }) => {
      console.log(`   Day ${day}: ${reason || reasons.join(', ')}`);
    });
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════\n');

  // Additional verification: Check proof structure
  console.log('🔍 Proof Structure Analysis:\n');
  const sampleReveal = JSON.parse(
    fs.readFileSync(path.join(revealsDir, 'day-01.json'), 'utf8')
  );
  console.log(`   Proof length: ${sampleReveal.proof.length} siblings`);
  console.log(`   Expected depth: ~5 (for 24 leaves)`);
  console.log(`   Leaf hash length: ${sampleReveal.leaf.length} chars`);
  console.log(`   Salt length: ${sampleReveal.salt.length} chars\n`);

  return failCount === 0;
}

// Run the test
testMerkleVerification()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Test error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

