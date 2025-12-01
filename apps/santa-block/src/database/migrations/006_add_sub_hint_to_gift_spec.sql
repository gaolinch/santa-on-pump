-- Migration: Add sub_hint column to gift_spec table
-- This allows custom subtitle text during the hint phase

ALTER TABLE gift_spec 
ADD COLUMN IF NOT EXISTS sub_hint TEXT;

-- Add comment
COMMENT ON COLUMN gift_spec.sub_hint IS 'Subtitle text displayed during hint phase (e.g., "Full details revealed tomorrow")';

