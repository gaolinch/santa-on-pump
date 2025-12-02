import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';
import { getCurrentUTCDate } from '../../utils/date';
import { giftSpecRepo } from '../../database';

const router = Router();

// Load private merkle data (contains salts and proofs for all days)
let privateMerkleData: any = null;
try {
  const privateMerklePath = path.join(__dirname, '../../../data/private-merkle-data.json');
  if (fs.existsSync(privateMerklePath)) {
    privateMerkleData = JSON.parse(fs.readFileSync(privateMerklePath, 'utf8'));
    logger.info('Loaded private merkle data for reveals');
  } else {
    logger.warn({ path: privateMerklePath }, 'Private merkle data file not found');
  }
} catch (error) {
  logger.error({ error }, 'Failed to load private merkle data');
}

/**
 * GET /reveals/day-01, /reveals/day-02, etc.
 * Serve daily reveal data with proper timing controls
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

    // Check if we're in December and determine reveal phase
    const now = getCurrentUTCDate();
    const currentMonth = now.getUTCMonth(); // 0-indexed, so December = 11
    const currentDay = now.getUTCDate();
    
    const isDecember = currentMonth === 11;
    
    // Allow override for testing via environment variable
    const ALLOW_FUTURE_REVEALS = process.env.ALLOW_FUTURE_REVEALS === 'true';
    
    // Determine reveal phase:
    // - Before day X: Not revealed at all (403)
    // - Day X (00:00 - 23:59): Hint phase only
    // - Day X+1 onwards: Full reveal
    const isHintPhase = isDecember && currentDay === dayNumber;
    const isFullyRevealed = isDecember && currentDay > dayNumber;
    const isNotYetRevealed = !isDecember || currentDay < dayNumber;
    
    if (isNotYetRevealed && !ALLOW_FUTURE_REVEALS) {
      return res.status(403).json({
        error: 'This gift has not been revealed yet',
        current_day: currentDay,
        current_month: currentMonth + 1,
        requested_day: dayNumber
      });
    }

    // Fetch gift spec from database
    const giftSpec = await giftSpecRepo.findByDay(dayNumber);
    
    if (!giftSpec) {
      logger.warn({ day: dayNumber }, 'Gift spec not found in database');
      return res.status(404).json({
        error: 'Gift data not found'
      });
    }

    // If in hint phase, return only limited data
    if (isHintPhase && !ALLOW_FUTURE_REVEALS) {
      const hint = giftSpec.hint || 'Mystery Gift';
      const sub_hint = giftSpec.sub_hint || 'Full details revealed tomorrow';
      
      return res.json({
        day: dayNumber,
        hint: hint,
        sub_hint: sub_hint,
        hint_only: true
      });
    }

    // Full reveal: Build complete reveal data from database
    // IMPORTANT: The gift structure must match what was used during Merkle tree generation
    // This includes: day, type, hint, sub_hint, params, distribution_source, notes
    // The 'hash' field is NOT included (it's removed during verification)
    const revealData: any = {
      day: dayNumber,
      gift: {
        day: dayNumber,
        type: giftSpec.type,
        hint: giftSpec.hint,
        sub_hint: giftSpec.sub_hint,
        params: giftSpec.params,
        distribution_source: giftSpec.distribution_source || 'treasury_daily_fees',
        notes: giftSpec.notes
      }
    };

    // Add Merkle proof data from database
    if (giftSpec.salt && giftSpec.leaf) {
      revealData.salt = giftSpec.salt;
      revealData.leaf = giftSpec.leaf;
      
      // Parse proof if it exists
      if (giftSpec.proof) {
        try {
          revealData.proof = typeof giftSpec.proof === 'string' 
            ? JSON.parse(giftSpec.proof) 
            : giftSpec.proof;
        } catch (error) {
          logger.warn({ day: dayNumber, error }, 'Failed to parse proof from database');
        }
      }
      
      // Get root from multiple sources (in order of preference):
      // 1. Private merkle data file (if available)
      // 2. Environment variable (for production)
      // 3. Reveal file (fallback)
      if (privateMerkleData && privateMerkleData.root) {
        revealData.root = privateMerkleData.root;
      } else if (process.env.MERKLE_ROOT) {
        // Use environment variable (for production where data folder doesn't exist)
        revealData.root = process.env.MERKLE_ROOT;
      } else {
        // Fallback: try to load from reveal file
        try {
          const revealPath = path.join(__dirname, '../../../data/reveals', `day-${String(dayNumber).padStart(2, '0')}.json`);
          if (fs.existsSync(revealPath)) {
            const revealFile = JSON.parse(fs.readFileSync(revealPath, 'utf8'));
            if (revealFile.root) {
              revealData.root = revealFile.root;
            }
          }
        } catch (error) {
          logger.warn({ day: dayNumber, error }, 'Could not load root from reveal file');
        }
        
        // If still no root, log warning
        if (!revealData.root) {
          logger.warn({ day: dayNumber }, 'Root not available - set MERKLE_ROOT environment variable or ensure data files exist');
        }
      }
    } else {
      logger.warn({ day: dayNumber }, 'Merkle data not found in database for this day');
    }

    // Return the full reveal data
    return res.json(revealData);
  } catch (error) {
    logger.error({ error }, 'Error loading reveal');
    return res.status(500).json({
      error: 'Failed to load reveal data'
    });
  }
});

export default router;

