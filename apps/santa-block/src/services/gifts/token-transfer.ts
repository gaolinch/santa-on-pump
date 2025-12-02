/**
 * Token Transfer Service
 * 
 * Handles SPL token transfers from treasury wallet to winners
 * Supports both single-sig and multi-sig wallets
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { solanaService } from '../solana';

export interface TransferResult {
  signature: string;
  success: boolean;
  error?: string;
}

export class TokenTransferService {
  private treasuryKeypair: Keypair | null = null;
  private tokenMint: PublicKey;
  private decimals: number;

  constructor() {
    // Use PUMP_FUN_TOKEN as the token mint (as specified by user)
    const tokenMintAddress = config.solana.pumpFunToken || config.santa.tokenMint;
    if (!tokenMintAddress) {
      throw new Error('Token mint not configured. Set PUMP_FUN_TOKEN or SANTA_TOKEN_MINT');
    }

    this.tokenMint = new PublicKey(tokenMintAddress);
    
    // Use PUMP_FUN_DECIMALS (as specified by user)
    this.decimals = config.solana.pumpFunDecimals || config.santa.decimals;
    
    const transferMode = config.santa.transferMode;
    const isDryRun = transferMode === 'dryrun';
    
    logger.info({
      tokenMint: this.tokenMint.toBase58(),
      decimals: this.decimals,
      transferMode,
      dryRun: isDryRun,
    }, isDryRun 
      ? '🧪 TokenTransferService initialized in DRY RUN mode (no actual transfers)'
      : '💰 TokenTransferService initialized in REAL mode (actual transfers enabled)'
    );

    // Load treasury keypair if available (only required for real mode)
    if (!isDryRun) {
      this.loadTreasuryKeypair();
    } else {
      logger.info('DRY RUN mode: Skipping treasury keypair loading');
    }
  }

  /**
   * Load treasury keypair from environment variable
   */
  private loadTreasuryKeypair(): void {
    try {
      const privateKeyBase58 = process.env.SANTA_TREASURY_PRIVATE_KEY;
      
      if (!privateKeyBase58) {
        logger.warn('SANTA_TREASURY_PRIVATE_KEY not set. Token transfers will not work.');
        return;
      }

      // Support both base58 and JSON array formats
      let secretKey: Uint8Array;
      
      if (privateKeyBase58.startsWith('[')) {
        // JSON array format: [1,2,3,...]
        const keyArray = JSON.parse(privateKeyBase58);
        secretKey = Uint8Array.from(keyArray);
      } else {
        // Base58 format (more common)
        const bs58 = require('bs58');
        secretKey = bs58.decode(privateKeyBase58);
      }

      this.treasuryKeypair = Keypair.fromSecretKey(secretKey);

      // Validate that the keypair matches the configured treasury wallet
      if (config.santa.treasuryWallet) {
        const expectedPubkey = new PublicKey(config.santa.treasuryWallet);
        if (!this.treasuryKeypair.publicKey.equals(expectedPubkey)) {
          logger.error({
            expected: expectedPubkey.toBase58(),
            actual: this.treasuryKeypair.publicKey.toBase58(),
          }, 'Treasury keypair does not match SANTA_TREASURY_WALLET');
          this.treasuryKeypair = null;
          return;
        }
      }

      logger.info({
        publicKey: this.treasuryKeypair.publicKey.toBase58(),
      }, 'Treasury keypair loaded successfully');

    } catch (error) {
      logger.error({ error }, 'Failed to load treasury keypair');
      this.treasuryKeypair = null;
    }
  }

  /**
   * Check if token transfers are available
   */
  isAvailable(): boolean {
    return this.treasuryKeypair !== null;
  }

  /**
   * Transfer tokens to a winner
   * 
   * @param recipientWallet - Winner's wallet address
   * @param amount - Amount in token base units (e.g., lamports for 9 decimals)
   * @param maxRetries - Maximum number of retry attempts
   */
  async transferTokens(
    recipientWallet: string,
    amount: number,
    maxRetries: number = 3
  ): Promise<TransferResult> {
    const transferMode = config.santa.transferMode;
    const isDryRun = transferMode === 'dryrun';

    if (!this.treasuryKeypair && !isDryRun) {
      const error = 'Treasury keypair not loaded. Cannot transfer tokens.';
      logger.error(error);
      return { signature: '', success: false, error };
    }

    const recipient = new PublicKey(recipientWallet);
    const amountBigInt = BigInt(amount);

    logger.info({
      recipient: recipientWallet,
      amount: amount.toString(),
      amountTokens: (amount / Math.pow(10, this.decimals)).toFixed(this.decimals),
      mode: transferMode,
      dryRun: isDryRun,
    }, isDryRun ? 'DRY RUN: Simulating token transfer' : 'Starting token transfer');

    // DRY RUN MODE: Only log, don't actually transfer
    if (isDryRun) {
      logger.info({
        recipient: recipientWallet,
        amount: amount.toString(),
        amountTokens: (amount / Math.pow(10, this.decimals)).toFixed(this.decimals),
        tokenMint: this.tokenMint.toBase58(),
        treasuryWallet: config.santa.treasuryWallet,
      }, '✅ DRY RUN: Would transfer tokens (no actual transfer executed)');

      // Return mock signature for dry run
      return {
        signature: `dryrun-${Date.now()}-${recipientWallet.slice(0, 8)}`,
        success: true,
      };
    }

    // REAL MODE: Actually transfer tokens
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const signature = await this.executeTransfer(recipient, amountBigInt);
        
        logger.info({
          recipient: recipientWallet,
          amount: amount.toString(),
          signature,
          attempt,
        }, '✅ Token transfer successful');

        return { signature, success: true };

      } catch (error: any) {
        logger.warn({
          recipient: recipientWallet,
          amount: amount.toString(),
          attempt,
          maxRetries,
          error: error.message,
        }, 'Token transfer attempt failed');

        if (attempt === maxRetries) {
          logger.error({
            recipient: recipientWallet,
            amount: amount.toString(),
            error: error.message,
            stack: error.stack,
          }, '❌ Token transfer failed after all retries');

          return {
            signature: '',
            success: false,
            error: error.message,
          };
        }

        // Wait before retry (exponential backoff)
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        logger.info({ delayMs }, 'Waiting before retry');
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return {
      signature: '',
      success: false,
      error: 'Transfer failed after all retries',
    };
  }

  /**
   * Execute the actual token transfer
   */
  private async executeTransfer(
    recipient: PublicKey,
    amount: bigint
  ): Promise<string> {
    if (!this.treasuryKeypair) {
      throw new Error('Treasury keypair not available');
    }

    const connection = await solanaService.getConnection();

    // Get treasury token account
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      this.tokenMint,
      this.treasuryKeypair.publicKey
    );

    logger.debug({
      treasuryTokenAccount: treasuryTokenAccount.toBase58(),
    }, 'Treasury token account');

    // Get or create recipient token account
    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      this.treasuryKeypair, // Treasury pays for account creation
      this.tokenMint,
      recipient
    );

    logger.debug({
      recipientTokenAccount: recipientTokenAccount.address.toBase58(),
    }, 'Recipient token account');

    // Create transfer instruction
    const transferInstruction = createTransferInstruction(
      treasuryTokenAccount,           // Source
      recipientTokenAccount.address,  // Destination
      this.treasuryKeypair.publicKey, // Authority
      amount,                         // Amount
      [],                             // Multi-sig signers (empty for single-sig)
      TOKEN_PROGRAM_ID
    );

    // Build transaction
    const transaction = new Transaction().add(transferInstruction);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.treasuryKeypair.publicKey;

    logger.debug({
      blockhash,
      lastValidBlockHeight,
    }, 'Transaction prepared');

    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [this.treasuryKeypair],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    return signature;
  }

  /**
   * Get treasury token balance
   */
  async getTreasuryBalance(): Promise<bigint> {
    if (!this.treasuryKeypair) {
      throw new Error('Treasury keypair not available');
    }

    const connection = await solanaService.getConnection();

    const treasuryTokenAccount = await getAssociatedTokenAddress(
      this.tokenMint,
      this.treasuryKeypair.publicKey
    );

    try {
      const accountInfo = await connection.getTokenAccountBalance(treasuryTokenAccount);
      return BigInt(accountInfo.value.amount);
    } catch (error) {
      logger.error({ error }, 'Failed to get treasury balance');
      return BigInt(0);
    }
  }

  /**
   * Validate that recipient can receive tokens
   */
  async validateRecipient(recipientWallet: string): Promise<boolean> {
    try {
      const recipient = new PublicKey(recipientWallet);
      const connection = await solanaService.getConnection();

      // Check if wallet exists
      const accountInfo = await connection.getAccountInfo(recipient);
      if (!accountInfo) {
        logger.warn({ recipient: recipientWallet }, 'Recipient wallet does not exist');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, recipient: recipientWallet }, 'Failed to validate recipient');
      return false;
    }
  }
}

// Singleton instance
export const tokenTransferService = new TokenTransferService();

