-- Migration: Add network_fee column to tx_raw table
-- Date: 2025-11-27
-- Description: Add dedicated column for Solana network transaction fees

-- Add network_fee column (Solana network fee in lamports)
ALTER TABLE tx_raw 
ADD COLUMN IF NOT EXISTS network_fee BIGINT DEFAULT 0;

-- Add comment to clarify the difference
COMMENT ON COLUMN tx_raw.fee IS 'Protocol fee (e.g., Santa platform fee or trading fee) in tokens';
COMMENT ON COLUMN tx_raw.network_fee IS 'Solana network transaction fee in lamports';

-- Create index for network_fee queries
CREATE INDEX IF NOT EXISTS idx_tx_network_fee ON tx_raw(network_fee);

-- Backfill existing transactions from metadata
UPDATE tx_raw 
SET network_fee = (metadata->>'transactionFee')::bigint
WHERE metadata->>'transactionFee' IS NOT NULL 
  AND network_fee = 0;

-- Log the migration
INSERT INTO audit_log (actor, action, payload, resource_type)
VALUES (
  'system', 
  'schema_migration', 
  jsonb_build_object(
    'migration', '001_add_network_fee',
    'timestamp', NOW(),
    'description', 'Added network_fee column to tx_raw table'
  ),
  'database_schema'
);



