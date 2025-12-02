import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  Commitment,
  BlockResponse,
  VersionedBlockResponse,
} from '@solana/web3.js';
import { config } from '../config';
import { logger } from '../utils/logger';
import { 
  decodePumpFeesInstruction,
  calculateCreatorFee,
  isPumpFeesProgram,
} from '../utils/pumpfun-decoder';

export class SolanaService {
  private primaryConnection: Connection;
  private fallbackConnection: Connection;
  private currentConnection: Connection;
  private tokenMint?: PublicKey;
  private treasuryWallet?: PublicKey;
  
  // Request queueing to prevent rate limiting
  private requestQueue: Array<() => Promise<void>> = [];
  private activeRequests = 0;
  private readonly MAX_CONCURRENT_REQUESTS: number;
  private readonly REQUEST_DELAY_MS: number;
  private readonly MAX_QUEUE_SIZE: number;
  private lastRequestTime = 0;
  private droppedRequestsCount = 0;

  constructor() {
    const commitment: Commitment = 'finalized';
    
    // Initialize rate limiting configuration from config
    this.MAX_CONCURRENT_REQUESTS = config.solana.maxConcurrentRequests;
    this.REQUEST_DELAY_MS = config.solana.requestDelayMs;
    this.MAX_QUEUE_SIZE = config.solana.maxQueueSize;
    
    // Use correct RPC based on network configuration
    const rpcUrl = config.solana.network === 'devnet' 
      ? config.solana.rpcDevnet 
      : config.solana.rpcPrimary;
    
    const fallbackUrl = config.solana.network === 'devnet'
      ? config.solana.rpcDevnet // Use same devnet URL for fallback
      : config.solana.rpcFallback;
    
    logger.info({ 
      network: config.solana.network, 
      rpcUrl,
      maxConcurrentRequests: this.MAX_CONCURRENT_REQUESTS,
      requestDelayMs: this.REQUEST_DELAY_MS,
      maxQueueSize: this.MAX_QUEUE_SIZE
    }, 'Initializing Solana service with request queueing');
    
    this.primaryConnection = new Connection(rpcUrl, {
      commitment,
      confirmTransactionInitialTimeout: 60000,
      // Disable built-in retries - we handle retries ourselves with better logic
      disableRetryOnRateLimit: true,
      httpHeaders: { 'Content-Type': 'application/json' },
    });

    this.fallbackConnection = new Connection(fallbackUrl, {
      commitment,
      confirmTransactionInitialTimeout: 60000,
      // Disable built-in retries - we handle retries ourselves with better logic
      disableRetryOnRateLimit: true,
      httpHeaders: { 'Content-Type': 'application/json' },
    });

    this.currentConnection = this.primaryConnection;
    
    // Only initialize if values are provided (for development)
    if (config.santa.tokenMint) {
      try {
        this.tokenMint = new PublicKey(config.santa.tokenMint);
      } catch (error) {
        logger.warn({ error }, 'Invalid SANTA_TOKEN_MINT, running without token configuration');
      }
    }
    
    if (config.santa.treasuryWallet) {
      try {
        this.treasuryWallet = new PublicKey(config.santa.treasuryWallet);
      } catch (error) {
        logger.warn({ error }, 'Invalid SANTA_TREASURY_WALLET, running without treasury configuration');
      }
    }
    
    if (!this.tokenMint || !this.treasuryWallet) {
      logger.warn('Solana service initialized without token/treasury configuration. Some features will be disabled.');
    }
  }

  /**
   * Switch to fallback RPC
   */
  private switchToFallback(): void {
    logger.warn('Switching to fallback RPC provider');
    this.currentConnection = this.fallbackConnection;
  }

  /**
   * Switch back to primary RPC
   */
  private switchToPrimary(): void {
    logger.info('Switching back to primary RPC provider');
    this.currentConnection = this.primaryConnection;
  }

  /**
   * Get connection with automatic fallback
   */
  async getConnection(): Promise<Connection> {
    try {
      // Test current connection
      await this.currentConnection.getSlot();
      return this.currentConnection;
    } catch (error) {
      logger.error({ error }, 'Primary RPC connection failed, switching to fallback');
      this.switchToFallback();
      return this.currentConnection;
    }
  }

