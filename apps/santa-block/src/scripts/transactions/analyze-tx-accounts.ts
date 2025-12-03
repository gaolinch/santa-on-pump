import { solanaService } from '../../services/solana';

async function analyzeTxAccounts() {
  const knownBuyTx = '3y3fdrhVmrMmLKwnQZ6CCiUVuDqc2K3o1qFjZmyLAFxxt8vcqyvg2izCeBx1ydig1x5w6yQYeuqzjEQ4TKRVuYdg';
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('ANALYZING TRANSACTION ACCOUNTS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const tx = await solanaService.getParsedTransaction(knownBuyTx);
  
  if (!tx) {
    console.log('Transaction not found');
    return;
  }
  
  console.log('ALL ACCOUNTS IN TRANSACTION:\n');
  
  const accounts = tx.transaction.message.accountKeys;
  accounts.forEach((account: any, i) => {
    const addr = account && typeof account === 'object' && 'pubkey' in account 
      ? account.pubkey.toString() 
      : account?.toString ? account.toString() : 'unknown';
    const writable = account && typeof account === 'object' && 'writable' in account ? account.writable : false;
    const signer = account && typeof account === 'object' && 'signer' in account ? account.signer : false;
    
    console.log(`${i + 1}. ${addr}`);
    console.log(`   Writable: ${writable}, Signer: ${signer}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('TOKEN ACCOUNTS:\n');
  
  if (tx.meta?.postTokenBalances) {
    for (const balance of tx.meta.postTokenBalances) {
      const account: any = accounts[balance.accountIndex];
      const addr = account && typeof account === 'object' && 'pubkey' in account 
        ? account.pubkey.toString() 
        : account?.toString ? account.toString() : 'unknown';
      console.log(`Account: ${addr}`);
      console.log(`  Owner: ${balance.owner}`);
      console.log(`  Mint: ${balance.mint}`);
      console.log(`  Balance: ${balance.uiTokenAmount.uiAmount}`);
      console.log();
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💡 TRY MONITORING THESE ADDRESSES:\n');
  
  // Find accounts that were written to
  const writableAccounts = accounts.filter((acc, i) => {
    const writable = 'writable' in acc ? acc.writable : false;
    return writable;
  });
  
  console.log('Writable accounts (potential monitoring targets):');
  writableAccounts.forEach((acc: any) => {
    const addr = acc && typeof acc === 'object' && 'pubkey' in acc 
      ? acc.pubkey.toString() 
      : acc?.toString ? acc.toString() : 'unknown';
    console.log(`  - ${addr}`);
  });
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
}

analyzeTxAccounts();


