'use client'

import { useState, useEffect } from 'react'
import { getCommitmentHash } from '@/lib/gifts'
import MerkleProofVerifier from './MerkleProofVerifier'
import { DayReveal } from '@/lib/merkle'

export default function ProofVerifier() {
  const [selectedDay, setSelectedDay] = useState<number>(1)
  const [dayReveal, setDayReveal] = useState<DayReveal | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commitmentHash = getCommitmentHash()

  useEffect(() => {
    loadDayReveal(selectedDay)
  }, [selectedDay])

  const loadDayReveal = async (day: number) => {
    setLoading(true)
    setError(null)
    setDayReveal(null)

    try {
      const response = await fetch(`/api/reveals/day-${String(day).padStart(2, '0')}`)
      if (response.ok) {
        const data = await response.json()
        setDayReveal(data)
      } else if (response.status === 403) {
        setError('This gift has not been revealed yet')
      } else if (response.status === 404) {
        setError('Reveal data not found')
      } else {
        setError('Failed to load reveal data')
      }
    } catch (err) {
      console.error('Error loading reveal:', err)
      setError('Failed to load reveal data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
          🎁 Select Day to Verify
        </h3>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Choose a day to verify its Merkle proof against the commitment published before December 1st.
        </p>

        <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
          Select Day:
        </label>
        <select
          value={selectedDay}
          onChange={(e) => setSelectedDay(Number(e.target.value))}
          className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-festive-green-500 focus:border-transparent text-gray-900 dark:text-white"
        >
          {Array.from({ length: 24 }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day}>
              Day {day} - December {day}
            </option>
          ))}
        </select>

        {loading && (
          <div className="text-center py-8 mt-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-festive-green-600 dark:border-festive-green-400"></div>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading reveal data...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mt-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">{error}</p>
          </div>
        )}
      </div>

      {!loading && !error && (
        <MerkleProofVerifier day={selectedDay} dayReveal={dayReveal} />
      )}
    </div>
  )
}

