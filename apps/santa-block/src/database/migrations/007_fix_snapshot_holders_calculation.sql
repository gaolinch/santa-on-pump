-- Fix snapshot_holders function to correctly calculate balances
-- 
-- Issue: The function was grouping by from_wallet only, but:
-- - BUY: buyer is to_wallet (receives tokens) - should ADD amount
-- - SELL: seller is from_wallet (sends tokens) - should SUBTRACT amount
--
-- Migration: 007_fix_snapshot_holders_calculation
-- Date: 2025-12-02

-- Drop and recreate the function with correct logic
DROP FUNCTION IF EXISTS snapshot_holders(DATE);

CREATE OR REPLACE FUNCTION snapshot_holders(target_date DATE)
RETURNS INTEGER AS $$
DECLARE
    snapshot_count INTEGER;
BEGIN
    -- Calculate balances and ranks
    -- For BUY: buyer is to_wallet (receives tokens) - ADD amount
    -- For SELL: seller is from_wallet (sends tokens) - SUBTRACT amount
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

