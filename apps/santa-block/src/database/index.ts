import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

class Database {
  private pool: Pool;

  constructor() {
    // Use DATABASE_URL if available (Railway, Heroku, etc.), otherwise use individual config
    const connectionConfig = config.database.url
      ? {
          connectionString: config.database.url,
          ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        }
      : {
          host: config.database.host,
          port: config.database.port,
          database: config.database.name,
          user: config.database.user,
          password: config.database.password,
          ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        };

    this.pool = new Pool(connectionConfig);

    logger.info(
      {
        usingConnectionString: !!config.database.url,
        ssl: config.database.ssl,
      },
      'Database pool initialized'
    );

    this.pool.on('error', (err: Error) => {
      logger.error({ err }, 'Unexpected database pool error');
    });

    this.pool.on('connect', () => {
      logger.debug('New database connection established');
    });

    this.pool.on('remove', () => {
      logger.debug('Database connection removed from pool');
    });
  }

  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      logger.debug({ text, duration, rows: result.rowCount }, 'Executed query');
      return result;
    } catch (error) {
      logger.error({ error, text }, 'Database query error');
      throw error;
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
    logger.info('Database pool closed');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.query('SELECT NOW()');
      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      logger.error({ error }, 'Database health check failed');
      return false;
    }
  }
}

export const db = new Database();

// Database models/repositories

export interface TxRaw {
  id?: string;
  signature: string;
  sub_tx?: number; // Sub-transaction index (0 = single transfer, 1+ = multiple transfers)
  slot: number;
  block_time: Date;
  from_wallet: string;
  to_wallet?: string;
  amount: bigint;
  kind: 'buy' | 'sell' | 'transfer';
  fee?: bigint; // Pump.fun protocol fee (0.95% = 95 basis points)
  network_fee?: bigint;
  creator_fee?: bigint; // Pump.fun creator fee (0.3% = 30 basis points)
  creator_fee_bps?: number; // Creator fee basis points (default: 30)
  status?: 'confirmed' | 'finalized' | 'failed';
  metadata?: any;
  created_at?: Date;
}

export interface HolderSnapshot {
  id?: string;
  day: Date;
  wallet: string;
  balance: bigint;
  rank?: number;
}

export interface DayPool {
  id?: string;
  day: Date;
  fees_in: bigint;
  fees_out: bigint;
  net: bigint;
  treasury_balance: bigint;
  tx_count: number;
  holder_count: number;
  status: 'open' | 'closed' | 'executed';
  closed_at?: Date;
  executed_at?: Date;
}

export interface GiftSpec {
  id?: string;
  day: number;
  type: string;
  hint?: string;
  sub_hint?: string;
  params: any;
  distribution_source?: string;
  notes?: string;
  hash: string;
  salt?: string;
  leaf?: string;
  proof?: string[];
}

export interface GiftExec {
  id?: string;
  day: number;
  gift_spec_id: string;
  winners: any;
  tx_hashes: string[];
  total_distributed: bigint;
  execution_time: Date;
  status: 'pending' | 'executed' | 'confirmed' | 'failed';
  error_message?: string;
}

export interface AuditLog {
  id?: string;
  ts: Date;
  actor: string;
  action: string;
  payload?: any;
  resource_type?: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
}

export interface GiftExecutionLog {
  id?: string;
  day: number;
  gift_type: string;
  execution_id: string;
  step_number: number;
  step_name: string;
  step_status: 'started' | 'completed' | 'failed';
  log_level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: any;
  duration_ms?: number;
  timestamp: Date;
}

export interface GiftExecutionSummary {
  id?: string;
  execution_id: string;
  day: number;
  gift_type: string;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  status: 'started' | 'success' | 'failed' | 'skipped';
  winner_count?: number;
  total_distributed?: bigint;
  error_message?: string;
  metadata?: any;
}

export interface NGOWallet {
  id?: string;
  name: string;
  wallet_address: string;
  description?: string;
  website?: string;
  verified: boolean;
  total_received: bigint;
  tx_count: number;
}

