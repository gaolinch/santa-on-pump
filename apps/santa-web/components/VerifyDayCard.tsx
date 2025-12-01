'use client'

import { useState, useEffect } from 'react'
import { getGiftByDay, getGiftTypeName, getGiftDescription, Gift } from '@/lib/gifts'
import { getCurrentDate } from '@/lib/date-simulator'

interface VerifyDayCardProps {
  day: number
  isSelected: boolean
  onSelect: () => void
}

export default function VerifyDayCard({ day, isSelected, onSelect }: VerifyDayCardProps) {
  const [gift, setGift] = useState<Gift | undefined>(undefined)
  const [giftType, setGiftType] = useState<string>('Loading...')
  const [giftDescription, setGiftDescription] = useState<string>('')
  const [leafHash, setLeafHash] = useState<string>('Loading...')
  const [isRevealed, setIsRevealed] = useState<boolean>(false)

  // Fetch gift data from API
  useEffect(() => {
    const loadGift = async () => {
      const giftData = await getGiftByDay(day)
      setGift(giftData)
      if (giftData) {
        setGiftType(getGiftTypeName(giftData.type))
        setGiftDescription(getGiftDescription(giftData))
      } else {
        setGiftType('Unknown')
        setGiftDescription('')
      }
    }
    loadGift()
  }, [day])

  useEffect(() => {
    // Check reveal status based on current date (respects NEXT_PUBLIC_SIMULATE_DATE)
    const now = getCurrentDate()
    const currentMonth = now.getMonth() // 0-indexed, so December = 11
    const currentDay = now.getDate()
    
    // Hint phase: Day X at 00:00 - show category only
    const isHintPhase = currentMonth === 11 && currentDay === day
    
    // Full reveal: Day X+1 at 00:00 - show everything
    const isFullyRevealed = currentMonth === 11 && currentDay > day
    
    if (!isHintPhase && !isFullyRevealed) {
      // Not time to reveal yet - completely locked
      setLeafHash('X'.repeat(64))
      setIsRevealed(false)
      return
    }

    if (isHintPhase) {
      // Hint phase - show type but hide details
      setLeafHash('X'.repeat(64))
      setIsRevealed(false) // Keep as not revealed to prevent clicking
      return
    }

    // Full reveal phase - fetch the reveal data to get the actual leaf hash
    const fetchLeafHash = async () => {
      try {
        const response = await fetch(`/api/reveals/day-${String(day).padStart(2, '0')}`)
        if (response.ok) {
          const data = await response.json()
          setLeafHash(data.leaf)
          setIsRevealed(true)
        } else {
          setLeafHash('X'.repeat(64))
          setIsRevealed(false)
        }
      } catch (err) {
        setLeafHash('X'.repeat(64))
        setIsRevealed(false)
      }
    }

    fetchLeafHash()
  }, [day])

  // Determine reveal state from gift data
  const isHintPhase = gift?.hint_only === true
  const isFullyRevealed = isRevealed && !isHintPhase

  const getCardStyles = () => {
    const base = 'bg-white dark:bg-gray-800 rounded-lg p-6 border transition-all'
    
    // Hint phase - show some info but not clickable
    if (isHintPhase) {
      return `${base} border-yellow-300 dark:border-yellow-700 opacity-80 cursor-not-allowed`
    }
    
    // Unrevealed days - darker, no interaction
    if (!isFullyRevealed) {
      return `${base} border-gray-300 dark:border-gray-700 opacity-60 cursor-not-allowed`
    }
    
    // Revealed and selected
    if (isSelected) {
      return `${base} border-festive-green-500 dark:border-festive-green-500 ring-2 ring-festive-green-300 dark:ring-festive-green-700 shadow-lg cursor-pointer`
    }
    
    // Revealed but not selected
    return `${base} border-gray-200 dark:border-gray-700 hover:border-festive-green-500 dark:hover:border-festive-green-500 hover:shadow-lg cursor-pointer`
  }

  return (
    <div
      className={getCardStyles()}
      onClick={isFullyRevealed ? onSelect : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className={`text-2xl font-bold ${
          isFullyRevealed 
            ? 'text-festive-green-600 dark:text-festive-green-400'
            : isHintPhase
            ? 'text-yellow-600 dark:text-yellow-400'
            : 'text-gray-500 dark:text-gray-600'
        }`}>
          Day {day}
        </h2>
        <span className="text-xs font-semibold px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
          Dec {day}
        </span>
      </div>
      
      {isFullyRevealed ? (
        <>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {giftType}
          </p>

          <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
            {giftDescription}
          </p>
        </>
      ) : isHintPhase ? (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 mb-2">
            <span className="text-xl">💡</span>
            <p className="text-sm font-medium">Hint Revealed</p>
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {gift?.hint || giftType}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            {gift?.sub_hint || 'Full details will be revealed tomorrow'}
          </p>
        </div>
      ) : (
        <div className="mb-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <span className="text-xl">🔒</span>
            <p className="text-sm font-medium">Not yet revealed</p>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            Check back on December {day}
          </p>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
          Leaf Hash:
        </p>
        <p className="font-mono text-xs break-all bg-gray-100 dark:bg-gray-900 p-2 rounded text-gray-800 dark:text-gray-200">
          {leafHash}
        </p>
      </div>

      {isSelected && isFullyRevealed && (
        <div className="mt-4 flex items-center gap-2 text-festive-green-600 dark:text-festive-green-400">
          <span className="text-sm">⏬</span>
          <span className="text-xs font-medium">See verification details below</span>
        </div>
      )}
    </div>
  )
}

