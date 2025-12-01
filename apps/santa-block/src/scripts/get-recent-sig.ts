import { solanaService } from '../services/solana';
import { config } from '../config';

async function getRecentSignature() {
  const { PublicKey } = await import('@solana/web3.js');
  const tokenMint = new PublicKey(config.santa.tokenMint);
  
  const signatures = await solanaService.getSignaturesForAddress(tokenMint, undefined, 3);
  
  console.log('Recent signatures:');
  signatures.forEach((sig, i) => {
    console.log(`${i + 1}. ${sig.signature}`);
  });
}

getRecentSignature();




