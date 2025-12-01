'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { formatNumber } from '@/lib/format'

type CounterProps = {
  value: number
  label: string
  prefix?: string
  suffix?: string
}

export default function Counter({
  value,
  label,
  prefix = '',
  suffix = '',
}: CounterProps) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const duration = 2000
    const steps = 60
    const increment = value / steps
    let current = 0
    let step = 0

    const timer = setInterval(() => {
      step++
      current = Math.min(value, increment * step)
      setDisplayValue(current)

      if (step >= steps) {
        clearInterval(timer)
        setDisplayValue(value)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center"
    >
      <div className="text-3xl md:text-4xl font-bold text-festive-green-600 dark:text-festive-green-400">
        {prefix}
        {formatNumber(displayValue)}
        {suffix}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400 mt-2">
        {label}
      </div>
    </motion.div>
  )
}

