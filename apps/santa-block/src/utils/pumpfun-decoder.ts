/**
 * Pump.fun Instruction Decoder
 * 
 * Decodes Pump.fun program instructions to extract fee information
 * including creatorFee, creatorFeeBasisPoints, and other trade data.
 */

import { logger } from './logger';
import bs58 from 'bs58';

// Pump.fun program IDs
export const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_FEES_PROGRAM_ID = 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ';

/**
 * Pump.fun instruction discriminators (first 8 bytes of instruction data)
 * These identify which instruction is being called
 * 
 * These are derived from the instruction name hash
 */
const INSTRUCTION_DISCRIMINATORS = {
  // Actual discriminators from real transactions
  // SELL: 33 e6 85 a4 01 7f 83 ad (verified from transaction 2VpzCQgu...)
  SELL: Buffer.from([51, 230, 133, 164, 1, 127, 131, 173]), // sell instruction (verified)
  BUY: Buffer.from([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea]), // buy instruction (to be verified)
};

/**
 * Decoded Pump.fun trade data
 */
export interface PumpFunTradeData {
  instructionType: 'buy' | 'sell';
  tokenAmount: bigint;
  solAmount: bigint;
  maxSolCost?: bigint;  // for buy
  minSolOutput?: bigint; // for sell
}

/**
 * Pump.fun fee data extracted from accounts and logs
 */
export interface PumpFunFeeData {
  creatorFee?: bigint;
  creatorFeeBasisPoints?: number;
  protocolFee?: bigint;
  protocolFeeBasisPoints?: number;
}

/**
 * Check if a program ID is the Pump.fun program
 */
export function isPumpFunProgram(programId: string): boolean {
  return programId === PUMP_FUN_PROGRAM_ID;
}

/**
 * Check if a program ID is the Pump Fees program
 */
export function isPumpFeesProgram(programId: string): boolean {
  return programId === PUMP_FEES_PROGRAM_ID;
}

/**
 * Decode Pump Fees Program instruction data
 * 
 * The Pump Fees Program provides fee information for trades.
 * 
 * Format (33 bytes):
 * - Bytes 0-7: discriminator/flags
 * - Bytes 8-24: market_cap_lamports (u128 = 16 bytes)
 * - Bytes 25-32: trade_size_lamports (u64 = 8 bytes)
 * 
 * Fees calculated from trade_size_lamports:
 * - Protocol fee: 0.95% (95 basis points)
 * - Creator fee: 0.3% (30 basis points)
 */
export function decodePumpFeesInstruction(data: string | Buffer): { 
  tradeSizeLamports: bigint;
  protocolFee: bigint;
  protocolFeeBps: number;
  creatorFee: bigint;
  creatorFeeBps: number;
} | null {
  try {
    // Convert to Buffer (bs58.decode returns Uint8Array, we need Buffer)
    const decoded = typeof data === 'string' ? bs58.decode(data) : data;
    const buffer = Buffer.from(decoded);
    
    if (buffer.length >= 33) {
      // Read bytes 25-32 as trade_size_lamports (u64, little-endian)
      const tradeSizeLamports = buffer.readBigUInt64LE(25);
      
      // Calculate fees
      const protocolFeeBps = 95; // 0.95%
      const creatorFeeBps = 30;  // 0.3%
      const protocolFee = calculateCreatorFee(tradeSizeLamports, protocolFeeBps);
      const creatorFee = calculateCreatorFee(tradeSizeLamports, creatorFeeBps);
      
      logger.debug({
        tradeSizeLamports: tradeSizeLamports.toString(),
        tradeSizeSol: (Number(tradeSizeLamports) / 1e9).toFixed(9),
        protocolFee: protocolFee.toString(),
        creatorFee: creatorFee.toString()
      }, 'Decoded Pump Fees instruction');
      
      return { 
        tradeSizeLamports,
        protocolFee,
        protocolFeeBps,
        creatorFee,
        creatorFeeBps
      };
    }
    
    logger.warn({ bufferLength: buffer.length }, 'Pump Fees instruction data too short');
    return null;
  } catch (error) {
    logger.error({ error }, 'Failed to decode Pump Fees instruction');
    return null;
  }
}