// Repository methods
export const txRawRepo = {
  async insert(tx: TxRaw): Promise<string> {
    const sub_tx = tx.sub_tx ?? 0;
    const result = await db.query<{ id: string }>(
      `INSERT INTO tx_raw (signature, sub_tx, slot, block_time, from_wallet, to_wallet, amount, kind, fee, network_fee, creator_fee, creator_fee_bps, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (signature, sub_tx) DO NOTHING
       RETURNING id`,
      [tx.signature, sub_tx, tx.slot, tx.block_time, tx.from_wallet, tx.to_wallet, tx.amount, tx.kind, tx.fee, tx.network_fee, tx.creator_fee, tx.creator_fee_bps, tx.status, tx.metadata]
    );
    return result.rows[0]?.id;
  },

  async findByDay(day: Date): Promise<TxRaw[]> {
    const result = await db.query<TxRaw>(
      `SELECT * FROM tx_raw WHERE DATE(block_time) = $1 ORDER BY block_time ASC`,
      [day]
    );
    return result.rows;
  },

  async findBySignature(signature: string): Promise<TxRaw | null> {
    const result = await db.query<TxRaw>(
      `SELECT * FROM tx_raw WHERE signature = $1`,
      [signature]
    );
    return result.rows[0] || null;
  },

  async findRecent(limit: number, offset: number): Promise<TxRaw[]> {
    const result = await db.query<TxRaw>(
      `SELECT * FROM tx_raw 
       WHERE status IN ('confirmed', 'finalized') 
       ORDER BY block_time DESC, slot DESC, created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },

  async findSince(signature: string, limit: number): Promise<TxRaw[]> {
    // First get the block_time of the reference signature
    const refTx = await db.query<TxRaw>(
      `SELECT block_time, slot, created_at FROM tx_raw WHERE signature = $1`,
      [signature]
    );
    
    if (refTx.rows.length === 0) {
      // If signature not found, return recent transactions
      return txRawRepo.findRecent(limit, 0);
    }

    const result = await db.query<TxRaw>(
      `SELECT * FROM tx_raw 
       WHERE status IN ('confirmed', 'finalized') 
       AND (
         block_time > $1 
         OR (block_time = $1 AND slot > $2)
         OR (block_time = $1 AND slot = $2 AND created_at > $3)
       )
       ORDER BY block_time DESC, slot DESC, created_at DESC
       LIMIT $4`,
      [refTx.rows[0].block_time, refTx.rows[0].slot, refTx.rows[0].created_at, limit]
    );
    return result.rows;
  },
};

export const dayPoolRepo = {
  async upsert(pool: DayPool): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO day_pool (day, fees_in, fees_out, net, treasury_balance, tx_count, holder_count, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (day) DO UPDATE
       SET fees_in = EXCLUDED.fees_in,
           fees_out = EXCLUDED.fees_out,
           net = EXCLUDED.net,
           treasury_balance = EXCLUDED.treasury_balance,
           tx_count = EXCLUDED.tx_count,
           holder_count = EXCLUDED.holder_count,
           status = EXCLUDED.status
       RETURNING id`,
      [pool.day, pool.fees_in, pool.fees_out, pool.net, pool.treasury_balance, pool.tx_count, pool.holder_count, pool.status]
    );
    return result.rows[0].id;
  },

  async findByDay(day: Date): Promise<DayPool | null> {
    const result = await db.query<DayPool>(
      `SELECT * FROM day_pool WHERE day = $1`,
      [day]
    );
    return result.rows[0] || null;
  },

  async closeDay(day: Date): Promise<string> {
    const result = await db.query<{ close_day: string }>(
      `SELECT close_day($1)`,
      [day]
    );
    return result.rows[0].close_day;
  },
};

