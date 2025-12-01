/**
 * Base Gift Interface
 * 
 * Common interface for all gift types
 */

import { GiftSpec, TxRaw, HolderSnapshot } from '../../database';

export interface Winner {
  wallet: string;
  amount: bigint;
  reason?: string;
}

export interface TokenAirdrop {
  wallet: string;
  amount: number;
  hour?: number;
}

export interface GiftResult {
  winners: Winner[];
  totalDistributed: bigint;
  tokenAirdrops?: TokenAirdrop[];
  metadata?: any;
}

export interface GiftExecutionContext {
  spec: GiftSpec;
  transactions: TxRaw[];
  holders: HolderSnapshot[];
  treasuryBalance: bigint;
  blockhash: string;
}

/**
 * Base interface for gift implementations
 */
export interface IGiftHandler {
  /**
   * Execute the gift distribution logic
   */
  execute(context: GiftExecutionContext): Promise<GiftResult>;
  
  /**
   * Get the gift type name
   */
  getType(): string;
}

