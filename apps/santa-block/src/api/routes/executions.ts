import { Router, Request, Response } from 'express';
import { logger } from '../../utils/logger';
import { 
  giftExecRepo, 
  giftExecutionSummaryRepo, 
  giftExecutionLogRepo,
  dayPoolRepo 
} from '../../database';
import { getCurrentUTCDate } from '../../utils/date';

const router = Router();

/**
 * GET /executions/day-01, /executions/day-02, etc.
 * Get detailed execution data for a specific day including:
 * - Execution summary
 * - Winners list with wallet addresses and amounts
 * - Execution logs
 * - Transaction details
 */
router.get('/day-:day', async (req: Request, res: Response) => {
  try {
    const dayParam = req.params.day;
    
    // Validate day format (should be 01, 02, etc.)
    if (!dayParam || !dayParam.match(/^\d{2}$/)) {
      return res.status(400).json({
        error: 'Invalid day format. Use day-01, day-02, etc.'
      });
    }

    const dayNumber = parseInt(dayParam, 10);
    
    if (dayNumber < 1 || dayNumber > 24) {
      return res.status(400).json({
        error: 'Day must be between 1 and 24'
      });
    }

    // Get execution records for this day
    const executions = await giftExecRepo.findByDay(dayNumber);
    
    if (executions.length === 0) {
      return res.status(404).json({
        error: 'No execution found for this day',
        day: dayNumber
      });
    }

    // Get the most recent execution (should typically be only one)
    const execution = executions[0];

    // Get execution summary if available
    let summary = null;
    try {
      const summaries = await giftExecutionSummaryRepo.findByDay(dayNumber);
      if (summaries.length > 0) {
        summary = summaries[0];
      }
    } catch (error) {
      logger.warn({ day: dayNumber, error }, 'Could not fetch execution summary');
    }

    // Get execution logs
    let logs: Awaited<ReturnType<typeof giftExecutionLogRepo.findByExecutionId>> = [];
    if (summary?.execution_id) {
      try {
        logs = await giftExecutionLogRepo.findByExecutionId(summary.execution_id);
      } catch (error) {
        logger.warn({ day: dayNumber, error }, 'Could not fetch execution logs');
      }
    }

    // Get day pool for additional context
    const now = getCurrentUTCDate();
    const year = now.getUTCFullYear();
    const dayDate = new Date(Date.UTC(year, 11, dayNumber)); // December {day}
    const dayPool = await dayPoolRepo.findByDay(dayDate);

    // Parse winners JSONB
    let winners = [];
    try {
      winners = typeof execution.winners === 'string' 
        ? JSON.parse(execution.winners) 
        : execution.winners;
    } catch (error) {
      logger.warn({ day: dayNumber, error }, 'Could not parse winners JSON');
    }

    // Build response
    const response = {
      day: dayNumber,
      execution: {
        id: execution.id,
        execution_time: execution.execution_time,
        status: execution.status,
        total_distributed: execution.total_distributed.toString(),
        total_distributed_sol: (Number(execution.total_distributed) / 1e9).toFixed(9),
        tx_hashes: execution.tx_hashes,
        error_message: execution.error_message,
      },
      summary: summary ? {
        start_time: summary.start_time,
        end_time: summary.end_time,
        duration_ms: summary.duration_ms,
        status: summary.status,
        winner_count: summary.winner_count,
        total_distributed: summary.total_distributed?.toString(),
        metadata: summary.metadata,
      } : null,
      winners: winners.map((winner: any) => ({
        wallet: winner.wallet,
        amount: typeof winner.amount === 'string' ? winner.amount : winner.amount.toString(),
        amount_sol: (Number(typeof winner.amount === 'string' ? winner.amount : winner.amount.toString()) / 1e9).toFixed(9),
        ...(winner.balance !== undefined && {
          balance: typeof winner.balance === 'string' ? winner.balance : winner.balance.toString(),
        }),
      })),
      logs: logs.map(log => ({
        step_number: log.step_number,
        step_name: log.step_name,
        step_status: log.step_status,
        log_level: log.log_level,
        message: log.message,
        data: log.data,
        duration_ms: log.duration_ms,
        timestamp: log.timestamp,
      })),
      day_pool: dayPool ? {
        day: dayPool.day,
        fees_in: dayPool.fees_in.toString(),
        fees_in_sol: (Number(dayPool.fees_in) / 1e9).toFixed(9),
        tx_count: dayPool.tx_count,
        status: dayPool.status,
        closed_at: dayPool.closed_at,
      } : null,
    };

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Error fetching execution data');
    return res.status(500).json({
      error: 'Failed to fetch execution data'
    });
  }
});

export default router;

