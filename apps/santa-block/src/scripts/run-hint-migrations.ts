#!/usr/bin/env tsx
/**
 * Run hint and sub_hint migrations
 */

import { db } from '../database';
import fs from 'fs';
import path from 'path';

async function runMigrations() {
  // Wait for database to initialize
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const migrations = [
    '005_add_hint_to_gift_spec.sql',
    '006_add_sub_hint_to_gift_spec.sql',
  ];

  console.log('🗄️  Running hint migrations...\n');

  for (const migration of migrations) {
    console.log(`📄 Running: ${migration}`);
    
    const sqlPath = path.join(__dirname, '../database/migrations', migration);
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    try {
      await db.query(sql);
      console.log(`✅ ${migration} completed\n`);
    } catch (error: any) {
      if (error.message?.includes('already exists') || error.message?.includes('duplicate')) {
        console.log(`⏭️  ${migration} already applied (skipped)\n`);
      } else {
        console.error(`❌ ${migration} failed:`, error.message);
        throw error;
      }
    }
  }

  console.log('✅ All hint migrations completed successfully!');
}

runMigrations()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

