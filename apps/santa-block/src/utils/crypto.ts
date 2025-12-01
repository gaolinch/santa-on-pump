import crypto from 'crypto';

/**
 * SHA256 hash function
 */
export function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * HMAC-SHA256 for deterministic randomness
 */
export function hmacSha256(message: string, key: string): string {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

/**
 * Hash a gift list with salt for commit-reveal
 */
export function hashGiftList(gifts: any[], salt: string): string {
  const data = JSON.stringify({ gifts, salt });
  return sha256(data);
}

/**
 * Verify a gift list against a committed hash
 */
export function verifyGiftList(gifts: any[], salt: string, expectedHash: string): boolean {
  const actualHash = hashGiftList(gifts, salt);
  return actualHash === expectedHash;
}

/**
 * Deterministic shuffle using Fisher-Yates with seeded random
 */
export function deterministicShuffle<T>(array: T[], seed: string): T[] {
  const shuffled = [...array];
  let currentIndex = shuffled.length;
  
  // Create a seedable random number generator
  const seedNum = parseInt(seed.substring(0, 8), 16);
  let random = seedNum;
  
  const seededRandom = () => {
    random = (random * 9301 + 49297) % 233280;
    return random / 233280;
  };

  while (currentIndex !== 0) {
    const randomIndex = Math.floor(seededRandom() * currentIndex);
    currentIndex--;
    [shuffled[currentIndex], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[currentIndex]];
  }

  return shuffled;
}

/**
 * Generate deterministic random seed from blockhash and salt
 */
export function generateRandomSeed(blockhash: string, salt: string): string {
  return hmacSha256(blockhash, salt);
}

