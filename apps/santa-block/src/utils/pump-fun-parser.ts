/**
 * Pump.fun Transaction Parser
 * 
 * Parses enhanced transaction data from Helius or similar RPC providers
 * that include decoded pump.fun instruction data
 */

import { logger } from './logger';

/**
 * Enhanced Pump.fun transaction data structure
 * This is the format provided by Helius or similar enhanced RPC providers
 */
export interface PumpFunTransactionData {
  mint: string;
  solAmount: string;
  tokenAmount: string;
  isBuy: boolean;
  user: string;
  timestamp: string;
  virtualSolReserves: string;
  virtualTokenReserves: string;
  realSolReserves: string;
  realTokenReserves: string;
  feeRecipient: string;
  feeBasisPoints: string;
  fee: string;
  creator: string;
  creatorFeeBasisPoints: string;
  creatorFee: string;
  trackVolume: boolean;
  totalUnclaimedTokens: string;
  totalClaimedTokens: string;
  currentSolVolume: string;
  lastUpdateTimestamp: string;
  ixName: 'buy' | 'sell';
}

/**
 * Parse pump.fun transaction data from enhanced RPC response
 * 
 * @param txData - Transaction data object (could be in various formats)
 * @returns Parsed pump.fun data or null
 */
export function parsePumpFunData(txData: any): PumpFunTransactionData | null {
  try {
    // Check if this looks like pump.fun data
    if (!txData || typeof txData !== 'object') {
      return null;
    }

    // Check for required pump.fun fields
    const hasPumpFunFields = 
      'creatorFee' in txData &&
      'creatorFeeBasisPoints' in txData &&
      'ixName' in txData &&
      (txData.ixName === 'buy' || txData.ixName === 'sell');

    if (!hasPumpFunFields) {
      return null;
    }

    // Return the parsed data
    return {
      mint: txData.mint || '',
      solAmount: txData.solAmount || '0',
      tokenAmount: txData.tokenAmount || '0',
      isBuy: txData.isBuy ?? (txData.ixName === 'buy'),
      user: txData.user || '',
      timestamp: txData.timestamp || '0',
      virtualSolReserves: txData.virtualSolReserves || '0',
      virtualTokenReserves: txData.virtualTokenReserves || '0',
      realSolReserves: txData.realSolReserves || '0',
      realTokenReserves: txData.realTokenReserves || '0',
      feeRecipient: txData.feeRecipient || '',
      feeBasisPoints: txData.feeBasisPoints || '0',
      fee: txData.fee || '0',
      creator: txData.creator || '',
      creatorFeeBasisPoints: txData.creatorFeeBasisPoints || '0',
      creatorFee: txData.creatorFee || '0',
      trackVolume: txData.trackVolume ?? false,
      totalUnclaimedTokens: txData.totalUnclaimedTokens || '0',
      totalClaimedTokens: txData.totalClaimedTokens || '0',
      currentSolVolume: txData.currentSolVolume || '0',
      lastUpdateTimestamp: txData.lastUpdateTimestamp || '0',
      ixName: txData.ixName,
    };
  } catch (error) {
    logger.warn({ error }, 'Failed to parse pump.fun data');
    return null;
  }
}

/**
 * Extract creator fee from pump.fun transaction data
 * 
 * @param txData - Transaction data object
 * @returns Creator fee as bigint or undefined
 */
export function extractCreatorFeeFromPumpFun(txData: any): bigint | undefined {
  try {
    const pumpFunData = parsePumpFunData(txData);
    if (!pumpFunData) {
      return undefined;
    }

    const creatorFee = BigInt(pumpFunData.creatorFee);
    logger.info({ 
      creatorFee: creatorFee.toString(),
      creatorFeeBasisPoints: pumpFunData.creatorFeeBasisPoints,
      ixName: pumpFunData.ixName
    }, 'Extracted creatorFee from pump.fun data');

    return creatorFee;
  } catch (error) {
    logger.warn({ error }, 'Failed to extract creatorFee from pump.fun data');
    return undefined;
  }
}

/**
 * Check if transaction data contains pump.fun instruction data
 * 
 * @param txData - Transaction data object
 * @returns true if pump.fun data is present
 */
export function isPumpFunTransaction(txData: any): boolean {
  return parsePumpFunData(txData) !== null;
}

