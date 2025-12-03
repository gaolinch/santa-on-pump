#!/usr/bin/env ts-node

/**
 * Manual Transaction Insertion Script
 * 
 * This script allows you to manually insert a transaction into the database
 * by providing its signature. It will:
 * 1. Fetch the transaction from Solana blockchain
 * 2. Parse the transaction details (amount, fees, type, etc.)
 * 3. Insert it into the tx_raw table
 * 
 * Usage:
 *   npm run insert-tx <signature>
 *   
 * Example:
 *   npm run insert-tx hFASB4vGKEeZhfbk9RnLErP2f1BcR9oPUWt9fTtpZsHPXVjWh51aPunEpgMhqHDgybXiR5ApdxqhiGJB19Z8DAs
 */

import { solanaService } from '../../services/solana';
import { txRawRepo } from '../../database';
import { logger } from '../../utils/logger';

interface InsertResult {
  success: boolean;
  signature: string;
  inserted: boolean;
  alreadyExists: boolean;
  error?: string;
  details?: {
    slot: number;
    blockTime: Date;
    from: string;
    to: string;
    amount: string;
    kind: string;
    protocolFee: string;
    creatorFee: string;
    networkFee: string;
  };
}

async function insertTransactionManually(signature: string): Promise<InsertResult> {
  const result: InsertResult = {
    success: false,
    signature,
    inserted: false,
    alreadyExists: false,
  };

  try {
    logger.info({ signature }, '🔍 Fetching transaction from Solana blockchain...');

    // Check if transaction already exists in database
    const existing = await txRawRepo.findBySignature(signature);
    if (existing) {
      logger.warn({ signature }, '⚠️  Transaction already exists in database');
      result.alreadyExists = true;
      result.success = true;
      result.details = {
        slot: existing.slot,
        blockTime: existing.block_time,
        from: existing.from_wallet,
        to: existing.to_wallet || 'N/A',
        amount: existing.amount.toString(),
        kind: existing.kind,
        protocolFee: (existing.fee || BigInt(0)).toString(),
        creatorFee: (existing.creator_fee || BigInt(0)).toString(),
        networkFee: (existing.network_fee || BigInt(0)).toString(),
      };
      return result;
    }

    // Fetch transaction from Solana
    const tx = await solanaService.getParsedTransaction(signature);
    
    if (!tx) {
      throw new Error('Transaction not found on Solana blockchain');
    }

    if (!tx.blockTime) {
      throw new Error('Transaction has no block time');
    }

    logger.info({ 
      signature, 
      slot: tx.slot, 
      blockTime: new Date(tx.blockTime * 1000).toISOString() 
    }, '✅ Transaction found on blockchain');

    // Parse token transfers (may return multiple for multi-buyer transactions)
    logger.info({ signature }, '🔍 Parsing token transfers...');
    const transfers = solanaService.parseTokenTransfers(tx, signature);

    if (!transfers || transfers.length === 0) {
      throw new Error('Could not parse token transfer from transaction');
    }

    logger.info({
      signature,
      transferCount: transfers.length,
      transfers: transfers.map(t => ({
        from: t.from,
        to: t.to || 'N/A',
        amount: t.amount.toString(),
        kind: t.kind,
        sub_tx: t.sub_tx,
      }))
    }, `✅ Token transfer(s) parsed successfully (${transfers.length} transfer${transfers.length > 1 ? 's' : ''})`);

    const networkFee = tx.meta?.fee || 0;

    // Insert all transfers into database
    logger.info({ signature, count: transfers.length }, '💾 Inserting into database...');
    const insertedIds: string[] = [];
    
    for (const transfer of transfers) {
      const protocolFee = transfer.protocolFee || BigInt(0);
      const creatorFee = transfer.creatorFee || BigInt(0);
      const creatorFeeBps = transfer.creatorFeeBps || 30;
      
      const insertedId = await txRawRepo.insert({
        signature,
        sub_tx: transfer.sub_tx,
        slot: tx.slot,
        block_time: new Date(tx.blockTime * 1000),
        from_wallet: transfer.from,
        to_wallet: transfer.to ?? undefined,
        amount: transfer.amount,
        kind: transfer.kind,
        fee: protocolFee,
        network_fee: BigInt(networkFee),
        creator_fee: creatorFee,
        creator_fee_bps: creatorFeeBps,
        status: 'finalized',
        metadata: {
          signatures: tx.transaction.signatures,
          manuallyInserted: true,
          insertedAt: new Date().toISOString(),
          subTxIndex: transfer.sub_tx,
          totalSubTx: transfers.length,
        },
      });

      if (insertedId) {
        insertedIds.push(insertedId);
      }
    }

    if (insertedIds.length === 0) {
      throw new Error('Failed to insert transaction (no IDs returned)');
    }

    logger.info({ 
      signature, 
      ids: insertedIds, 
      count: insertedIds.length 
    }, `✅ Transaction successfully inserted (${insertedIds.length} sub-transaction${insertedIds.length > 1 ? 's' : ''})!`);

    result.success = true;
    result.inserted = true;
    // Use first transfer for summary (or aggregate if multiple)
    const firstTransfer = transfers[0];
    const totalAmount = transfers.reduce((sum, t) => sum + t.amount, BigInt(0));
    result.details = {
      slot: tx.slot,
      blockTime: new Date(tx.blockTime * 1000),
      from: firstTransfer.from,
      to: firstTransfer.to || 'N/A',
      amount: totalAmount.toString(), // Show total amount
      kind: firstTransfer.kind,
      protocolFee: (firstTransfer.protocolFee || BigInt(0)).toString(),
      creatorFee: (firstTransfer.creatorFee || BigInt(0)).toString(),
      networkFee: networkFee.toString(),
    };

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, signature }, '❌ Failed to insert transaction');
    result.error = errorMessage;
    return result;
  }
}

