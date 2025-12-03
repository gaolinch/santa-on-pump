#!/usr/bin/env tsx
/**
 * Send 30000 SANTA tokens to Day 1 gift recipients as a bonus
 * 
 * Sends tokens from the AIRDROP_WALLET (configured in .env)
 * Requires AIRDROP_WALLET_PRIVATE_KEY or falls back to SANTA_TREASURY_PRIVATE_KEY
 * 
 * Usage: npx tsx src/scripts/send-token-bonus.ts [day]
 * 
 * Default: day 1
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import { 
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
  createTransferCheckedInstruction
} from '@solana/spl-token';
import * as bs58 from 'bs58';
import * as readline from 'readline';
import { config } from '../../config';
import { solanaService } from '../../services/solana';
import { giftExecRepo } from '../../database';
import { logger } from '../../utils/logger';

interface Winner {
  wallet: string;
  amount: bigint;
}

const TOKEN_AMOUNT = 30000; // 30000 SANTA tokens per wallet
const BATCH_SIZE = 5; // Send to 5 wallets per transaction

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
 * Load winners from database for a specific day
 */
async function loadWinners(day: number): Promise<Winner[]> {
  const executions = await giftExecRepo.findByDay(day);
  if (!executions || executions.length === 0) {
    throw new Error(`No execution found for day ${day}`);
  }

  const execution = executions[0];
  if (!execution.winners) {
    throw new Error(`No winners found in execution for day ${day}`);
  }

  const winners = typeof execution.winners === 'string' 
    ? JSON.parse(execution.winners) 
    : execution.winners;

  return winners.map((w: any) => ({
    wallet: w.wallet,
    amount: typeof w.amount === 'string' ? BigInt(w.amount) : BigInt(w.amount),
  }));
}

/**
 * Get airdrop wallet keypair
 */
function getAirdropKeypair(): Keypair {
  // First try AIRDROP_WALLET_PRIVATE_KEY
  const airdropPrivateKey = process.env.AIRDROP_WALLET_PRIVATE_KEY;
  if (airdropPrivateKey) {
    try {
      const decoded = bs58.decode(airdropPrivateKey);
      const keypair = Keypair.fromSecretKey(decoded);
      
      // Validate it matches AIRDROP_WALLET if configured
      if (config.santa.airdropWallet) {
        const expectedPubkey = new PublicKey(config.santa.airdropWallet);
        if (!keypair.publicKey.equals(expectedPubkey)) {
          throw new Error(`Airdrop keypair does not match AIRDROP_WALLET. Expected ${config.santa.airdropWallet}, got ${keypair.publicKey.toBase58()}`);
        }
      }
      
      return keypair;
    } catch (error: any) {
      throw new Error(`Failed to decode airdrop private key: ${error.message}`);
    }
  }

  // Fallback to treasury private key if airdrop key not configured
  const treasuryPrivateKey = config.santa.treasuryPrivateKey;
  if (!treasuryPrivateKey) {
    throw new Error('AIRDROP_WALLET_PRIVATE_KEY or SANTA_TREASURY_PRIVATE_KEY must be configured in .env');
  }

  try {
    const decoded = bs58.decode(treasuryPrivateKey);
    return Keypair.fromSecretKey(decoded);
  } catch (error: any) {
    throw new Error(`Failed to decode treasury private key: ${error.message}`);
  }
}

/**
 * Check airdrop wallet token balance
 * Checks all token accounts for the wallet to find tokens
 */