/**
 * Decode Pump.fun instruction data
 * 
 * Pump.fun instructions have this structure:
 * - Bytes 0-7: Instruction discriminator (identifies the instruction type)
 * - Remaining bytes: Instruction-specific data
 * 
 * Note: This is currently not used as we extract fees from the Pump Fees Program instead.
 * Kept for potential future use.
 */
export function decodePumpFunInstruction(data: string | Buffer): PumpFunTradeData | null {
  try {
    // Convert to Buffer (bs58.decode returns Uint8Array, we need Buffer)
    const decoded = typeof data === 'string' ? bs58.decode(data) : data;
    const buffer = Buffer.from(decoded);
    
    if (buffer.length < 8) {
      return null;
    }

    // Extract discriminator (first 8 bytes)
    const discriminator = buffer.slice(0, 8);
    
    // Check if it's a BUY instruction
    if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.BUY)) {
      return decodeBuyInstruction(buffer);
    }
    
    // Check if it's a SELL instruction
    if (discriminator.equals(INSTRUCTION_DISCRIMINATORS.SELL)) {
      return decodeSellInstruction(buffer);
    }
    
    return null;
  } catch (error) {
    logger.debug({ error }, 'Failed to decode Pump.fun instruction');
    return null;
  }
}

/**
 * Decode BUY instruction
 * 
 * Format (24 bytes):
 * - Bytes 0-7: Discriminator
 * - Bytes 8-15: Token amount (little-endian u64)
 * - Bytes 16-23: Max SOL cost (little-endian u64)
 */
function decodeBuyInstruction(buffer: Buffer): PumpFunTradeData | null {
  try {
    if (buffer.length < 24) {
      return null;
    }

    // Read token amount (bytes 8-15, little-endian u64)
    const tokenAmount = buffer.readBigUInt64LE(8);
    
    // Read max SOL cost (bytes 16-23, little-endian u64)
    const maxSolCost = buffer.readBigUInt64LE(16);

    return {
      instructionType: 'buy',
      tokenAmount,
      solAmount: maxSolCost,
      maxSolCost,
    };
  } catch (error) {
    logger.debug({ error }, 'Failed to decode BUY instruction');
    return null;
  }
}

/**
 * Decode SELL instruction
 * 
 * Format (24 bytes):
 * - Bytes 0-7: Discriminator
 * - Bytes 8-15: Token amount (little-endian u64)
 * - Bytes 16-23: Min SOL output (little-endian u64)
 */
function decodeSellInstruction(buffer: Buffer): PumpFunTradeData | null {
  try {
    if (buffer.length < 24) {
      return null;
    }

    // Read token amount (bytes 8-15, little-endian u64)
    const tokenAmount = buffer.readBigUInt64LE(8);
    
    // Read min SOL output (bytes 16-23, little-endian u64)
    const minSolOutput = buffer.readBigUInt64LE(16);

    return {
      instructionType: 'sell',
      tokenAmount,
      solAmount: minSolOutput,
      minSolOutput,
    };
  } catch (error) {
    logger.debug({ error }, 'Failed to decode SELL instruction');
    return null;
  }
}

/**
 * Calculate creator fee from SOL amount and basis points
 * 
 * @param solAmount - SOL amount in lamports
 * @param basisPoints - Fee in basis points (1 bp = 0.01%)
 * @returns Creator fee in lamports
 * 
 * Example: calculateCreatorFee(1000000n, 30) = 300n (0.3% fee)
 */
export function calculateCreatorFee(solAmount: bigint, basisPoints: number): bigint {
  return (solAmount * BigInt(basisPoints)) / BigInt(10000);
}

