/**
 * Shared types and utilities for Santa project
 */

// Gift Types
export type GiftType =
  | 'full_donation_to_ngo'
  | 'top_buyers_airdrop'
  | 'last_second_hour'
  | 'deterministic_random'
  | 'proportional_holders';

export interface GiftSpec {
  day: number;
  type: GiftType;
  params: Record<string, any>;
  distribution_source?: string;
  notes?: string;
  hash?: string;
}

export interface Winner {
  wallet: string;
  amount: bigint | string;
  reason?: string;
}

export interface GiftResult {
  winners: Winner[];
  totalDistributed: bigint | string;
  metadata?: Record<string, any>;
}

// API Types
export interface DayStats {
  day: string;
  pool: {
    fees_in: string;
    fees_out: string;
    net: string;
    tx_count: number;
    holder_count: number;
    status: 'open' | 'closed' | 'executed';
  } | null;
  treasury_balance: string;
  transactions_today: number;
  unique_holders: number;
}

export interface SeasonStats {
  season: string;
  days_active: number;
  total_fees_collected: string;
  total_fees_distributed: string;
  total_transactions: number;
  unique_wallets: number;
  avg_holders_per_day: number;
}

export interface Proof {
  day: number;
  gift_spec: {
    type: GiftType;
    params: Record<string, any>;
    notes?: string;
    hash: string;
  };
  executions: Array<{
    id: string;
    winners: Winner[];
    tx_hashes: string[];
    total_distributed: string;
    execution_time: string;
    status: 'pending' | 'executed' | 'confirmed' | 'failed';
    error_message?: string;
  }>;
  verified: boolean;
}

export interface CommitmentStatus {
  committed: boolean;
  revealed: boolean;
  hash?: string;
  timestamp?: string;
}

// Transaction Types
export type TransactionKind = 'buy' | 'sell' | 'transfer';

export interface Transaction {
  signature: string;
  slot: number;
  block_time: string;
  from_wallet: string;
  to_wallet?: string;
  amount: string;
  kind: TransactionKind;
  fee?: string;
  status: 'confirmed' | 'finalized' | 'failed';
}

// Constants
export const SANTA_SEASON_START = '2025-12-01';
export const SANTA_SEASON_END = '2025-12-24';
export const ADVENT_DAYS = 24;

// Utility Types
export type AdventDay = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24;

export function isValidAdventDay(day: number): day is AdventDay {
  return day >= 1 && day <= 24;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: boolean;
    rpc: boolean;
  };
  details?: Record<string, any>;
}

// Frontend-specific types (from santa-web)
export interface DayProof {
  day: number;
  gift: {
    name: string;
    type: GiftType;
    params: Record<string, unknown>;
    distribution_source: 'treasury_daily_fees' | 'treasury_reserve';
    notes?: string;
  };
  salt: string; // hex
  leaf: string; // sha256 hex
  proof: string[]; // hex sibling nodes
  root: string; // merkle root hex
  executions: {
    close_at_utc: string; // ISO
    tx_hashes: string[];
    published_at_utc: string;
  };
}

export interface StatsToday {
  date_utc: string;
  holders: number;
  volume_24h: number;
  fees_24h: number;
  treasury_balance: number;
}

export interface Commitment {
  root: string;
  hash: string;
  published_at_utc: string;
  metadata?: {
    season: number;
    year: number;
  };
}

