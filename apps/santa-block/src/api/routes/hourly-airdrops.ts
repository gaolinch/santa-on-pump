/**
 * Hourly Airdrops API Routes
 * 
 * ⚠️ All endpoints require admin authentication (API key + IP whitelist)
 * These endpoints can trigger real token transfers and should be protected.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { hourlyProcessor } from '../../services/hourly-processor';
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
    logger.warn({ ip }, 'Unauthorized hourly-airdrops access attempt');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Check IP whitelist
  if (!config.security.adminIpWhitelist.includes(ip || '')) {
    logger.warn({ ip }, 'Hourly-airdrops access from non-whitelisted IP');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}

// Apply admin auth to all hourly-airdrops routes
router.use(adminAuth);

/**
 * GET /api/hourly-airdrops/status
 * Get current hourly airdrop status
 */
router.get('/status', async (req, res) => {
  try {
    // Return basic status
    res.json({
      status: 'operational',
      message: 'Hourly airdrop processor is running',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get hourly airdrop status');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/hourly-airdrops/execute
 * Manually trigger hourly airdrop execution
 * 
 * ⚠️ WARNING: This performs real operations (token transfers, DB writes)
 * ⚠️ Requires admin authentication (API key + IP whitelist)
 */
router.post('/execute', async (req, res) => {
  try {
    logger.info('Manual hourly airdrop execution triggered via API');

    const result = await hourlyProcessor.processHourlyAirdrop();

    if (!result) {
      return res.json({
        success: true,
        message: 'No hourly airdrop to process',
        data: null,
      });
    }

    if (result.skipped) {
      return res.json({
        success: true,
        message: 'Hourly airdrop skipped',
        data: {
          skipped: true,
          skipReason: result.skipReason,
          day: result.day,
          hour: result.hour,
        },
      });
    }

    res.json({
      success: true,
      message: 'Hourly airdrop executed successfully',
      data: {
        day: result.day,
        hour: result.hour,
        winner: result.winner,
        amount: result.amount,
        blockhash: result.blockhash,
        timestamp: result.timestamp,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to execute hourly airdrop');
    res.status(500).json({
      success: false,
      error: 'Failed to execute hourly airdrop',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/hourly-airdrops/dry-run
 * Test hourly airdrop without performing real operations
 * 
 * Query params:
 *   - day: Advent day (1-24), defaults to current day
 *   - hour: Hour (0-23), defaults to current hour
 * 
 * ⚠️ Requires admin authentication (API key + IP whitelist)
 */
router.post('/dry-run', async (req, res) => {
  try {
    const day = req.query.day ? parseInt(req.query.day as string) : undefined;
    const hour = req.query.hour ? parseInt(req.query.hour as string) : undefined;

    logger.info({ day, hour }, 'Hourly airdrop dry run triggered via API');

    const result = await hourlyProcessor.dryRunHourlyAirdrop(day, hour);

    if (!result) {
      return res.json({
        success: true,
        message: 'No hourly airdrop to process (dry run)',
        data: null,
      });
    }

    res.json({
      success: true,
      message: 'Dry run completed',
      data: result,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to execute hourly airdrop dry run');
    res.status(500).json({
      success: false,
      error: 'Failed to execute dry run',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
