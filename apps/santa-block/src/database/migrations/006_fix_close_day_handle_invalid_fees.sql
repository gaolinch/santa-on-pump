-- Migration: Fix close_day() to handle invalid creator_fee values
-- Date: 2025-12-02
-- Description: Update close_day() function to filter out invalid creator_fee values
--              (UUIDs, negative values, or unreasonably large values)

-- Drop the existing function first
DROP FUNCTION IF EXISTS close_day(DATE);

-- Recreate the close_day function with validation
CREATE FUNCTION close_day(target_date DATE)
RETURNS BIGINT AS $$
DECLARE
    pool_id BIGINT;
    total_fees BIGINT;
    total_txs INTEGER;
    total_holders INTEGER;
BEGIN
    -- Calculate daily totals using creator_fee (Pump.fun creator fees)
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
        COUNT(*) FILTER (WHERE status = 'finalized'),
        COUNT(DISTINCT from_wallet) FILTER (WHERE status = 'finalized')
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

-- Log the migration
INSERT INTO audit_log (actor, action, payload, resource_type)
VALUES (
  'system',
  'schema_migration',
  jsonb_build_object(
    'migration', '006_fix_close_day_handle_invalid_fees',
    'timestamp', NOW(),
    'description', 'Updated close_day() function to filter out invalid creator_fee values (UUIDs, negative, or too large)',
    'critical', true,
    'reason', 'Prevents errors when closing day pool with corrupted creator_fee data'
  ),
  'database_schema'
);

