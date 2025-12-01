'use client'

import Link from 'next/link'
import DayCard from './DayCard'
import { motion } from 'framer-motion'

type DayStatus = 'locked' | 'revealed' | 'today'

export type AdventDay = {
  day: number
  status: DayStatus
}

type AdventGridProps = {
  days: AdventDay[]
  currentDay?: number
}

export default function AdventGrid({ days, currentDay }: AdventGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {days.map(({ day, status }, index) => (
        <motion.div
          key={day}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
        >
          <Link href={`/day/${String(day).padStart(2, '0')}`}>
            <DayCard day={day} status={status} isToday={day === currentDay} />
          </Link>
        </motion.div>
      ))}
    </div>
  )
}

