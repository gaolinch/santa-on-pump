import crypto from 'crypto';

/**
 * Merkle Tree implementation for commit-reveal scheme
 */

export interface MerkleProof {
  leaf: string;
  proof: string[];
  root: string;
  index: number;
}

/**
 * SHA256 hash function
 */
function sha256(data: string): string {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Hash a gift with its salt to create a leaf
 */
export function hashGiftLeaf(gift: any, salt: string): string {
  // Remove the hash field if present (it's added after Merkle tree creation)
  const { hash, ...giftWithoutHash } = gift;
  
  // Create canonical JSON (sorted keys, no extra whitespace)
  const canonicalGift = JSON.stringify(giftWithoutHash, Object.keys(giftWithoutHash).sort());
  const data = canonicalGift + salt;
  return sha256(data);
}

/**
 * Hash two nodes together (parent hash)
 */
function hashPair(left: string, right: string): string {
  return sha256(left + right);
}

/**
 * Build a Merkle tree from leaf hashes
 * Returns the tree as an array of levels, where tree[0] is the leaves
 */
function buildMerkleTree(leaves: string[]): string[][] {
  if (leaves.length === 0) {
    throw new Error('Cannot build Merkle tree from empty leaves');
  }

  const tree: string[][] = [leaves];
  let currentLevel = leaves;

  // Build tree bottom-up
  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    
    for (let i = 0; i < currentLevel.length; i += 2) {
      if (i + 1 < currentLevel.length) {
        // Hash pair of nodes
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

/**
 * Get the Merkle root from a tree
 */
function getMerkleRoot(tree: string[][]): string {
  return tree[tree.length - 1][0];
}

/**
 * Generate a Merkle proof for a specific leaf index
 */
function generateMerkleProof(tree: string[][], leafIndex: number): string[] {
  const proof: string[] = [];
  let index = leafIndex;

  // Traverse up the tree, collecting sibling hashes
  for (let level = 0; level < tree.length - 1; level++) {
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;

    if (siblingIndex < tree[level].length) {
      proof.push(tree[level][siblingIndex]);
    } else {
      // No sibling (odd number of nodes) - use the node itself
      proof.push(tree[level][index]);
    }

    index = Math.floor(index / 2);
  }

  return proof;
}

/**
 * Verify a Merkle proof
 */
export function verifyMerkleProof(
  leaf: string,
  proof: string[],
  root: string,
  leafIndex: number
): boolean {
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

/**
 * Create a complete Merkle tree from gifts with individual salts
 */
export interface GiftWithSalt {
  gift: any;
  salt: string;
  day: number;
}

export interface MerkleTreeResult {
  root: string;
  leaves: string[];
  tree: string[][];
  giftsWithSalts: GiftWithSalt[];
}

export function createMerkleTreeFromGifts(gifts: any[], individualSalts: string[]): MerkleTreeResult {
  if (gifts.length !== individualSalts.length) {
    throw new Error('Number of gifts must match number of salts');
  }

  if (gifts.length !== 24) {
    throw new Error('Must have exactly 24 gifts');
  }

  // Create leaves from gifts
  const leaves: string[] = [];
  const giftsWithSalts: GiftWithSalt[] = [];

  for (let i = 0; i < gifts.length; i++) {
    const gift = gifts[i];
    const salt = individualSalts[i];
    const leaf = hashGiftLeaf(gift, salt);
    
    leaves.push(leaf);
    giftsWithSalts.push({
      gift,
      salt,
      day: gift.day
    });
  }

  // Build tree
  const tree = buildMerkleTree(leaves);
  const root = getMerkleRoot(tree);

  return {
    root,
    leaves,
    tree,
    giftsWithSalts
  };
}

/**
 * Generate proof for a specific day
 */
export function generateProofForDay(
  merkleTree: MerkleTreeResult,
  day: number
): MerkleProof | null {
  // Find the gift for this day
  const giftIndex = merkleTree.giftsWithSalts.findIndex(g => g.day === day);
  
  if (giftIndex === -1) {
    return null;
  }

  const leaf = merkleTree.leaves[giftIndex];
  const proof = generateMerkleProof(merkleTree.tree, giftIndex);

  return {
    leaf,
    proof,
    root: merkleTree.root,
    index: giftIndex
  };
}

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate 24 unique salts for all gifts
 */
export function generateSaltsForAllGifts(): string[] {
  const salts: string[] = [];
  for (let i = 0; i < 24; i++) {
    salts.push(generateSalt());
  }
  return salts;
}

