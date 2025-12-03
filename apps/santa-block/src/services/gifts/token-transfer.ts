/**
 * Token Transfer Service
 * 
 * Handles SPL token transfers from AIRDROP_WALLET to winners
 * All airdrops are sent from the airdrop wallet (not treasury)
 * Supports both single-sig and multi-sig wallets
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { solanaService } from '../solana';
import * as bs58 from 'bs58';

export interface TransferResult {
  signature: string;
  success: boolean;
  error?: string;
}

export class TokenTransferService {
  private airdropKeypair: Keypair | null = null;
  private tokenMint: PublicKey;
  private decimals: number;
  private tokenProgramId: PublicKey | null = null; // Will be detected dynamically

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

    // Load airdrop wallet keypair if available (only required for real mode)
    if (!isDryRun) {
      this.loadAirdropKeypair();
    } else {
      logger.info('DRY RUN mode: Skipping airdrop wallet keypair loading');
    }
  }

  /**
   * Load airdrop wallet keypair from environment variable
   * All airdrops must be sent from AIRDROP_WALLET
   */
  private loadAirdropKeypair(): void {
    try {
      // First try AIRDROP_WALLET_PRIVATE_KEY
      let privateKeyBase58 = process.env.AIRDROP_WALLET_PRIVATE_KEY;
      
      // Fallback to SANTA_TREASURY_PRIVATE_KEY if airdrop key not configured
      if (!privateKeyBase58) {
        logger.warn('AIRDROP_WALLET_PRIVATE_KEY not set. Falling back to SANTA_TREASURY_PRIVATE_KEY.');
        privateKeyBase58 = process.env.SANTA_TREASURY_PRIVATE_KEY;
      }
      
      if (!privateKeyBase58) {
        logger.warn('AIRDROP_WALLET_PRIVATE_KEY and SANTA_TREASURY_PRIVATE_KEY not set. Token transfers will not work.');
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
        secretKey = bs58.decode(privateKeyBase58);
      }

      this.airdropKeypair = Keypair.fromSecretKey(secretKey);

      // Validate that the keypair matches the configured airdrop wallet
      if (config.santa.airdropWallet) {
        const expectedPubkey = new PublicKey(config.santa.airdropWallet);
        if (!this.airdropKeypair.publicKey.equals(expectedPubkey)) {
          logger.error({
            expected: expectedPubkey.toBase58(),
            actual: this.airdropKeypair.publicKey.toBase58(),
          }, 'Airdrop keypair does not match AIRDROP_WALLET');
          this.airdropKeypair = null;
          return;
        }
      }

      logger.info({
        publicKey: this.airdropKeypair.publicKey.toBase58(),
        walletType: config.santa.airdropWallet ? 'AIRDROP_WALLET' : 'SANTA_TREASURY_WALLET (fallback)',
      }, 'Airdrop wallet keypair loaded successfully');

    } catch (error) {
      logger.error({ error }, 'Failed to load airdrop wallet keypair');
      this.airdropKeypair = null;
    }
  }

  /**
   * Check if token transfers are available
   */
  isAvailable(): boolean {
    return this.airdropKeypair !== null;
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
    // Validate recipient wallet address format first
    let recipient: PublicKey;
    try {
      recipient = new PublicKey(recipientWallet);
      // Verify it's a valid base58 address by encoding it back
      const encoded = recipient.toBase58();
      if (encoded !== recipientWallet) {
        throw new Error(`Invalid wallet address format: ${recipientWallet}`);
      }
    } catch (error: any) {
      logger.error({
        recipientWallet,
        error: error.message,
      }, 'Invalid recipient wallet address');
      return {
        signature: '',
        success: false,
        error: `Invalid recipient wallet address: ${error.message}`,
      };
    }

    const transferMode = config.santa.transferMode;
    const isDryRun = transferMode === 'dryrun';

    if (!this.airdropKeypair && !isDryRun) {
      const error = 'Airdrop wallet keypair not loaded. Cannot transfer tokens. Check AIRDROP_WALLET_PRIVATE_KEY configuration.';
      logger.error(error);
      return { signature: '', success: false, error };
    }

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
        airdropWallet: config.santa.airdropWallet || this.airdropKeypair?.publicKey.toBase58() || 'not configured',
      }, '✅ DRY RUN: Would transfer tokens from airdrop wallet (no actual transfer executed)');

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
          sourceWallet: this.airdropKeypair?.publicKey.toBase58(),
        }, '✅ Token transfer successful from airdrop wallet');

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
   * Detect which token program the token uses (Token Program or Token 2022)
   */
  private async detectTokenProgram(connection: Connection): Promise<PublicKey> {
    if (this.tokenProgramId) {
      return this.tokenProgramId;
    }

    try {
      const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
      
      // Check mint account owner to determine which program it uses
      const mintInfo = await connection.getAccountInfo(this.tokenMint);
      if (!mintInfo) {
        throw new Error(`Token mint ${this.tokenMint.toBase58()} not found`);
      }

      // Token 2022 Program owns Token 2022 mints
      if (mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
        this.tokenProgramId = TOKEN_2022_PROGRAM_ID;
        logger.info({
          tokenMint: this.tokenMint.toBase58(),
          program: 'Token 2022',
        }, 'Detected Token 2022 Program');
        return TOKEN_2022_PROGRAM_ID;
      } else {
        // Standard Token Program
        this.tokenProgramId = TOKEN_PROGRAM_ID;
        logger.info({
          tokenMint: this.tokenMint.toBase58(),
          program: 'Token Program',
        }, 'Detected standard Token Program');
        return TOKEN_PROGRAM_ID;
      }
    } catch (error: any) {
      logger.warn({
        error: error.message,
        tokenMint: this.tokenMint.toBase58(),
      }, 'Failed to detect token program, defaulting to Token Program');
      // Default to standard Token Program
      this.tokenProgramId = TOKEN_PROGRAM_ID;
      return TOKEN_PROGRAM_ID;
    }
  }

  /**
   * Execute the actual token transfer from airdrop wallet
   */
  private async executeTransfer(
    recipient: PublicKey,
    amount: bigint
  ): Promise<string> {
    if (!this.airdropKeypair) {
      throw new Error('Airdrop wallet keypair not available');
    }

    const connection = await solanaService.getConnection();
    
    // Detect which token program to use
    const tokenProgramId = await this.detectTokenProgram(connection);

    // Find the airdrop wallet's actual token account (may not be ATA)
    let airdropTokenAccount: PublicKey;
    try {
      // First try the associated token account
      const ataAddress = await getAssociatedTokenAddress(
        this.tokenMint,
        this.airdropKeypair.publicKey
      );
      
      // Check if ATA exists
      try {
        await getAccount(connection, ataAddress);
        airdropTokenAccount = ataAddress;
        logger.debug({
          airdropTokenAccount: airdropTokenAccount.toBase58(),
          type: 'ATA',
        }, 'Using associated token account');
      } catch (error: any) {
        // ATA doesn't exist, find all token accounts for this wallet
        // Catch any error from getAccount (TokenAccountNotFoundError, etc.)
        logger.debug({
          errorName: error.name,
          errorMessage: error.message,
          ataAddress: ataAddress.toBase58(),
        }, 'ATA check failed, searching for token accounts');
        
        const tokenAccountsResponse = await connection.getParsedTokenAccountsByOwner(
          this.airdropKeypair.publicKey,
          { mint: this.tokenMint }
        );
        
        if (tokenAccountsResponse.value.length > 0) {
          // Use the first token account that has this mint
          airdropTokenAccount = tokenAccountsResponse.value[0].pubkey;
          logger.debug({
            airdropTokenAccount: airdropTokenAccount.toBase58(),
            type: 'non-ATA',
            accountCount: tokenAccountsResponse.value.length,
          }, 'Using existing token account');
        } else {
          const errorMsg = `No token account found for airdrop wallet ${this.airdropKeypair.publicKey.toBase58()} for token mint ${this.tokenMint.toBase58()}. The airdrop wallet must have a token account with tokens before transfers can be made.`;
          logger.error({
            airdropWallet: this.airdropKeypair.publicKey.toBase58(),
            tokenMint: this.tokenMint.toBase58(),
            ataAddress: ataAddress.toBase58(),
          }, errorMsg);
          throw new Error(errorMsg);
        }
      }
    } catch (error: any) {
      // If error already has our custom message, re-throw it
      if (error.message?.includes('No token account found for airdrop wallet')) {
        throw error;
      }
      logger.error({
        error: error.message,
        errorName: error.name,
        airdropWallet: this.airdropKeypair.publicKey.toBase58(),
        tokenMint: this.tokenMint.toBase58(),
      }, 'Failed to find airdrop wallet token account');
      throw new Error(`Airdrop wallet token account not found for ${this.airdropKeypair.publicKey.toBase58()}: ${error.message}`);
    }

    // Check airdrop wallet balance before transfer
    let airdropBalance: bigint;
    try {
      const balanceInfo = await connection.getTokenAccountBalance(airdropTokenAccount);
      airdropBalance = BigInt(balanceInfo.value.amount);
      
      logger.info({
        airdropTokenAccount: airdropTokenAccount.toBase58(),
        airdropWallet: this.airdropKeypair.publicKey.toBase58(),
        balance: airdropBalance.toString(),
        balanceTokens: (Number(airdropBalance) / Math.pow(10, this.decimals)).toFixed(2),
        transferAmount: amount.toString(),
        transferAmountTokens: (Number(amount) / Math.pow(10, this.decimals)).toFixed(2),
      }, 'Airdrop wallet token account (source) - balance check');
      
      if (airdropBalance < amount) {
        throw new Error(
          `Insufficient balance in airdrop wallet. ` +
          `Balance: ${(Number(airdropBalance) / Math.pow(10, this.decimals)).toFixed(2)} tokens, ` +
          `Required: ${(Number(amount) / Math.pow(10, this.decimals)).toFixed(2)} tokens`
        );
      }
    } catch (error: any) {
      if (error.message?.includes('Insufficient balance')) {
        throw error;
      }
      logger.error({
        error: error.message,
        airdropTokenAccount: airdropTokenAccount.toBase58(),
        airdropWallet: this.airdropKeypair.publicKey.toBase58(),
      }, 'Failed to check airdrop wallet balance');
      throw new Error(`Failed to check airdrop wallet balance: ${error.message}`);
    }

    // Get or create recipient token account
    let recipientTokenAccount: PublicKey;
    let needsAccountCreation = false;
    
    try {
      logger.debug({
        recipient: recipient.toBase58(),
        tokenMint: this.tokenMint.toBase58(),
        payer: this.airdropKeypair.publicKey.toBase58(),
      }, 'Getting or creating recipient token account');
      
      // Get the ATA address
      const ataAddress = await getAssociatedTokenAddress(
        this.tokenMint,
        recipient,
        false, // allowOwnerOffCurve
        tokenProgramId // Use the detected token program (Token or Token 2022)
      );
      
      // Try to check if account exists
      try {
        await getAccount(connection, ataAddress, 'confirmed', tokenProgramId);
        recipientTokenAccount = ataAddress;
        logger.info({
          recipientTokenAccount: recipientTokenAccount.toBase58(),
          recipient: recipient.toBase58(),
          type: 'existing',
        }, 'Using existing recipient token account');
      } catch (error: any) {
        // Account doesn't exist, we'll create it in the transaction
        recipientTokenAccount = ataAddress;
        needsAccountCreation = true;
        logger.info({
          recipientTokenAccount: recipientTokenAccount.toBase58(),
          recipient: recipient.toBase58(),
          type: 'will-create',
        }, 'Will create recipient token account in transaction');
      }
    } catch (error: any) {
      // Check if it's an invalid address error
      if (error.message?.includes('Invalid public key') || 
          error.message?.includes('invalid') ||
          error.name === 'InvalidPublicKeyError') {
        logger.error({
          recipient: recipient.toBase58(),
          error: error.message,
        }, 'Invalid recipient wallet address');
        throw new Error(`Invalid recipient wallet address "${recipient.toBase58()}": ${error.message}`);
      }
      
      logger.error({
        error: error.message,
        errorName: error.name,
        errorStack: error.stack,
        recipient: recipient.toBase58(),
        tokenMint: this.tokenMint.toBase58(),
        airdropWallet: this.airdropKeypair.publicKey.toBase58(),
      }, 'Failed to get or create recipient token account');
      throw new Error(`Failed to get or create recipient token account for ${recipient.toBase58()}: ${error.message || error.name}`);
    }

    // Create transfer instruction using the detected token program
    const transferInstruction = createTransferInstruction(
      airdropTokenAccount,            // Source: AIRDROP_WALLET
      recipientTokenAccount,           // Destination: recipient
      this.airdropKeypair.publicKey, // Authority: airdrop wallet
      amount,                         // Amount
      [],                             // Multi-sig signers (empty for single-sig)
      tokenProgramId                  // Use detected token program (Token Program or Token 2022)
    );

    // Build transaction with memo instruction (matching external program structure)
    const transaction = new Transaction();
    
    // Add account creation instruction if needed (before transfer)
    if (needsAccountCreation) {
      const createAccountInstruction = createAssociatedTokenAccountInstruction(
        this.airdropKeypair.publicKey, // Payer
        recipientTokenAccount,          // ATA address
        recipient,                      // Owner
        this.tokenMint,                 // Mint
        tokenProgramId                  // Token program (Token or Token 2022)
      );
      transaction.add(createAccountInstruction);
      logger.debug({
        recipientTokenAccount: recipientTokenAccount.toBase58(),
        recipient: recipient.toBase58(),
      }, 'Added account creation instruction to transaction');
    }
    
    // Add memo instruction (Memo Program v2: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr)
    // This matches the external program's transaction structure
    const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
    const memoText = 'Merry Christmas ! We love $SANTA';
    const memoData = Buffer.from(memoText, 'utf8');
    const memoInstruction = new TransactionInstruction({
      keys: [{ pubkey: this.airdropKeypair.publicKey, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: memoData,
    });
    
    transaction.add(memoInstruction);
    transaction.add(transferInstruction);
    
    logger.debug({
      memoText,
      memoProgram: MEMO_PROGRAM_ID.toBase58(),
      instructionCount: transaction.instructions.length,
    }, 'Transaction built with memo instruction (matching external program structure)');

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.airdropKeypair.publicKey;

    logger.debug({
      blockhash,
      lastValidBlockHeight,
      sourceWallet: this.airdropKeypair.publicKey.toBase58(),
    }, 'Transaction prepared (from airdrop wallet)');

    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [this.airdropKeypair],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    return signature;
  }

  /**
   * Get airdrop wallet token balance
   */
  async getAirdropBalance(): Promise<bigint> {
    if (!this.airdropKeypair) {
      throw new Error('Airdrop wallet keypair not available');
    }

    const connection = await solanaService.getConnection();

    const airdropTokenAccount = await getAssociatedTokenAddress(
      this.tokenMint,
      this.airdropKeypair.publicKey
    );

    try {
      const accountInfo = await connection.getTokenAccountBalance(airdropTokenAccount);
      return BigInt(accountInfo.value.amount);
    } catch (error) {
      logger.error({ error }, 'Failed to get airdrop wallet balance');
      return BigInt(0);
    }
  }

  /**
   * Get treasury token balance (deprecated - kept for backward compatibility)
   * @deprecated Use getAirdropBalance() instead
   */
  async getTreasuryBalance(): Promise<bigint> {
    return this.getAirdropBalance();
  }

  /**
   * Validate that recipient can receive tokens
   */
  async validateRecipient(recipientWallet: string): Promise<boolean> {
    try {
      // For token transfers, we only need to validate the PublicKey format
      // The associated token account will be created automatically if it doesn't exist
      const recipient = new PublicKey(recipientWallet);
      return true;
    } catch (error) {
      logger.error({ error, recipient: recipientWallet }, 'Failed to validate recipient - invalid PublicKey format');
      return false;
    }
  }
}

// Singleton instance
export const tokenTransferService = new TokenTransferService();