async function main() {
  const signature = process.argv[2];

  if (!signature) {
    console.error('❌ Error: Transaction signature is required');
    console.error('');
    console.error('Usage:');
    console.error('  npm run insert-tx <signature>');
    console.error('');
    console.error('Example:');
    console.error('  npm run insert-tx hFASB4vGKEeZhfbk9RnLErP2f1BcR9oPUWt9fTtpZsHPXVjWh51aPunEpgMhqHDgybXiR5ApdxqhiGJB19Z8DAs');
    process.exit(1);
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📝 Manual Transaction Insertion');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Signature: ${signature}`);
  console.log('');

  const result = await insertTransactionManually(signature);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📊 Result');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  if (result.success) {
    if (result.alreadyExists) {
      console.log('⚠️  Transaction already exists in database');
    } else if (result.inserted) {
      console.log('✅ Transaction successfully inserted!');
    }

    if (result.details) {
      console.log('');
      console.log('Transaction Details:');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(`  Slot:         ${result.details.slot}`);
      console.log(`  Block Time:   ${result.details.blockTime.toISOString()}`);
      console.log(`  From:         ${result.details.from}`);
      console.log(`  To:           ${result.details.to}`);
      console.log(`  Amount:       ${result.details.amount} lamports (${(Number(result.details.amount) / 1e9).toFixed(9)} tokens)`);
      console.log(`  Kind:         ${result.details.kind.toUpperCase()}`);
      console.log(`  Protocol Fee: ${result.details.protocolFee} lamports (${(Number(result.details.protocolFee) / 1e9).toFixed(9)} SOL)`);
      console.log(`  Creator Fee:  ${result.details.creatorFee} lamports (${(Number(result.details.creatorFee) / 1e9).toFixed(9)} SOL)`);
      console.log(`  Network Fee:  ${result.details.networkFee} lamports (${(Number(result.details.networkFee) / 1e9).toFixed(9)} SOL)`);
      console.log('');
    }
  } else {
    console.log('❌ Failed to insert transaction');
    if (result.error) {
      console.log('');
      console.log(`Error: ${result.error}`);
    }
    console.log('');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  process.exit(0);
}

// Run the script
main().catch((error) => {
  logger.error({ error }, '❌ Unhandled error in main');
  console.error('');
  console.error('❌ Unhandled error:', error);
  console.error('');
  process.exit(1);
});

