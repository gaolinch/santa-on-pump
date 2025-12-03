#!/usr/bin/env ts-node

import { db } from '../../database';
import { logger } from '../../utils/logger';

async function test() {
  const signature = 'ndqWzRpmqPUfC8jKkM554yad1Tn4xvXEArgyF5xUjeDpF1HQg1fJtEJQNwrJNLHmMS3JVzwfK5BccuxUxqNJDEs';
  
  // Delete existing
  await db.query('DELETE FROM tx_raw WHERE signature = $1', [signature]);
  logger.info('Deleted existing transaction');
  
  // Now run insert-tx
  logger.info('Run: yarn insert-tx ' + signature);
  
  process.exit(0);
}

test();

