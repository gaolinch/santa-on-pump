import { solanaService } from '../services/solana';
import { config } from '../../config';

async function testMonitoring() {
  const { PublicKey } = await import('@solana/web3.js');
  const { getAssociatedTokenAddress } = await import('@solana/spl-token');
  
  const tokenMint = new PublicKey(config.santa.tokenMint);
  const knownBuyTx = '3y3fdrhVmrMmLKwnQZ6CCiUVuDqc2K3o1qFjZmyLAFxxt8vcqyvg2izCeBx1ydig1x5w6yQYeuqzjEQ4TKRVuYdg';
  
  console.log('\n════════════════════════════════════════════════');
  console.log('TEST: What Address Should We Monitor?');
  console.log('════════════════════════════════════════════════\n');
  
  console.log(`Known BUY transaction: ${knownBuyTx}\n`);
  
  // Test 1: Monitor token mint directly
  console.log('TEST 1: Monitoring TOKEN MINT');
  console.log(`Address: ${tokenMint.toString()}\n`);
  
  const mintSigs = await solanaService.getSignaturesForAddress(tokenMint, undefined, 50);
  const foundInMint = mintSigs.find(s => s.signature === knownBuyTx);
  
  console.log(`Total signatures found: ${mintSigs.length}`);
  console.log(`Contains our buy tx: ${foundInMint ? '✅ YES' : '❌ NO'}`);
  
  if (foundInMint) {
    console.log(`  Position in list: ${mintSigs.findIndex(s => s.signature === knownBuyTx) + 1}`);
    console.log(`  Block time: ${new Date(foundInMint.blockTime! * 1000).toISOString()}`);
  }
  
  console.log('\n────────────────────────────────────────────────');
  
  // Test 2: Monitor the bonding curve / pool
  const poolAddress = new PublicKey('4EEbhkkKsSzhH48xza9VNNjTmsKPsRPudHL5pSEf3spr');
  console.log('\nTEST 2: Monitoring LIQUIDITY POOL');
  console.log(`Address: ${poolAddress.toString()}\n`);
  
  const poolSigs = await solanaService.getSignaturesForAddress(poolAddress, undefined, 50);
  const foundInPool = poolSigs.find(s => s.signature === knownBuyTx);
  
  console.log(`Total signatures found: ${poolSigs.length}`);
  console.log(`Contains our buy tx: ${foundInPool ? '✅ YES' : '❌ NO'}`);
  
  if (foundInPool) {
    console.log(`  Position in list: ${poolSigs.findIndex(s => s.signature === knownBuyTx) + 1}`);
    console.log(`  Block time: ${new Date(foundInPool.blockTime! * 1000).toISOString()}`);
  }
  
  console.log('\n════════════════════════════════════════════════');
  console.log('CONCLUSION:');
  if (foundInMint) {
    console.log('✅ Token mint monitoring WILL capture this transaction');
  } else if (foundInPool) {
    console.log('⚠️  Only pool monitoring captures this transaction');
    console.log('   You need to monitor the pool address, not the mint!');
  } else {
    console.log('❌ Neither address captures this transaction');
    console.log('   Need to investigate further');
  }
  console.log('════════════════════════════════════════════════\n');
}

testMonitoring();




