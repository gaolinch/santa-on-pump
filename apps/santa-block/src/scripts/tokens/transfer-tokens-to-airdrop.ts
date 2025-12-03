#!/usr/bin/env tsx
/**
 * Transfer SANTA tokens from treasury to airdrop wallet
 * 
 * Usage: npx tsx src/scripts/transfer-tokens-to-airdrop.ts <amount>
 * 
 * Example: npx tsx src/scripts/transfer-tokens-to-airdrop.ts 900000
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getAccount
} from '@solana/spl-token';
import * as bs58 from 'bs58';
import * as readline from 'readline';
import { config } from '../../config';
import { solanaService } from '../services/solana';
import { logger } from '../utils/logger';

/**
 * Get user confirmation
 */
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * Get treasury keypair
 */
function getTreasuryKeypair(): Keypair {
  const privateKey = config.santa.treasuryPrivateKey;
  if (!privateKey) {
    throw new Error('SANTA_TREASURY_PRIVATE_KEY not configured in .env');
  }

  try {
    const decoded = bs58.decode(privateKey);
    return Keypair.fromSecretKey(decoded);
  } catch (error: any) {
    throw new Error(`Failed to decode treasury private key: ${error.message}`);
  }
}

/**
 * Get airdrop wallet public key
 */
function getAirdropWallet(): PublicKey {
  const airdropWallet = config.santa.airdropWallet;
  if (!airdropWallet) {
    throw new Error('AIRDROP_WALLET not configured in .env');
  }

  try {
    return new PublicKey(airdropWallet);
  } catch (error: any) {
    throw new Error(`Invalid AIRDROP_WALLET address: ${error.message}`);
  }
}

/**
 * Check token balance
 */
async function checkTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  tokenMint: PublicKey
): Promise<bigint> {
  try {
    const tokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      wallet
    );

    const accountInfo = await getAccount(connection, tokenAccount);
    return accountInfo.amount;
  } catch (error: any) {
    if (error.message?.includes('could not find account') || 
        error.message?.includes('TokenAccountNotFoundError') ||
        error.name === 'TokenAccountNotFoundError') {
      return BigInt(0);
    }
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx tsx src/scripts/transfer-tokens-to-airdrop.ts <amount>');
    console.error('Example: npx tsx src/scripts/transfer-tokens-to-airdrop.ts 900000');
    process.exit(1);
  }

  const amount = parseFloat(args[0]);
  if (isNaN(amount) || amount <= 0) {
    console.error('❌ Invalid amount. Must be a positive number.');
    process.exit(1);
  }

  console.log(`\n💰 Transferring ${amount.toLocaleString()} SANTA tokens to airdrop wallet\n`);

  // Load configuration
  const tokenMintAddress = config.santa.tokenMint || config.solana.pumpFunToken;
  if (!tokenMintAddress) {
    console.error('❌ Token mint not configured. Set SANTA_TOKEN_MINT or PUMP_FUN_TOKEN in .env');
    process.exit(1);
  }

  const tokenMint = new PublicKey(tokenMintAddress);
  const decimals = config.santa.decimals;
  const amountBaseUnits = BigInt(Math.floor(amount * (10 ** decimals)));

  console.log(`📋 Configuration:`);
  console.log(`   Token Mint: ${tokenMintAddress}`);
  console.log(`   Decimals: ${decimals}`);
  console.log(`   Amount: ${amount.toLocaleString()} tokens (${amountBaseUnits.toString()} base units)\n`);

  // Get keypairs
  const treasuryKeypair = getTreasuryKeypair();
  const airdropWallet = getAirdropWallet();

  console.log(`💰 Treasury: ${treasuryKeypair.publicKey.toBase58()}`);
  console.log(`📦 Airdrop Wallet: ${airdropWallet.toBase58()}\n`);

  // Initialize connection
  const connection = await solanaService.getConnection();

  // Check treasury SOL balance
  const treasurySolBalance = await connection.getBalance(treasuryKeypair.publicKey);
  console.log(`💵 Treasury SOL balance: ${(treasurySolBalance / 1e9).toFixed(4)} SOL`);

  if (treasurySolBalance < 0.01 * 1e9) {
    console.error('❌ Insufficient SOL in treasury. Need at least 0.01 SOL for transaction fees.');
    process.exit(1);
  }

  // Check airdrop wallet SOL balance
  const airdropSolBalance = await connection.getBalance(airdropWallet);
  console.log(`💵 Airdrop wallet SOL balance: ${(airdropSolBalance / 1e9).toFixed(4)} SOL\n`);

  // Check treasury token balance
  const treasuryTokenBalance = await checkTokenBalance(connection, treasuryKeypair.publicKey, tokenMint);
  const treasuryTokenBalanceFormatted = Number(treasuryTokenBalance) / (10 ** decimals);

  console.log(`🪙 Treasury token balance: ${treasuryTokenBalanceFormatted.toLocaleString()} tokens`);
  console.log(`📊 Amount to transfer: ${amount.toLocaleString()} tokens\n`);

  if (treasuryTokenBalance < amountBaseUnits) {
    console.error(`❌ Insufficient tokens in treasury.`);
    console.error(`   Have: ${treasuryTokenBalanceFormatted.toLocaleString()} tokens`);
    console.error(`   Need: ${amount.toLocaleString()} tokens`);
    process.exit(1);
  }

  // Confirmation
  const confirm = await askQuestion(`⚠️  Transfer ${amount.toLocaleString()} SANTA tokens from treasury to airdrop wallet? (yes/no): `);
  if (confirm.toLowerCase() !== 'yes') {
    console.log('❌ Cancelled by user');
    process.exit(0);
  }

  try {
    // Get treasury token account
    const treasuryTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      treasuryKeypair.publicKey
    );

    // Get or create airdrop wallet token account
    console.log(`\n📦 Creating/getting airdrop wallet token account...`);
    const airdropTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      treasuryKeypair, // Treasury pays for account creation
      tokenMint,
      airdropWallet
    );

    console.log(`✅ Airdrop token account: ${airdropTokenAccount.address.toBase58()}\n`);

    // Create transfer instruction
    const transaction = new Transaction();

    // Get fresh blockhash
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = treasuryKeypair.publicKey;

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        treasuryTokenAccount,
        airdropTokenAccount.address,
        treasuryKeypair.publicKey,
        amountBaseUnits,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    console.log(`🚀 Sending transfer transaction...`);

    // Send and confirm
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [treasuryKeypair],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    console.log(`\n✅ Transfer successful!`);
    console.log(`   Signature: ${signature}`);
    console.log(`   View: https://solscan.io/tx/${signature}\n`);

    // Verify new balance
    const newAirdropBalance = await checkTokenBalance(connection, airdropWallet, tokenMint);
    const newAirdropBalanceFormatted = Number(newAirdropBalance) / (10 ** decimals);
    console.log(`🪙 New airdrop wallet token balance: ${newAirdropBalanceFormatted.toLocaleString()} tokens\n`);

  } catch (error: any) {
    console.error(`\n❌ Transfer failed: ${error.message}`);
    logger.error({ error }, 'Token transfer to airdrop wallet failed');
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    logger.error({ error }, 'Token transfer script failed');
    process.exit(1);
  });

