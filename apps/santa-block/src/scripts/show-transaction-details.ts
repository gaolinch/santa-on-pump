#!/usr/bin/env tsx

/**
 * Show complete transaction details
 * 
 * This script displays ALL information available for a transaction:
 * - Database stored data
 * - Blockchain data (from RPC)
 * - Parsed token transfers
 * - Fee calculations
 * 
 * Usage:
 *   npx tsx src/scripts/show-transaction-details.ts [signature]
 *   
 * If no signature provided, shows details for the most recent transaction
 */

import '../config/index.js';
import { db, txRawRepo } from '../database/index.js';
import { solanaService } from '../services/solana.js';
import { logger } from '../utils/logger.js';

function formatNumber(value: bigint | number | string | null | undefined, decimals: number = 9): string {
  if (value === null || value === undefined) return 'N/A';
  const num = typeof value === 'bigint' ? Number(value) : typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return 'N/A';
  return (num / Math.pow(10, decimals)).toFixed(decimals);
}

function formatLamports(lamports: number | bigint | string | null | undefined): string {
  if (lamports === null || lamports === undefined) return 'N/A';
  const num = typeof lamports === 'bigint' ? Number(lamports) : typeof lamports === 'string' ? parseFloat(lamports) : lamports;
  if (isNaN(num)) return 'N/A';
  return `${num.toLocaleString()} lamports (${(num / 1e9).toFixed(9)} SOL)`;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString() + ' (' + d.toLocaleString() + ')';
}

