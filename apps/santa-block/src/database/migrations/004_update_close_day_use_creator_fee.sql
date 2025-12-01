-- Migration: Update close_day() function to use creator_fee
-- Date: 2025-12-01
-- Description: Change day pool calculation to use creator_fee instead of amount * 0.03
--              This is CRITICAL for gift distribution as all gifts are based on creator fees

-- Drop the existing function first
DROP FUNCTION IF EXISTS close_day(DATE);

-- Recreate the close_day function with creator_fee
CREATE FUNCTION close_day(target_date DATE)
RETURNS BIGINT AS $$
DECLARE
    pool_id BIGINT;
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

-- Log the migration
INSERT INTO audit_log (actor, action, payload, resource_type)
VALUES (
  'system',
  'schema_migration',
  jsonb_build_object(
    'migration', '004_update_close_day_use_creator_fee',
    'timestamp', NOW(),
    'description', 'Updated close_day() function to use creator_fee for gift pool calculation',
    'critical', true,
    'reason', 'All gifts are based on creator fees, not calculated fees'
  ),
  'database_schema'
);

