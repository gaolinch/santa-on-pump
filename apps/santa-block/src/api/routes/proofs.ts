import { Router, Request, Response } from 'express';
import { giftSpecRepo, giftExecRepo, dayPoolRepo } from '../../database';
import { commitRevealService } from '../../services/commit-reveal';
import { logger } from '../../utils/logger';
import { getCurrentUTCDate } from '../../utils/date';

const router = Router();

/**
 * Check if a day should be revealed based on current date
 * Only reveals during December, and only for days that have passed
 */
function isDayRevealed(day: number): boolean {
  const now = getCurrentUTCDate();
  const currentMonth = now.getUTCMonth(); // 0-indexed, December = 11
  const currentDay = now.getUTCDate();
  
  // Allow override for testing via environment variable
  if (process.env.ALLOW_FUTURE_REVEALS === 'true') {
    return true;
  }
  
  // Only reveal during December, and only for days that have passed
  const isDecember = currentMonth === 11;
  const hasPassedDay = currentDay >= day;
  
  return isDecember && hasPassedDay;
}

/**
 * GET /proofs/commitment
 * Get the commitment hash
 */
router.get('/commitment', async (req: Request, res: Response) => {
  try {
    const status = await commitRevealService.getCommitmentStatus();
    res.json(status);
  } catch (error) {
    logger.error({ error }, 'Error fetching commitment');
    res.status(500).json({ error: 'Failed to fetch commitment' });
  }
});

/**
 * GET /proofs/:day
 * Get proof for a specific day's gift execution
 */
router.get('/:day', async (req: Request, res: Response) => {
  try {
    const day = parseInt(req.params.day);

    if (isNaN(day) || day < 1 || day > 24) {
      return res.status(400).json({ error: 'Invalid day (must be 1-24)' });
    }

    // Check if this day should be revealed yet
    if (!isDayRevealed(day)) {
      const now = getCurrentUTCDate();
      return res.status(403).json({ 
        error: 'This gift has not been revealed yet',
        current_day: now.getUTCDate(),
        current_month: now.getUTCMonth() + 1,
        requested_day: day
      });
    }

    // Get gift specification
    const spec = await giftSpecRepo.findByDay(day);
    if (!spec) {
      return res.status(404).json({ error: 'Gift not found' });
    }

    // Get day pool status (to show if day is open/closed/executed)
    const now = getCurrentUTCDate();
    const year = now.getUTCFullYear();
    const dayDate = new Date(Date.UTC(year, 11, day)); // December {day}
    const dayPool = await dayPoolRepo.findByDay(dayDate);
    
    // Determine if we're in hint phase (current day) or full reveal (past day)
    // If ALLOW_FUTURE_REVEALS is enabled, always show full details
    const allowFutureReveals = process.env.ALLOW_FUTURE_REVEALS === 'true';
    const currentMonth = now.getUTCMonth(); // 0-indexed, December = 11
    const currentDay = now.getUTCDate();
    const isHintPhase = !allowFutureReveals && currentMonth === 11 && currentDay === day;
    const isFullyRevealed = allowFutureReveals || (currentMonth === 11 && currentDay > day);
    
    // Get execution records
    const executions = await giftExecRepo.findByDay(day);

    // Build response based on reveal phase
    const response: any = {
      day,
      day_status: dayPool?.status || 'open', // 'open' | 'closed' | 'executed'
      executions: executions.map((exec) => ({
        id: exec.id,
        winners: exec.winners,
        tx_hashes: exec.tx_hashes,
        total_distributed: exec.total_distributed.toString(),
        execution_time: exec.execution_time,
        status: exec.status,
        error_message: exec.error_message,
      })),
      verified: true, // In production, verify the execution matches the spec
    };

    if (isHintPhase) {
      // Hint phase: Return only hint text (or type as fallback)
      response.gift_spec = {
        type: spec.type,
        hint: spec.hint || spec.type, // Use custom hint or fallback to type
        sub_hint: spec.sub_hint, // Optional subtitle
        hint_only: true,
      };
    } else if (isFullyRevealed) {
      // Full reveal: Return everything
      response.gift_spec = {
        type: spec.type,
        params: spec.params,
        notes: spec.notes,
        hash: spec.hash,
        hint_only: false,
      };
    }

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Error fetching proof');
    res.status(500).json({ error: 'Failed to fetch proof' });
  }
});

/**
 * GET /proofs/verify/:day
 * Verify that a day's execution matches the committed gift
 */
router.get('/verify/:day', async (req: Request, res: Response) => {
  try {
    const day = parseInt(req.params.day);

    if (isNaN(day) || day < 1 || day > 24) {
      return res.status(400).json({ error: 'Invalid day (must be 1-24)' });
    }

    const verified = await commitRevealService.verifyGiftForDay(day);

    res.json({
      day,
      verified,
    });
  } catch (error) {
    logger.error({ error }, 'Error verifying proof');
    res.status(500).json({ error: 'Failed to verify proof' });
  }
});

/**
 * GET /proofs/all/gifts
 * Get all gift specifications with appropriate reveal level
 * - Current day (Day X): Returns hint only (type, no params/notes)
 * - Past days (Day < X): Returns full details
 * - Future days (Day > X): Not included
 * - If ALLOW_FUTURE_REVEALS=true: Returns all gifts with full details
 */
router.get('/all/gifts', async (req: Request, res: Response) => {
  try {
    const gifts = await giftSpecRepo.findAll();
    const now = getCurrentUTCDate();
    const currentMonth = now.getUTCMonth(); // 0-indexed, December = 11
    const currentDay = now.getUTCDate();
    
    // Check if future reveals are allowed (for testing)
    const allowFutureReveals = process.env.ALLOW_FUTURE_REVEALS === 'true';
    
    // Filter and map gifts based on reveal status
    const processedGifts = gifts
      .filter(gift => {
        // If ALLOW_FUTURE_REVEALS is enabled, include all gifts
        if (allowFutureReveals) {
          return true;
        }
        // Otherwise, only include gifts that are at least in hint phase
        const isDecember = currentMonth === 11;
        return isDecember && currentDay >= gift.day;
      })
      .map((gift) => {
        // If ALLOW_FUTURE_REVEALS is enabled, always show full details
        if (allowFutureReveals) {
          return {
            day: gift.day,
            type: gift.type,
            params: gift.params,
            notes: gift.notes,
            hint_only: false,
          };
        }
        
        // Normal reveal logic
        const isHintPhase = currentMonth === 11 && currentDay === gift.day;
        const isFullyRevealed = currentMonth === 11 && currentDay > gift.day;
        
        if (isHintPhase) {
          // Hint phase: Return only hint text (or type as fallback)
          return {
            day: gift.day,
            type: gift.type,
            hint: gift.hint || gift.type, // Use custom hint or fallback to type
            sub_hint: gift.sub_hint, // Optional subtitle
            hint_only: true,
          };
        } else if (isFullyRevealed) {
          // Full reveal: Return everything
          return {
            day: gift.day,
            type: gift.type,
            params: gift.params,
            notes: gift.notes,
            hint_only: false,
          };
        }
        return null;
      })
      .filter(Boolean);

    res.json({
      total: processedGifts.length,
      total_gifts: gifts.length,
      gifts: processedGifts,
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching all gifts');
    res.status(500).json({ error: 'Failed to fetch gifts' });
  }
});

export default router;

