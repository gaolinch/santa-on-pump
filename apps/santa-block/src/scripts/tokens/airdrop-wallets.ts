#!/usr/bin/env tsx

/**
 * Airdrop SOL and distribute SANTA tokens to test wallets
 * This script handles rate limits better by processing wallets slowly
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { 
  getOrCreateAssociatedTokenAccount, 
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { Transaction } from '@solana/web3.js';

async function airdropWithRetry(
  connection: Connection, 
  publicKey: PublicKey, 
  amount: number,
  maxRetries: number = 3
): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      logger.info(`Attempting airdrop to ${publicKey.toBase58()} (attempt ${i + 1}/${maxRetries})`);
      const signature = await connection.requestAirdrop(publicKey, amount);
      await connection.confirmTransaction(signature);
      logger.info(`✅ Airdropped ${amount / 1e9} SOL`);
      return true;
    } catch (error: any) {
      logger.warn(`Airdrop attempt ${i + 1} failed: ${error.message}`);
      if (i < maxRetries - 1) {
        const delay = (i + 1) * 5000; // Increasing delay: 5s, 10s, 15s
        logger.info(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

async function main() {
  const connection = new Connection(config.solana.rpcPrimary, 'confirmed');
  const tokenMint = new PublicKey(config.santa.tokenMint);
  
  // Load treasury keypair
  const treasuryKeyPath = path.join(process.env.HOME!, '.config/solana/devnet-keypair.json');
  if (!fs.existsSync(treasuryKeyPath)) {
    logger.error(`Treasury keypair not found at ${treasuryKeyPath}`);
    process.exit(1);
  }
  
  const treasuryKeyData = JSON.parse(fs.readFileSync(treasuryKeyPath, 'utf-8'));
  const treasuryKeypair = Keypair.fromSecretKey(Uint8Array.from(treasuryKeyData));
  
  logger.info(`Treasury: ${treasuryKeypair.publicKey.toBase58()}`);
  
  // Load test wallets
  const walletsFile = path.join(__dirname, '../../data/test-wallets.json');
  if (!fs.existsSync(walletsFile)) {
    logger.error('Test wallets not found. Run "generate-tx setup" first.');
    process.exit(1);
  }
  
  const walletData = JSON.parse(fs.readFileSync(walletsFile, 'utf-8'));
  logger.info(`Found ${walletData.length} test wallets`);
  
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  if (command === 'sol' || command === 'all') {
    logger.info('\n📥 Airdropping SOL to wallets...\n');
    
    let successCount = 0;
    for (let i = 0; i < walletData.length; i++) {
      const wallet = walletData[i];
      logger.info(`\n[${i + 1}/${walletData.length}] Processing ${wallet.name}`);
      
      const publicKey = new PublicKey(wallet.address);
      const balance = await connection.getBalance(publicKey);
      
      if (balance > 0.1 * 1e9) {
        logger.info(`✅ Already has ${balance / 1e9} SOL, skipping`);
        successCount++;
      } else {
        const success = await airdropWithRetry(connection, publicKey, 0.5 * 1e9);
        if (success) {
          successCount++;
        } else {
          logger.error(`❌ Failed to airdrop to ${wallet.name}`);
        }
        
        // Rate limit protection: wait between wallets
        if (i < walletData.length - 1) {
          logger.info('Waiting 3s before next wallet...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    logger.info(`\n✅ SOL airdrop complete: ${successCount}/${walletData.length} successful\n`);
    
    if (successCount < walletData.length) {
      logger.warn('Some airdrops failed. You can:');
      logger.warn('1. Wait a few minutes and run this script again');
      logger.warn('2. Use Devnet faucet: https://faucet.solana.com/');
      logger.warn('3. Continue anyway - failed wallets will be skipped');
    }
  }
  
  if (command === 'tokens' || command === 'all') {
    logger.info('\n🪙 Distributing SANTA tokens...\n');
    
    // Get treasury token account
    const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair,
      tokenMint,
      treasuryKeypair.publicKey
    );
    
    logger.info(`Treasury token account: ${treasuryTokenAccount.address.toBase58()}`);
    
    // Check treasury balance
    const treasuryBalance = await getAccount(connection, treasuryTokenAccount.address);
    logger.info(`Treasury balance: ${Number(treasuryBalance.amount) / 1e9} tokens\n`);
    
    let successCount = 0;
    for (let i = 0; i < walletData.length; i++) {
      const wallet = walletData[i];
      logger.info(`\n[${i + 1}/${walletData.length}] Processing ${wallet.name}`);
      
      try {
        const keypair = Keypair.fromSecretKey(Uint8Array.from(wallet.secretKey));
        
        // Check if wallet has SOL
        const balance = await connection.getBalance(keypair.publicKey);
        if (balance < 0.01 * 1e9) {
          logger.warn(`⚠️  Insufficient SOL (${balance / 1e9}), skipping`);
          continue;
        }
        
        // Create or get token account
        const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          treasuryKeypair,
          tokenMint,
          keypair.publicKey
        );
        
        logger.info(`Token account: ${recipientTokenAccount.address.toBase58()}`);
        
        // Check if already has tokens
        const accountInfo = await getAccount(connection, recipientTokenAccount.address);
        if (Number(accountInfo.amount) > 100000 * 1e9) {
          logger.info(`✅ Already has ${Number(accountInfo.amount) / 1e9} tokens, skipping`);
          successCount++;
          continue;
        }
        
        // Random amount between 1M and 10M tokens
        const amount = BigInt(Math.floor(Math.random() * 9_000_000 + 1_000_000)) * BigInt(1e9);
        
        const transaction = new Transaction().add(
          createTransferInstruction(
            treasuryTokenAccount.address,
            recipientTokenAccount.address,
            treasuryKeypair.publicKey,
            amount,
            [],
            TOKEN_PROGRAM_ID
          )
        );
        
        const signature = await connection.sendTransaction(
          transaction,
          [treasuryKeypair]
        );
        await connection.confirmTransaction(signature);
        
        logger.info(`✅ Sent ${Number(amount) / 1e9} tokens`);
        logger.info(`   Signature: ${signature}`);
        successCount++;
        
        // Rate limit protection
        if (i < walletData.length - 1) {
          logger.info('Waiting 2s before next wallet...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error: any) {
        logger.error(`❌ Failed to distribute tokens: ${error.message}`);
      }
    }
    
    logger.info(`\n✅ Token distribution complete: ${successCount}/${walletData.length} successful\n`);
  }
  
  logger.info('\n🎉 Setup complete! You can now generate transactions with:');
  logger.info('   yarn workspace @santa/block generate-tx generate 3\n');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error({ error }, 'Script failed');
      process.exit(1);
    });
}


