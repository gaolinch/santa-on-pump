#!/usr/bin/env ts-node

/**
 * Add sub_tx column to tx_raw table
 * This allows storing multiple transfers from the same transaction
 */

import { db } from '../database';
import { logger } from '../utils/logger';

async function addSubTxColumn() {
  try {
    logger.info('Adding sub_tx column to tx_raw table...');

    // Add sub_tx column if it doesn't exist
    await db.query(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'tx_raw' AND column_name = 'sub_tx'
          ) THEN
              -- Add the column
              ALTER TABLE tx_raw ADD COLUMN sub_tx INTEGER DEFAULT 0;
              
              -- Drop old unique constraint on signature only
              ALTER TABLE tx_raw DROP CONSTRAINT IF EXISTS tx_raw_signature_key;
              
              -- Add new unique constraint on (signature, sub_tx)
              ALTER TABLE tx_raw ADD CONSTRAINT tx_raw_signature_sub_tx_key UNIQUE (signature, sub_tx);
              
              RAISE NOTICE 'Added sub_tx column and updated constraints';
          ELSE
              RAISE NOTICE 'sub_tx column already exists';
          END IF;
      END $$;
    `);

    logger.info('✅ Successfully added sub_tx column');
    
    // Verify the change
    const result = await db.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'tx_raw' AND column_name = 'sub_tx'
    `);

    if (result.rows.length > 0) {
      logger.info('Column details:', result.rows[0]);
    }

    // Check constraints
    const constraints = await db.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'tx_raw' AND constraint_name LIKE '%signature%'
    `);

    logger.info('Signature constraints:', constraints.rows);

    process.exit(0);
  } catch (error) {
    logger.error({ error }, '❌ Failed to add sub_tx column');
    process.exit(1);
  }
}

addSubTxColumn();