async function checkAirdropBalance(
  connection: Connection,
  airdropKeypair: Keypair,
  tokenMint: PublicKey
): Promise<bigint> {
  try {
    // First try the associated token account
    const airdropTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      airdropKeypair.publicKey
    );

    try {
      const accountInfo = await getAccount(connection, airdropTokenAccount);
      return accountInfo.amount;
    } catch (error: any) {
      // ATA doesn't exist, try finding all token accounts
      if (error.message?.includes('could not find account') || 
          error.message?.includes('TokenAccountNotFoundError') ||
          error.name === 'TokenAccountNotFoundError') {
        
        // Get all token accounts for this wallet
        const tokenAccountsResponse = await connection.getParsedTokenAccountsByOwner(
          airdropKeypair.publicKey,
          { mint: tokenMint }
        );

        if (tokenAccountsResponse.value.length > 0) {
          // Sum up all token account balances
          let totalBalance = BigInt(0);
          for (const account of tokenAccountsResponse.value) {
            if (account.account.data.parsed.info.mint === tokenMint.toBase58()) {
              totalBalance += BigInt(account.account.data.parsed.info.tokenAmount.amount);
            }
          }
          return totalBalance;
        }
        
        return BigInt(0);
      }
      throw error;
    }
  } catch (error: any) {
    // Fallback: try to get all token accounts
    try {
      const tokenAccountsResponse = await connection.getParsedTokenAccountsByOwner(
        airdropKeypair.publicKey,
        { mint: tokenMint }
      );

      if (tokenAccountsResponse.value.length > 0) {
        let totalBalance = BigInt(0);
        for (const account of tokenAccountsResponse.value) {
          if (account.account.data.parsed.info.mint === tokenMint.toBase58()) {
            totalBalance += BigInt(account.account.data.parsed.info.tokenAmount.amount);
          }
        }
        return totalBalance;
      }
    } catch (fallbackError) {
      // Ignore fallback errors
    }
    
    return BigInt(0);
  }
}

/**
 * Send tokens to a batch of wallets
 */
