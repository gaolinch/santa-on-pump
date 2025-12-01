/**
 * Scheduler API Routes
 * 
 * Provides endpoints to:
 * - Get scheduler status
 * - Manually trigger gift execution
 * - View execution logs
 * - Get execution history
 * 
 * ⚠️ All endpoints require admin authentication (API key + IP whitelist)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { giftScheduler } from '../../services/gift-scheduler';
import { giftLogger } from '../../services/gift-logger';
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
    logger.warn({ ip }, 'Unauthorized scheduler access attempt');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Check IP whitelist
  if (!config.security.adminIpWhitelist.includes(ip || '')) {
    logger.warn({ ip }, 'Scheduler access from non-whitelisted IP');
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  next();
}

// Apply admin auth to all scheduler routes
router.use(adminAuth);

/**
 * GET /api/scheduler/status
 * Get scheduler status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const isRunning = giftScheduler.isSchedulerRunning();
    const executionStatuses = giftScheduler.getAllExecutionStatuses();

    res.json({
      success: true,
      data: {
        isRunning,
        executionCount: executionStatuses.length,
        executions: executionStatuses,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get scheduler status');
    res.status(500).json({
      success: false,
      error: 'Failed to get scheduler status',
    });
  }
});

/**
 * GET /api/scheduler/logs
 * Get execution logs
 */
router.get('/logs', (req: Request, res: Response) => {
  try {
    const logs = giftLogger.getAllExecutionLogs();

    res.json({
      success: true,
      data: {
        count: logs.length,
        logs,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get execution logs');
    res.status(500).json({
      success: false,
      error: 'Failed to get execution logs',
    });
  }
});

/**
 * GET /api/scheduler/logs/:day
 * Get execution log for a specific day
 */
router.get('/logs/:day', (req: Request, res: Response) => {
  try {
    const day = parseInt(req.params.day, 10);

    if (isNaN(day) || day < 1 || day > 24) {
      return res.status(400).json({
        success: false,
        error: 'Invalid day. Must be between 1 and 24',
      });
    }

    const log = giftLogger.getExecutionLog(day);
    const status = giftScheduler.getExecutionStatus(day);

    if (!log && !status) {
      return res.status(404).json({
        success: false,
        error: `No execution found for day ${day}`,
      });
    }

    res.json({
      success: true,
      data: {
        day,
        log,
        status,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get execution log');
    res.status(500).json({
      success: false,
      error: 'Failed to get execution log',
    });
  }
});

/**
 * POST /api/scheduler/execute
 * Manually trigger gift execution
 * ⚠️ Requires admin authentication (API key + IP whitelist)
 */
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { force = false } = req.body;

    if (giftScheduler.isSchedulerRunning() && !force) {
      return res.status(409).json({
        success: false,
        error: 'Gift execution already in progress. Use force=true to override',
      });
    }

    logger.info({ force }, 'Manual gift execution triggered');

    // Execute asynchronously
    giftScheduler.executeDaily(force).catch((error) => {
      logger.error({ error }, 'Manual gift execution failed');
    });

    res.json({
      success: true,
      message: 'Gift execution started',
      data: {
        force,
        startedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to trigger gift execution');
    res.status(500).json({
      success: false,
      error: 'Failed to trigger gift execution',
    });
  }
});

/**
 * GET /api/scheduler/health
 * Health check for scheduler
 */
router.get('/health', (req: Request, res: Response) => {
  try {
    const isRunning = giftScheduler.isSchedulerRunning();
    const executionStatuses = giftScheduler.getAllExecutionStatuses();
    
    // Check for recent failures
    const recentFailures = executionStatuses.filter(
      (status) => status.status === 'failed' && 
      status.lastAttempt && 
      (Date.now() - status.lastAttempt.getTime()) < 3600000 // Last hour
    );

    const healthy = recentFailures.length === 0;

    res.status(healthy ? 200 : 503).json({
      success: true,
      data: {
        healthy,
        isRunning,
        recentFailures: recentFailures.length,
        lastExecution: executionStatuses.length > 0 
          ? executionStatuses[executionStatuses.length - 1].lastAttempt 
          : null,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to check scheduler health');
    res.status(500).json({
      success: false,
      error: 'Failed to check scheduler health',
    });
  }
});

export default router;

