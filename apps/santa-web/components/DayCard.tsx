import type { AdventDay } from './AdventGrid'

type DayCardProps = {
  day: number
  status: 'locked' | 'revealed' | 'today'
  isToday?: boolean
}

export default function DayCard({ day, status, isToday }: DayCardProps) {
  const baseStyles =
    'relative aspect-square rounded-lg border-2 p-4 flex flex-col items-center justify-center transition-all hover:scale-105 cursor-pointer'

  if (status === 'locked') {
    return (
      <div
        className={`${baseStyles} border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 opacity-85`}
      >
        <div className="text-2xl font-bold text-gray-400 dark:text-gray-600">
          {day}
        </div>
        <div className="text-xs text-gray-400 dark:text-gray-600 mt-1">
          🔒 Locked
        </div>
      </div>
    )
  }

  if (status === 'revealed') {
    return (
      <div
        className={`${baseStyles} border-festive-green-500 dark:border-festive-green-400 bg-festive-green-50 dark:bg-festive-green-900/60`}
      >
        <div className="text-2xl font-bold text-festive-green-700 dark:text-festive-green-300">
          {day}
        </div>
        <div className="text-xs text-festive-green-600 dark:text-festive-green-400 mt-1">
          🎁 Revealed
        </div>
      </div>
    )
  }

  // today
  return (
    <div
      className={`${baseStyles} border-festive-red-500 dark:border-festive-red-400 bg-festive-red-50 dark:bg-festive-red-900/60 ring-2 ring-festive-red-300 dark:ring-festive-red-700`}
    >
      <div className="text-2xl font-bold text-festive-red-700 dark:text-festive-red-300">
        {day}
      </div>
      <div className="text-xs text-festive-red-600 dark:text-festive-red-400 mt-1 animate-pulse">
        ⏰ Today
      </div>
    </div>
  )
}

