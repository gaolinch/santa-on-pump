-- Migration: Add Merkle tree fields to gift_spec table
-- This stores the salt, leaf hash, and merkle proof for each gift

ALTER TABLE gift_spec 
ADD COLUMN IF NOT EXISTS salt TEXT,
ADD COLUMN IF NOT EXISTS leaf TEXT,
ADD COLUMN IF NOT EXISTS proof JSONB;

-- Add comments
COMMENT ON COLUMN gift_spec.salt IS 'Cryptographic salt used to generate the leaf hash';
COMMENT ON COLUMN gift_spec.leaf IS 'SHA256 leaf hash for this gift in the Merkle tree';
COMMENT ON COLUMN gift_spec.proof IS 'Array of sibling hashes for Merkle proof verification';

