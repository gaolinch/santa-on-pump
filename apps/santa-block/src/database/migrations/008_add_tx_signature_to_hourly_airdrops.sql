-- Add transaction signature column to gift_hourly_airdrops table
-- This allows tracking the on-chain transaction for each airdrop

-- Add tx_signature column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'gift_hourly_airdrops' AND column_name = 'tx_signature'
    ) THEN
        ALTER TABLE gift_hourly_airdrops ADD COLUMN tx_signature TEXT;
    END IF;
END $$;

-- Add index for transaction signature lookups
CREATE INDEX IF NOT EXISTS idx_hourly_tx_signature ON gift_hourly_airdrops(tx_signature) WHERE tx_signature IS NOT NULL;

-- Add comment
COMMENT ON COLUMN gift_hourly_airdrops.tx_signature IS 'Solana transaction signature for the token transfer';


