import { Router, Request, Response } from 'express';
import { db, dayPoolRepo, txRawRepo } from '../../database';
import { solanaService } from '../../services/solana';
import { logger } from '../../utils/logger';
import { getCurrentUTCDate, getPreviousUTCDate } from '../../utils/date';

const router = Router();

/**
 * GET /stats/today
 * Get statistics for current day
 */
router.get('/today', async (req: Request, res: Response) => {
  try {
    const today = getCurrentUTCDate();
    
    // Get day pool
    const pool = await dayPoolRepo.findByDay(today);
    
    // Get treasury balance
    const treasuryBalance = await solanaService.getTreasuryBalance();
    
    // Get transaction count for today
    const txs = await txRawRepo.findByDay(today);
    
    // Get unique holders count
    const uniqueHolders = new Set(txs.map((tx) => tx.from_wallet)).size;

    res.json({
      day: today,
      pool: pool
        ? {
            fees_in: pool.fees_in.toString(),
            fees_out: pool.fees_out.toString(),
            net: pool.net.toString(),
            tx_count: pool.tx_count,
            holder_count: pool.holder_count,
            status: pool.status,
          }
        : null,
      treasury_balance: treasuryBalance.toString(),
      transactions_today: txs.length,
      unique_holders: uniqueHolders,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching today stats');
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /stats/season
 * Get cumulative statistics for the season
 */
router.get('/season', async (req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT 
        COUNT(DISTINCT day) as days_active,
        SUM(fees_in) as total_fees_in,
        SUM(fees_out) as total_fees_out,
        SUM(tx_count) as total_transactions,
        AVG(holder_count) as avg_holders
      FROM day_pool
      WHERE day >= '2025-12-01' AND day <= '2025-12-24'
    `);

    const stats = result.rows[0];

    // Get total unique wallets
    const walletsResult = await db.query(`
      SELECT COUNT(DISTINCT from_wallet) as unique_wallets
      FROM tx_raw
      WHERE block_time >= '2025-12-01' AND block_time < '2025-12-25'
    `);

    res.json({
      season: '2025-season-1',
      days_active: parseInt(stats.days_active) || 0,
      total_fees_collected: stats.total_fees_in || '0',
      total_fees_distributed: stats.total_fees_out || '0',
      total_transactions: parseInt(stats.total_transactions) || 0,
      unique_wallets: parseInt(walletsResult.rows[0].unique_wallets) || 0,
      avg_holders_per_day: parseInt(stats.avg_holders) || 0,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching season stats');
    res.status(500).json({ error: 'Failed to fetch season statistics' });
  }
});

/**
 * GET /stats/day/:date
 * Get statistics for specific day
 */
router.get('/day/:date', async (req: Request, res: Response) => {
  try {
    const date = new Date(req.params.date);
    
    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const pool = await dayPoolRepo.findByDay(date);
    const txs = await txRawRepo.findByDay(date);

    if (!pool) {
      return res.status(404).json({ error: 'Day not found' });
    }

    res.json({
      day: date,
      fees_in: pool.fees_in.toString(),
      fees_out: pool.fees_out.toString(),
      net: pool.net.toString(),
      treasury_balance: pool.treasury_balance.toString(),
      tx_count: pool.tx_count,
      holder_count: pool.holder_count,
      status: pool.status,
      transactions: txs.map((tx) => ({
        signature: tx.signature,
        from: tx.from_wallet,
        to: tx.to_wallet,
        amount: tx.amount.toString(),
        kind: tx.kind,
        time: tx.block_time,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching day stats');
    res.status(500).json({ error: 'Failed to fetch day statistics' });
  }
});

export default router;

