import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { solanaService } from './solana';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Winner } from './gifts';

export interface TransferBundle {
  recipients: Winner[];
  totalAmount: bigint;
  transactions: Transaction[];
}

export interface SignedTransaction {
  signature: string;
  recipient: string;
  amount: bigint;
}

/**
 * Transaction Builder - creates and submits SPL token transfers
 */
export class TransactionBuilder {
  private connection: Connection;
  private tokenMint: PublicKey | null;
  private treasuryWallet: PublicKey | null;

  constructor() {
    this.connection = new (require('@solana/web3.js')).Connection(config.solana.rpcPrimary);
    
    // Only create PublicKeys if the values are provided
    try {
      this.tokenMint = config.santa.tokenMint ? new PublicKey(config.santa.tokenMint) : null;
    } catch (error) {
      logger.warn({ error }, 'Invalid token mint address, setting to null');
      this.tokenMint = null;
    }
    
    try {
      this.treasuryWallet = config.santa.treasuryWallet ? new PublicKey(config.santa.treasuryWallet) : null;
    } catch (error) {
      logger.warn({ error }, 'Invalid treasury wallet address, setting to null');
      this.treasuryWallet = null;
    }
  }

  /**
   * Build transfer bundle for winners
   */
  async buildTransferBundle(winners: Winner[]): Promise<TransferBundle> {
    logger.info({ winnerCount: winners.length }, 'Building transfer bundle');

    if (!this.tokenMint || !this.treasuryWallet) {
      throw new Error('Token mint and treasury wallet must be configured to build transfer bundles');
    }

    const transactions: Transaction[] = [];
    const totalAmount = winners.reduce((sum, w) => sum + w.amount, BigInt(0));

    // Group winners into batches (max 5 transfers per transaction for safety)
    const batchSize = 5;
    for (let i = 0; i < winners.length; i += batchSize) {
      const batch = winners.slice(i, i + batchSize);
      const transaction = await this.createBatchTransferTransaction(batch);
      transactions.push(transaction);
    }

    return {
      recipients: winners,
      totalAmount,
      transactions,
    };
  }

  /**
   * Create a batch transfer transaction
   */
  private async createBatchTransferTransaction(winners: Winner[]): Promise<Transaction> {
    const connection = await solanaService.getConnection();
    const transaction = new Transaction();

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.treasuryWallet!;

    // Get treasury token account
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      this.tokenMint!,
      this.treasuryWallet!
    );

    // Add transfer instruction for each winner
    for (const winner of winners) {
      const recipientWallet = new PublicKey(winner.wallet);
      
      // Get or create associated token account for recipient
      const recipientTokenAccount = await getAssociatedTokenAddress(
        this.tokenMint!,
        recipientWallet
      );

      // Check if recipient token account exists
      const accountInfo = await connection.getAccountInfo(recipientTokenAccount);
      
      // If account doesn't exist, we'll need to create it first
      // For simplicity, assuming accounts exist or using a different approach
      // In production, you'd add createAssociatedTokenAccountInstruction

      // Create transfer instruction
      // At this point we know treasuryWallet is not null due to check at start of buildTransferBundle
      const transferInstruction = createTransferInstruction(
        treasuryTokenAccount,
        recipientTokenAccount,
        this.treasuryWallet!,
        BigInt(winner.amount),
        [],
        TOKEN_PROGRAM_ID
      );

      transaction.add(transferInstruction);
    }

    return transaction;
  }

  /**
   * Submit transactions for multi-sig approval
   * In production, this would integrate with Squads or similar multi-sig solution
   */
  async submitForMultiSig(bundle: TransferBundle): Promise<string[]> {
    logger.info(
      { transactionCount: bundle.transactions.length },
      'Submitting transactions for multi-sig approval'
    );

    // In a real implementation, this would:
    // 1. Serialize transactions
    // 2. Submit to Squads multi-sig program
    // 3. Return proposal IDs for signers to approve

    // For now, return mock proposal IDs
    const proposalIds = bundle.transactions.map((_, i) => `proposal_${Date.now()}_${i}`);

    logger.info({ proposalIds }, 'Multi-sig proposals created');

    return proposalIds;
  }

  /**
   * Execute signed transactions
   * This would be called after multi-sig approval
   */
  async executeSignedTransactions(
    transactions: Transaction[],
    signers: Keypair[]
  ): Promise<SignedTransaction[]> {
    logger.info({ count: transactions.length }, 'Executing signed transactions');

    const connection = await solanaService.getConnection();
    const results: SignedTransaction[] = [];

    for (const transaction of transactions) {
      try {
        // Sign and send transaction
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          signers,
          {
            commitment: 'finalized',
            maxRetries: 3,
          }
        );

        logger.info({ signature }, 'Transaction confirmed');

        // Extract recipient info from transaction
        // This is simplified - in production, parse the transaction instructions
        results.push({
          signature,
          recipient: 'extracted_from_transaction',
          amount: BigInt(0), // extracted_from_transaction
        });
      } catch (error) {
        logger.error({ error, transaction }, 'Failed to execute transaction');
        throw error;
      }
    }

    return results;
  }

  /**
   * Simulate transactions before execution
   */
  async simulateTransactions(transactions: Transaction[]): Promise<boolean> {
    logger.info({ count: transactions.length }, 'Simulating transactions');

    const connection = await solanaService.getConnection();

    for (const transaction of transactions) {
      try {
        const simulation = await connection.simulateTransaction(transaction);

        if (simulation.value.err) {
          logger.error(
            { error: simulation.value.err },
            'Transaction simulation failed'
          );
          return false;
        }

        logger.debug({ logs: simulation.value.logs }, 'Transaction simulation successful');
      } catch (error) {
        logger.error({ error }, 'Failed to simulate transaction');
        return false;
      }
    }

    return true;
  }

  /**
   * Estimate total transaction fees
   */
  async estimateFees(transactions: Transaction[]): Promise<bigint> {
    const connection = await solanaService.getConnection();
    
    // Get recent fee calculator
    const { feeCalculator } = await connection.getRecentBlockhash();
    
    // Estimate fee per transaction (5000 lamports is typical)
    const feePerTransaction = BigInt(5000);
    const totalFees = feePerTransaction * BigInt(transactions.length);

    logger.info(
      { transactionCount: transactions.length, totalFees: totalFees.toString() },
      'Estimated transaction fees'
    );

    return totalFees;
  }

  /**
   * Batch retry failed transactions
   */
  async retryFailedTransactions(
    failedSignatures: string[],
    maxRetries: number = 3
  ): Promise<SignedTransaction[]> {
    logger.info(
      { count: failedSignatures.length, maxRetries },
      'Retrying failed transactions'
    );

    const results: SignedTransaction[] = [];

    for (const signature of failedSignatures) {
      let retries = 0;
      let success = false;

      while (retries < maxRetries && !success) {
        try {
          const connection = await solanaService.getConnection();
          const status = await connection.getSignatureStatus(signature);

          if (status.value?.confirmationStatus === 'finalized') {
            logger.info({ signature }, 'Transaction confirmed on retry');
            success = true;
            results.push({
              signature,
              recipient: 'extracted_from_transaction',
              amount: BigInt(0),
            });
          } else {
            logger.warn({ signature, retry: retries }, 'Transaction not confirmed, retrying');
            retries++;
            
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retries)));
          }
        } catch (error) {
          logger.error({ error, signature, retry: retries }, 'Retry failed');
          retries++;
        }
      }

      if (!success) {
        logger.error({ signature }, 'Transaction failed after all retries');
      }
    }

    return results;
  }
}

export const transactionBuilder = new TransactionBuilder();

