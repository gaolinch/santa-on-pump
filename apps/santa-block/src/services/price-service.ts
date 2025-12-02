/**
 * Price Service - Fetches SOL/USD price from CoinGecko API
 * 
 * Provides cached SOL price to avoid excessive API calls.
 * Falls back to a default price if API is unavailable.
 */

import { logger } from '../utils/logger';

interface PriceCache {
  price: number;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_SOL_PRICE = 150; // Fallback price in USD
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';

class PriceService {
  private cache: PriceCache | null = null;

  /**
   * Get current SOL price in USD
   * Uses cached value if available and fresh, otherwise fetches from API
   */
  async getSOLPrice(): Promise<number> {
    const now = Date.now();

    // Return cached price if still valid
    if (this.cache && (now - this.cache.timestamp) < CACHE_TTL_MS) {
      logger.debug({ 
        price: this.cache.price, 
        age: Math.round((now - this.cache.timestamp) / 1000) 
      }, 'Using cached SOL price');
      return this.cache.price;
    }

    // Fetch fresh price
    try {
      const response = await fetch(COINGECKO_API_URL, {
        headers: {
          'Accept': 'application/json',
        },
        // 10 second timeout
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`CoinGecko API returned ${response.status}`);
      }

      const data = await response.json() as { solana?: { usd?: number } };
      
      if (data.solana?.usd) {
        const price = data.solana.usd;
        this.cache = { price, timestamp: now };
        logger.info({ price }, '✅ Fetched SOL price from CoinGecko');
        return price;
      } else {
        throw new Error('Invalid response format from CoinGecko');
      }
    } catch (error) {
      logger.warn({ error }, '⚠️  Failed to fetch SOL price from CoinGecko, using cached or default price');
      
      // Use cached price even if expired, or fall back to default
      if (this.cache) {
        logger.info({ 
          price: this.cache.price, 
          age: Math.round((now - this.cache.timestamp) / 1000) 
        }, 'Using expired cached SOL price');
        return this.cache.price;
      }
      
      logger.warn({ defaultPrice: DEFAULT_SOL_PRICE }, 'Using default SOL price');
      return DEFAULT_SOL_PRICE;
    }
  }

  /**
   * Convert USD amount to SOL (lamports)
   */
  async convertUSDToSOL(usdAmount: number): Promise<bigint> {
    const solPrice = await this.getSOLPrice();
    const solAmount = usdAmount / solPrice;
    const lamports = BigInt(Math.floor(solAmount * 1e9));
    return lamports;
  }

  /**
   * Clear the price cache (useful for testing)
   */
  clearCache(): void {
    this.cache = null;
  }
}

export const priceService = new PriceService();

