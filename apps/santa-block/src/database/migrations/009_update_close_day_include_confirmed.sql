-- Migration: Update close_day() to include both confirmed and finalized transactions
-- Date: 2025-12-05
-- Description: Update close_day() function to count fees from both 'confirmed' and 'finalized' transactions
--              This ensures we capture fees even if transactions haven't been finalized yet

-- Drop the existing function first
DROP FUNCTION IF EXISTS close_day(DATE);

-- Recreate the close_day function to include both confirmed and finalized transactions
CREATE FUNCTION close_day(target_date DATE)
RETURNS UUID AS $$
DECLARE
    pool_id UUID;
    total_fees BIGINT;
    total_txs INTEGER;
    total_holders INTEGER;
BEGIN
    -- Calculate daily totals using creator_fee (Pump.fun creator fees)
    -- Include both 'confirmed' and 'finalized' transactions
    -- Filter out invalid values:
    -- - NULL values
    -- - Negative values
    -- - UUID-like strings (36 chars with dashes)
    -- - Unreasonably large values (> 1 SOL = 1,000,000,000 lamports)
    SELECT 
        COALESCE(SUM(creator_fee) FILTER (
            WHERE creator_fee IS NOT NULL 
            AND creator_fee > 0 
            AND creator_fee <= 1000000000
            AND creator_fee::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ), 0),
        COUNT(*),
        COUNT(DISTINCT from_wallet)
    INTO total_fees, total_txs, total_holders
    FROM tx_raw
    WHERE DATE(block_time) = target_date
    AND status IN ('confirmed', 'finalized');

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

-- Log the migration
INSERT INTO audit_log (actor, action, payload, resource_type)
VALUES (
  'system',
  'schema_migration',
  jsonb_build_object(
    'migration', '009_update_close_day_include_confirmed',
    'timestamp', NOW(),
    'description', 'Updated close_day() function to include both confirmed and finalized transactions',
    'critical', true,
    'reason', 'Ensures fees are captured even if transactions are not yet finalized'
  ),
  'database_schema'
);

