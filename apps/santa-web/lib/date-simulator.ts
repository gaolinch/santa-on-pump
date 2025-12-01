/**
 * Date utilities for Santa calendar
 */

export function getCurrentDate(): Date {
  return new Date()
}

export function getCurrentDay(): number | null {
  const now = getCurrentDate()
  const dec1 = new Date(now.getFullYear(), 11, 1) // December 1st (month is 0-indexed)
  
  // Before December 1st
  if (now < dec1) return null
  
  // Calculate which day of December we're on
  const day = Math.floor((now.getTime() - dec1.getTime()) / (1000 * 60 * 60 * 24)) + 1
  
  // After December 24th
  return day > 24 ? null : day
}

export function getDecember1st(): Date {
  const now = getCurrentDate()
  return new Date(now.getFullYear(), 11, 1)
}
