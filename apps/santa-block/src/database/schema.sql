-- Santa Database Schema
-- Version 1.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Raw transaction data from the blockchain
CREATE TABLE IF NOT EXISTS tx_raw (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    signature TEXT NOT NULL,
    sub_tx INTEGER DEFAULT 0, -- Sub-transaction index for multi-transfer transactions (0 = single transfer)
    slot BIGINT NOT NULL,
    block_time TIMESTAMPTZ NOT NULL, -- Block time from Solana in UTC
    from_wallet TEXT NOT NULL,
    to_wallet TEXT,
    amount BIGINT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('buy', 'sell', 'transfer')),
    fee BIGINT DEFAULT 0, -- Pump.fun protocol fee (0.95% = 95 basis points)
    network_fee BIGINT DEFAULT 0,
    creator_fee BIGINT DEFAULT 0, -- Pump.fun creator fee (0.3% = 30 basis points)
    creator_fee_bps INTEGER DEFAULT 30, -- Creator fee basis points
    status TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'finalized', 'failed')),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(signature, sub_tx) -- Allow same signature with different sub_tx values
);

-- Add network_fee column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tx_raw' AND column_name = 'network_fee'
    ) THEN
        ALTER TABLE tx_raw ADD COLUMN network_fee BIGINT DEFAULT 0;
    END IF;
END $$;

-- Add creator_fee column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tx_raw' AND column_name = 'creator_fee'
    ) THEN
        ALTER TABLE tx_raw ADD COLUMN creator_fee BIGINT DEFAULT 0;
    END IF;
END $$;

-- Add creator_fee_bps column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tx_raw' AND column_name = 'creator_fee_bps'
    ) THEN
        ALTER TABLE tx_raw ADD COLUMN creator_fee_bps INTEGER DEFAULT 30;
    END IF;
END $$;

-- Add sub_tx column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tx_raw' AND column_name = 'sub_tx'
    ) THEN
        ALTER TABLE tx_raw ADD COLUMN sub_tx INTEGER DEFAULT 0;
        -- Drop old unique constraint on signature only
        ALTER TABLE tx_raw DROP CONSTRAINT IF EXISTS tx_raw_signature_key;
        -- Add new unique constraint on (signature, sub_tx)
        ALTER TABLE tx_raw ADD CONSTRAINT tx_raw_signature_sub_tx_key UNIQUE (signature, sub_tx);
    END IF;
END $$;

-- Create indexes for tx_raw
CREATE INDEX IF NOT EXISTS idx_tx_block_time ON tx_raw(block_time);
CREATE INDEX IF NOT EXISTS idx_tx_slot ON tx_raw(slot);
CREATE INDEX IF NOT EXISTS idx_tx_from ON tx_raw(from_wallet);
CREATE INDEX IF NOT EXISTS idx_tx_kind ON tx_raw(kind);
CREATE INDEX IF NOT EXISTS idx_tx_signature ON tx_raw(signature);
CREATE INDEX IF NOT EXISTS idx_tx_network_fee ON tx_raw(network_fee);
CREATE INDEX IF NOT EXISTS idx_tx_creator_fee ON tx_raw(creator_fee);

-- Partition tx_raw by day for better performance (TimescaleDB - optional)
-- Uncomment if you have TimescaleDB installed:
-- CREATE EXTENSION IF NOT EXISTS timescaledb;
-- SELECT create_hypertable('tx_raw', 'block_time', if_not_exists => TRUE);

-- Daily snapshot of holder balances
CREATE TABLE IF NOT EXISTS holders_snapshot (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day DATE NOT NULL,
    wallet TEXT NOT NULL,
    balance BIGINT NOT NULL,
    rank INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(day, wallet)
);

-- Create indexes for holders_snapshot
CREATE INDEX IF NOT EXISTS idx_holders_day ON holders_snapshot(day);
CREATE INDEX IF NOT EXISTS idx_holders_wallet ON holders_snapshot(wallet);
CREATE INDEX IF NOT EXISTS idx_holders_balance ON holders_snapshot(balance DESC);