async function sendTokenBatch(
  connection: Connection,
  airdropKeypair: Keypair,
  tokenMint: PublicKey,
  wallets: string[],
  amountPerWallet: bigint
): Promise<string[]> {
  const signatures: string[] = [];

  // Find the actual token account that has the balance
  // The tokens might be in a non-ATA account, so we need to find it first
  let airdropTokenAccount: PublicKey;
  let airdropTokenAccountInfo: any;
  
  const tokenAccountsResponse = await connection.getParsedTokenAccountsByOwner(
    airdropKeypair.publicKey,
    { mint: tokenMint }
  );
  
  if (tokenAccountsResponse.value.length > 0) {
    // Use the first token account that has balance
    airdropTokenAccount = tokenAccountsResponse.value[0].pubkey;
    airdropTokenAccountInfo = tokenAccountsResponse.value[0].account.data.parsed.info;
    console.log(`   Using token account: ${airdropTokenAccount.toBase58()}`);
  } else {
    // No token account found, this shouldn't happen if balance check passed
    throw new Error('No token account found for airdrop wallet, but balance check passed. This is unexpected.');
  }

  // Create transaction
  const transaction = new Transaction();

  // Get fresh blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = airdropKeypair.publicKey;

  // Add transfer instructions for each wallet
  for (const wallet of wallets) {
    const recipientPubkey = new PublicKey(wallet);

    // Check if recipient already has a token account
    let recipientTokenAccount: PublicKey;
    try {
      const recipientTokenAccounts = await connection.getParsedTokenAccountsByOwner(
        recipientPubkey,
        { mint: tokenMint }
      );
      
      if (recipientTokenAccounts.value.length > 0) {
        // Use existing token account
        recipientTokenAccount = recipientTokenAccounts.value[0].pubkey;
      } else {
        // Create new associated token account
        const ata = await getOrCreateAssociatedTokenAccount(
          connection,
          airdropKeypair, // Airdrop wallet pays for account creation
          tokenMint,
          recipientPubkey
        );
        recipientTokenAccount = ata.address;
      }
    } catch (error) {
      // Fallback: try to create ATA
      const ata = await getOrCreateAssociatedTokenAccount(
        connection,
        airdropKeypair,
        tokenMint,
        recipientPubkey
      );
      recipientTokenAccount = ata.address;
    }

    // Add transfer instruction using createTransferCheckedInstruction
    // This doesn't validate the account before creating the instruction
    transaction.add(
      createTransferCheckedInstruction(
        airdropTokenAccount,      // Source
        tokenMint,                // Mint (required for checked instruction)
        recipientTokenAccount,    // Destination
        airdropKeypair.publicKey, // Authority
        amountPerWallet,          // Amount
        6                         // Decimals (we detected 6 earlier)
      )
    );
  }

  // Send and confirm
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [airdropKeypair],
      {
        commitment: 'confirmed',
        maxRetries: 3,
      }
    );

    signatures.push(signature);
    return signatures;
  } catch (error: any) {
    const errorMsg = error?.message || error?.toString() || 'Unknown error';
    throw new Error(`Transaction failed: ${errorMsg}. Token account: ${airdropTokenAccount.toBase58()}, Recipients: ${wallets.length}`);
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const day = args[0] ? parseInt(args[0], 10) : 1;

  if (isNaN(day) || day < 1 || day > 24) {
    console.error('❌ Invalid day. Must be between 1 and 24');
    process.exit(1);
  }

  console.log(`\n🎁 Sending ${TOKEN_AMOUNT.toLocaleString()} SANTA tokens to Day ${day} recipients\n`);

  // Load configuration
  const tokenMintAddress = config.santa.tokenMint || config.solana.pumpFunToken;
  if (!tokenMintAddress) {
    console.error('❌ Token mint not configured. Set SANTA_TOKEN_MINT or PUMP_FUN_TOKEN in .env');
    process.exit(1);
  }

  const tokenMint = new PublicKey(tokenMintAddress);
  
  // Initialize connection early to check decimals
  const connection = await solanaService.getConnection();
  
  // Get actual decimals from token mint
  let decimals = config.santa.decimals;
  try {
    const mintInfo = await connection.getParsedAccountInfo(tokenMint);
    if (mintInfo.value && 'parsed' in mintInfo.value.data) {
      const parsedData = mintInfo.value.data as any;
      if (parsedData.parsed?.info?.decimals !== undefined) {
        decimals = parsedData.parsed.info.decimals;
        console.log(`📋 Detected token decimals: ${decimals} (from blockchain)`);
      }
    }
  } catch (error) {
    console.log(`⚠️  Could not fetch decimals from blockchain, using config: ${decimals}`);
  }
  
  const amountPerWallet = BigInt(TOKEN_AMOUNT) * BigInt(10 ** decimals);

  console.log(`📋 Configuration:`);
  console.log(`   Token Mint: ${tokenMintAddress}`);
  console.log(`   Decimals: ${decimals}`);
  console.log(`   Amount per wallet: ${TOKEN_AMOUNT.toLocaleString()} tokens (${amountPerWallet.toString()} base units)\n`);

  // Load winners
  console.log(`📦 Loading winners from Day ${day}...`);
  const winners = await loadWinners(day);
  console.log(`✅ Loaded ${winners.length} winners\n`);

  // Get airdrop wallet keypair
  const airdropKeypair = getAirdropKeypair();
  const airdropWalletAddress = airdropKeypair.publicKey.toBase58();
  const expectedAirdropWallet = config.santa.airdropWallet;
  
  if (expectedAirdropWallet && airdropWalletAddress !== expectedAirdropWallet) {
    console.error(`❌ Airdrop keypair does not match AIRDROP_WALLET`);
    console.error(`   Expected: ${expectedAirdropWallet}`);
    console.error(`   Got: ${airdropWalletAddress}`);
    process.exit(1);
  }
  
  console.log(`💰 Airdrop Wallet: ${airdropWalletAddress}\n`);

  // Check airdrop wallet SOL balance
  const airdropSolBalance = await connection.getBalance(airdropKeypair.publicKey);
  console.log(`💵 Airdrop wallet SOL balance: ${(airdropSolBalance / 1e9).toFixed(4)} SOL`);

  if (airdropSolBalance < 0.1 * 1e9) {
    console.error('❌ Insufficient SOL in airdrop wallet. Need at least 0.1 SOL for transaction fees.');
    process.exit(1);
  }

  // Check airdrop wallet token balance
  const airdropTokenBalance = await checkAirdropBalance(connection, airdropKeypair, tokenMint);
  const totalNeeded = amountPerWallet * BigInt(winners.length);
  const airdropTokenBalanceFormatted = Number(airdropTokenBalance) / (10 ** decimals);
  const totalNeededFormatted = Number(totalNeeded) / (10 ** decimals);

  console.log(`🪙 Airdrop wallet token balance: ${airdropTokenBalanceFormatted.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens`);
  console.log(`   (Raw: ${airdropTokenBalance.toString()} base units)`);
  console.log(`📊 Total tokens needed: ${totalNeededFormatted.toLocaleString(undefined, { maximumFractionDigits: 0 })} tokens\n`);

  if (airdropTokenBalance < totalNeeded) {
    console.error(`❌ Insufficient tokens in airdrop wallet.`);
    console.error(`   Have: ${airdropTokenBalanceFormatted.toLocaleString()} tokens`);
    console.error(`   Need: ${(Number(totalNeeded) / (10 ** decimals)).toLocaleString()} tokens`);
    process.exit(1);
  }

  // Show summary
  const totalBatches = Math.ceil(winners.length / BATCH_SIZE);
  console.log('='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`   Recipients: ${winners.length}`);
  console.log(`   Amount per recipient: ${TOKEN_AMOUNT.toLocaleString()} SANTA tokens`);
  console.log(`   Total tokens: ${(Number(totalNeeded) / (10 ** decimals)).toLocaleString()} tokens`);
  console.log(`   Batches: ${totalBatches} (${BATCH_SIZE} recipients per batch)`);
  console.log(`   Estimated fees: ~${(totalBatches * 0.000005).toFixed(6)} SOL\n`);

  // Confirmation
  const confirm = await askQuestion('⚠️  Do you want to proceed with sending tokens? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes') {
    console.log('❌ Cancelled by user');
    process.exit(0);
  }

  // Process in batches
  const allSignatures: string[] = [];
  const failedWallets: string[] = [];

  for (let i = 0; i < winners.length; i += BATCH_SIZE) {
    const batch = winners.slice(i, i + BATCH_SIZE);
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`\n📤 Batch ${batchNumber}/${totalBatches}:`);
    console.log(`   Recipients: ${batch.length}`);
    batch.forEach((w, idx) => {
      console.log(`     ${i + idx + 1}. ${w.wallet}`);
    });

    try {
      const wallets = batch.map(w => w.wallet);
      const signatures = await sendTokenBatch(
        connection,
        airdropKeypair,
        tokenMint,
        wallets,
        amountPerWallet
      );

      allSignatures.push(...signatures);
      console.log(`   ✅ Batch ${batchNumber} confirmed!`);
      signatures.forEach((sig, idx) => {
        console.log(`      Transaction ${idx + 1}: ${sig}`);
        console.log(`      View: https://solscan.io/tx/${sig}`);
      });

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < winners.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      console.error(`   ❌ Batch ${batchNumber} failed: ${errorMsg}`);
      if (error?.stack) {
        console.error(`   Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
      failedWallets.push(...batch.map(w => w.wallet));
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Successful batches: ${allSignatures.length}`);
  console.log(`❌ Failed batches: ${failedWallets.length > 0 ? failedWallets.length : 0}`);

  if (allSignatures.length > 0) {
    console.log(`\n✅ Successfully sent ${TOKEN_AMOUNT.toLocaleString()} SANTA tokens to ${winners.length - failedWallets.length} wallets`);
    console.log(`\n📝 Transaction signatures:`);
    allSignatures.forEach((sig, idx) => {
      console.log(`   ${idx + 1}. ${sig}`);
      console.log(`      View: https://solscan.io/tx/${sig}`);
    });
  }

  if (failedWallets.length > 0) {
    console.log(`\n❌ Failed wallets (${failedWallets.length}):`);
    failedWallets.forEach((wallet, idx) => {
      console.log(`   ${idx + 1}. ${wallet}`);
    });
    console.log(`\n💡 You can retry failed wallets by modifying the script or running it again.`);
  }

  console.log('\n🎉 Token bonus distribution completed!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    logger.error({ error }, 'Token bonus distribution failed');
    process.exit(1);
  });

