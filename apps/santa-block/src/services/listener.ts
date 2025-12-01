import { solanaService } from './solana';
import { txRawRepo, auditLogRepo } from '../database';
import { logger } from '../utils/logger';
import { config } from '../config';

export class TransactionListener {
  private isRunning: boolean = false;
  private lastProcessedSignature: string | null = null;
  private pollInterval: number = 4000; // 4 seconds between polls
  private isInitialized: boolean = false; // Track if we've set our starting point
  private requestDelay: number = 100; // 100ms = 10 requests/second (Helius free tier)

  /**
   * Start listening to transactions
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Transaction listener is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting transaction listener');

    await this.poll();
  }

  /**
   * Stop listening to transactions
   */
  stop(): void {
    this.isRunning = false;
    logger.info('Stopping transaction listener');
  }

  /**
   * Reset the listener to start fresh from current moment
   */
  reset(): void {
    this.lastProcessedSignature = null;
    this.isInitialized = false;
    logger.info('Reset transaction listener - will start fresh on next poll');
  }

  /**
   * Poll for new transactions
   */
  private async poll(): Promise<void> {
    while (this.isRunning) {
      try {
        await this.fetchAndProcessTransactions();
      } catch (error) {
        logger.error({ error }, 'Error in transaction listener poll');
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
  }

  /**
   * Fetch and process new transactions
   */
  private async fetchAndProcessTransactions(): Promise<void> {
    try {
      // Check if token mint is configured
      if (!config.santa.tokenMint) {
        logger.debug('Token mint not configured, skipping transaction fetch');
        return;
      }

      const { PublicKey } = await import('@solana/web3.js');
      const tokenMint = new PublicKey(config.santa.tokenMint);
      
      let addressToMonitor: any;
      
      // If treasury wallet is configured, monitor its token account
      // Otherwise, monitor the token mint directly
      if (config.santa.treasuryWallet) {
        const { getAssociatedTokenAddress } = await import('@solana/spl-token');
        const treasuryWallet = new PublicKey(config.santa.treasuryWallet);
        
        // Get treasury's token account address
        addressToMonitor = await getAssociatedTokenAddress(
          tokenMint,
          treasuryWallet
        );
        
        logger.debug({ address: addressToMonitor.toString() }, 'Monitoring treasury token account');
      } else {
        // Monitor token mint directly for all transactions
        addressToMonitor = tokenMint;
        logger.debug({ address: addressToMonitor.toString() }, 'Monitoring token mint address');
      }
      
      // Monitor the selected address to catch transfers
      // Fetch 10 transactions per poll (will take ~1.1 seconds at 10 req/sec)
      const signatures = await solanaService.getSignaturesForAddress(
        addressToMonitor,
        this.lastProcessedSignature || undefined,
        10
      );
      
      // Small delay after getSignaturesForAddress (1 request)
      await new Promise(resolve => setTimeout(resolve, this.requestDelay));

      if (signatures.length === 0) {
        logger.debug('No new transactions found');
        return;
      }

      // FIRST TIME: Skip all historical transactions and start from NOW
      if (!this.isInitialized) {
        // Just set the last processed signature to the most recent one
        // This way we start fresh from this point forward
        this.lastProcessedSignature = signatures[0].signature;
        this.isInitialized = true;
        logger.info({ 
          startSignature: this.lastProcessedSignature?.substring(0, 8),
          skippedCount: signatures.length 
        }, 'Initialized listener - starting from NOW (skipped historical transactions)');
        return;
      }

      logger.info({ count: signatures.length, lastSig: this.lastProcessedSignature?.substring(0, 8) }, 'Found new transactions');

      // Process each transaction with delay to avoid rate limits
      for (const signatureInfo of signatures.reverse()) {
        try {
          logger.debug({ signature: signatureInfo.signature }, 'Processing transaction...');
          const wasNew = await this.processTransaction(signatureInfo.signature);
          
          // Always update the last processed signature, even if it was a duplicate
          this.lastProcessedSignature = signatureInfo.signature;
          
          if (wasNew) {
            logger.info({ signature: signatureInfo.signature }, 'NEW transaction saved!');
          } else {
            logger.debug({ signature: signatureInfo.signature }, 'Transaction already exists');
          }
          
          // Delay after each getParsedTransaction call (rate limit: 10 req/sec)
          await new Promise(resolve => setTimeout(resolve, this.requestDelay));
        } catch (error) {
          logger.error(
            { error, signature: signatureInfo.signature },
            'Error processing transaction'
          );
        }
      }
      
      logger.info('Finished processing batch');

      // Log audit entry
      await auditLogRepo.insert({
        ts: new Date(),
        actor: 'listener',
        action: 'poll_transactions',
        payload: {
          count: signatures.length,
          lastSignature: this.lastProcessedSignature,
        },
      });
    } catch (error) {
      // Check if it's a rate limit error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('429') || errorMessage.includes('Too Many Requests')) {
        logger.warn('Rate limit hit, will retry on next poll cycle');
        // Don't throw, just log and continue
      } else {
        logger.error({ error }, 'Error fetching transactions');
      }
    }
  }

  /**
   * Process a single transaction
   * Returns true if transaction was newly saved, false if it already existed
   */
  private async processTransaction(signature: string): Promise<boolean> {
    try {
      // Check if already processed
      const existing = await txRawRepo.findBySignature(signature);
      if (existing) {
        logger.debug({ signature }, 'Transaction already processed');
        return false;
      }

      // Get parsed transaction
      logger.debug({ signature }, 'Fetching parsed transaction from RPC');
      const tx = await solanaService.getParsedTransaction(signature);
      if (!tx || !tx.blockTime) {
        logger.warn({ signature }, 'Transaction not found or missing block time');
        return false;
      }

      // Parse token transfer
      logger.info({ signature }, '🔄 Parsing token transfer...');
      
      // Log transaction structure for debugging
      logger.debug({ 
        signature,
        slot: tx.slot,
        blockTime: tx.blockTime,
        hasTransaction: !!tx.transaction,
        hasMessage: !!(tx.transaction as any)?.message,
        instructionCount: (tx.transaction as any)?.message?.instructions?.length || 0,
        hasMeta: !!tx.meta,
        hasLogMessages: !!tx.meta?.logMessages,
        logMessageCount: tx.meta?.logMessages?.length || 0,
        hasInnerInstructions: !!tx.meta?.innerInstructions,
        innerInstructionCount: tx.meta?.innerInstructions?.length || 0
      }, '📊 Transaction structure overview');
      
      const transfer = solanaService.parseTokenTransfer(tx);
      if (!transfer) {
        logger.debug({ signature }, 'No token transfer found in transaction - skipping');
        return false;
      }
      
      logger.info({ 
        signature,
        from: transfer.from,
        to: transfer.to,
        amount: transfer.amount.toString(),
        kind: transfer.kind,
        hasCreatorFee: transfer.creatorFee !== undefined
      }, '✅ Token transfer parsed successfully');

      // Extract Pump.fun fees
      const protocolFee = transfer.protocolFee || BigInt(0);
      const creatorFee = transfer.creatorFee || BigInt(0);
      const creatorFeeBps = transfer.creatorFeeBps || 30;
      
      // Get network fee
      const networkFee = tx.meta?.fee || 0;
      
      // Log warning if network fee is missing
      if (!tx.meta || networkFee === 0) {
        logger.warn({ 
          signature, 
          hasMeta: !!tx.meta,
          metaFee: tx.meta?.fee 
        }, '⚠️  Network fee is missing or zero (polling listener)');
      }

      // Fee logging
      if (transfer.creatorFee) {
        logger.info({ 
          signature,
          protocolFee: protocolFee.toString(),
          protocolFeeSol: (Number(protocolFee) / 1e9).toFixed(9),
          creatorFee: creatorFee.toString(),
          creatorFeeSol: (Number(creatorFee) / 1e9).toFixed(9),
          creatorFeeBps,
          source: 'pump_fees_program'
        }, 'Using Pump.fun fees from transaction');
      } else {
        logger.debug({ signature }, 'No Pump.fun fees found');
      }

      // Insert into database
      logger.debug({ signature }, 'Inserting into database');
      await txRawRepo.insert({
        signature,
        slot: tx.slot,
        block_time: new Date(tx.blockTime * 1000),
        from_wallet: transfer.from,
        to_wallet: transfer.to ?? undefined,
        amount: transfer.amount,
        kind: transfer.kind,
        fee: protocolFee,
        network_fee: BigInt(networkFee),
        creator_fee: creatorFee,
        creator_fee_bps: creatorFeeBps,
        status: 'finalized',
        metadata: {
          signatures: tx.transaction.signatures,
        },
      });

      logger.info(
        {
          signature,
          from: transfer.from,
          to: transfer.to,
          amount: transfer.amount.toString(),
          kind: transfer.kind,
          networkFee: (networkFee / 1e9).toFixed(9) + ' SOL',
          protocolFee: (Number(protocolFee) / 1e9).toFixed(9) + ' SOL',
          creatorFee: (Number(creatorFee) / 1e9).toFixed(9) + ' SOL'
        },
        'Saved new transaction to DB'
      );
      
      return true; // Successfully saved new transaction
    } catch (error) {
      logger.error({ error, signature }, 'Error in processTransaction');
      return false;
    }
  }

  /**
   * Backfill transactions for a specific date range
   */
  async backfillRange(startDate: Date, endDate: Date): Promise<void> {
    logger.info({ startDate, endDate }, 'Starting backfill');

    let currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      logger.info({ date: currentDate }, 'Backfilling date');
      
      try {
        await this.backfillDate(currentDate);
      } catch (error) {
        logger.error({ error, date: currentDate }, 'Error backfilling date');
      }

      // Move to next day
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    logger.info('Backfill complete');
  }

  /**
   * Backfill transactions for a specific date
   */
  private async backfillDate(date: Date): Promise<void> {
    const tokenMint = new (await import('@solana/web3.js')).PublicKey(config.santa.tokenMint);
    
    // Get all signatures for the day
    let allSignatures: any[] = [];
    let beforeSignature: string | undefined = undefined;
    
    while (true) {
      const signatures = await solanaService.getSignaturesForAddress(
        tokenMint,
        beforeSignature,
        1000
      );

      if (signatures.length === 0) {
        break;
      }

      // Filter signatures for the target date
      const dateSignatures = signatures.filter((sig) => {
        const sigDate = new Date(sig.blockTime * 1000);
        return (
          sigDate.getUTCFullYear() === date.getUTCFullYear() &&
          sigDate.getUTCMonth() === date.getUTCMonth() &&
          sigDate.getUTCDate() === date.getUTCDate()
        );
      });

      allSignatures.push(...dateSignatures);

      // Check if we've gone past the target date
      const lastSigDate = new Date(signatures[signatures.length - 1].blockTime * 1000);
      if (lastSigDate < date) {
        break;
      }

      beforeSignature = signatures[signatures.length - 1].signature;
    }

    logger.info({ date, count: allSignatures.length }, 'Found signatures for backfill');

    // Process each signature
    for (const signatureInfo of allSignatures) {
      try {
        await this.processTransaction(signatureInfo.signature);
      } catch (error) {
        logger.error(
          { error, signature: signatureInfo.signature },
          'Error processing backfill transaction'
        );
      }
    }
  }
}

export const transactionListener = new TransactionListener();

