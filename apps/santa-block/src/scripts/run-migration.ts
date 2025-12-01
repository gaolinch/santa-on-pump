#!/usr/bin/env tsx
/**
 * Run database migration
 */
import { db } from '../database/index.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';

async function runMigration(migrationFile: string) {
  console.log('\n' + '='.repeat(80));
  console.log('RUNNING DATABASE MIGRATION');
  console.log('='.repeat(80));
  console.log(`Migration: ${migrationFile}\n`);

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, '../database/migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL:');
    console.log('─'.repeat(80));
    console.log(sql);
    console.log('─'.repeat(80));
    console.log();

    // Execute migration
    console.log('⚙️  Executing migration...');
    await db.query(sql);
    
    console.log('✅ Migration completed successfully!\n');

    // Verify the change
    console.log('🔍 Verifying changes...');
    const result = await db.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tx_raw'
        AND column_name IN ('network_fee', 'fee', 'amount', 'kind')
      ORDER BY column_name
    `);

    console.log('\n📋 Columns in tx_raw table:');
    for (const row of result.rows) {
      console.log(`  ${row.column_name}: ${row.data_type} (default: ${row.column_default || 'none'})`);
    }

    // Check if any data was backfilled
    const backfillResult = await db.query(`
      SELECT COUNT(*) as count
      FROM tx_raw
      WHERE network_fee > 0
    `);
    const backfilledCount = parseInt(backfillResult.rows[0]?.count || '0');
    console.log(`\n✅ Backfilled ${backfilledCount} transactions with network_fee\n`);

    console.log('='.repeat(80));
    console.log('✅ Migration complete!');
    console.log('='.repeat(80) + '\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Get migration file from command line or use default
const migrationFile = process.argv[2] || '001_add_network_fee.sql';
runMigration(migrationFile);