export const giftSpecRepo = {
  async insert(gift: GiftSpec): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO gift_spec (day, type, hint, sub_hint, params, distribution_source, notes, hash, salt, leaf, proof)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [gift.day, gift.type, gift.hint, gift.sub_hint, gift.params, gift.distribution_source, gift.notes, gift.hash, gift.salt, gift.leaf, JSON.stringify(gift.proof)]
    );
    return result.rows[0].id;
  },

  async findByDay(day: number): Promise<GiftSpec | null> {
    const result = await db.query<GiftSpec>(
      `SELECT * FROM gift_spec WHERE day = $1`,
      [day]
    );
    return result.rows[0] || null;
  },

  async findAll(): Promise<GiftSpec[]> {
    const result = await db.query<GiftSpec>(
      `SELECT * FROM gift_spec ORDER BY day ASC`
    );
    return result.rows;
  },
};

export const giftExecRepo = {
  async insert(exec: GiftExec): Promise<string> {
    // Serialize winners to JSON, handling BigInt values
    const winnersJson = JSON.stringify(exec.winners, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });
    
    // Convert total_distributed to string for PostgreSQL BIGINT
    const totalDistributedStr = typeof exec.total_distributed === 'bigint' 
      ? exec.total_distributed.toString() 
      : String(exec.total_distributed);
    
    const result = await db.query<{ id: string }>(
      `INSERT INTO gift_exec (day, gift_spec_id, winners, tx_hashes, total_distributed, execution_time, status, error_message)
       VALUES ($1, $2, $3::jsonb, $4, $5::bigint, $6, $7, $8)
       RETURNING id`,
      [exec.day, exec.gift_spec_id, winnersJson, exec.tx_hashes, totalDistributedStr, exec.execution_time, exec.status, exec.error_message]
    );
    return result.rows[0].id;
  },

  async findByDay(day: number): Promise<GiftExec[]> {
    const result = await db.query<GiftExec>(
      `SELECT * FROM gift_exec WHERE day = $1 ORDER BY execution_time DESC`,
      [day]
    );
    return result.rows;
  },

  async updateStatus(id: string, status: GiftExec['status'], errorMessage?: string): Promise<void> {
    await db.query(
      `UPDATE gift_exec SET status = $1, error_message = $2 WHERE id = $3`,
      [status, errorMessage, id]
    );
  },
};

