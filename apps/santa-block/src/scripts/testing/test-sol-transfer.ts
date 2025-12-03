#!/usr/bin/env tsx
/**
 * Test SOL Transfer
 * 
 * Sends a small amount of SOL to a wallet to test transfers
 * 
 * Usage:
 *   npm run test:sol-transfer -- --wallet B3yC1eToLFYdwRdeTauM6Yi6TVTugBRCycQFMLZikiS2 --amount 0.001
 */

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram,
  Keypair,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { config } from '../../config';
import { logger } from '../utils/logger';
import { solanaService } from '../services/solana';
import bs58 from 'bs58';

interface TransferOptions {
  wallet: string;
  amount: number; // Amount in SOL
}

async function testSOLTransfer(options: TransferOptions) {
  const { wallet, amount = 0.001 } = options;

  console.log('\n🧪 Testing SOL Transfer\n');

  // Validate wallet address
  let recipientPubkey: PublicKey;
  try {
    recipientPubkey = new PublicKey(wallet);
  } catch (error) {
    console.error(`❌ Invalid wallet address: ${wallet}`);
    process.exit(1);
  }

  console.log(`📤 Recipient: ${wallet}`);
  console.log(`💰 Amount: ${amount} SOL (${amount * LAMPORTS_PER_SOL} lamports)\n`);

  // Check if treasury private key is configured
  if (!config.santa.treasuryPrivateKey) {
    console.error('❌ SANTA_TREASURY_PRIVATE_KEY not configured!');
    console.error('   Set it in your .env file to enable transfers.\n');
    process.exit(1);
  }

  // Load treasury keypair
  let treasuryKeypair: Keypair;
  try {
    const privateKeyBytes = bs58.decode(config.santa.treasuryPrivateKey);
    treasuryKeypair = Keypair.fromSecretKey(privateKeyBytes);
    console.log(`✅ Treasury wallet: ${treasuryKeypair.publicKey.toBase58()}\n`);
  } catch (error) {
    console.error('❌ Failed to load treasury keypair from SANTA_TREASURY_PRIVATE_KEY');
    console.error('   Make sure it\'s a valid base58-encoded private key\n');
    process.exit(1);
  }

  // Check treasury balance
  const connection = await solanaService.getConnection();
  const treasuryBalance = await connection.getBalance(treasuryKeypair.publicKey);
  const treasuryBalanceSOL = treasuryBalance / LAMPORTS_PER_SOL;

  console.log(`💵 Treasury balance: ${treasuryBalanceSOL.toFixed(9)} SOL\n`);

  if (treasuryBalanceSOL < amount + 0.01) {
    console.error(`❌ Insufficient balance!`);
    console.error(`   Need: ${(amount + 0.01).toFixed(9)} SOL (${amount} SOL + ~0.01 SOL for fees)`);
    console.error(`   Have: ${treasuryBalanceSOL.toFixed(9)} SOL\n`);
    process.exit(1);
  }

  // Create transfer instruction
  const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
  const transferInstruction = SystemProgram.transfer({
    fromPubkey: treasuryKeypair.publicKey,
    toPubkey: recipientPubkey,
    lamports,
  });

  // Build transaction
  const transaction = new Transaction().add(transferInstruction);

  // Get recent blockhash
  console.log('📡 Getting recent blockhash...');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = treasuryKeypair.publicKey;

  console.log(`✅ Transaction prepared\n`);

  // Send transaction
  console.log('🚀 Sending transaction...');
  try {
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
    console.log(`   View on Solscan: https://solscan.io/tx/${signature}\n`);

    // Verify the transfer
    console.log('🔍 Verifying transfer...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    
    const recipientBalance = await connection.getBalance(recipientPubkey);
    console.log(`   Recipient balance: ${(recipientBalance / LAMPORTS_PER_SOL).toFixed(9)} SOL\n`);

  } catch (error) {
    console.error('\n❌ Transfer failed\n');
    console.error('Error:', (error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs(): TransferOptions {
  const args = process.argv.slice(2);
  const options: TransferOptions = {
    wallet: '',
    amount: 0.001,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--wallet' && args[i + 1]) {
      options.wallet = args[i + 1];
      i++;
    } else if (args[i] === '--amount' && args[i + 1]) {
      options.amount = parseFloat(args[i + 1]);
      i++;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();

  if (!options.wallet) {
    console.error('❌ Wallet address required!');
    console.error('\nUsage:');
    console.error('  npm run test:sol-transfer -- --wallet <WALLET_ADDRESS> [--amount <SOL_AMOUNT>]');
    console.error('\nExample:');
    console.error('  npm run test:sol-transfer -- --wallet B3yC1eToLFYdwRdeTauM6Yi6TVTugBRCycQFMLZikiS2 --amount 0.001\n');
    process.exit(1);
  }

  await testSOLTransfer(options);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

