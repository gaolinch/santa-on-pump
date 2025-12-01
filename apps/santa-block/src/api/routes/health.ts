import { Router, Request, Response } from 'express';
import { db } from '../../database';
import { solanaService } from '../../services/solana';
import { websocketListener } from '../../services/websocket-listener';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /health
 * Health check endpoint
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const checks = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: false,
        rpc: false,
      },
      details: {} as any,
    };

    // Check database
    try {
      checks.checks.database = await db.healthCheck();
    } catch (error) {
      checks.checks.database = false;
      checks.details.database_error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Check Solana RPC
    try {
      const rpcHealth = await solanaService.healthCheck();
      checks.checks.rpc = rpcHealth.healthy;
      checks.details.rpc_slot = rpcHealth.slot;
    } catch (error) {
      checks.checks.rpc = false;
      checks.details.rpc_error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Overall status
    const allHealthy = Object.values(checks.checks).every((check) => check);
    checks.status = allHealthy ? 'healthy' : 'degraded';

    const statusCode = allHealthy ? 200 : 503;
    res.status(statusCode).json(checks);
  } catch (error) {
    logger.error({ error }, 'Health check error');
    res.status(503).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /health/ready
 * Readiness check
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const dbHealthy = await db.healthCheck();
    const rpcHealthy = (await solanaService.healthCheck()).healthy;

    if (dbHealthy && rpcHealthy) {
      res.status(200).json({ ready: true });
    } else {
      res.status(503).json({ ready: false });
    }
  } catch (error) {
    res.status(503).json({ ready: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

/**
 * GET /health/live
 * Liveness check
 */
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ alive: true });
});

/**
 * GET /health/websocket
 * WebSocket listener status
 */
router.get('/websocket', (req: Request, res: Response) => {
  try {
    const status = websocketListener.getStatus();
    
    const isHealthy = status.isRunning && status.isConnected;
    const statusCode = isHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      websocket: {
        ...status,
        readyStateLabel: getReadyStateLabel(status.readyState),
      }
    });
  } catch (error) {
    logger.error({ error }, 'WebSocket status check error');
    res.status(503).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Helper function to convert WebSocket readyState to label
function getReadyStateLabel(readyState: number | undefined): string {
  switch (readyState) {
    case 0: return 'CONNECTING';
    case 1: return 'OPEN';
    case 2: return 'CLOSING';
    case 3: return 'CLOSED';
    default: return 'UNKNOWN';
  }
}

export default router;

