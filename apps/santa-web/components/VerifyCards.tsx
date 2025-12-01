'use client'

import { useState } from 'react'
import VerifyDayCard from './VerifyDayCard'
import VerifyDetailsCard from './VerifyDetailsCard'

export default function VerifyCards() {
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const days = Array.from({ length: 24 }, (_, i) => i + 1)
  
  // Calculate which row the selected day is in (0-indexed)
  const selectedRowIndex = selectedDay ? Math.floor((selectedDay - 1) / 3) : -1
  const cardsPerRow = 3 // lg:grid-cols-3

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          Select a Day to Verify
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {days.map((day) => {
            const dayRowIndex = Math.floor((day - 1) / cardsPerRow)
            const isLastInRow = day % cardsPerRow === 0 || day === 24
            
            return (
              <div key={day} className="contents">
                <VerifyDayCard
                  day={day}
                  isSelected={selectedDay === day}
                  onSelect={() => setSelectedDay(selectedDay === day ? null : day)}
                />
                
                {/* Show details card after the last card in the row if a day in this row is selected */}
                {isLastInRow && selectedDay && dayRowIndex === selectedRowIndex && (
                  <div className="col-span-full">
                    <VerifyDetailsCard
                      day={selectedDay}
                      onClose={() => setSelectedDay(null)}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

