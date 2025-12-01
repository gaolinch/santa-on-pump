#!/usr/bin/env tsx

/**
 * Generate Test Transactions for SANTA Token
 * 
 * This script creates realistic transaction patterns for testing:
 * - Multiple buyers and sellers
 * - Varying transaction amounts
 * - Transactions across multiple days
 * - Different time windows (for time-based gifts)
 * - Top buyers/sellers scenarios
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { 
  getOrCreateAssociatedTokenAccount, 
  createTransferInstruction,
  TOKEN_PROGRAM_ID 
} from '@solana/spl-token';
import { config } from '../config';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface TestWallet {
  keypair: Keypair;
  name: string;
}

interface TransactionPattern {
  fromWallet: string;
  toWallet: string;
  amount: number;
  day: number;
  hour: number;
  minute: number;
}

class TransactionGenerator {
  private connection: Connection;
  private tokenMint: PublicKey;
  private treasuryKeypair: Keypair;
  public testWallets: TestWallet[] = [];

  constructor() {
    // Use devnet RPC for testing
    const rpcUrl = config.solana.network === 'devnet' 
      ? config.solana.rpcDevnet 
      : config.solana.rpcPrimary;
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.tokenMint = new PublicKey(config.santa.tokenMint);
    
    // Load treasury keypair (assumes you have the private key file)
    const treasuryKeyPath = path.join(process.env.HOME!, '.config/solana/devnet-keypair.json');
    const treasuryKeyData = JSON.parse(fs.readFileSync(treasuryKeyPath, 'utf-8'));
    this.treasuryKeypair = Keypair.fromSecretKey(Uint8Array.from(treasuryKeyData));
  }

  /**
   * Create test wallets
   */
  async createTestWallets(count: number): Promise<void> {
    logger.info({ count }, 'Creating test wallets');

    for (let i = 0; i < count; i++) {
      const keypair = Keypair.generate();
      this.testWallets.push({
        keypair,
        name: `wallet_${i + 1}`,
      });

      logger.info({ 
        name: `wallet_${i + 1}`, 
        address: keypair.publicKey.toBase58() 
      }, 'Created wallet');
    }

    // Save wallet info
    const walletInfo = this.testWallets.map(w => ({
      name: w.name,
      address: w.keypair.publicKey.toBase58(),
      secretKey: Array.from(w.keypair.secretKey),
    }));

    // Save to multiple locations for safety
    const dataDir = path.join(__dirname, '../../data');
    const secretDir = path.join(__dirname, '../../.secret');
    
    // Ensure directories exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(secretDir)) {
      fs.mkdirSync(secretDir, { recursive: true });
    }

    // Save to data directory (primary location)
    fs.writeFileSync(
      path.join(dataDir, 'test-wallets.json'),
      JSON.stringify(walletInfo, null, 2)
    );

    // Save backup to .secret directory
    fs.writeFileSync(
      path.join(secretDir, 'test-wallets-backup.json'),
      JSON.stringify(walletInfo, null, 2)
    );

    // Save human-readable summary
    const summary = this.testWallets.map(w => 
      `${w.name}: ${w.keypair.publicKey.toBase58()}`
    ).join('\n');
    
    fs.writeFileSync(
      path.join(dataDir, 'test-wallets-addresses.txt'),
      `Santa Test Wallets (Devnet)\n${'='.repeat(50)}\n\n${summary}\n`
    );

    logger.info('✅ Test wallets saved to:');
    logger.info('   - data/test-wallets.json (main)');
    logger.info('   - .secret/test-wallets-backup.json (backup)');
    logger.info('   - data/test-wallets-addresses.txt (addresses only)');
  }

  /**
   * Airdrop SOL to test wallets for gas fees
   */
  async airdropToWallets(): Promise<void> {
    logger.info('Airdropping SOL to test wallets');

    for (const wallet of this.testWallets) {
      try {
        const signature = await this.connection.requestAirdrop(
          wallet.keypair.publicKey,
          0.5 * 1e9 // 0.5 SOL
        );
        await this.connection.confirmTransaction(signature);
        logger.info({ name: wallet.name }, 'Airdropped 0.5 SOL');
        
        // Wait to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error({ error, name: wallet.name }, 'Airdrop failed');
      }
    }
  }

  /**
   * Create token accounts for all test wallets
   */
  async createTokenAccounts(): Promise<void> {
    logger.info('Creating token accounts');

    for (const wallet of this.testWallets) {
      try {
        await getOrCreateAssociatedTokenAccount(
          this.connection,
          this.treasuryKeypair,
          this.tokenMint,
          wallet.keypair.publicKey
        );
        logger.info({ name: wallet.name }, 'Created token account');
        
        // Wait to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error({ error, name: wallet.name }, 'Failed to create token account');
      }
    }
  }

  /**
   * Distribute initial tokens to test wallets
   */
  async distributeInitialTokens(): Promise<void> {
    logger.info('Distributing initial tokens to test wallets');

    const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
      this.connection,
      this.treasuryKeypair,
      this.tokenMint,
      this.treasuryKeypair.publicKey
    );

    for (const wallet of this.testWallets) {
      try {
        const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
          this.connection,
          this.treasuryKeypair,
          this.tokenMint,
          wallet.keypair.publicKey
        );

        // Give varying amounts (1M to 10M tokens)
        const amount = Math.floor(Math.random() * 9_000_000 + 1_000_000) * 1e9;

        const transaction = new Transaction().add(
          createTransferInstruction(
            treasuryTokenAccount.address,
            recipientTokenAccount.address,
            this.treasuryKeypair.publicKey,
            amount,
            [],
            TOKEN_PROGRAM_ID
          )
        );

        const signature = await this.connection.sendTransaction(
          transaction,
          [this.treasuryKeypair]
        );
        await this.connection.confirmTransaction(signature);

        logger.info({ 
          name: wallet.name, 
          amount: amount / 1e9,
          signature 
        }, 'Distributed tokens');

        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error({ error, name: wallet.name }, 'Failed to distribute tokens');
      }
    }
  }

  /**
   * Generate transaction patterns for testing
   */
  generateTransactionPatterns(days: number = 3): TransactionPattern[] {
    const patterns: TransactionPattern[] = [];

    for (let day = 1; day <= days; day++) {
      // Morning transactions (small amounts)
      for (let i = 0; i < 5; i++) {
        const from = this.testWallets[Math.floor(Math.random() * this.testWallets.length)];
        const to = this.testWallets[Math.floor(Math.random() * this.testWallets.length)];
        if (from !== to) {
          patterns.push({
            fromWallet: from.name,
            toWallet: to.name,
            amount: Math.floor(Math.random() * 100_000 + 10_000),
            day,
            hour: Math.floor(Math.random() * 6 + 6), // 6-12 AM
            minute: Math.floor(Math.random() * 60),
          });
        }
      }

      // Midday transactions (medium amounts)
      for (let i = 0; i < 8; i++) {
        const from = this.testWallets[Math.floor(Math.random() * this.testWallets.length)];
        const to = this.testWallets[Math.floor(Math.random() * this.testWallets.length)];
        if (from !== to) {
          patterns.push({
            fromWallet: from.name,
            toWallet: to.name,
            amount: Math.floor(Math.random() * 500_000 + 100_000),
            day,
            hour: Math.floor(Math.random() * 6 + 12), // 12-6 PM
            minute: Math.floor(Math.random() * 60),
          });
        }
      }

      // Create "top buyer" - one wallet buys large amounts
      const topBuyer = this.testWallets[day % this.testWallets.length];
      const seller = this.testWallets[(day + 1) % this.testWallets.length];
      patterns.push({
        fromWallet: seller.name,
        toWallet: topBuyer.name,
        amount: Math.floor(Math.random() * 2_000_000 + 1_000_000), // 1-3M tokens
        day,
        hour: Math.floor(Math.random() * 4 + 14), // 2-6 PM
        minute: Math.floor(Math.random() * 60),
      });

      // Evening transactions (varied amounts)
      for (let i = 0; i < 6; i++) {
        const from = this.testWallets[Math.floor(Math.random() * this.testWallets.length)];
        const to = this.testWallets[Math.floor(Math.random() * this.testWallets.length)];
        if (from !== to) {
          patterns.push({
            fromWallet: from.name,
            toWallet: to.name,
            amount: Math.floor(Math.random() * 300_000 + 50_000),
            day,
            hour: Math.floor(Math.random() * 4 + 18), // 6-10 PM
            minute: Math.floor(Math.random() * 60),
          });
        }
      }

      // Last minute transactions (for "last second hour" gifts)
      for (let i = 0; i < 3; i++) {
        const from = this.testWallets[Math.floor(Math.random() * this.testWallets.length)];
        const to = this.testWallets[Math.floor(Math.random() * this.testWallets.length)];
        if (from !== to) {
          patterns.push({
            fromWallet: from.name,
            toWallet: to.name,
            amount: Math.floor(Math.random() * 100_000 + 20_000),
            day,
            hour: 23,
            minute: Math.floor(Math.random() * 15 + 45), // 23:45 - 23:59
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Execute transactions based on patterns
   * Note: This simulates transactions but executes them now
   * Real backdate would require system time manipulation or manual DB insertion
   */
  async executeTransactions(patterns: TransactionPattern[]): Promise<void> {
    logger.info({ count: patterns.length }, 'Executing test transactions');

    for (const pattern of patterns) {
      try {
        const fromWallet = this.testWallets.find(w => w.name === pattern.fromWallet);
        const toWallet = this.testWallets.find(w => w.name === pattern.toWallet);

        if (!fromWallet || !toWallet) {
          logger.warn({ pattern }, 'Wallet not found');
          continue;
        }

        const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
          this.connection,
          fromWallet.keypair,
          this.tokenMint,
          fromWallet.keypair.publicKey
        );

        const toTokenAccount = await getOrCreateAssociatedTokenAccount(
          this.connection,
          fromWallet.keypair,
          this.tokenMint,
          toWallet.keypair.publicKey
        );

        const amount = BigInt(pattern.amount) * BigInt(1e9);

        const transaction = new Transaction().add(
          createTransferInstruction(
            fromTokenAccount.address,
            toTokenAccount.address,
            fromWallet.keypair.publicKey,
            amount,
            [],
            TOKEN_PROGRAM_ID
          )
        );

        const signature = await this.connection.sendTransaction(
          transaction,
          [fromWallet.keypair]
        );
        await this.connection.confirmTransaction(signature);

        logger.info({
          from: pattern.fromWallet,
          to: pattern.toWallet,
          amount: pattern.amount,
          day: pattern.day,
          time: `${pattern.hour}:${pattern.minute}`,
          signature,
        }, 'Transaction executed');

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        logger.error({ error, pattern }, 'Transaction failed');
      }
    }
  }

  /**
   * Generate SQL for backdated transactions
   */
  generateBackdatedSQL(patterns: TransactionPattern[]): string {
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    let sql = '-- Backdated test transactions for Santa\n\n';

    for (const pattern of patterns) {
      const fromWallet = this.testWallets.find(w => w.name === pattern.fromWallet);
      const toWallet = this.testWallets.find(w => w.name === pattern.toWallet);

      if (!fromWallet || !toWallet) continue;

      const txDate = new Date(baseDate);
      txDate.setDate(txDate.getDate() - (3 - pattern.day)); // Go back in time
      txDate.setHours(pattern.hour, pattern.minute, 0, 0);

      const signature = `test_sig_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const slot = 380000000 + Math.floor(Math.random() * 100000);

      sql += `INSERT INTO tx_raw (signature, slot, block_time, from_wallet, to_wallet, amount, kind, fee, status) VALUES\n`;
      sql += `('${signature}', ${slot}, '${txDate.toISOString()}', '${fromWallet.keypair.publicKey.toBase58()}', '${toWallet.keypair.publicKey.toBase58()}', ${BigInt(pattern.amount) * BigInt(1e9)}, 'transfer', ${BigInt(3e7)}, 'finalized')\n`;
      sql += `ON CONFLICT (signature) DO NOTHING;\n\n`;
    }

    return sql;
  }
}

async function main() {
  const generator = new TransactionGenerator();

  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    switch (command) {
      case 'setup':
        // Create wallets, airdrop SOL, create token accounts
        await generator.createTestWallets(10);
        await generator.airdropToWallets();
        await generator.createTokenAccounts();
        await generator.distributeInitialTokens();
        logger.info('✅ Setup complete! Test wallets ready.');
        break;

      case 'generate':
        // Generate and execute transactions
        const days = parseInt(args[1]) || 3;
        
        // Load existing wallets
        const walletsFileGen = path.join(__dirname, '../../data/test-wallets.json');
        if (!fs.existsSync(walletsFileGen)) {
          logger.error('Test wallets not found. Run "setup" first.');
          process.exit(1);
        }
        
        const walletDataGen = JSON.parse(fs.readFileSync(walletsFileGen, 'utf-8'));
        generator.testWallets = walletDataGen.map((w: any) => ({
          keypair: Keypair.fromSecretKey(Uint8Array.from(w.secretKey)),
          name: w.name,
        }));
        
        logger.info({ count: generator.testWallets.length }, 'Loaded test wallets');
        
        const patterns = generator.generateTransactionPatterns(days);
        await generator.executeTransactions(patterns);
        logger.info('✅ Transactions generated!');
        break;

      case 'sql':
        // Generate SQL for backdated transactions
        const sqlDays = parseInt(args[1]) || 3;
        
        // Load existing wallets
        const walletsFile = path.join(__dirname, '../../data/test-wallets.json');
        if (!fs.existsSync(walletsFile)) {
          logger.error('Test wallets not found. Run "setup" first.');
          process.exit(1);
        }
        
        const walletData = JSON.parse(fs.readFileSync(walletsFile, 'utf-8'));
        generator.testWallets = walletData.map((w: any) => ({
          keypair: Keypair.fromSecretKey(Uint8Array.from(w.secretKey)),
          name: w.name,
        }));
        
        logger.info({ count: generator.testWallets.length }, 'Loaded test wallets');
        
        const sqlPatterns = generator.generateTransactionPatterns(sqlDays);
        const sql = generator.generateBackdatedSQL(sqlPatterns);
        
        const sqlFile = path.join(__dirname, '../../data/backdated-transactions.sql');
        fs.writeFileSync(sqlFile, sql);
        logger.info({ file: sqlFile }, '✅ SQL file generated!');
        console.log('\nTo import backdated transactions, run:');
        console.log(`psql -U santa -d santa -f ${sqlFile}`);
        break;

      default:
        console.log(`
🎅 Santa Transaction Generator

Usage:
  yarn workspace @santa/block generate-tx <command> [options]

Commands:
  setup              Create test wallets and distribute initial tokens
  generate [days]    Generate and execute transactions (default: 3 days)
  sql [days]         Generate SQL for backdated transactions (default: 3 days)
  help               Show this help

Examples:
  yarn workspace @santa/block generate-tx setup
  yarn workspace @santa/block generate-tx generate 5
  yarn workspace @santa/block generate-tx sql 7

Notes:
  - 'setup' must be run first to create test wallets
  - 'generate' creates real transactions on-chain (takes time)
  - 'sql' creates SQL file for backdating transactions in DB
        `);
        break;
    }
  } catch (error) {
    logger.error({ error }, 'Command failed');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { TransactionGenerator };

