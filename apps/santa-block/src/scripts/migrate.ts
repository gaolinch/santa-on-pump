#!/usr/bin/env tsx

import { readFile } from 'fs/promises';
import { join } from 'path';
import { db } from '../database';
import { logger } from '../utils/logger';

async function migrate() {
  logger.info('Running database migrations');

  try {
    // Read schema file
    const schemaPath = join(__dirname, '../database/schema.sql');
    const schema = await readFile(schemaPath, 'utf-8');

    // Execute the schema directly without transaction
    // Since we use IF NOT EXISTS, it's safe to run without transaction
    // This prevents connection reset issues with Railway/Postgres
    await db.query(schema);

    logger.info('Database migrations completed successfully');
  } catch (error: any) {
    // Check if it's a "relation already exists" error (idempotent migration)
    if (error.code === '42P07' || error.code === '42710' || error.code === '42P16') {
      logger.warn('Some database objects already exist, migration may have already run');
      logger.info('Database migrations completed (some objects already exist)');
      return;
    }
    
    logger.error({ error }, 'Database migration failed');
    throw error;
  }
}

// Run if called directly
if (typeof require !== 'undefined' && require.main === module) {
  migrate()
    .then(() => {
      logger.info('Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error({ error }, 'Migration script failed');
      process.exit(1);
    });
}

export { migrate };

