-- Migration: Add creator_fee column to tx_raw table
-- Date: 2025-11-30
-- Description: Add dedicated column for Pump.fun creator fees from transaction data

-- Add creator_fee column (Pump.fun creator fee in lamports)
ALTER TABLE tx_raw 
ADD COLUMN IF NOT EXISTS creator_fee BIGINT DEFAULT 0;

-- Add comment to clarify the field
COMMENT ON COLUMN tx_raw.creator_fee IS 'Pump.fun creator fee in lamports (extracted from transaction instruction data)';

-- Create index for creator_fee queries
CREATE INDEX IF NOT EXISTS idx_tx_creator_fee ON tx_raw(creator_fee);

-- Log the migration
INSERT INTO audit_log (actor, action, payload, resource_type)
VALUES (
  'system', 
  'schema_migration', 
  jsonb_build_object(
    'migration', '002_add_creator_fee',
    'timestamp', NOW(),
    'description', 'Added creator_fee column to tx_raw table for Pump.fun creator fees'
  ),
  'database_schema'
);

