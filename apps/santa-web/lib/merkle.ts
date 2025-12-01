/**
 * Merkle Tree utilities for web (browser-compatible)
 * Used for verifying daily gift reveals
 */

/**
 * SHA256 hash function using Web Crypto API
 */
async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a gift with its salt to create a leaf
 */
export async function hashGiftLeaf(gift: any, salt: string): Promise<string> {
  if (!gift) {
    throw new Error('Gift cannot be null or undefined');
  }
  
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
async function hashPair(left: string, right: string): Promise<string> {
  return sha256(left + right);
}

/**
 * Verify a Merkle proof
 * @param leaf - The leaf hash to verify
 * @param proof - Array of sibling hashes from leaf to root
 * @param root - The expected Merkle root
 * @param leafIndex - The index of the leaf in the tree (0-based)
 * @returns true if the proof is valid
 */
export async function verifyMerkleProof(
  leaf: string,
  proof: string[],
  root: string,
  leafIndex: number
): Promise<boolean> {
  let hash = leaf;
  let index = leafIndex;

  for (const sibling of proof) {
    const isRightNode = index % 2 === 1;
    
    if (isRightNode) {
      hash = await hashPair(sibling, hash);
    } else {
      hash = await hashPair(hash, sibling);
    }

    index = Math.floor(index / 2);
  }

  return hash === root;
}

/**
 * Verify a complete day reveal against the commitment
 * @param dayReveal - The daily reveal data
 * @param expectedRoot - The published Merkle root commitment
 * @returns Object with verification result and details
 */
export async function verifyDayReveal(
  dayReveal: DayReveal,
  expectedRoot: string
): Promise<{
  valid: boolean;
  leafMatches: boolean;
  proofValid: boolean;
  rootMatches: boolean;
  details: string;
}> {
  // Check if all required fields are present
  if (!dayReveal.gift || !dayReveal.salt || !dayReveal.leaf || !dayReveal.proof || !dayReveal.root) {
    return {
      valid: false,
      leafMatches: false,
      proofValid: false,
      rootMatches: false,
      details: 'Incomplete reveal data - verification not possible'
    };
  }

  // 1. Check if the provided root matches the expected commitment
  const rootMatches = dayReveal.root === expectedRoot;
  
  // 2. Recompute the leaf hash from gift + salt
  const computedLeaf = await hashGiftLeaf(dayReveal.gift, dayReveal.salt);
  const leafMatches = computedLeaf === dayReveal.leaf;
  
  // 3. Verify the Merkle proof
  // The leaf index is (day - 1) since days are 1-indexed but tree is 0-indexed
  const leafIndex = dayReveal.day - 1;
  const proofValid = await verifyMerkleProof(
    dayReveal.leaf,
    dayReveal.proof,
    dayReveal.root,
    leafIndex
  );
  
  const valid = rootMatches && leafMatches && proofValid;
  
  let details = '';
  if (!valid) {
    if (!rootMatches) details += 'Root does not match commitment. ';
    if (!leafMatches) details += 'Leaf hash does not match gift+salt. ';
    if (!proofValid) details += 'Merkle proof is invalid. ';
  } else {
    details = 'All checks passed! This gift was committed before December 1st.';
  }
  
  return {
    valid,
    leafMatches,
    proofValid,
    rootMatches,
    details
  };
}

export interface DayReveal {
  day: number;
  hint?: string;
  sub_hint?: string;
  hint_only?: boolean;
  gift?: any;
  salt?: string;
  leaf?: string;
  proof?: string[];
  root?: string;
}

/**
 * Load a day's reveal data
 * In production, this would fetch from an API or public storage
 * For now, it loads from the local reveals directory
 */
export async function loadDayReveal(day: number): Promise<DayReveal | null> {
  try {
    // In production, this would be an API call or IPFS fetch
    const response = await fetch(`/api/reveals/day-${String(day).padStart(2, '0')}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to load reveal for day ${day}:`, error);
    return null;
  }
}

