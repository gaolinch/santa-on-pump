'use client'

import { useEffect, useState } from 'react'
import { differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from 'date-fns'

type CountdownProps = {
  targetDate: Date
}

// Calculate time left to avoid initial flash
const calculateTimeLeft = (targetDate: Date) => {
  const simulatedDate = process.env.NEXT_PUBLIC_SIMULATE_DATE
  const now = simulatedDate ? new Date(simulatedDate) : new Date()
  
  if (now >= targetDate) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  const totalDays = differenceInDays(targetDate, now)
  const totalHours = differenceInHours(targetDate, now)
  const totalMinutes = differenceInMinutes(targetDate, now)
  const totalSeconds = differenceInSeconds(targetDate, now)

  return {
    days: totalDays,
    hours: totalHours - totalDays * 24,
    minutes: totalMinutes - totalHours * 60,
    seconds: totalSeconds - totalMinutes * 60,
  }
}

export default function Countdown({ targetDate }: CountdownProps) {
  // Initialize with calculated value to avoid flash
  const [timeLeft, setTimeLeft] = useState(() => calculateTimeLeft(targetDate))
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const update = () => {
      setTimeLeft(calculateTimeLeft(targetDate))
    }

    update()
    const interval = setInterval(update, 1000)

    return () => clearInterval(interval)
  }, [targetDate])

  // Only show "PUMP!" after component has mounted and time is actually 0
  if (mounted && timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.minutes === 0 && timeLeft.seconds === 0) {
    const SANTA_CA = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
    
    return (
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-3 bg-gradient-to-r from-festive-green-600 to-emerald-500 dark:from-festive-green-500 dark:to-emerald-400 px-8 py-4 rounded-lg shadow-lg border-2 border-festive-green-500 dark:border-festive-green-400">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
          </div>
          <div className="text-3xl font-bold text-white tracking-wider uppercase">
            PUMP!
          </div>
        </div>
        
        {/* Token CA Display */}
        <div className="bg-white dark:bg-gray-800 rounded-lg px-6 py-4 border-2 border-festive-green-500/30 dark:border-festive-green-400/30 shadow-md max-w-2xl mx-auto">
          <div className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wider">
            $SANTA Token Contract Address
          </div>
          <div className="flex items-center justify-center gap-2">
            <code className="text-sm md:text-base font-mono text-festive-green-600 dark:text-festive-green-400 break-all">
              {SANTA_CA}
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(SANTA_CA)
              }}
              className="flex-shrink-0 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Copy to clipboard"
            >
              <svg 
                className="w-5 h-5 text-gray-600 dark:text-gray-400" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" 
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const letters = ['P', 'U', 'M', 'P']
  const labels = ['Days', 'Hours', 'Minutes', 'Seconds']
  const values = [
    String(timeLeft.days).padStart(2, '0'),
    String(timeLeft.hours).padStart(2, '0'),
    String(timeLeft.minutes).padStart(2, '0'),
    String(timeLeft.seconds).padStart(2, '0')
  ]

  return (
    <div className="grid grid-cols-4 gap-4 text-center">
      {values.map((value, index) => (
        <div key={index} className="countdown-flip-container">
          <div className="countdown-flip-inner">
            {/* Front - Number */}
            <div className="countdown-flip-front bg-white dark:bg-gray-800/80 rounded-lg p-4 border-2 border-festive-green-500/30 dark:border-festive-green-400/30 shadow-lg backdrop-blur-sm">
              <div className="text-3xl font-bold text-festive-green-600 dark:text-festive-green-400 font-mono" suppressHydrationWarning>
                {value}
              </div>
              <div className="text-xs uppercase tracking-wider text-gray-600 dark:text-gray-400 mt-1 font-semibold">{labels[index]}</div>
            </div>
            {/* Back - Letter */}
            <div className="countdown-flip-back bg-white dark:bg-gray-800/80 rounded-lg p-4 border-2 border-festive-green-500/30 dark:border-festive-green-400/30 shadow-lg backdrop-blur-sm">
              <div className="text-3xl font-bold text-festive-green-600 dark:text-festive-green-400 font-mono text-center">
                {letters[index]}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