export const auditLogRepo = {
  async insert(log: AuditLog): Promise<void> {
    await db.query(
      `INSERT INTO audit_log (ts, actor, action, payload, resource_type, resource_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [log.ts || new Date(), log.actor, log.action, log.payload, log.resource_type, log.resource_id, log.ip_address, log.user_agent]
    );
  },

  async findRecent(limit: number, filters?: { resource_type?: string; action?: string }): Promise<AuditLog[]> {
    let query = `SELECT * FROM audit_log`;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.resource_type) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resource_type);
    }

    if (filters?.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY ts DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await db.query<AuditLog>(query, params);
    return result.rows;
  },
};

export const holderSnapshotRepo = {
  async findByDay(day: Date): Promise<HolderSnapshot[]> {
    const result = await db.query<HolderSnapshot>(
      `SELECT day, wallet, balance, rank
       FROM holders_snapshot
       WHERE day = $1
       ORDER BY balance DESC`,
      [day]
    );
    return result.rows;
  },

  async createSnapshot(day: Date): Promise<number> {
    const result = await db.query<{ snapshot_holders: number }>(
      `SELECT snapshot_holders($1)`,
      [day]
    );
    return result.rows[0].snapshot_holders;
  },
};

export const giftExecutionLogRepo = {
  async insert(log: GiftExecutionLog): Promise<void> {
    await db.query(
      `INSERT INTO gift_execution_logs 
       (day, gift_type, execution_id, step_number, step_name, step_status, log_level, message, data, duration_ms, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        log.day,
        log.gift_type,
        log.execution_id,
        log.step_number,
        log.step_name,
        log.step_status,
        log.log_level,
        log.message,
        log.data ? JSON.stringify(log.data) : null,
        log.duration_ms,
        log.timestamp,
      ]
    );
  },

  async findByExecutionId(executionId: string): Promise<GiftExecutionLog[]> {
    const result = await db.query<GiftExecutionLog>(
      `SELECT * FROM gift_execution_logs 
       WHERE execution_id = $1 
       ORDER BY step_number ASC, timestamp ASC`,
      [executionId]
    );
    return result.rows;
  },

  async findByDay(day: number): Promise<GiftExecutionLog[]> {
    const result = await db.query<GiftExecutionLog>(
      `SELECT * FROM gift_execution_logs 
       WHERE day = $1 
       ORDER BY timestamp DESC`,
      [day]
    );
    return result.rows;
  },

  async findRecent(limit: number = 100): Promise<GiftExecutionLog[]> {
    const result = await db.query<GiftExecutionLog>(
      `SELECT * FROM gift_execution_logs 
       ORDER BY timestamp DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },
};

export const giftExecutionSummaryRepo = {
  async insert(summary: GiftExecutionSummary): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO gift_execution_summary 
       (execution_id, day, gift_type, start_time, end_time, duration_ms, status, winner_count, total_distributed, error_message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        summary.execution_id,
        summary.day,
        summary.gift_type,
        summary.start_time,
        summary.end_time,
        summary.duration_ms,
        summary.status,
        summary.winner_count,
        summary.total_distributed?.toString(),
        summary.error_message,
        summary.metadata ? JSON.stringify(summary.metadata) : null,
      ]
    );
    return result.rows[0].id;
  },

  async update(executionId: string, updates: Partial<GiftExecutionSummary>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.end_time !== undefined) {
      fields.push(`end_time = $${paramIndex++}`);
      values.push(updates.end_time);
    }
    if (updates.duration_ms !== undefined) {
      fields.push(`duration_ms = $${paramIndex++}`);
      values.push(updates.duration_ms);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.winner_count !== undefined) {
      fields.push(`winner_count = $${paramIndex++}`);
      values.push(updates.winner_count);
    }
    if (updates.total_distributed !== undefined) {
      fields.push(`total_distributed = $${paramIndex++}`);
      values.push(updates.total_distributed?.toString());
    }
    if (updates.error_message !== undefined) {
      fields.push(`error_message = $${paramIndex++}`);
      values.push(updates.error_message);
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (fields.length === 0) return;

    values.push(executionId);
    await db.query(
      `UPDATE gift_execution_summary SET ${fields.join(', ')} WHERE execution_id = $${paramIndex}`,
      values
    );
  },

  async findByExecutionId(executionId: string): Promise<GiftExecutionSummary | null> {
    const result = await db.query<GiftExecutionSummary>(
      `SELECT * FROM gift_execution_summary WHERE execution_id = $1`,
      [executionId]
    );
    return result.rows[0] || null;
  },

  async findByDay(day: number): Promise<GiftExecutionSummary[]> {
    const result = await db.query<GiftExecutionSummary>(
      `SELECT * FROM gift_execution_summary 
       WHERE day = $1 
       ORDER BY start_time DESC`,
      [day]
    );
    return result.rows;
  },

  async findRecent(limit: number = 20): Promise<GiftExecutionSummary[]> {
    const result = await db.query<GiftExecutionSummary>(
      `SELECT * FROM gift_execution_summary 
       ORDER BY start_time DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  },
};

export const ngoWalletRepo = {
  async insert(ngo: NGOWallet): Promise<string | null> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO ngo_wallets (name, wallet_address, description, website, verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (wallet_address) DO NOTHING
       RETURNING id`,
      [ngo.name, ngo.wallet_address, ngo.description, ngo.website, ngo.verified]
    );
    return result.rows[0]?.id || null;
  },

  async findAll(): Promise<NGOWallet[]> {
    const result = await db.query<NGOWallet>(
      `SELECT * FROM ngo_wallets WHERE verified = TRUE ORDER BY name ASC`
    );
    return result.rows;
  },

  async updateReceived(walletAddress: string, amount: bigint): Promise<void> {
    await db.query(
      `UPDATE ngo_wallets 
       SET total_received = total_received + $1, 
           tx_count = tx_count + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE wallet_address = $2`,
      [amount, walletAddress]
    );
  },
};

