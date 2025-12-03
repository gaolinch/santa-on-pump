import { db, txRawRepo } from '../../database';
import { solanaService } from '../services/solana';
import { config } from '../../config';
import { logger } from '../utils/logger';

/**
 * Quick diagnostic check for transaction listener configuration and database state
 */

async function diagnosticCheck() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║      TRANSACTION LISTENER DIAGNOSTIC CHECK              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Check Configuration
    console.log('📋 CONFIGURATION');
    console.log('─────────────────────────────────────────────────────────────');
    console.log(`Network:          ${config.solana.network}`);
    console.log(`RPC Primary:      ${config.solana.rpcPrimary?.substring(0, 50)}...`);
    console.log(`RPC Devnet:       ${config.solana.rpcDevnet?.substring(0, 50)}...`);
    console.log(`Token Mint:       ${config.santa.tokenMint || '❌ NOT SET'}`);
    console.log(`Treasury Wallet:  ${config.santa.treasuryWallet || '❌ NOT SET'}`);
    console.log();

    // 2. Check Monitoring Mode
    console.log('🔍 MONITORING MODE');
    console.log('─────────────────────────────────────────────────────────────');
    if (!config.santa.tokenMint) {
      console.log('❌ Cannot monitor - Token mint not configured');
      console.log('   Please set SANTA_TOKEN_MINT environment variable');
      return;
    }

    if (config.santa.treasuryWallet) {
      console.log('✓ Monitoring: TREASURY TOKEN ACCOUNT');
      console.log('  This will only capture transactions involving the treasury.');
      console.log('  User-to-user transfers will be MISSED.');
      
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress } = await import('@solana/spl-token');
      const tokenMint = new PublicKey(config.santa.tokenMint);
      const treasuryWallet = new PublicKey(config.santa.treasuryWallet);
      const tokenAccount = await getAssociatedTokenAddress(tokenMint, treasuryWallet);
      console.log(`  Address: ${tokenAccount.toString()}`);
    } else {
      console.log('✓ Monitoring: TOKEN MINT DIRECTLY');
      console.log('  This will capture ALL transactions for this token.');
      console.log(`  Address: ${config.santa.tokenMint}`);
    }
    console.log();

    // 3. Check Database Connection
    console.log('💾 DATABASE STATUS');
    console.log('─────────────────────────────────────────────────────────────');
    const dbHealthy = await db.healthCheck();
    if (dbHealthy) {
      console.log('✓ Database connection: HEALTHY');
    } else {
      console.log('❌ Database connection: FAILED');
      console.log('   Check your database configuration');
      return;
    }

    // Get transaction counts
    const totalTxResult = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM tx_raw');
    const totalTx = parseInt(totalTxResult.rows[0]?.count || '0');
    
    const buyTxResult = await db.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM tx_raw WHERE kind = 'buy'"
    );
    const buyTx = parseInt(buyTxResult.rows[0]?.count || '0');
    
    const sellTxResult = await db.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM tx_raw WHERE kind = 'sell'"
    );
    const sellTx = parseInt(sellTxResult.rows[0]?.count || '0');
    
    const transferTxResult = await db.query<{ count: string }>(
      "SELECT COUNT(*) as count FROM tx_raw WHERE kind = 'transfer'"
    );
    const transferTx = parseInt(transferTxResult.rows[0]?.count || '0');

    console.log(`Total transactions: ${totalTx}`);
    console.log(`  - Buy:      ${buyTx}`);
    console.log(`  - Sell:     ${sellTx}`);
    console.log(`  - Transfer: ${transferTx}`);

    // Get date range
    if (totalTx > 0) {
      const dateRangeResult = await db.query<{ min_date: Date; max_date: Date }>(
        'SELECT MIN(block_time) as min_date, MAX(block_time) as max_date FROM tx_raw'
      );
      const { min_date, max_date } = dateRangeResult.rows[0];
      console.log(`Date range: ${min_date?.toISOString().split('T')[0]} to ${max_date?.toISOString().split('T')[0]}`);
    }
    console.log();

    // 4. Check Solana RPC Connection
    console.log('🌐 SOLANA RPC STATUS');
    console.log('─────────────────────────────────────────────────────────────');
    const rpcHealth = await solanaService.healthCheck();
    if (rpcHealth.healthy) {
      console.log('✓ RPC connection: HEALTHY');
      console.log(`  Current slot: ${rpcHealth.slot}`);
    } else {
      console.log('❌ RPC connection: FAILED');
      console.log(`  Error: ${rpcHealth.error}`);
      return;
    }
    console.log();

    // 5. Check Recent Transactions on Blockchain
    console.log('🔗 BLOCKCHAIN STATUS');
    console.log('─────────────────────────────────────────────────────────────');
    
    const { PublicKey } = await import('@solana/web3.js');
    const tokenMint = new PublicKey(config.santa.tokenMint);
    
    let addressToCheck: any = tokenMint;
    if (config.santa.treasuryWallet) {
      const { getAssociatedTokenAddress } = await import('@solana/spl-token');
      const treasuryWallet = new PublicKey(config.santa.treasuryWallet);
      addressToCheck = await getAssociatedTokenAddress(tokenMint, treasuryWallet);
    }
    
    const recentSignatures = await solanaService.getSignaturesForAddress(addressToCheck, undefined, 10);
    console.log(`Recent signatures on-chain: ${recentSignatures.length}`);
    
    if (recentSignatures.length > 0) {
      const mostRecent = recentSignatures[0];
      const mostRecentDate = new Date(mostRecent.blockTime * 1000);
      console.log(`Most recent transaction: ${mostRecent.signature.substring(0, 8)}...`);
      console.log(`  Time: ${mostRecentDate.toISOString()}`);
      console.log(`  Status: ${mostRecent.confirmationStatus}`);
      
      // Check if most recent is in database
      const existsInDb = await txRawRepo.findBySignature(mostRecent.signature);
      if (existsInDb) {
        console.log(`  ✓ Found in database`);
      } else {
        console.log(`  ⚠️  NOT found in database`);
      }
    } else {
      console.log('⚠️  No recent transactions found on blockchain');
    }
    console.log();

    // 6. Recommendations
    console.log('💡 RECOMMENDATIONS');
    console.log('─────────────────────────────────────────────────────────────');
    
    const recommendations = [];
    
    if (!config.santa.tokenMint) {
      recommendations.push('Set SANTA_TOKEN_MINT environment variable');
    }
    
    if (config.santa.treasuryWallet) {
      recommendations.push('You are monitoring TREASURY TOKEN ACCOUNT only');
      recommendations.push('  → User-to-user transfers will be MISSED');
      recommendations.push('  → Remove SANTA_TREASURY_WALLET to monitor ALL transactions');
    }
    
    if (totalTx === 0 && recentSignatures.length > 0) {
      recommendations.push('Transactions exist on-chain but database is empty');
      recommendations.push('  → Run: yarn verify-tx');
      recommendations.push('  → Consider using backfill for historical data');
    }
    
    if (totalTx > 0 && recentSignatures.length > 0) {
      recommendations.push('Run verification to check for missing transactions:');
      recommendations.push('  → yarn verify-tx --limit 100');
    }
    
    if (recommendations.length === 0) {
      console.log('✓ Everything looks good! No recommendations at this time.');
    } else {
      for (let i = 0; i < recommendations.length; i++) {
        if (recommendations[i].startsWith(' ')) {
          console.log(`  ${recommendations[i]}`);
        } else {
          console.log(`${i > 0 ? '\n' : ''}• ${recommendations[i]}`);
        }
      }
    }
    console.log();

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║  For full verification, run:                             ║');
    console.log('║  yarn verify-tx                                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ Error during diagnostic check:', error);
    logger.error({ error }, 'Diagnostic check failed');
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  diagnosticCheck();
}

export { diagnosticCheck };

