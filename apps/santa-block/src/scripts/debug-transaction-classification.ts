#!/usr/bin/env ts-node

/**
 * Debug Transaction Classification
 * 
 * Analyzes a transaction to understand why it's being classified as buy/sell
 */

import { solanaService } from '../services/solana';
import { logger } from '../utils/logger';

async function debugTransaction(signature: string) {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  🔍 Transaction Classification Debug');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log(`Signature: ${signature}\n`);

  try {
    // Fetch transaction
    const tx = await solanaService.getParsedTransaction(signature);
    
    if (!tx) {
      console.error('❌ Transaction not found');
      return;
    }

    console.log('✅ Transaction found');
    console.log(`Slot: ${tx.slot}`);
    console.log(`Block Time: ${new Date((tx.blockTime || 0) * 1000).toISOString()}\n`);

    // Analyze token balances
    console.log('─────────────────────────────────────────────────────────────');
    console.log('Token Balance Analysis:');
    console.log('─────────────────────────────────────────────────────────────\n');

    if (!tx.meta?.preTokenBalances || !tx.meta?.postTokenBalances) {
      console.error('❌ No token balance data');
      return;
    }

    const preBalances = tx.meta.preTokenBalances;
    const postBalances = tx.meta.postTokenBalances;

    console.log(`Pre-balances: ${preBalances.length}`);
    console.log(`Post-balances: ${postBalances.length}\n`);

    // Get all mints
    const mints = new Set([
      ...preBalances.map(b => b.mint),
      ...postBalances.map(b => b.mint)
    ]);

    console.log('Token mints in transaction:');
    mints.forEach(mint => {
      if (mint === 'So11111111111111111111111111111111111111112') {
        console.log(`  - ${mint} (WSOL/SOL)`);
      } else {
        console.log(`  - ${mint} (Project Token)`);
      }
    });
    console.log('');

    // Analyze each token balance change
    console.log('Token Balance Changes:');
    console.log('─────────────────────────────────────────────────────────────\n');

    for (const postBalance of postBalances) {
      const preBalance = preBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
      const preAmount = preBalance ? BigInt(preBalance.uiTokenAmount.amount) : BigInt(0);
      const postAmount = BigInt(postBalance.uiTokenAmount.amount);
      const change = postAmount - preAmount;
      const changeAbs = change < 0n ? -change : change;
      const direction = change > 0n ? '📈 INCREASE' : change < 0n ? '📉 DECREASE' : '➡️  NO CHANGE';

      console.log(`Account Index: ${postBalance.accountIndex}`);
      console.log(`  Mint: ${postBalance.mint}`);
      console.log(`  Owner: ${postBalance.owner}`);
      console.log(`  Pre:  ${preAmount.toString()} (${(Number(preAmount) / 1e9).toFixed(6)} tokens)`);
      console.log(`  Post: ${postAmount.toString()} (${(Number(postAmount) / 1e9).toFixed(6)} tokens)`);
      console.log(`  ${direction}: ${changeAbs.toString()} (${(Number(changeAbs) / 1e9).toFixed(6)} tokens)`);
      console.log('');
    }

    // Analyze WSOL changes
    console.log('SOL/WSOL Balance Changes:');
    console.log('─────────────────────────────────────────────────────────────\n');

    const wsolMint = 'So11111111111111111111111111111111111111112';
    const wsolBalances = postBalances.filter(b => b.mint === wsolMint);

    for (const postBalance of wsolBalances) {
      const preBalance = preBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
      if (!preBalance) continue;

      const preAmount = BigInt(preBalance.uiTokenAmount.amount);
      const postAmount = BigInt(postBalance.uiTokenAmount.amount);
      const change = postAmount - preAmount;
      const changeAbs = change < 0n ? -change : change;
      const direction = change > 0n ? '📈 INCREASE' : change < 0n ? '📉 DECREASE' : '➡️  NO CHANGE';

      console.log(`Account Index: ${postBalance.accountIndex}`);
      console.log(`  Owner: ${postBalance.owner}`);
      console.log(`  Pre:  ${preAmount.toString()} lamports (${(Number(preAmount) / 1e9).toFixed(9)} SOL)`);
      console.log(`  Post: ${postAmount.toString()} lamports (${(Number(postAmount) / 1e9).toFixed(9)} SOL)`);
      console.log(`  ${direction}: ${changeAbs.toString()} lamports (${(Number(changeAbs) / 1e9).toFixed(9)} SOL)`);
      console.log('');
    }

    // Parse using the service
    console.log('Service Classification:');
    console.log('─────────────────────────────────────────────────────────────\n');

    const transfer = solanaService.parseTokenTransfer(tx, signature);

    if (transfer) {
      console.log(`✅ Parsed as: ${transfer.kind.toUpperCase()}`);
      console.log(`  From: ${transfer.from}`);
      console.log(`  To: ${transfer.to || 'N/A'}`);
      console.log(`  Amount: ${transfer.amount.toString()} (${(Number(transfer.amount) / 1e9).toFixed(6)} tokens)`);
    } else {
      console.log('❌ Failed to parse transfer');
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');

    // Provide analysis
    console.log('Analysis:');
    console.log('─────────────────────────────────────────────────────────────\n');

    // Find the bonding curve account
    const bondingCurveAccount = postBalances.find(b => 
      b.mint !== wsolMint && b.owner?.includes('ELoXCCRa1HcFGgothnMFUeFz7vcqKCHHG5HxBnX7xkMf')
    );

    if (bondingCurveAccount) {
      const preBalance = preBalances.find(pb => pb.accountIndex === bondingCurveAccount.accountIndex);
      const preAmount = preBalance ? BigInt(preBalance.uiTokenAmount.amount) : BigInt(0);
      const postAmount = BigInt(bondingCurveAccount.uiTokenAmount.amount);
      const change = postAmount - preAmount;

      console.log('Bonding Curve Account Analysis:');
      console.log(`  Account: ${bondingCurveAccount.owner}`);
      console.log(`  Change: ${change > 0n ? 'INCREASED' : 'DECREASED'} by ${(change < 0n ? -change : change).toString()}`);
      
      if (change < 0n) {
        console.log('\n  ✅ Bonding curve DECREASED = tokens went OUT = BUY');
        console.log('     (User bought tokens from the bonding curve)');
      } else {
        console.log('\n  ⚠️  Bonding curve INCREASED = tokens went IN = SELL');
        console.log('     (User sold tokens to the bonding curve)');
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

const signature = process.argv[2];
if (!signature) {
  console.error('Usage: npm run debug-tx-class <signature>');
  process.exit(1);
}

debugTransaction(signature).then(() => process.exit(0));