async function showTransactionDetails(signature?: string) {
  try {
    let txSignature = signature;

    // If no signature provided, get the most recent transaction
    if (!txSignature) {
      console.log('📋 No signature provided, fetching most recent transaction...\n');
      const recent = await db.query(`
        SELECT signature FROM tx_raw 
        ORDER BY block_time DESC 
        LIMIT 1
      `);
      
      if (recent.rows.length === 0) {
        console.log('❌ No transactions found in database\n');
        return;
      }
      
      txSignature = recent.rows[0].signature;
    }

    if (!txSignature) {
      console.log('❌ No transaction signature provided\n');
      return;
    }

    console.log('================================================================================');
    console.log('TRANSACTION DETAILS');
    console.log('================================================================================\n');
    console.log(`Signature: ${txSignature}\n`);

    // ============================================================================
    // 1. DATABASE DATA
    // ============================================================================
    console.log('────────────────────────────────────────────────────────────────────────────────');
    console.log('📦 DATABASE STORED DATA');
    console.log('────────────────────────────────────────────────────────────────────────────────\n');

    const dbTx = await txRawRepo.findBySignature(txSignature);
    
    if (!dbTx) {
      console.log('⚠️  Transaction not found in database\n');
    } else {
      console.log(`  ID:              ${dbTx.id}`);
      console.log(`  Signature:       ${dbTx.signature}`);
      console.log(`  Slot:            ${dbTx.slot}`);
      console.log(`  Block Time:      ${formatDate(dbTx.block_time)}`);
      console.log(`  From Wallet:     ${dbTx.from_wallet}`);
      console.log(`  To Wallet:       ${dbTx.to_wallet || 'N/A'}`);
      console.log(`  Amount:          ${formatNumber(dbTx.amount)} tokens`);
      console.log(`  Amount (raw):    ${dbTx.amount.toString()}`);
      console.log(`  Kind:            ${dbTx.kind}`);
      console.log(`  Protocol Fee:    ${formatNumber(dbTx.fee || 0n)} tokens`);
      console.log(`  Protocol Fee (raw): ${(dbTx.fee || 0n).toString()}`);
      console.log(`  Network Fee:     ${formatLamports(dbTx.network_fee || 0n)}`);
      console.log(`  Network Fee (raw):  ${(dbTx.network_fee || 0n).toString()}`);
      console.log(`  Status:          ${dbTx.status}`);
      console.log(`  Created At:      ${formatDate(dbTx.metadata?.capturedAt || 'N/A')}`);
      
      if (dbTx.metadata) {
        console.log(`\n  Metadata:`);
        console.log(`    Source:        ${dbTx.metadata.source || 'N/A'}`);
        console.log(`    Subscription:  ${dbTx.metadata.subscriptionId || 'N/A'}`);
        console.log(`    Captured At:   ${dbTx.metadata.capturedAt || 'N/A'}`);
        if (dbTx.metadata.logs) {
          console.log(`    Logs:          ${dbTx.metadata.logs.length} lines`);
        }
        // Show any other metadata fields
        const otherFields = Object.keys(dbTx.metadata).filter(
          k => !['source', 'subscriptionId', 'capturedAt', 'logs'].includes(k)
        );
        if (otherFields.length > 0) {
          console.log(`    Other Fields:  ${otherFields.join(', ')}`);
        }
      }
      console.log('');
    }

    // ============================================================================
    // 2. BLOCKCHAIN DATA (from RPC)
    // ============================================================================
    console.log('────────────────────────────────────────────────────────────────────────────────');
    console.log('⛓️  BLOCKCHAIN DATA (from RPC)');
    console.log('────────────────────────────────────────────────────────────────────────────────\n');

    const blockchainTx = await solanaService.getTransaction(txSignature);
    
    if (!blockchainTx) {
      console.log('⚠️  Transaction not found on blockchain (may be too old or not finalized)\n');
    } else {
      console.log(`  Slot:            ${blockchainTx.slot}`);
      console.log(`  Block Time:      ${formatDate(blockchainTx.blockTime ? new Date(blockchainTx.blockTime * 1000) : null)}`);
      
      // Transaction metadata
      if (blockchainTx.meta) {
        console.log(`\n  Transaction Meta:`);
        console.log(`    Fee:           ${formatLamports(blockchainTx.meta.fee)}`);
        console.log(`    Status:        ${blockchainTx.meta.err ? 'Failed' : 'Success'}`);
        if (blockchainTx.meta.err) {
          console.log(`    Error:         ${JSON.stringify(blockchainTx.meta.err)}`);
        }
        console.log(`    Compute Units: ${blockchainTx.meta.computeUnitsConsumed || 'N/A'}`);
        
        // Pre/Post balances
        if (blockchainTx.meta.preBalances && blockchainTx.meta.postBalances) {
          console.log(`\n    Account Balances (lamports):`);
          blockchainTx.meta.preBalances.forEach((pre, idx) => {
            const post = blockchainTx.meta!.postBalances[idx];
            const diff = post - pre;
            const sign = diff > 0 ? '+' : '';
            console.log(`      Account ${idx}: ${pre.toLocaleString()} -> ${post.toLocaleString()} (${sign}${diff.toLocaleString()})`);
          });
        }
        
        // Token balances
        if (blockchainTx.meta.preTokenBalances && blockchainTx.meta.postTokenBalances) {
          console.log(`\n    Token Balances:`);
          const tokenChanges = new Map<string, any>();
          
          // Collect pre balances
          blockchainTx.meta.preTokenBalances.forEach(balance => {
            const key = `${balance.accountIndex}-${balance.mint}`;
            tokenChanges.set(key, { ...balance, post: null });
          });
          
          // Collect post balances
          blockchainTx.meta.postTokenBalances.forEach(balance => {
            const key = `${balance.accountIndex}-${balance.mint}`;
            const existing = tokenChanges.get(key);
            if (existing) {
              existing.post = balance.uiTokenAmount;
            } else {
              tokenChanges.set(key, { ...balance, pre: null });
            }
          });
          
          // Display changes
          tokenChanges.forEach((change, key) => {
            const preAmount = change.uiTokenAmount?.uiAmountString || '0';
            const postAmount = change.post?.uiAmountString || '0';
            console.log(`      Account ${change.accountIndex}:`);
            console.log(`        Mint:    ${change.mint}`);
            console.log(`        Change:  ${preAmount} -> ${postAmount}`);
          });
        }
        
        // Log messages
        if (blockchainTx.meta.logMessages && blockchainTx.meta.logMessages.length > 0) {
          console.log(`\n    Log Messages (${blockchainTx.meta.logMessages.length}):`);
          blockchainTx.meta.logMessages.slice(0, 10).forEach((log, idx) => {
            console.log(`      ${idx + 1}. ${log}`);
          });
          if (blockchainTx.meta.logMessages.length > 10) {
            console.log(`      ... and ${blockchainTx.meta.logMessages.length - 10} more`);
          }
        }
      }
      
      // Transaction details
      if (blockchainTx.transaction) {
        console.log(`\n  Transaction:`);
        console.log(`    Signatures:    ${blockchainTx.transaction.signatures.join(', ')}`);
        
        // Message
        const message = blockchainTx.transaction.message;
        console.log(`    Instructions:  ${message.instructions.length}`);
        console.log(`    Accounts:      ${message.accountKeys.length}`);
        
        // Recent blockhash
        console.log(`    Recent Hash:   ${message.recentBlockhash}`);
        
        // Account keys
        console.log(`\n    Account Keys:`);
        message.accountKeys.slice(0, 5).forEach((key: any, idx) => {
          const pubkey = key && typeof key === 'object' && 'pubkey' in key 
            ? key.pubkey.toString() 
            : key?.toString ? key.toString() : 'unknown';
          const signer = key && typeof key === 'object' && 'signer' in key ? key.signer : false;
          const writable = key && typeof key === 'object' && 'writable' in key ? key.writable : false;
          console.log(`      ${idx}. ${pubkey} ${signer ? '[signer]' : ''} ${writable ? '[writable]' : ''}`);
        });
        if (message.accountKeys.length > 5) {
          console.log(`      ... and ${message.accountKeys.length - 5} more`);
        }
        
        // Instructions
        console.log(`\n    Instructions:`);
        message.instructions.slice(0, 3).forEach((ix: any, idx) => {
          console.log(`      ${idx + 1}. Program: ${message.accountKeys[ix.programIdIndex]}`);
          if ('parsed' in ix && ix.parsed) {
            console.log(`         Type: ${ix.parsed.type || 'unknown'}`);
            if (ix.parsed.info) {
              console.log(`         Info: ${JSON.stringify(ix.parsed.info, null, 10).substring(0, 200)}...`);
            }
          }
        });
        if (message.instructions.length > 3) {
          console.log(`      ... and ${message.instructions.length - 3} more`);
        }
      }
      
      console.log('');
    }

    // ============================================================================
    // 3. PARSED TOKEN TRANSFER
    // ============================================================================
    console.log('────────────────────────────────────────────────────────────────────────────────');
    console.log('🔍 PARSED TOKEN TRANSFER (our parsing logic)');
    console.log('────────────────────────────────────────────────────────────────────────────────\n');

    if (blockchainTx) {
      const transfer = solanaService.parseTokenTransfer(blockchainTx, txSignature);
      
      if (!transfer) {
        console.log('⚠️  No token transfer found in transaction\n');
      } else {
        console.log(`  From:            ${transfer.from}`);
        console.log(`  To:              ${transfer.to || 'N/A'}`);
        console.log(`  Amount:          ${formatNumber(transfer.amount)} tokens`);
        console.log(`  Amount (raw):    ${transfer.amount.toString()}`);
        console.log(`  Kind:            ${transfer.kind}`);
        console.log('');
      }
    }

    // ============================================================================
    // 4. FEE CALCULATION VERIFICATION
    // ============================================================================
    console.log('────────────────────────────────────────────────────────────────────────────────');
    console.log('💰 FEE CALCULATION VERIFICATION');
    console.log('────────────────────────────────────────────────────────────────────────────────\n');

    if (dbTx && blockchainTx) {
      const transfer = solanaService.parseTokenTransfer(blockchainTx, txSignature);
      if (transfer) {
        // Get fee percentage from config
        const { config } = await import('../config/index.js');
        const feePercent = config.santa.feePercent || 1;
        
        const expectedProtocolFee = (transfer.amount * BigInt(feePercent)) / BigInt(100);
        const actualProtocolFee = BigInt(dbTx.fee || 0n);
        const protocolFeeMatch = expectedProtocolFee.toString() === actualProtocolFee.toString();
        
        const expectedNetworkFee = blockchainTx.meta?.fee || 0;
        const actualNetworkFee = Number(dbTx.network_fee || 0n);
        const networkFeeMatch = expectedNetworkFee === actualNetworkFee;
        
        console.log(`  Fee Percentage:       ${feePercent}%`);
        console.log(`  Transaction Amount:   ${formatNumber(transfer.amount)} tokens`);
        console.log('');
        console.log(`  Protocol Fee:`);
        console.log(`    Expected:           ${formatNumber(expectedProtocolFee)} tokens`);
        console.log(`    Stored in DB:       ${formatNumber(actualProtocolFee)} tokens`);
        console.log(`    Match:              ${protocolFeeMatch ? '✅ YES' : '❌ NO'}`);
        console.log('');
        console.log(`  Network Fee:`);
        console.log(`    Expected (RPC):     ${formatLamports(expectedNetworkFee)}`);
        console.log(`    Stored in DB:       ${formatLamports(actualNetworkFee)}`);
        console.log(`    Match:              ${networkFeeMatch ? '✅ YES' : '❌ NO'}`);
        console.log('');
      }
    }

    console.log('================================================================================\n');

  } catch (error) {
    logger.error({ error }, 'Failed to show transaction details');
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    console.log('');
  } finally {
    await db.close();
  }
}

// Get signature from command line arguments
const signature = process.argv[2];

if (signature && signature.length < 50) {
  console.log('❌ Invalid signature format. Signature should be 87-88 characters long.\n');
  process.exit(1);
}

showTransactionDetails(signature);

