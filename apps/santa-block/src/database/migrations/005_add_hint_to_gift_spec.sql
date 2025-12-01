-- Migration: Add hint column to gift_spec table
-- This allows custom hint text to be displayed during the hint phase (Day X at 00:00)

ALTER TABLE gift_spec 
ADD COLUMN IF NOT EXISTS hint TEXT;

-- Add comment
COMMENT ON COLUMN gift_spec.hint IS 'Short hint text displayed on Day X (e.g., "Holder Reward", "Top Buyers")';

