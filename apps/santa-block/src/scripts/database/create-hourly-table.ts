#!/usr/bin/env tsx

import { db } from '../../database';

async function createHourlyTable() {
  console.log('Creating gift_hourly_airdrops table...\n');

  const sql = `
    CREATE TABLE IF NOT EXISTS gift_hourly_airdrops (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        day INTEGER NOT NULL CHECK (day >= 1 AND day <= 24),
        hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
        wallet TEXT NOT NULL,
        amount BIGINT NOT NULL,
        distributed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        blockhash TEXT,
        trace_id TEXT,
        tx_signature TEXT,
        UNIQUE(day, hour)
    );

    CREATE INDEX IF NOT EXISTS idx_hourly_day ON gift_hourly_airdrops(day);
    CREATE INDEX IF NOT EXISTS idx_hourly_wallet ON gift_hourly_airdrops(wallet);
    CREATE INDEX IF NOT EXISTS idx_hourly_day_hour ON gift_hourly_airdrops(day, hour);
    CREATE INDEX IF NOT EXISTS idx_hourly_tx_signature ON gift_hourly_airdrops(tx_signature) WHERE tx_signature IS NOT NULL;
  `;

  try {
    await db.query(sql);
    console.log('✅ Table gift_hourly_airdrops created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating table:', error);
    process.exit(1);
  }
}

createHourlyTable();

