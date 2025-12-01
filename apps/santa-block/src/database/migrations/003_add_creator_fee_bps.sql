-- Migration: Add creator_fee_bps column to tx_raw table
-- Date: 2025-12-01
-- Description: Add creator fee basis points column to store the fee percentage

ALTER TABLE tx_raw
ADD COLUMN IF NOT EXISTS creator_fee_bps INTEGER DEFAULT 30;

COMMENT ON COLUMN tx_raw.creator_fee_bps IS 'Creator fee basis points (e.g., 30 = 0.3%)';

-- Update the fee column comment to clarify it's the protocol fee
COMMENT ON COLUMN tx_raw.fee IS 'Pump.fun protocol fee in lamports (0.95% = 95 basis points)';

-- Log the migration
INSERT INTO audit_log (actor, action, payload, resource_type)
VALUES (
  'system',
  'schema_migration',
  jsonb_build_object(
    'migration', '003_add_creator_fee_bps',
    'timestamp', NOW(),
    'description', 'Added creator_fee_bps column to tx_raw table'
  ),
  'database_schema'
);

