#!/usr/bin/env tsx
/**
 * Run merkle fields migration
 */

import { db } from '../../database';
import fs from 'fs';
import path from 'path';

async function runMigrations() {
  // Wait for database to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const migrations = [
    '007_add_merkle_fields_to_gift_spec.sql',
  ];

  console.log('🗄️  Running merkle fields migration...\n');

  for (const migration of migrations) {
    console.log(`📄 Running: ${migration}`);
    
    const sqlPath = path.join(__dirname, '../database/migrations', migration);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    try {
      await db.query(sql);
      console.log(`✅ ${migration} completed\n`);
    } catch (error: any) {
      if (error.message?.includes('already exists') || error.message?.includes('duplicate') || error.message?.includes('column') && error.message?.includes('already exists')) {
        console.log(`⏭️  ${migration} already applied (skipped)\n`);
      } else {
        console.error(`❌ ${migration} failed:`, error.message);
        throw error;
      }
    }
  }

  console.log('✅ Merkle fields migration completed successfully!');
  
  // Verify the columns were added
  console.log('\n🔍 Verifying columns...');
  const result = await db.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'gift_spec'
      AND column_name IN ('salt', 'leaf', 'proof')
    ORDER BY column_name
  `);

  if (result.rows.length === 3) {
    console.log('✅ All merkle columns verified:');
    result.rows.forEach((row: any) => {
      console.log(`  ✓ ${row.column_name}: ${row.data_type}`);
    });
  } else {
    console.warn(`⚠️  Expected 3 columns, found ${result.rows.length}`);
  }
}

runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