-- Daily treasury pool accounting
CREATE TABLE IF NOT EXISTS day_pool (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day DATE UNIQUE NOT NULL,
    fees_in BIGINT NOT NULL DEFAULT 0,
    fees_out BIGINT NOT NULL DEFAULT 0,
    net BIGINT NOT NULL DEFAULT 0,
    treasury_balance BIGINT NOT NULL DEFAULT 0,
    tx_count INTEGER DEFAULT 0,
    holder_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'executed')),
    closed_at TIMESTAMP,
    executed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for day_pool
CREATE INDEX IF NOT EXISTS idx_pool_day ON day_pool(day);
CREATE INDEX IF NOT EXISTS idx_pool_status ON day_pool(status);

-- Pre-committed gift specifications
CREATE TABLE IF NOT EXISTS gift_spec (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day INTEGER UNIQUE NOT NULL CHECK (day >= 1 AND day <= 24),
    type TEXT NOT NULL,
    params JSONB NOT NULL,
    distribution_source TEXT DEFAULT 'treasury_daily_fees',
    notes TEXT,
    hash TEXT NOT NULL,
    hint TEXT,
    sub_hint TEXT,
    salt TEXT,
    leaf TEXT,
    proof JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add hint columns if they don't exist (for existing tables)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gift_spec' AND column_name = 'hint'
    ) THEN
        ALTER TABLE gift_spec ADD COLUMN hint TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gift_spec' AND column_name = 'sub_hint'
    ) THEN
        ALTER TABLE gift_spec ADD COLUMN sub_hint TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gift_spec' AND column_name = 'salt'
    ) THEN
        ALTER TABLE gift_spec ADD COLUMN salt TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gift_spec' AND column_name = 'leaf'
    ) THEN
        ALTER TABLE gift_spec ADD COLUMN leaf TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gift_spec' AND column_name = 'proof'
    ) THEN
        ALTER TABLE gift_spec ADD COLUMN proof JSONB;
    END IF;
END $$;

-- Create indexes for gift_spec
CREATE INDEX IF NOT EXISTS idx_gift_day ON gift_spec(day);
CREATE INDEX IF NOT EXISTS idx_gift_type ON gift_spec(type);

-- Gift execution records
CREATE TABLE IF NOT EXISTS gift_exec (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day INTEGER NOT NULL,
    gift_spec_id UUID REFERENCES gift_spec(id),
    winners JSONB NOT NULL,
    tx_hashes TEXT[] NOT NULL,
    total_distributed BIGINT NOT NULL,
    execution_time TIMESTAMP NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'confirmed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for gift_exec
CREATE INDEX IF NOT EXISTS idx_exec_day ON gift_exec(day);
CREATE INDEX IF NOT EXISTS idx_exec_status ON gift_exec(status);

-- Immutable audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ts TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    payload JSONB,
    resource_type TEXT,
    resource_id TEXT,
    ip_address TEXT,
    user_agent TEXT
);

-- Create indexes for audit_log
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- Verified NGO wallets
CREATE TABLE IF NOT EXISTS ngo_wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    wallet_address TEXT UNIQUE NOT NULL,
    description TEXT,
    website TEXT,
    verified BOOLEAN DEFAULT FALSE,
    total_received BIGINT DEFAULT 0,
    tx_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for ngo_wallets
CREATE INDEX IF NOT EXISTS idx_ngo_wallet ON ngo_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_ngo_verified ON ngo_wallets(verified);

-- System configuration and metadata
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
);

-- RPC provider health tracking
CREATE TABLE IF NOT EXISTS rpc_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'down')),
    response_time_ms INTEGER,
    error_count INTEGER DEFAULT 0,
    last_check TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB
);

-- Create indexes for rpc_health
CREATE INDEX IF NOT EXISTS idx_rpc_provider ON rpc_health(provider);
CREATE INDEX IF NOT EXISTS idx_rpc_status ON rpc_health(status);
CREATE INDEX IF NOT EXISTS idx_rpc_last_check ON rpc_health(last_check);

