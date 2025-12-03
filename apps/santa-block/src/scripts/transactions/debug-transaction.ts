import { solanaService } from '../services/solana';
import { config } from '../../config';
import { logger } from '../utils/logger';
import { txRawRepo } from '../../database';

/**
 * Debug a specific transaction to see why it's not being saved
 */

async function debugTransaction(signature: string) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('           TRANSACTION DEBUG ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`Signature: ${signature}\n`);

  try {
    // Check if already in database
    const existing = await txRawRepo.findBySignature(signature);
    if (existing) {
      console.log('✅ Transaction IS in database:');
      console.log(`   From: ${existing.from_wallet}`);
      console.log(`   To: ${existing.to_wallet}`);
      console.log(`   Amount: ${existing.amount}`);
      console.log(`   Kind: ${existing.kind}`);
      console.log(`   Time: ${existing.block_time}\n`);
      return;
    } else {
      console.log('❌ Transaction NOT in database\n');
    }

    // Get the transaction
    console.log('Fetching transaction from RPC...');
    const tx = await solanaService.getParsedTransaction(signature);
    
    if (!tx || !tx.blockTime) {
      console.log('❌ Transaction not found or missing block time\n');
      return;
    }

    console.log('✅ Transaction fetched\n');
    console.log(`Block Time: ${new Date(tx.blockTime * 1000).toISOString()}`);
    console.log(`Slot: ${tx.slot}`);
    console.log(`Status: ${tx.meta?.err ? 'FAILED' : 'SUCCESS'}\n`);

    // Check token balances
    if (tx.meta?.preTokenBalances && tx.meta?.postTokenBalances) {
      console.log('📊 TOKEN BALANCES ANALYSIS:');
      console.log('─────────────────────────────────────────────────────────\n');

      const preBalances = tx.meta.preTokenBalances;
      const postBalances = tx.meta.postTokenBalances;

      console.log(`Total accounts with token balances: ${postBalances.length}\n`);

      // Find all token mints involved
      const mints = new Set([
        ...preBalances.map(b => b.mint),
        ...postBalances.map(b => b.mint)
      ]);

      console.log('Token mints in this transaction:');
      mints.forEach(mint => console.log(`  - ${mint}`));
      console.log();

      // Find changes for OUR token
      const targetMint = config.santa.tokenMint;
      console.log(`Looking for changes in OUR token: ${targetMint}\n`);

      const changes: any[] = [];

      for (const postBalance of postBalances) {
        if (postBalance.mint === targetMint) {
          const preBalance = preBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
          const preAmount = preBalance ? BigInt(preBalance.uiTokenAmount.amount) : BigInt(0);
          const postAmount = BigInt(postBalance.uiTokenAmount.amount);
          const change = postAmount > preAmount ? postAmount - preAmount : preAmount - postAmount;
          const direction = postAmount > preAmount ? 'INCREASE' : postAmount < preAmount ? 'DECREASE' : 'NO CHANGE';

          changes.push({
            accountIndex: postBalance.accountIndex,
            owner: postBalance.owner,
            preAmount,
            postAmount,
            change,
            direction
          });

          console.log(`Account #${postBalance.accountIndex}:`);
          console.log(`  Owner: ${postBalance.owner}`);
          console.log(`  Pre:  ${preAmount.toString()}`);
          console.log(`  Post: ${postAmount.toString()}`);
          console.log(`  Change: ${change.toString()} (${direction})`);
          console.log();
        }
      }

      if (changes.length === 0) {
        console.log('⚠️  No accounts found with our token mint!\n');
      } else {
        console.log(`Found ${changes.length} account(s) with our token\n`);

        const nonZeroChanges = changes.filter(c => c.change > BigInt(0));
        console.log(`Accounts with NON-ZERO changes: ${nonZeroChanges.length}\n`);

        if (nonZeroChanges.length > 0) {
          console.log('💡 SHOULD BE SAVED! Details:');
          nonZeroChanges.forEach(c => {
            console.log(`  Account: ${c.owner}`);
            console.log(`  Change: ${c.change.toString()} (${c.direction})`);
          });
          console.log();
        } else {
          console.log('⚠️  All changes are ZERO - this is why it\'s not saved\n');
        }
      }
    } else {
      console.log('❌ No token balance data in transaction\n');
    }

    // Try parsing with our parser
    console.log('─────────────────────────────────────────────────────────');
    console.log('TESTING OUR PARSER:\n');
    
    const transfer = solanaService.parseTokenTransfer(tx);
    if (transfer) {
      console.log('✅ Parser found a transfer:');
      console.log(`   From: ${transfer.from}`);
      console.log(`   To: ${transfer.to}`);
      console.log(`   Amount: ${transfer.amount.toString()}`);
      console.log(`   Kind: ${transfer.kind}\n`);
    } else {
      console.log('❌ Parser returned NULL - no transfer detected\n');
    }

    // Check instructions
    console.log('─────────────────────────────────────────────────────────');
    console.log('INSTRUCTIONS ANALYSIS:\n');
    
    const instructions = tx.transaction.message.instructions;
    console.log(`Total instructions: ${instructions.length}\n`);

    instructions.forEach((ix, i) => {
      const program = 'program' in ix ? ix.program : 'unknown';
      const hasParsed = 'parsed' in ix;
      const type = hasParsed && 'parsed' in ix ? ix.parsed?.type : 'unparsed';
      
      console.log(`Instruction ${i + 1}:`);
      console.log(`  Program: ${program}`);
      console.log(`  Parsed: ${hasParsed}`);
      console.log(`  Type: ${type}`);
      console.log();
    });

    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// CLI
const signature = process.argv[2];
if (!signature) {
  console.error('Usage: yarn tsx src/scripts/debug-transaction.ts <signature>');
  process.exit(1);
}

debugTransaction(signature);




