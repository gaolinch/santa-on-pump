#!/usr/bin/env tsx
/**
 * Analyze a specific Pump.fun transaction to understand buy/sell detection
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../../config/index';
import { solanaService } from '../../services/solana';
import { logger } from '../../utils/logger';

async function analyzePumpFunTransaction(signature: string) {
  console.log('\n='.repeat(80));
  console.log('ANALYZING PUMP.FUN TRANSACTION');
  console.log('='.repeat(80));
  console.log(`Signature: ${signature}\n`);

  try {
    // Fetch transaction
    console.log('Fetching transaction...');
    const tx = await solanaService.getTransaction(signature);
    
    if (!tx) {
      console.error('❌ Transaction not found');
      return;
    }

    console.log('✅ Transaction fetched\n');

    // Display transaction overview
    console.log('─'.repeat(80));
    console.log('TRANSACTION OVERVIEW:');
    console.log('─'.repeat(80));
    console.log(`Slot: ${tx.slot}`);
    console.log(`Block Time: ${tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : 'N/A'}`);
    console.log(`Transaction Fee: ${tx.meta?.fee || 0} lamports (${((tx.meta?.fee || 0) / 1e9).toFixed(6)} SOL)`);
    console.log(`Status: ${tx.meta?.err ? 'FAILED' : 'SUCCESS'}`);
    
    // Check for Pump.fun protocol fees in the transfers
    if (tx.meta?.postTokenBalances && tx.meta?.preTokenBalances) {
      console.log('\n🏦 FEE ANALYSIS:');
      const wsolMint = 'So11111111111111111111111111111111111111112';
      const postBalances = tx.meta.postTokenBalances;
      const preBalances = tx.meta.preTokenBalances;
      
      for (const postBalance of postBalances) {
        if (postBalance.mint === wsolMint) {
          const preBalance = preBalances.find(pb => pb.accountIndex === postBalance.accountIndex);
          if (preBalance) {
            const preAmount = BigInt(preBalance.uiTokenAmount.amount);
            const postAmount = BigInt(postBalance.uiTokenAmount.amount);
            const change = postAmount - preAmount;
            
            // Check if this looks like a fee account (small increase)
            if (change > 0n && change < 10000000n && postBalance.owner) { // Less than 0.01 SOL
              console.log(`  Fee Account: ${postBalance.owner}`);
              console.log(`  Fee Amount: ${change.toString()} lamports (${(Number(change) / 1e9).toFixed(6)} SOL)`);
              console.log(`  ≈ $${((Number(change) / 1e9) * 142).toFixed(4)} USD (at $142/SOL)`);
            }
          }
        }
      }
    }
    console.log();

    // Display token balance changes
    console.log('─'.repeat(80));
    console.log('TOKEN BALANCE CHANGES:');
    console.log('─'.repeat(80));
    
    if (tx.meta?.preTokenBalances && tx.meta?.postTokenBalances) {
      const preBalances = tx.meta.preTokenBalances;
      const postBalances = tx.meta.postTokenBalances;

      console.log(`Pre-balances: ${preBalances.length}`);
      console.log(`Post-balances: ${postBalances.length}\n`);

      // Match pre and post balances
      for (const postBalance of postBalances) {
        const preBalance = preBalances.find(
          pb => pb.accountIndex === postBalance.accountIndex
        );

        if (preBalance) {
          const preAmount = BigInt(preBalance.uiTokenAmount.amount);
          const postAmount = BigInt(postBalance.uiTokenAmount.amount);
          const change = postAmount - preAmount;
          const direction = change > 0n ? '📈 INCREASED' : change < 0n ? '📉 DECREASED' : '➡️  NO CHANGE';

          console.log(`Account Index: ${postBalance.accountIndex}`);
          console.log(`  Mint: ${postBalance.mint}`);
          console.log(`  Owner: ${postBalance.owner || 'N/A'}`);
          console.log(`  Pre:  ${preBalance.uiTokenAmount.uiAmount}`);
          console.log(`  Post: ${postBalance.uiTokenAmount.uiAmount}`);
          console.log(`  ${direction}: ${change.toString()}`);
          
          // Check if this is a Pump.fun account
          const isPumpFun = postBalance.owner?.includes('pAMM') || 
                           postBalance.owner === config.solana.pumpFunProgram;
          if (isPumpFun) {
            console.log(`  🎯 PUMP.FUN ACCOUNT!`);
          }
          console.log();
        }
      }
    }

    // Display SPL token transfers from instructions
    console.log('─'.repeat(80));
    console.log('SPL TOKEN TRANSFERS (from instructions):');
    console.log('─'.repeat(80));
    
    const instructions = tx.transaction.message.instructions;
    let transferCount = 0;
    
    for (const instruction of instructions) {
      if ('parsed' in instruction && 
          (instruction.program === 'spl-token' || instruction.program === 'spl-token-2022')) {
        const parsed = instruction.parsed;
        
        if (parsed.type === 'transfer' || parsed.type === 'transferChecked') {
          transferCount++;
          const info = parsed.info;
          
          console.log(`\nTransfer #${transferCount}:`);
          console.log(`  Type: ${parsed.type}`);
          console.log(`  Amount: ${info.amount || info.tokenAmount?.amount || 'N/A'}`);
          console.log(`  Source: ${info.source || 'N/A'}`);
          console.log(`  Destination: ${info.destination || 'N/A'}`);
          console.log(`  Authority: ${info.authority || 'N/A'}`);
          
          // Check if involved with Pump.fun
          const sourceIsPumpFun = info.source?.includes('pAMM') || 
                                 info.source === config.solana.pumpFunProgram;
          const destIsPumpFun = info.destination?.includes('pAMM') || 
                               info.destination === config.solana.pumpFunProgram;
          
          if (sourceIsPumpFun) {
            console.log(`  🎯 Source is Pump.fun → This transfer is FROM Pump.fun`);
          }
          if (destIsPumpFun) {
            console.log(`  🎯 Destination is Pump.fun → This transfer is TO Pump.fun`);
          }
        }
      }
    }

    // Test our parser
    console.log('\n' + '='.repeat(80));
    console.log('TESTING OUR PARSER:');
    console.log('='.repeat(80));
    
    const transfer = solanaService.parseTokenTransfer(tx, signature);
    if (transfer) {
      console.log('\n✅ Successfully parsed transaction:');
      console.log(`  From: ${transfer.from}`);
      console.log(`  To: ${transfer.to || 'N/A'}`);
      console.log(`  Amount: ${transfer.amount.toString()}`);
      console.log(`  Kind: ${transfer.kind.toUpperCase()} ${transfer.kind === 'buy' ? '🟢' : transfer.kind === 'sell' ? '🔴' : '🔵'}`);
      console.log(`  Transaction Fee: ${tx.meta?.fee || 0} lamports (${((tx.meta?.fee || 0) / 1e9).toFixed(6)} SOL)`);
      
      console.log('\n📊 INTERPRETATION:');
      if (transfer.kind === 'sell') {
        console.log('  This is a SELL transaction:');
        console.log('  - User is SENDING tokens TO Pump.fun');
        console.log('  - User is RECEIVING SOL FROM Pump.fun');
        console.log('  - Tokens went INTO Pump.fun\'s pool');
        console.log(`  - Network fee: ${((tx.meta?.fee || 0) / 1e9).toFixed(6)} SOL`);
      } else if (transfer.kind === 'buy') {
        console.log('  This is a BUY transaction:');
        console.log('  - User is SENDING SOL TO Pump.fun');
        console.log('  - User is RECEIVING tokens FROM Pump.fun');
        console.log('  - Tokens came OUT OF Pump.fun\'s pool');
        console.log(`  - Network fee: ${((tx.meta?.fee || 0) / 1e9).toFixed(6)} SOL`);
      }
    } else {
      console.log('\n❌ Could not parse transaction');
    }

    console.log('\n' + '='.repeat(80));

  } catch (error) {
    console.error('❌ Error analyzing transaction:', error);
  }
}

// Get signature from command line
const signature = process.argv[2];

if (!signature) {
  console.error('Usage: tsx analyze-pumpfun-tx.ts <signature>');
  process.exit(1);
}

analyzePumpFunTransaction(signature);