-- Gift Execution Logs Table
-- Stores detailed step-by-step logs for each gift execution
CREATE TABLE IF NOT EXISTS gift_execution_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  day INTEGER NOT NULL,
  gift_type VARCHAR(100) NOT NULL,
  execution_id UUID,
  step_number INTEGER NOT NULL,
  step_name VARCHAR(100) NOT NULL,
  step_status VARCHAR(20) NOT NULL, -- 'started', 'completed', 'failed'
  log_level VARCHAR(20) NOT NULL, -- 'info', 'warn', 'error', 'debug'
  message TEXT NOT NULL,
  data JSONB,
  duration_ms INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_day ON gift_execution_logs(day);
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_execution_id ON gift_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_timestamp ON gift_execution_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_gift_type ON gift_execution_logs(gift_type);
CREATE INDEX IF NOT EXISTS idx_gift_execution_logs_step_status ON gift_execution_logs(step_status);

-- Gift Execution Summary Table
-- Stores high-level summary of each execution
CREATE TABLE IF NOT EXISTS gift_execution_summary (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id UUID UNIQUE NOT NULL,
  day INTEGER NOT NULL,
  gift_type VARCHAR(100) NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_ms INTEGER,
  status VARCHAR(20) NOT NULL, -- 'started', 'success', 'failed', 'skipped'
  winner_count INTEGER,
  total_distributed BIGINT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for summary table
CREATE INDEX IF NOT EXISTS idx_gift_execution_summary_day ON gift_execution_summary(day);
CREATE INDEX IF NOT EXISTS idx_gift_execution_summary_status ON gift_execution_summary(status);
CREATE INDEX IF NOT EXISTS idx_gift_execution_summary_start_time ON gift_execution_summary(start_time DESC);

-- Gift Hourly Airdrops Table
-- Stores hourly airdrop distributions (one per hour per day)
CREATE TABLE IF NOT EXISTS gift_hourly_airdrops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    day INTEGER NOT NULL CHECK (day >= 1 AND day <= 24),
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    wallet TEXT NOT NULL,
    amount BIGINT NOT NULL,
    distributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    blockhash TEXT,
    trace_id TEXT,
    tx_signature TEXT,
    UNIQUE(day, hour)
);

-- Indexes for hourly airdrops
CREATE INDEX IF NOT EXISTS idx_hourly_day ON gift_hourly_airdrops(day);
CREATE INDEX IF NOT EXISTS idx_hourly_wallet ON gift_hourly_airdrops(wallet);
CREATE INDEX IF NOT EXISTS idx_hourly_day_hour ON gift_hourly_airdrops(day, hour);
CREATE INDEX IF NOT EXISTS idx_hourly_tx_signature ON gift_hourly_airdrops(tx_signature) WHERE tx_signature IS NOT NULL;

-- Views for common queries

-- Daily statistics view
CREATE OR REPLACE VIEW daily_stats AS
SELECT 
    dp.day,
    dp.fees_in,
    dp.fees_out,
    dp.net,
    dp.treasury_balance,
    dp.tx_count,
    dp.holder_count,
    dp.status,
    gs.type as gift_type,
    ge.total_distributed,
    ge.status as execution_status
FROM day_pool dp
LEFT JOIN gift_spec gs ON DATE_PART('day', dp.day) = gs.day
LEFT JOIN gift_exec ge ON gs.id = ge.gift_spec_id AND dp.day = DATE(ge.execution_time)
ORDER BY dp.day DESC;

-- Top holders view
CREATE OR REPLACE VIEW top_holders AS
SELECT 
    wallet,
    balance,
    rank,
    day
FROM holders_snapshot
WHERE day = (SELECT MAX(day) FROM holders_snapshot)
ORDER BY balance DESC
LIMIT 100;

-- NGO impact summary
CREATE OR REPLACE VIEW ngo_impact AS
SELECT 
    nw.name,
    nw.wallet_address,
    nw.total_received,
    nw.tx_count,
    COUNT(DISTINCT ge.day) as days_received
FROM ngo_wallets nw
LEFT JOIN gift_exec ge ON ge.winners::jsonb @> jsonb_build_array(jsonb_build_object('wallet', nw.wallet_address))
WHERE nw.verified = TRUE
GROUP BY nw.id, nw.name, nw.wallet_address, nw.total_received, nw.tx_count
ORDER BY nw.total_received DESC;

