import { solanaService } from '../services/solana';
import { config } from '../../config';
import { db } from '../../database';

/**
 * Find real token transfers that should have been saved
 */

async function findRealTransfers() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('     FINDING REAL TOKEN TRANSFERS');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const { PublicKey } = await import('@solana/web3.js');
    const tokenMint = new PublicKey(config.santa.tokenMint);

    console.log(`Token: ${config.santa.tokenMint}\n`);
    console.log('Fetching last 20 transactions from blockchain...\n');

    // Get recent signatures
    const signatures = await solanaService.getSignaturesForAddress(tokenMint, undefined, 20);
    
    console.log(`Found ${signatures.length} signatures\n`);
    console.log('Analyzing each transaction...\n');
    console.log('─────────────────────────────────────────────────────────\n');

    let realTransfers = 0;
    let zeroChange = 0;
    let failed = 0;

    for (let i = 0; i < signatures.length && i < 10; i++) {
      const sig = signatures[i];
      const shortSig = sig.signature.substring(0, 8);
      
      try {
        // Get transaction
        const tx = await solanaService.getParsedTransaction(sig.signature);
        
        if (!tx || !tx.blockTime) {
          console.log(`${shortSig}... ⚠️  No transaction data`);
          failed++;
          continue;
        }

        // Check for token balance changes
        if (!tx.meta?.preTokenBalances || !tx.meta?.postTokenBalances) {
          console.log(`${shortSig}... ⚠️  No token balance data`);
          continue;
        }

        const preBalances = tx.meta.preTokenBalances;
        const postBalances = tx.meta.postTokenBalances;

        // Find changes for our token
        let hasRealChange = false;
        let maxChange = BigInt(0);
        let changeDetails: any = null;

        for (const postBalance of postBalances) {
          if (postBalance.mint === config.santa.tokenMint) {
            const preBalance = preBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
            const preAmount = preBalance ? BigInt(preBalance.uiTokenAmount.amount) : BigInt(0);
            const postAmount = BigInt(postBalance.uiTokenAmount.amount);
            
            let change: bigint;
            let direction: string;
            
            if (postAmount > preAmount) {
              change = postAmount - preAmount;
              direction = 'BUY';
            } else if (preAmount > postAmount) {
              change = preAmount - postAmount;
              direction = 'SELL';
            } else {
              change = BigInt(0);
              direction = 'NONE';
            }

            if (change > BigInt(0)) {
              hasRealChange = true;
              if (change > maxChange) {
                maxChange = change;
                changeDetails = {
                  owner: postBalance.owner,
                  change,
                  direction
                };
              }
            }
          }
        }

        if (hasRealChange) {
          realTransfers++;
          console.log(`${shortSig}... ✅ REAL TRANSFER`);
          console.log(`           Amount: ${maxChange.toString()}`);
          console.log(`           Type: ${changeDetails.direction}`);
          console.log(`           Wallet: ${changeDetails.owner.substring(0, 8)}...`);
          console.log(`           Time: ${new Date(tx.blockTime * 1000).toISOString()}`);
          console.log(`           Full sig: ${sig.signature}`);
          console.log();
        } else {
          zeroChange++;
          console.log(`${shortSig}... ⚪ Zero change (internal operation)`);
        }

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 150));

      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`${shortSig}... ❌ Error: ${message}`);
        failed++;
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('SUMMARY:');
    console.log(`✅ Real transfers: ${realTransfers}`);
    console.log(`⚪ Zero-change txs: ${zeroChange}`);
    console.log(`❌ Failed/No data: ${failed}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    if (realTransfers > 0) {
      console.log('💡 Use the debug-transaction script on any of the real transfers');
      console.log('   to see why they\'re not being saved:\n');
      console.log('   yarn tsx src/scripts/debug-transaction.ts <signature>\n');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await db.close();
  }
}

findRealTransfers();


