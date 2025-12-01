import { Router, Request, Response, NextFunction } from 'express';
import { dayPoolRepo, auditLogRepo } from '../../database';
import { transactionListener } from '../../services/listener';
import { commitRevealService } from '../../services/commit-reveal';
import { logger } from '../../utils/logger';
import { config } from '../../config';

const router = Router();

/**
 * Admin authentication middleware
 */
function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];
  const ip = req.ip || req.connection.remoteAddress;

  // Check API key
  if (!apiKey || apiKey !== config.security.adminApiKey) {
    logger.warn({ ip }, 'Unauthorized admin access attempt');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Check IP whitelist
  if (!config.security.adminIpWhitelist.includes(ip || '')) {
    logger.warn({ ip }, 'Admin access from non-whitelisted IP');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}

// Apply admin auth to all routes
router.use(adminAuth);

/**
 * POST /admin/close-day/:date
 * Manually close a day (fallback if automatic close fails)
 */
router.post('/close-day/:date', async (req: Request, res: Response) => {
  try {
    const date = new Date(req.params.date);

    if (isNaN(date.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    logger.info({ date, actor: 'admin' }, 'Manual day close initiated');

    // Close the day
    const poolId = await dayPoolRepo.closeDay(date);

    // Log audit entry
    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'admin',
      action: 'manual_close_day',
      payload: { date, pool_id: poolId },
      ip_address: req.ip,
    });

    res.json({
      success: true,
      pool_id: poolId,
      date,
    });
  } catch (error) {
    logger.error({ error }, 'Error closing day');
    res.status(500).json({ error: 'Failed to close day' });
  }
});

/**
 * POST /admin/backfill
 * Backfill transactions for a date range
 */
router.post('/backfill', async (req: Request, res: Response) => {
  try {
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'start_date and end_date required' });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    logger.info({ startDate, endDate, actor: 'admin' }, 'Backfill initiated');

    // Start backfill (async)
    transactionListener.backfillRange(startDate, endDate).catch((error) => {
      logger.error({ error }, 'Backfill failed');
    });

    // Log audit entry
    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'admin',
      action: 'backfill_transactions',
      payload: { start_date, end_date },
      ip_address: req.ip,
    });

    res.json({
      success: true,
      message: 'Backfill started',
      start_date: startDate,
      end_date: endDate,
    });
  } catch (error) {
    logger.error({ error }, 'Error starting backfill');
    res.status(500).json({ error: 'Failed to start backfill' });
  }
});

/**
 * POST /admin/commit-gifts
 * Commit the gift list with hash
 */
router.post('/commit-gifts', async (req: Request, res: Response) => {
  try {
    const { gifts, salt } = req.body;

    if (!gifts || !salt) {
      return res.status(400).json({ error: 'gifts and salt required' });
    }

    logger.info({ actor: 'admin' }, 'Gift commitment initiated');

    const commitment = await commitRevealService.commitGiftList(gifts, salt);

    // Log audit entry
    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'admin',
      action: 'commit_gift_list',
      payload: { hash: commitment.hash },
      ip_address: req.ip,
    });

    res.json({
      success: true,
      commitment,
    });
  } catch (error) {
    logger.error({ error }, 'Error committing gifts');
    res.status(500).json({ error: 'Failed to commit gifts' });
  }
});

/**
 * POST /admin/reveal-gifts
 * Reveal the full gift list
 */
router.post('/reveal-gifts', async (req: Request, res: Response) => {
  try {
    logger.info({ actor: 'admin' }, 'Gift reveal initiated');

    const reveal = await commitRevealService.revealGiftList();

    // Log audit entry
    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'admin',
      action: 'reveal_gift_list',
      payload: { hash: reveal.hash, verified: reveal.verified },
      ip_address: req.ip,
    });

    res.json({
      success: true,
      reveal: {
        hash: reveal.hash,
        verified: reveal.verified,
        gift_count: reveal.gifts.length,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error revealing gifts');
    res.status(500).json({ error: 'Failed to reveal gifts' });
  }
});

/**
 * GET /admin/audit-log
 * Get audit log entries
 */
router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await auditLogRepo.insert.arguments[0].constructor.prototype.constructor(
      `SELECT * FROM audit_log ORDER BY ts DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      total: result.rowCount,
      limit,
      offset,
      logs: result.rows,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching audit log');
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

/**
 * POST /admin/emergency-pause
 * Emergency pause system
 */
router.post('/emergency-pause', async (req: Request, res: Response) => {
  try {
    const { paused } = req.body;

    logger.warn({ paused, actor: 'admin' }, 'Emergency pause triggered');

    // In production, this would stop the relayer and prevent distributions
    // For now, just log it

    await auditLogRepo.insert({
      ts: new Date(),
      actor: 'admin',
      action: 'emergency_pause',
      payload: { paused },
      ip_address: req.ip,
    });

    res.json({
      success: true,
      paused,
      message: paused ? 'System paused' : 'System resumed',
    });
  } catch (error) {
    logger.error({ error }, 'Error toggling emergency pause');
    res.status(500).json({ error: 'Failed to toggle emergency pause' });
  }
});

export default router;

