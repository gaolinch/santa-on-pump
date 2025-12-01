import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * API endpoint to serve daily reveal data
 * GET /api/reveals/day-01, /api/reveals/day-02, etc.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ day: string }> }
) {
  try {
    const { day } = await params;
    
    // Validate day format (should be day-01, day-02, etc.)
    if (!day || !day.match(/^day-\d{2}$/)) {
      return NextResponse.json(
        { error: 'Invalid day format. Use day-01, day-02, etc.' },
        { status: 400 }
      );
    }

    // Extract day number
    const dayNumber = parseInt(day.split('-')[1], 10);
    
    if (dayNumber < 1 || dayNumber > 24) {
      return NextResponse.json(
        { error: 'Day must be between 1 and 24' },
        { status: 400 }
      );
    }

    // Check if we're in December and determine reveal phase
    const now = new Date();
    const currentMonth = now.getUTCMonth(); // 0-indexed, so December = 11
    const currentDay = now.getUTCDate();
    
    const isDecember = currentMonth === 11;
    
    // Allow override for testing via environment variable
    const ALLOW_FUTURE_REVEALS = process.env.ALLOW_FUTURE_REVEALS === 'false';
    
    // Determine reveal phase:
    // - Before day X: Not revealed at all (403)
    // - Day X (00:00 - 23:59): Hint phase only
    // - Day X+1 onwards: Full reveal
    const isHintPhase = isDecember && currentDay === dayNumber;
    const isFullyRevealed = isDecember && currentDay > dayNumber;
    const isNotYetRevealed = !isDecember || currentDay < dayNumber;
    
    if (isNotYetRevealed && !ALLOW_FUTURE_REVEALS) {
      return NextResponse.json(
        { 
          error: 'This gift has not been revealed yet',
          current_day: currentDay,
          current_month: currentMonth + 1,
          requested_day: dayNumber
        },
        { status: 403 }
      );
    }

    // If in hint phase, return only limited data (check this FIRST before trying to read files)
    if (isHintPhase && !ALLOW_FUTURE_REVEALS) {
      // Fetch hint from database via backend API
      const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      let hint = 'Mystery Gift';
      let sub_hint = 'Full details revealed tomorrow';
      
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        try {
          const response = await fetch(`${apiUrl}/proofs/all/gifts`, {
            signal: controller.signal,
          });
          if (response.ok) {
            const data = await response.json();
            const giftData = data.gifts?.find((g: any) => g.day === dayNumber);
            if (giftData?.hint) {
              hint = giftData.hint;
            }
            if (giftData?.sub_hint) {
              sub_hint = giftData.sub_hint;
            }
          } else {
            console.error(`Failed to fetch hint from API: ${response.status} ${response.statusText}`);
          }
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        console.error('Failed to fetch hint from API:', error);
        // Continue with default hint values if API call fails
      }
      
      return NextResponse.json({
        day: dayNumber,
        hint: hint,
        sub_hint: sub_hint,
        hint_only: true
      }, {
        headers: {
          'Cache-Control': 'public, max-age=60', // Cache for 1 minute during hint phase
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // For full reveal, try to load the reveal file from the backend data directory
    // In production, you might want to store these in a database or cloud storage
    const revealsDir = path.join(process.cwd(), '../santa-block/data/reveals');
    const revealPath = path.join(revealsDir, `${day}.json`);

    if (!fs.existsSync(revealPath)) {
      // If reveal file doesn't exist, try to fetch from backend API as fallback
      const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        try {
          const response = await fetch(`${apiUrl}/proofs/${dayNumber}`, {
            signal: controller.signal,
          });
          if (response.ok) {
            const data = await response.json();
            // Return a simplified reveal structure from API data
            return NextResponse.json({
              day: dayNumber,
              gift: data.gift_spec,
              leaf: data.gift_spec?.hash,
              hint_only: false,
            }, {
              headers: {
                'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        console.error('Failed to fetch reveal from API:', error);
      }
      
      return NextResponse.json(
        { error: 'Reveal data not found' },
        { status: 404 }
      );
    }

    const revealData = JSON.parse(fs.readFileSync(revealPath, 'utf8'));

    // Return the full reveal data with CORS headers for public access
    return NextResponse.json(revealData, {
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache forever since reveals don't change
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error loading reveal:', error);
    return NextResponse.json(
      { error: 'Failed to load reveal data' },
      { status: 500 }
    );
  }
}