  /**
   * Process the request queue
   */
  private processQueue(): void {
    // Log queue stats when queue is building up
    if (this.requestQueue.length > 5 || (this.requestQueue.length > 0 && Math.random() < 0.2)) {
      const stats = this.getQueueStats();
      logger.info(stats, '📊 RPC Queue Stats');
    }
    
    // Process requests from queue if we have capacity
    while (this.activeRequests < this.MAX_CONCURRENT_REQUESTS && this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) {
        this.activeRequests++;
        request().finally(() => {
          this.activeRequests--;
          // Process next request after a small delay
          setTimeout(() => this.processQueue(), this.REQUEST_DELAY_MS);
        });
      }
    }
  }

  /**
   * Queue a request with rate limiting
   */
  private async queueRequest<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedFn = async () => {
        try {
          // Add delay between requests to avoid bursts
          const now = Date.now();
          const timeSinceLastRequest = now - this.lastRequestTime;
          if (timeSinceLastRequest < this.REQUEST_DELAY_MS) {
            await new Promise(r => setTimeout(r, this.REQUEST_DELAY_MS - timeSinceLastRequest));
          }
          this.lastRequestTime = Date.now();
          
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      // If we have capacity, execute immediately
      if (this.activeRequests < this.MAX_CONCURRENT_REQUESTS) {
        this.activeRequests++;
        wrappedFn().finally(() => {
          this.activeRequests--;
          this.processQueue();
        });
      } else {
        // Check if queue is full
        if (this.requestQueue.length >= this.MAX_QUEUE_SIZE) {
          // Queue is full - drop oldest request and log warning
          const droppedRequest = this.requestQueue.shift();
          this.droppedRequestsCount++;
          
          if (this.droppedRequestsCount % 10 === 1) { // Log every 10th drop (or first)
            logger.warn({ 
              queueLength: this.requestQueue.length,
              activeRequests: this.activeRequests,
              maxQueueSize: this.MAX_QUEUE_SIZE,
              totalDropped: this.droppedRequestsCount
            }, '🚨 RPC Queue FULL - dropping oldest requests! Consider increasing RPC_MAX_CONCURRENT or RPC_MAX_QUEUE_SIZE');
          }
        }
        
        // Add to queue
        this.requestQueue.push(wrappedFn);
        
        // Log when queue starts building up
        if (this.requestQueue.length % 10 === 0 || this.requestQueue.length > 20) {
          logger.info({ 
            queueLength: this.requestQueue.length,
            activeRequests: this.activeRequests,
            maxConcurrent: this.MAX_CONCURRENT_REQUESTS,
            maxQueueSize: this.MAX_QUEUE_SIZE,
            droppedTotal: this.droppedRequestsCount
          }, '⏳ RPC Request queued - queue building up');
        }
      }
    });
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return {
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.MAX_CONCURRENT_REQUESTS,
      maxQueueSize: this.MAX_QUEUE_SIZE,
      droppedRequests: this.droppedRequestsCount,
      queueUsagePercent: Math.round((this.requestQueue.length / this.MAX_QUEUE_SIZE) * 100),
    };
  }

  /**
   * Get current slot
   */
  async getCurrentSlot(): Promise<number> {
    const connection = await this.getConnection();
    return connection.getSlot('finalized');
  }

  /**
   * Get transaction by signature (with queueing)
   */
  async getTransaction(signature: string): Promise<ParsedTransactionWithMeta | null> {
    // Use queue to prevent overwhelming the RPC
    return this.queueRequest(async () => {
      try {
        const connection = await this.getConnection();
        const transaction = await connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        });
        return transaction;
      } catch (error) {
        logger.error({ error, signature }, 'Failed to fetch transaction');
        return null;
      }
    });
  }

  /**
   * Get block by slot
   */
  async getBlock(slot: number): Promise<VersionedBlockResponse | null> {
    const connection = await this.getConnection();
    return connection.getBlock(slot, {
      maxSupportedTransactionVersion: 0,
    });
  }

  /**
   * Get signatures for token address in a time range
   */
  async getSignaturesForAddress(
    address?: PublicKey,
    beforeSignature?: string,
    limit: number = 1000
  ): Promise<any[]> {
    if (!address && !this.tokenMint) {
      throw new Error('No token mint address configured');
    }
    const connection = await this.getConnection();
    return connection.getSignaturesForAddress(address || this.tokenMint!, {
      before: beforeSignature,
      limit,
    });
  }

  /**
   * Get parsed transaction with retry logic and request queueing
   */
  async getParsedTransaction(signature: string, retries: number = 3): Promise<ParsedTransactionWithMeta | null> {
    // Use queue to prevent overwhelming the RPC with concurrent requests
    return this.queueRequest(async () => {
      const connection = await this.getConnection();
      
      for (let i = 0; i < retries; i++) {
        try {
          const result = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'finalized',
          });
          
          // Log queue stats periodically (20% of requests or when queue is active)
          const stats = this.getQueueStats();
          if (stats.queueLength > 0 || stats.activeRequests > 15) {
            logger.info(stats, '📊 RPC Queue Stats (active)');
          } else if (Math.random() < 0.05) {
            logger.debug(stats, 'RPC Queue Stats (idle)');
          }
          
          return result;
        } catch (error: any) {
          const is429 = error?.message?.includes('429') || error?.message?.includes('Too Many Requests');
          
          if (is429) {
            const stats = this.getQueueStats();
            
            if (i < retries - 1) {
              // Wait before retry with exponential backoff
              const delay = Math.min(1000 * Math.pow(2, i), 5000);
              logger.warn({ 
                signature: signature.slice(0, 12) + '...', 
                attempt: i + 1, 
                retries,
                waitingMs: delay,
                queueLength: stats.queueLength,
                activeRequests: stats.activeRequests 
              }, `⏳ Rate limited - waiting ${delay}ms before retry ${i + 2}/${retries}`);
              
              await new Promise(resolve => setTimeout(resolve, delay));
              
              logger.info({ 
                signature: signature.slice(0, 12) + '...',
                attempt: i + 2 
              }, `🔄 Retrying request now (attempt ${i + 2}/${retries})`);
              continue;
            } else {
              logger.error({ 
                signature: signature.slice(0, 12) + '...',
                attempt: i + 1,
                queueLength: stats.queueLength,
                activeRequests: stats.activeRequests 
              }, '❌ Rate limited - out of retries');
            }
          }
          
          // If not rate limit or out of retries, throw
          if (!is429 || i === retries - 1) {
            logger.error({ error, signature, attempt: i + 1 }, 'Failed to get parsed transaction');
            throw error;
          }
        }
      }
      
      return null;
    });
  }

  /**
   * Get token account balance
   */
  async getTokenAccountBalance(account: PublicKey): Promise<bigint> {
    const connection = await this.getConnection();
    const balance = await connection.getTokenAccountBalance(account);
    return BigInt(balance.value.amount);
  }

  /**
   * Get treasury SOL balance (in lamports)
   * This is the native SOL balance, not token balance
   */
  async getTreasuryBalance(): Promise<bigint> {
    if (!this.treasuryWallet) {
      logger.warn('Treasury wallet not configured');
      return BigInt(0);
    }
    
    const connection = await this.getConnection();
    // Get SOL balance (native balance) in lamports
    const balance = await connection.getBalance(this.treasuryWallet);
    return BigInt(balance);
  }

  /**
   * Get blockhash for a specific slot
   */
  async getBlockhashForSlot(slot: number): Promise<string | null> {
    try {
      const block = await this.getBlock(slot);
      return block?.blockhash || null;
    } catch (error) {
      logger.error({ error, slot }, 'Failed to get blockhash for slot');
      return null;
    }
  }

  /**
   * Get the last finalized slot for a specific date
   */
  async getLastSlotForDate(date: Date): Promise<number | null> {
    try {
      const connection = await this.getConnection();
      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);
      const targetTimestamp = Math.floor(endOfDay.getTime() / 1000);

      // Binary search to find the slot closest to the target timestamp
      let currentSlot = await this.getCurrentSlot();
      let block = await this.getBlock(currentSlot);
      
      if (!block || !block.blockTime) {
        return null;
      }

      // If current time is before target, we can't get a future slot
      if (block.blockTime < targetTimestamp) {
        return currentSlot;
      }

      // Binary search backwards
      let low = currentSlot - 216000; // Approximately 24 hours of slots
      let high = currentSlot;
      let closestSlot = currentSlot;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const midBlock = await this.getBlock(mid);

        if (!midBlock || !midBlock.blockTime) {
          high = mid - 1;
          continue;
        }

        if (midBlock.blockTime <= targetTimestamp) {
          closestSlot = mid;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      return closestSlot;
    } catch (error) {
      logger.error({ error, date }, 'Failed to get last slot for date');
      return null;
    }
  }

  /**
   * Extract Pump.fun fees from transaction
   * 
   * Extracts both protocol fee and creator fee by decoding the Pump Fees Program inner instruction.
   * 
   * Returns:
   * - protocolFee: 0.95% (95 basis points) - Pump.fun platform fee
   * - creatorFee: 0.3% (30 basis points) - Token creator fee
   * - creatorFeeBps: Basis points for creator fee
   */
  private extractPumpFunFees(tx: ParsedTransactionWithMeta, signature?: string): {
    protocolFee?: bigint;
    creatorFee?: bigint;
    creatorFeeBps?: number;
  } {
    try {
      const txAny = tx as any;

      // Check inner instructions for Pump Fees Program
      if (tx.meta?.innerInstructions) {
        for (let i = 0; i < tx.meta.innerInstructions.length; i++) {
          const inner = tx.meta.innerInstructions[i];
          
          for (let j = 0; j < inner.instructions.length; j++) {
            const instruction = inner.instructions[j] as any;
            
            // Get program ID
            let programId = '';
            if (instruction.programId) {
              programId = instruction.programId.toString();
            } else if (instruction.programIdIndex !== undefined && txAny.transaction?.message?.accountKeys) {
              const account = txAny.transaction.message.accountKeys[instruction.programIdIndex];
              programId = typeof account === 'object' && 'pubkey' in account 
                ? account.pubkey.toString() 
                : account?.toString?.() || '';
            }
            
            // Check if this is a Pump Fees Program instruction
            if (isPumpFeesProgram(programId) && instruction.data) {
              const decoded = decodePumpFeesInstruction(instruction.data);
              if (decoded) {
                logger.info({
                  signature,
                  protocolFee: decoded.protocolFee.toString(),
                  protocolFeeSol: (Number(decoded.protocolFee) / 1e9).toFixed(9),
                  creatorFee: decoded.creatorFee.toString(),
                  creatorFeeSol: (Number(decoded.creatorFee) / 1e9).toFixed(9),
                  creatorFeeBps: decoded.creatorFeeBps,
                  tradeSizeSol: (Number(decoded.tradeSizeLamports) / 1e9).toFixed(9)
                }, 'Extracted Pump.fun fees');
                
                return {
                  protocolFee: decoded.protocolFee,
                  creatorFee: decoded.creatorFee,
                  creatorFeeBps: decoded.creatorFeeBps
                };
              }
            }
          }
        }
      }

      logger.debug({ signature }, 'Pump.fun fees not found in transaction');

      return {};
    } catch (error) {
      logger.error({ signature, error }, 'Error extracting Pump.fun fees');
      return {};
    }
  }

  /**
   * Parse SPL token transfer from transaction (returns array for multi-transfer support)
   * Extracts token transfers from both instructions AND meta.postTokenBalances
   * Also extracts creatorFee from pump.fun instruction data if available
   * 
   * Returns an array of transfers (most transactions have 1, some have multiple)
   */
  parseTokenTransfers(tx: ParsedTransactionWithMeta, signature?: string): Array<{
    from: string;
    to: string | null;
    amount: bigint;
    kind: 'buy' | 'sell' | 'transfer';
    protocolFee?: bigint;
    creatorFee?: bigint;
    creatorFeeBps?: number;
    sub_tx: number; // Sub-transaction index
  }> | null {
    if (!tx.meta || !tx.transaction) {
      logger.debug({ signature }, 'No meta or transaction in parsed tx');
      return null;
    }

    // Extract Pump.fun fees once for the entire transaction
    logger.info({ signature }, 'Extracting Pump.fun fees from transaction');
    const pumpFunFees = this.extractPumpFunFees(tx, signature);
    
    if (pumpFunFees.creatorFee !== undefined) {
      logger.info({ 
        signature,
        protocolFee: pumpFunFees.protocolFee?.toString(),
        creatorFee: pumpFunFees.creatorFee.toString(),
        creatorFeeBps: pumpFunFees.creatorFeeBps
      }, 'Successfully extracted Pump.fun fees');
    } else {
      logger.debug({ signature }, 'No Pump.fun fees found');
    }

    // FIRST: Try to extract from token balance changes (works for all transactions including DEX)
    if (tx.meta.preTokenBalances && tx.meta.postTokenBalances) {
      logger.info({ 
        signature,
        preCount: tx.meta.preTokenBalances.length, 
        postCount: tx.meta.postTokenBalances.length 
      }, 'Checking token balances');
      
      const preBalances = tx.meta.preTokenBalances;
      const postBalances = tx.meta.postTokenBalances;
      
      // Log the actual mints to see what tokens are involved
      const mints = new Set([
        ...preBalances.map(b => b.mint),
        ...postBalances.map(b => b.mint)
      ]);
      logger.info({ mints: Array.from(mints) }, 'Token mints in transaction');
      
      // Detect MINT transactions (token creation)
      // MINT = all token accounts start at 0 (no pre-balances for the token)
      const nonWsolMints = Array.from(mints).filter(m => m !== 'So11111111111111111111111111111111111111112');
      const isMintTransaction = nonWsolMints.length > 0 && preBalances.filter(b => nonWsolMints.includes(b.mint)).length === 0;
      
      if (isMintTransaction) {
        logger.info({ signature, mints: nonWsolMints }, 'Detected MINT transaction (token creation) - will extract initial buy if present');
        // Don't skip - there may be an initial buy within the mint transaction
        // We'll handle this specially below
      }
      
      // Find ALL balance changes for our target token (not just the largest)
      const targetTokenChanges: Array<{
        amount: bigint;
        owner: string;
        isIncrease: boolean;
        accountIndex: number;
      }> = [];
      
      logger.info({ signature, totalPostBalances: postBalances.length }, 'Processing token balances');
      
      for (const postBalance of postBalances) {
        logger.info({ signature, mint: postBalance.mint }, 'Checking balance for mint');
        
        // Skip WSOL (SOL) - we only want to track project tokens
        if (postBalance.mint === 'So11111111111111111111111111111111111111112') {
          logger.info({ signature }, 'Skipping WSOL');
          continue;
        }
        
        // If we have a specific target token mint configured AND it's not Pump.fun mode, only process that
        // For Pump.fun monitoring (indicated by pumpFunToken being set), process ALL non-SOL tokens
        const isPumpFunMode = config.solana.pumpFunToken !== '';
        if (this.tokenMint && !isPumpFunMode && postBalance.mint !== this.tokenMint.toString()) {
          logger.info({ signature, mint: postBalance.mint, targetMint: this.tokenMint.toString() }, 'Skipping non-target token');
          continue;
        }
        
        // In Pump.fun mode, process all tokens
        if (isPumpFunMode) {
          logger.info({ signature, mint: postBalance.mint }, 'Pump.fun mode: processing all tokens');
        }
        
        logger.info({ signature, mint: postBalance.mint }, 'Processing this token balance!');
        
        const preBalance = preBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
        const preAmount = preBalance ? BigInt(preBalance.uiTokenAmount.amount) : BigInt(0);
        const postAmount = BigInt(postBalance.uiTokenAmount.amount);
        const change = postAmount > preAmount ? postAmount - preAmount : preAmount - postAmount;
        
        logger.info({ 
          accountIndex: postBalance.accountIndex,
          mint: postBalance.mint,
          owner: postBalance.owner,
          preAmount: preAmount.toString(),
          postAmount: postAmount.toString(),
          change: change.toString()
        }, 'Balance change for target token account');
        
        if (change > BigInt(0)) {
          // Get account owner
          const accountKeys = tx.transaction.message.accountKeys;
          const account: any = accountKeys[postBalance.accountIndex];
          const owner = account && typeof account === 'object' && 'pubkey' in account 
            ? account.pubkey.toString() 
            : account?.toString ? account.toString() : 'unknown';
          
          targetTokenChanges.push({
            amount: change,
            owner: postBalance.owner || owner,
            isIncrease: postAmount > preAmount,
            accountIndex: postBalance.accountIndex,
          });
        }
      }
      
      // Special handling for MINT transactions with initial buy
      // In a MINT transaction, all accounts start at 0 and increase
      // The bonding curve gets the majority (e.g., 848M tokens)
      // The buyer gets a smaller amount (e.g., 151M tokens)
      if (isMintTransaction && targetTokenChanges.length === 2 && targetTokenChanges.every(c => c.isIncrease)) {
        // Both accounts increased from 0 - this is a MINT with initial buy
        // Find the bonding curve (larger balance) and the buyer (smaller balance)
        const sorted = [...targetTokenChanges].sort((a, b) => Number(b.amount - a.amount));
        const bondingCurve = sorted[0]; // Larger amount
        const buyer = sorted[1]; // Smaller amount
        
        logger.info({
          signature,
          bondingCurveAmount: bondingCurve.amount.toString(),
          buyerAmount: buyer.amount.toString(),
          bondingCurveOwner: bondingCurve.owner,
          buyerOwner: buyer.owner
        }, 'Detected MINT transaction with initial buy');
        
        // Return the initial buy (buyer receiving tokens from bonding curve)
        return [{
          from: bondingCurve.owner, // Bonding curve is the "from" (conceptually)
          to: buyer.owner, // Buyer is the "to"
          amount: buyer.amount, // Amount the buyer received
          kind: 'buy',
          protocolFee: pumpFunFees.protocolFee,
          creatorFee: pumpFunFees.creatorFee,
          creatorFeeBps: pumpFunFees.creatorFeeBps,
          sub_tx: 0, // Single transfer
        }];
      }
      
      // If we have exactly 2 changes with opposite directions, this is likely a swap/trade
      // One account sends tokens (decreases), other receives (increases)
      if (targetTokenChanges.length === 2) {
        const increase = targetTokenChanges.find(c => c.isIncrease);
        const decrease = targetTokenChanges.find(c => !c.isIncrease);
        
        if (increase && decrease) {
          // Check SOL/WSOL balances to determine direction
          // SELL: User sends tokens, receives SOL (user SOL increases, pool SOL decreases)
          // BUY: User sends SOL, receives tokens (user SOL decreases, pool SOL increases)
          const wsolMint = 'So11111111111111111111111111111111111111112';
          const wsolChanges = [];
          
          for (const postBalance of postBalances) {
            if (postBalance.mint === wsolMint) {
              const preBalance = preBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
              if (preBalance) {
                const preAmount = BigInt(preBalance.uiTokenAmount.amount);
                const postAmount = BigInt(postBalance.uiTokenAmount.amount);
                const change = postAmount - preAmount;
                wsolChanges.push({
                  owner: postBalance.owner,
                  change,
                  isIncrease: change > 0n
                });
              }
            }
          }
          
          // Simple logic for Pump.fun:
          // If there are 2 token balance changes (increase and decrease):
          // - The one that DECREASED is the seller (or buyer receiving less)
          // - The one that INCREASED is the receiver (or pool receiving tokens)
          //
          // For a SELL: User tokens decrease, Pool tokens increase
          // For a BUY: Pool tokens decrease, User tokens increase
          
          // Check WSOL to confirm direction
          const poolWsolDecrease = wsolChanges.find(w => !w.isIncrease && w.owner === increase.owner);
          const userWsolIncrease = wsolChanges.find(w => w.isIncrease);
          
          let kind: 'buy' | 'sell' | 'transfer';
          let from: string;
          let to: string;
          
          // If pool's WSOL decreased (they sent SOL out), user is SELLING tokens for SOL
          if (poolWsolDecrease) {
            kind = 'sell';
            from = decrease.owner;
            to = increase.owner;
            logger.info({ signature, from, to, poolWsolOwner: poolWsolDecrease.owner }, 'Detected SELL (pool sent SOL out, received tokens)');
          }
          // If user received WSOL AND their tokens decreased, they SOLD
          else if (userWsolIncrease && userWsolIncrease.owner !== increase.owner) {
            kind = 'sell';
            from = decrease.owner;
            to = increase.owner;
            logger.info({ signature, from, to }, 'Detected SELL (user tokens out, SOL in)');
          }
          // Check if the account that INCREASED tokens is the pool (if configured)
          // If pool received tokens = SELL, if pool sent tokens = BUY
          else if (config.solana.poolTokenAccount && increase.owner === config.solana.poolTokenAccount) {
            kind = 'sell';
            from = decrease.owner;
            to = increase.owner;
            logger.info({ signature, from, to, poolAccount: config.solana.poolTokenAccount }, 'Detected SELL (pool received tokens, no WSOL data)');
          }
          else if (config.solana.poolTokenAccount && decrease.owner === config.solana.poolTokenAccount) {
            kind = 'buy';
            from = decrease.owner;
            to = increase.owner;
            logger.info({ signature, from, to, poolAccount: config.solana.poolTokenAccount }, 'Detected BUY (pool sent tokens, no WSOL data)');
          }
          // If tokens increased for an account = BUY (they bought tokens)
          else if (increase && decrease) {
            kind = 'buy';
            from = decrease.owner;
            to = increase.owner;
            logger.info({ signature, from, to }, 'Detected BUY (user received tokens) - fallback');
          }
          // Fallback
          else {
            // If we don't have both increase and decrease, skip this transaction
            logger.warn({ signature }, 'Cannot determine transfer direction - missing increase or decrease');
            return null;
          }
          
          logger.info({
            signature,
            tokenFrom: from,
            tokenTo: to,
            amount: decrease.amount.toString(),
            kind
          }, 'Detected swap between two accounts');
          
          return [{
            from,
            to,
            amount: decrease.amount,
            kind,
            protocolFee: pumpFunFees.protocolFee,
            creatorFee: pumpFunFees.creatorFee,
            creatorFeeBps: pumpFunFees.creatorFeeBps,
            sub_tx: 0, // Single transfer
          }];
        }
      }
      
      // Handle transactions with multiple buyers (e.g., bonding curve sends to 2+ wallets)
      // This happens when one transaction contains multiple buy orders
      if (targetTokenChanges.length > 2) {
        // Find the bonding curve (the one that DECREASED for buys, INCREASED for sells)
        const bondingCurve = targetTokenChanges.find(c => !c.isIncrease);
        // Find all buyers (those that INCREASED)
        const buyers = targetTokenChanges.filter(c => c.isIncrease);
        
        // Multiple BUYERS (bonding curve decreased, multiple wallets increased)
        if (bondingCurve && buyers.length >= 2) {
          logger.info({
            signature,
            bondingCurveOwner: bondingCurve.owner,
            bondingCurveDecrease: bondingCurve.amount.toString(),
            buyerCount: buyers.length,
            buyerAddresses: buyers.map(b => b.owner)
          }, 'Detected transaction with multiple buyers - creating sub-transactions');
          
          // Return array of individual buys, each with its own sub_tx index
          return buyers.map((buyer, index) => ({
            from: bondingCurve.owner, // Bonding curve
            to: buyer.owner, // Individual buyer
            amount: buyer.amount, // Individual amount
            kind: 'buy' as const,
            protocolFee: pumpFunFees.protocolFee,
            creatorFee: pumpFunFees.creatorFee,
            creatorFeeBps: pumpFunFees.creatorFeeBps,
            sub_tx: index + 1, // 1, 2, 3, etc.
          }));
        }
        
        // Multiple SELLERS (bonding curve increased, multiple wallets decreased)
        const bondingCurveIncrease = targetTokenChanges.find(c => c.isIncrease);
        const sellers = targetTokenChanges.filter(c => !c.isIncrease);
        
        if (bondingCurveIncrease && sellers.length >= 2) {
          logger.info({
            signature,
            bondingCurveOwner: bondingCurveIncrease.owner,
            bondingCurveIncrease: bondingCurveIncrease.amount.toString(),
            sellerCount: sellers.length,
            sellerAddresses: sellers.map(s => s.owner)
          }, 'Detected transaction with multiple sellers - creating sub-transactions');
          
          // Return array of individual sells, each with its own sub_tx index
          return sellers.map((seller, index) => ({
            from: seller.owner, // Individual seller
            to: bondingCurveIncrease.owner, // Bonding curve
            amount: seller.amount, // Individual amount
            kind: 'sell' as const,
            protocolFee: pumpFunFees.protocolFee,
            creatorFee: pumpFunFees.creatorFee,
            creatorFeeBps: pumpFunFees.creatorFeeBps,
            sub_tx: index + 1, // 1, 2, 3, etc.
          }));
        }
      }
      
      // Use the change with the largest amount (typically the user wallet, not liquidity pools)
      const transferInfo = targetTokenChanges.length > 0
        ? targetTokenChanges.reduce((max, current) => 
            current.amount > max.amount ? current : max
          )
        : null;
      
      // Accept ANY non-zero change, even if it's just 1 token
      if (transferInfo && transferInfo.amount > BigInt(0)) {
        // Check if the owner is a Pump.fun address
        // Note: Each Pump.fun market has its own bonding curve address
        // We check for known patterns OR if it's mentioned in logs
        const pumpFunAddresses = [
          config.solana.pumpFunProgram,
          config.solana.pumpFunBondingCurve,
        ].filter(Boolean);
        
        // Check if owner matches any known Pump.fun addresses
        // OR if the account appears to be a Pump.fun market account
        // (Pump.fun market accounts are created by the Pump.fun program)
        // OR if the account has a very large balance (bonding curve typically holds billions of tokens)
        const accountPreBalance = preBalances.find(pb => pb.accountIndex === transferInfo.accountIndex);
        const accountPostBalance = postBalances.find(pb => pb.accountIndex === transferInfo.accountIndex);
        const accountBalance = accountPostBalance ? BigInt(accountPostBalance.uiTokenAmount.amount) : 
                              accountPreBalance ? BigInt(accountPreBalance.uiTokenAmount.amount) : BigInt(0);
        
        // Bonding curves typically hold > 100,000 tokens (100_000 * 1e9 lamports)
        // This is a strong indicator of a bonding curve account vs a regular user wallet
        const isLargeBalance = accountBalance > BigInt(100_000) * BigInt(1e9);
        
        const isPumpFunAccount = pumpFunAddresses.some(addr => 
          transferInfo.owner?.includes(addr) || transferInfo.owner === addr
        ) || transferInfo.owner?.includes('AMM') || transferInfo.owner?.includes('pAMM') || isLargeBalance;
        
        // Determine if it's a buy or sell based on token balance change
        // If tokens increased in user wallet (NOT Pump.fun) = BUY
        // If tokens decreased from user wallet (going TO Pump.fun) = SELL
        // If Pump.fun account balance increased = SELL (user sent to Pump.fun)
        // If Pump.fun account balance decreased = BUY (user received from Pump.fun)
        let kind: 'buy' | 'sell' | 'transfer';
        
        if (isPumpFunAccount) {
          // This is a Pump.fun account
          // If it increased = tokens going TO Pump.fun = SELL
          // If it decreased = tokens coming FROM Pump.fun = BUY
          kind = transferInfo.isIncrease ? 'sell' : 'buy';
        } else {
          // This is a user wallet
          // If it increased = BUY (receiving tokens)
          // If it decreased = SELL (sending tokens)
          kind = transferInfo.isIncrease ? 'buy' : 'sell';
        }
        
        logger.info({ 
          signature,
          amount: transferInfo.amount.toString(), 
          owner: transferInfo.owner,
          accountBalance: accountBalance.toString(),
          isLargeBalance,
          isPumpFunAccount,
          isIncrease: transferInfo.isIncrease,
          kind: kind
        }, 'Found token transfer from balance changes');
        
        return [{
          from: transferInfo.isIncrease ? (isPumpFunAccount ? transferInfo.owner : 'unknown') : transferInfo.owner,
          to: transferInfo.isIncrease ? transferInfo.owner : (isPumpFunAccount ? transferInfo.owner : 'unknown'),
          amount: transferInfo.amount,
          kind: kind,
          protocolFee: pumpFunFees.protocolFee,
          creatorFee: pumpFunFees.creatorFee,
          creatorFeeBps: pumpFunFees.creatorFeeBps,
          sub_tx: 0, // Single transfer
        }];
      } else {
        logger.warn({ signature }, 'No balance changes detected or amount is 0');
      }
    } else {
      logger.warn('Missing preTokenBalances or postTokenBalances in transaction meta');
    }

    // FALLBACK: Try to parse from instructions (original method)
    const instructions = tx.transaction.message.instructions;
    logger.info({ instructionsCount: instructions.length }, 'Parsing transaction instructions');
    
    // Log all programs found in the transaction
    const programs = instructions.map(i => 'program' in i ? i.program : 'unknown');
    logger.info({ programs }, 'Programs in transaction');
    
    for (const instruction of instructions) {
      const program = 'program' in instruction ? instruction.program : 'unknown';
      const hasParsed = 'parsed' in instruction;
      const type = hasParsed && 'parsed' in instruction ? instruction.parsed?.type : 'no-type';
      
      logger.info({ signature, program, hasParsed, type }, 'Checking instruction');
      
      // Check for both spl-token and spl-token-2022
      if ('parsed' in instruction && (instruction.program === 'spl-token' || instruction.program === 'spl-token-2022')) {
        const parsed = instruction.parsed;
        
        logger.info({ type: parsed.type }, 'Found token instruction');
        
        if (parsed.type === 'transfer' || parsed.type === 'transferChecked' || parsed.type === 'transferCheckedWithFee') {
          const info = parsed.info;
          const amount = BigInt(info.amount || info.tokenAmount?.amount || 0);
          
          // Get source and destination
          const source = info.source || info.authority;
          const destination = info.destination;
          
          logger.info({ 
            signature,
            source, 
            destination, 
            amount: amount.toString() 
          }, 'Transfer details');
          
          // Determine transaction kind for Pump.fun
          // SELL = transfer TO Pump.fun AMM or bonding curve
          // BUY = transfer FROM Pump.fun AMM or bonding curve
          let kind: 'buy' | 'sell' | 'transfer' = 'transfer';
          
          // Check if destination or source is a Pump.fun address
          const pumpFunAddresses = [
            config.solana.pumpFunProgram,
            config.solana.pumpFunBondingCurve,
          ].filter(Boolean);
          
          // Check destination - if sending TO Pump.fun = SELL
          const isPumpFunDestination = pumpFunAddresses.some(addr => 
            destination?.includes(addr) || destination === addr
          );
          
          // Check source - if receiving FROM Pump.fun = BUY  
          const isPumpFunSource = pumpFunAddresses.some(addr => 
            source?.includes(addr) || source === addr
          );
          
          if (isPumpFunDestination) {
            kind = 'sell';
            logger.info({ signature, destination }, 'Detected SELL (transfer TO Pump.fun)');
          } else if (isPumpFunSource) {
            kind = 'buy';
            logger.info({ signature, source }, 'Detected BUY (transfer FROM Pump.fun)');
          } else {
            // Fallback: check treasury wallet
            if (this.treasuryWallet) {
              const treasuryAddress = this.treasuryWallet.toBase58();
              if (destination === treasuryAddress) {
                kind = 'sell';
              } else if (source === treasuryAddress) {
                kind = 'buy';
              }
            }
          }

          logger.info({ from: source, to: destination, amount: amount.toString(), kind }, 'Successfully parsed token transfer!');
          
          return [{
            from: source,
            to: destination,
            amount,
            kind,
            protocolFee: pumpFunFees.protocolFee,
            creatorFee: pumpFunFees.creatorFee,
            creatorFeeBps: pumpFunFees.creatorFeeBps,
            sub_tx: 0, // Single transfer
          }];
        } else {
          logger.info({ type: parsed.type }, 'Token instruction type not transfer - skipping');
        }
      }
    }

    logger.warn('No token transfer instruction found in transaction');
    return null;
  }

  /**
   * Parse SPL token transfer from transaction (backward compatible - returns first transfer only)
   * Use parseTokenTransfers() for multi-transfer support
   */
  parseTokenTransfer(tx: ParsedTransactionWithMeta, signature?: string): {
    from: string;
    to: string | null;
    amount: bigint;
    kind: 'buy' | 'sell' | 'transfer';
    protocolFee?: bigint;
    creatorFee?: bigint;
    creatorFeeBps?: number;
  } | null {
    const transfers = this.parseTokenTransfers(tx, signature);
    if (!transfers || transfers.length === 0) {
      return null;
    }
    // Return first transfer for backward compatibility
    const first = transfers[0];
    return {
      from: first.from,
      to: first.to,
      amount: first.amount,
      kind: first.kind,
      protocolFee: first.protocolFee,
      creatorFee: first.creatorFee,
      creatorFeeBps: first.creatorFeeBps,
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; slot?: number; error?: string }> {
    try {
      const slot = await this.getCurrentSlot();
      return { healthy: true, slot };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { healthy: false, error: errorMessage };
    }
  }
}

export const solanaService = new SolanaService();