-- Insert initial system configuration
INSERT INTO system_config (key, value, description, updated_by) VALUES
('season_start', '"2025-12-01"', 'Season 1 start date', 'system'),
('season_end', '"2025-12-24"', 'Season 1 end date', 'system'),
('gifts_committed_hash', '""', 'SHA256 hash of committed gifts', 'system'),
('gifts_revealed', 'false', 'Whether full gift list has been revealed', 'system'),
('emergency_pause', 'false', 'Emergency pause flag', 'system')
ON CONFLICT (key) DO NOTHING;

-- Functions for common operations

-- Drop existing functions if they exist (to allow recreation with updated signatures)
DROP FUNCTION IF EXISTS close_day(DATE);
DROP FUNCTION IF EXISTS snapshot_holders(DATE);

-- Function to close a day
CREATE OR REPLACE FUNCTION close_day(target_date DATE)
RETURNS UUID AS $$
DECLARE
    pool_id UUID;
    total_fees BIGINT;
    total_txs INTEGER;
    total_holders INTEGER;
BEGIN
    -- Calculate daily totals using creator_fee (Pump.fun creator fees)
    -- This is the fee that goes to the gift pool
    SELECT 
        COALESCE(SUM(creator_fee), 0),
        COUNT(*),
        COUNT(DISTINCT from_wallet)
    INTO total_fees, total_txs, total_holders
    FROM tx_raw
    WHERE DATE(block_time) = target_date
    AND status = 'finalized';

    -- Insert or update day_pool
    INSERT INTO day_pool (day, fees_in, tx_count, holder_count, status, closed_at)
    VALUES (target_date, total_fees, total_txs, total_holders, 'closed', CURRENT_TIMESTAMP)
    ON CONFLICT (day) DO UPDATE
    SET fees_in = EXCLUDED.fees_in,
        tx_count = EXCLUDED.tx_count,
        holder_count = EXCLUDED.holder_count,
        status = 'closed',
        closed_at = CURRENT_TIMESTAMP
    RETURNING id INTO pool_id;

    -- Log the action
    INSERT INTO audit_log (actor, action, payload, resource_type, resource_id)
    VALUES ('system', 'close_day', jsonb_build_object('day', target_date, 'fees', total_fees), 'day_pool', pool_id::text);

    RETURN pool_id;
END;
$$ LANGUAGE plpgsql;

-- Function to snapshot holders
-- Corrected logic:
-- - BUY: buyer is to_wallet (receives tokens) - ADD amount
-- - SELL: seller is from_wallet (sends tokens) - SUBTRACT amount
CREATE OR REPLACE FUNCTION snapshot_holders(target_date DATE)
RETURNS INTEGER AS $$
DECLARE
    snapshot_count INTEGER;
BEGIN
    -- Calculate balances and ranks
    WITH holder_balances AS (
        -- BUY transactions: buyer receives tokens (to_wallet gets +amount)
        SELECT 
            to_wallet as wallet,
            amount as balance_change
        FROM tx_raw
        WHERE DATE(block_time) <= target_date
        AND status = 'finalized'
        AND kind = 'buy'
        AND to_wallet IS NOT NULL
        
        UNION ALL
        
        -- SELL transactions: seller sends tokens (from_wallet gets -amount)
        SELECT 
            from_wallet as wallet,
            -amount as balance_change
        FROM tx_raw
        WHERE DATE(block_time) <= target_date
        AND status = 'finalized'
        AND kind = 'sell'
    ),
    ranked_holders AS (
        SELECT 
            wallet,
            SUM(balance_change) as balance,
            RANK() OVER (ORDER BY SUM(balance_change) DESC) as rank
        FROM holder_balances
        GROUP BY wallet
        HAVING SUM(balance_change) > 0
    )
    INSERT INTO holders_snapshot (day, wallet, balance, rank)
    SELECT target_date, wallet, balance, rank
    FROM ranked_holders
    ON CONFLICT (day, wallet) DO UPDATE
    SET balance = EXCLUDED.balance,
        rank = EXCLUDED.rank;

    GET DIAGNOSTICS snapshot_count = ROW_COUNT;

    RETURN snapshot_count;
END;
$$ LANGUAGE plpgsql;
