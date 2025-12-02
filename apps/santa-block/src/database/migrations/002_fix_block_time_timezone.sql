-- Migration: Fix block_time to use TIMESTAMPTZ for proper UTC storage
-- This ensures block_time is always stored in UTC regardless of server timezone

-- Drop views that depend on columns we're changing
DROP VIEW IF EXISTS daily_stats;
DROP VIEW IF EXISTS top_holders;
DROP VIEW IF EXISTS ngo_impact;

-- Convert block_time from TIMESTAMP to TIMESTAMPTZ
-- This will interpret existing timestamps as UTC and convert them properly
ALTER TABLE tx_raw 
  ALTER COLUMN block_time TYPE TIMESTAMPTZ 
  USING block_time AT TIME ZONE 'UTC';

-- Add comment to document the change
COMMENT ON COLUMN tx_raw.block_time IS 'Block time from Solana blockchain in UTC (TIMESTAMPTZ)';

-- Also fix other timestamp columns for consistency
ALTER TABLE tx_raw 
  ALTER COLUMN created_at TYPE TIMESTAMPTZ 
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE holders_snapshot 
  ALTER COLUMN created_at TYPE TIMESTAMPTZ 
  USING created_at AT TIME ZONE 'UTC';

ALTER TABLE day_pool 
  ALTER COLUMN closed_at TYPE TIMESTAMPTZ 
  USING closed_at AT TIME ZONE 'UTC';

ALTER TABLE day_pool 
  ALTER COLUMN executed_at TYPE TIMESTAMPTZ 
  USING executed_at AT TIME ZONE 'UTC';

ALTER TABLE day_pool 
  ALTER COLUMN created_at TYPE TIMESTAMPTZ 
  USING created_at AT TIME ZONE 'UTC';

-- Fix gift_spec table (not gift_specs)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gift_spec') THEN
    ALTER TABLE gift_spec 
      ALTER COLUMN created_at TYPE TIMESTAMPTZ 
      USING created_at AT TIME ZONE 'UTC';
  END IF;
END $$;

-- Fix gift_exec table
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'gift_exec') THEN
    ALTER TABLE gift_exec 
      ALTER COLUMN execution_time TYPE TIMESTAMPTZ 
      USING execution_time AT TIME ZONE 'UTC';
    
    ALTER TABLE gift_exec 
      ALTER COLUMN created_at TYPE TIMESTAMPTZ 
      USING created_at AT TIME ZONE 'UTC';
  END IF;
END $$;

-- Fix audit_log table
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_log') THEN
    ALTER TABLE audit_log 
      ALTER COLUMN ts TYPE TIMESTAMPTZ 
      USING ts AT TIME ZONE 'UTC';
  END IF;
END $$;

-- Fix ngo_wallets table
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ngo_wallets') THEN
    ALTER TABLE ngo_wallets 
      ALTER COLUMN created_at TYPE TIMESTAMPTZ 
      USING created_at AT TIME ZONE 'UTC';
    
    ALTER TABLE ngo_wallets 
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ 
      USING updated_at AT TIME ZONE 'UTC';
  END IF;
END $$;

-- Fix rpc_health table
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rpc_health') THEN
    ALTER TABLE rpc_health 
      ALTER COLUMN last_check TYPE TIMESTAMPTZ 
      USING last_check AT TIME ZONE 'UTC';
  END IF;
END $$;

-- Fix system_config table
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_config') THEN
    ALTER TABLE system_config 
      ALTER COLUMN updated_at TYPE TIMESTAMPTZ 
      USING updated_at AT TIME ZONE 'UTC';
  END IF;
END $$;

ALTER TABLE gift_hourly_airdrops 
  ALTER COLUMN distributed_at TYPE TIMESTAMPTZ 
  USING distributed_at AT TIME ZONE 'UTC';

-- Add comments
COMMENT ON COLUMN tx_raw.created_at IS 'Record creation time in UTC (TIMESTAMPTZ)';
COMMENT ON COLUMN audit_log.ts IS 'Audit log timestamp in UTC (TIMESTAMPTZ)';
COMMENT ON COLUMN gift_hourly_airdrops.distributed_at IS 'Distribution time in UTC (TIMESTAMPTZ)';

-- Recreate views with updated column types
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

-- Verify the changes
DO $$
BEGIN
  RAISE NOTICE 'Migration completed: All timestamp columns converted to TIMESTAMPTZ (UTC)';
END $$;

