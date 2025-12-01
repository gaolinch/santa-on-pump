/**
 * Get current UTC date (start of day)
 */
export function getCurrentUTCDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Get previous UTC date
 */
export function getPreviousUTCDate(): Date {
  const date = getCurrentUTCDate();
  date.setUTCDate(date.getUTCDate() - 1);
  return date;
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get day of advent (1-24) from date
 */
export function getAdventDay(date: Date): number | null {
  const year = date.getUTCFullYear();
  const dec1 = new Date(Date.UTC(year, 11, 1)); // December 1st
  const dec24 = new Date(Date.UTC(year, 11, 24)); // December 24th
  
  if (date < dec1 || date > dec24) {
    return null;
  }
  
  return Math.floor((date.getTime() - dec1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Check if date is within season
 */
export function isWithinSeason(date: Date): boolean {
  return getAdventDay(date) !== null;
}

/**
 * Parse time window string (HH:MM:SS)
 */
export function parseTimeWindow(dateStr: string, timeStr: string): Date {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  const date = new Date(dateStr);
  date.setUTCHours(hours, minutes, seconds, 0);
  return date;
}

/**
 * Check if timestamp is within time window
 */
export function isWithinTimeWindow(
  timestamp: Date,
  dayDate: Date,
  startTime: string,
  endTime: string
): boolean {
  const start = parseTimeWindow(dayDate.toISOString(), startTime);
  const end = parseTimeWindow(dayDate.toISOString(), endTime);
  return timestamp >= start && timestamp <= end;
}

