#!/usr/bin/env tsx
/**
 * Migration Script: Add Gift Execution Logs Tables
 * 
 * Creates tables for storing detailed execution logs:
 * - gift_execution_logs: Step-by-step logs
 * - gift_execution_summary: High-level summaries
 */

import { db } from '../database';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  console.log('\n🔄 Running Gift Execution Logs Migration\n');

  try {
    // Read migration SQL
    const migrationPath = path.join(__dirname, '../database/migrations/add-gift-execution-logs.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log('🔧 Executing migration...\n');

    // Execute migration
    await db.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');
    console.log('Created tables:');
    console.log('  - gift_execution_logs');
    console.log('  - gift_execution_summary\n');

    // Verify tables
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('gift_execution_logs', 'gift_execution_summary')
      ORDER BY table_name
    `);

    console.log('✅ Verified tables:');
    result.rows.forEach((row: any) => {
      console.log(`  ✓ ${row.table_name}`);
    });

    console.log('\n🎉 Migration successful!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed\n');
    console.error('Error:', (error as Error).message);
    console.error('\nStack trace:');
    console.error((error as Error).stack);
    process.exit(1);
  } finally {
    await db.close();
  }
}

runMigration();

