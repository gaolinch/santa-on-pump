#!/usr/bin/env tsx

/**
 * Convert Seed Phrase to Base58 Private Key
 * 
 * This script converts a BIP39 seed phrase (12 or 24 words) to a base58-encoded
 * private key that can be used for SANTA_TREASURY_PRIVATE_KEY
 * 
 * Usage:
 *   npm run seed-to-base58 "your twelve word seed phrase here"
 * 
 * Security:
 *   - Never commit seed phrases to git
 *   - Never share seed phrases
 *   - Use in a secure environment only
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';

function convertSeedPhraseToBase58(seedPhrase: string): {
  privateKeyBase58: string;
  publicKey: string;
  secretKeyArray: number[];
} {
  // Validate seed phrase
  if (!bip39.validateMnemonic(seedPhrase)) {
    throw new Error('Invalid seed phrase. Must be 12 or 24 words.');
  }

  // Convert seed phrase to seed
  const seed = bip39.mnemonicToSeedSync(seedPhrase, '');
  
  // Derive keypair using Solana's default derivation path
  const path = "m/44'/501'/0'/0'";
  const derivedSeed = derivePath(path, seed.toString('hex')).key;
  
  // Create keypair from derived seed
  const keypair = Keypair.fromSeed(derivedSeed);
  
  // Encode secret key to base58
  const privateKeyBase58 = bs58.encode(keypair.secretKey);
  
  // Get public key
  const publicKey = keypair.publicKey.toBase58();
  
  // Get secret key as array (alternative format)
  const secretKeyArray = Array.from(keypair.secretKey);
  
  return {
    privateKeyBase58,
    publicKey,
    secretKeyArray,
  };
}

async function main() {
  console.log('\n🔐 Seed Phrase to Base58 Converter\n');
  console.log('=' .repeat(80));
  
  // Get seed phrase from command line arguments
  const args = process.argv.slice(2);
  const seedPhrase = args.join(' ').trim();
  
  if (!seedPhrase) {
    console.error('❌ Error: No seed phrase provided\n');
    console.log('Usage:');
    console.log('  npm run seed-to-base58 "your twelve word seed phrase here"');
    console.log('  npm run seed-to-base58 "your twenty four word seed phrase here"\n');
    console.log('Example:');
    console.log('  npm run seed-to-base58 "witch collapse practice feed shame open despair creek road again ice least"\n');
    process.exit(1);
  }
  
  // Validate word count
  const words = seedPhrase.trim().split(/\s+/);
  if (words.length !== 12 && words.length !== 24) {
    console.error(`❌ Error: Invalid seed phrase length (${words.length} words)`);
    console.error('   Seed phrase must be exactly 12 or 24 words\n');
    process.exit(1);
  }
  
  console.log(`📝 Seed phrase: ${words.length} words`);
  console.log('🔄 Converting...\n');
  
  try {
    const result = convertSeedPhraseToBase58(seedPhrase);
    
    console.log('=' .repeat(80));
    console.log('✅ CONVERSION SUCCESSFUL\n');
    
    console.log('🔑 Public Key (Treasury Wallet):');
    console.log(`   ${result.publicKey}\n`);
    
    console.log('🔐 Private Key (Base58 Format - RECOMMENDED):');
    console.log(`   ${result.privateKeyBase58}\n`);
    
    console.log('=' .repeat(80));
    console.log('📋 ADD TO YOUR .env FILE:\n');
    console.log(`SANTA_TREASURY_WALLET=${result.publicKey}`);
    console.log(`SANTA_TREASURY_PRIVATE_KEY=${result.privateKeyBase58}\n`);
    
    console.log('=' .repeat(80));
    console.log('🔐 ALTERNATIVE FORMAT (JSON Array):\n');
    console.log(`SANTA_TREASURY_PRIVATE_KEY=[${result.secretKeyArray.join(',')}]\n`);
    
    console.log('=' .repeat(80));
    console.log('⚠️  SECURITY WARNINGS:\n');
    console.log('   1. Never commit your .env file to git');
    console.log('   2. Never share your private key or seed phrase');
    console.log('   3. Clear your terminal history after running this script');
    console.log('   4. Use TOKEN_TRANSFER_MODE=dryrun for testing first');
    console.log('   5. Test on devnet before using on mainnet\n');
    
    console.log('🧪 TEST YOUR CONFIGURATION:\n');
    console.log('   cd apps/santa-block');
    console.log('   TOKEN_TRANSFER_MODE=dryrun npm run manual:hourly-airdrop\n');
    
    console.log('=' .repeat(80) + '\n');
    
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('\nPossible issues:');
    console.error('  - Invalid seed phrase (check spelling and word count)');
    console.error('  - Words not in BIP39 word list');
    console.error('  - Extra spaces or special characters\n');
    process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

