#!/usr/bin/env tsx

/**
 * Transfer SOL from treasury to test wallets
 * Alternative to airdrop when RPC blocks airdrop requests
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
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

async function main() {
  // Use devnet RPC since we're working with test wallets
  const rpcUrl = config.solana.network === 'devnet' 
    ? config.solana.rpcDevnet 
    : config.solana.rpcPrimary;
  
  logger.info(`Network: ${config.solana.network}`);
  logger.info(`RPC URL: ${rpcUrl}`);
  
  const connection = new Connection(rpcUrl, 'confirmed');
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
  
  // Check treasury balance
  const treasuryBalance = await connection.getBalance(treasuryKeypair.publicKey);
  logger.info(`Treasury SOL balance: ${treasuryBalance / LAMPORTS_PER_SOL} SOL (${treasuryBalance} lamports)\n`);
  
  if (treasuryBalance < 0.5 * LAMPORTS_PER_SOL) {
    logger.error('Treasury has insufficient SOL. Needs at least 0.5 SOL.');
    process.exit(1);
  }
  
  // Load test wallets
  const walletsFile = path.join(__dirname, '../../data/test-wallets.json');
  if (!fs.existsSync(walletsFile)) {
    logger.error('Test wallets not found. Run "generate-tx setup" first.');
    process.exit(1);
  }
  
  const walletData = JSON.parse(fs.readFileSync(walletsFile, 'utf-8'));
  logger.info(`Found ${walletData.length} test wallets\n`);
  
  const args = process.argv.slice(2);
  const command = args[0] || 'all';
  
  if (command === 'sol' || command === 'all') {
    logger.info('💸 Transferring SOL to test wallets...\n');
    
    let successCount = 0;
    const amountPerWallet = 0.05 * LAMPORTS_PER_SOL; // 0.05 SOL each
    
    for (let i = 0; i < walletData.length; i++) {
      const wallet = walletData[i];
      logger.info(`[${i + 1}/${walletData.length}] ${wallet.name}: ${wallet.address}`);
      
      try {
        const publicKey = new PublicKey(wallet.address);
        const balance = await connection.getBalance(publicKey);
        
        if (balance > 0.01 * LAMPORTS_PER_SOL) {
          logger.info(`  ✅ Has ${balance / LAMPORTS_PER_SOL} SOL, skipping\n`);
          successCount++;
          continue;
        }
        
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: treasuryKeypair.publicKey,
            toPubkey: publicKey,
            lamports: amountPerWallet,
          })
        );
        
        const signature = await connection.sendTransaction(transaction, [treasuryKeypair]);
        await connection.confirmTransaction(signature);
        
        logger.info(`  ✅ Sent 0.05 SOL`);
        logger.info(`  📝 Signature: ${signature}\n`);
        successCount++;
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        logger.error(`  ❌ Failed: ${error.message}\n`);
      }
    }
    
    logger.info(`✅ SOL transfer complete: ${successCount}/${walletData.length} successful\n`);
  }
  
  if (command === 'tokens' || command === 'all') {
    logger.info('🪙 Distributing SANTA tokens...\n');
    
    // Get treasury token account
    const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair,
      tokenMint,
      treasuryKeypair.publicKey
    );
    
    logger.info(`Treasury token account: ${treasuryTokenAccount.address.toBase58()}`);
    
    // Check treasury balance
    const treasuryTokenBalance = await getAccount(connection, treasuryTokenAccount.address);
    logger.info(`Treasury token balance: ${Number(treasuryTokenBalance.amount) / 1e9} SANTA\n`);
    
    if (Number(treasuryTokenBalance.amount) < 10_000_000 * 1e9) {
      logger.warn('⚠️  Treasury has less than 10M tokens');
    }
    
    let successCount = 0;
    for (let i = 0; i < walletData.length; i++) {
      const wallet = walletData[i];
      logger.info(`[${i + 1}/${walletData.length}] ${wallet.name}`);
      
      try {
        const keypair = Keypair.fromSecretKey(Uint8Array.from(wallet.secretKey));
        
        // Check if wallet has SOL
        const balance = await connection.getBalance(keypair.publicKey);
        if (balance < 0.001 * LAMPORTS_PER_SOL) {
          logger.warn(`  ⚠️  Insufficient SOL (${balance / LAMPORTS_PER_SOL}), skipping\n`);
          continue;
        }
        
        // Create or get token account (treasury pays for this)
        const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
          connection,
          treasuryKeypair, // Treasury pays rent
          tokenMint,
          keypair.publicKey
        );
        
        logger.info(`  Token account: ${recipientTokenAccount.address.toBase58()}`);
        
        // Check if already has tokens
        const accountInfo = await getAccount(connection, recipientTokenAccount.address);
        if (Number(accountInfo.amount) > 100_000 * 1e9) {
          logger.info(`  ✅ Has ${Number(accountInfo.amount) / 1e9} tokens, skipping\n`);
          successCount++;
          continue;
        }
        
        // Random amount between 1M and 5M tokens
        const amount = BigInt(Math.floor(Math.random() * 4_000_000 + 1_000_000)) * BigInt(1e9);
        
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
        
        logger.info(`  ✅ Sent ${Number(amount) / 1e9} SANTA tokens`);
        logger.info(`  📝 Signature: ${signature}\n`);
        successCount++;
        
        // Small delay
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error: any) {
        logger.error(`  ❌ Failed: ${error.message}\n`);
      }
    }
    
    logger.info(`✅ Token distribution complete: ${successCount}/${walletData.length} successful\n`);
  }
  
  logger.info('🎉 Setup complete! You can now generate transactions with:');
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


