import { Router, Request, Response } from 'express';
import { txRawRepo } from '../../database';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /transactions/recent
 * Get recent transactions for the terminal feed
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await txRawRepo.findRecent(limit, offset);

    res.json({
      transactions: result.map((tx) => ({
        signature: tx.signature,
        sub_tx: tx.sub_tx,
        blockTime: tx.block_time,
        fromWallet: tx.from_wallet,
        toWallet: tx.to_wallet,
        amount: tx.amount.toString(),
        kind: tx.kind,
        fee: tx.fee?.toString(),
        status: tx.status,
        slot: tx.slot,
      })),
      count: result.length,
      offset,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching recent transactions');
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /transactions/live
 * Get live transactions since a specific signature
 */
router.get('/live', async (req: Request, res: Response) => {
  try {
    const since = req.query.since as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);

    let result;
    if (since) {
      result = await txRawRepo.findSince(since, limit);
    } else {
      result = await txRawRepo.findRecent(limit, 0);
    }

    res.json({
      transactions: result.map((tx) => ({
        signature: tx.signature,
        sub_tx: tx.sub_tx,
        blockTime: tx.block_time,
        fromWallet: tx.from_wallet,
        toWallet: tx.to_wallet,
        amount: tx.amount.toString(),
        kind: tx.kind,
        fee: tx.fee?.toString(),
        status: tx.status,
        slot: tx.slot,
      })),
      count: result.length,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching live transactions');
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

/**
 * GET /transactions/stream
 * Server-Sent Events stream for real-time transactions
 * This endpoint keeps the connection open and pushes new transactions as they arrive
 */
router.get('/stream', async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // CORS headers for SSE
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  logger.info('New SSE connection established');

  // Send initial connection confirmation
  res.write('data: {"type":"connected","message":"Stream connected"}\n\n');

  // Keep track of last sent transaction
  let lastSignature = (req.query.since as string) || null;

  // Poll interval - check DB every 5 seconds
  const POLL_INTERVAL = 5000;
  const HEARTBEAT_INTERVAL = 30000;
  let lastHeartbeat = Date.now();

  // Poll DB and push updates
  const intervalId = setInterval(async () => {
    try {
      // Fetch new transactions
      let newTxs: Awaited<ReturnType<typeof txRawRepo.findRecent>>;
      if (lastSignature) {
        newTxs = await txRawRepo.findSince(lastSignature, 50);
      } else {
        // First poll - get most recent transaction to establish baseline
        const recentTxs = await txRawRepo.findRecent(1, 0);
        if (recentTxs.length > 0) {
          lastSignature = recentTxs[0].signature;
          logger.info({ signature: lastSignature }, 'Established baseline signature');
        }
        newTxs = [];
      }

      // Send new transactions if any (findSince returns transactions AFTER lastSignature)
      if (newTxs.length > 0) {
        const formattedTxs = newTxs.map((tx) => ({
          signature: tx.signature,
          sub_tx: tx.sub_tx,
          blockTime: tx.block_time,
          fromWallet: tx.from_wallet,
          toWallet: tx.to_wallet,
          amount: tx.amount.toString(),
          kind: tx.kind,
          fee: tx.fee?.toString(),
          status: tx.status,
          slot: tx.slot,
        }));

        res.write(
          `data: ${JSON.stringify({
            type: 'transactions',
            transactions: formattedTxs,
            count: formattedTxs.length,
          })}\n\n`
        );

        // Update last signature to newest transaction
        lastSignature = newTxs[0].signature;
        lastHeartbeat = Date.now();
        
        logger.info({ count: newTxs.length }, 'Sent transactions via SSE');
      }

      // Send heartbeat every 30 seconds to keep connection alive
      if (Date.now() - lastHeartbeat > HEARTBEAT_INTERVAL) {
        res.write(': heartbeat\n\n');
        lastHeartbeat = Date.now();
        logger.debug('SSE heartbeat sent');
      }
    } catch (error) {
      logger.error({ error }, 'Error in SSE stream');
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message: 'Error fetching transactions',
        })}\n\n`
      );
    }
  }, POLL_INTERVAL);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(intervalId);
    logger.info('SSE connection closed');
  });
});

export default router;



