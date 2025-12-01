'use client'

import { useState, useEffect } from 'react'
import { verifyDayReveal, DayReveal } from '@/lib/merkle'
import { getCommitmentHash } from '@/lib/gifts'

interface VerifyDetailsCardProps {
  day: number
  onClose: () => void
}

export default function VerifyDetailsCard({ day, onClose }: VerifyDetailsCardProps) {
  const [dayReveal, setDayReveal] = useState<DayReveal | null>(null)
  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean
    leafMatches: boolean
    proofValid: boolean
    rootMatches: boolean
    details: string
  } | null>(null)

  const commitmentRoot = getCommitmentHash()

  useEffect(() => {
    loadAndVerify()
  }, [day])

  const loadAndVerify = async () => {
    setVerifying(true)
    setError(null)
    setDayReveal(null)
    setVerificationResult(null)

    try {
      const response = await fetch(`/api/reveals/day-${String(day).padStart(2, '0')}`)
      if (response.ok) {
        const data = await response.json()
        setDayReveal(data)
        
        // Auto-verify
        const result = await verifyDayReveal(data, commitmentRoot)
        setVerificationResult(result)
      } else if (response.status === 403) {
        setError('Not yet revealed')
      } else if (response.status === 404) {
        setError('Reveal data not found')
      } else {
        setError('Failed to load')
      }
    } catch (err) {
      console.error('Error loading reveal:', err)
      setError('Failed to load')
    } finally {
      setVerifying(false)
    }
  }

  // Not revealed state
  if (error && !verifying) {
    return (
      <div className="col-span-full border border-gray-300 dark:border-gray-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">🔒 Gift Not Yet Revealed</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          This gift will be revealed on December {day}. Check back then!
        </p>
      </div>
    )
  }

  return (
    <div className={`col-span-full border rounded-lg p-6 ${
      verificationResult?.valid 
        ? 'border-green-500 bg-green-50 dark:bg-green-950' 
        : verificationResult 
        ? 'border-red-500 bg-red-50 dark:bg-red-950'
        : 'border-gray-300 dark:border-gray-700'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span>{verificationResult?.valid ? '✅' : verificationResult ? '❌' : '🔍'}</span>
          <span>Merkle Proof Verification</span>
        </h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {verifying && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Verifying proof...</p>
        </div>
      )}

      {!verifying && verificationResult && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span className={verificationResult.rootMatches ? 'text-green-600' : 'text-red-600'}>
              {verificationResult.rootMatches ? '✓' : '✗'}
            </span>
            <span>Root matches commitment</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <span className={verificationResult.leafMatches ? 'text-green-600' : 'text-red-600'}>
              {verificationResult.leafMatches ? '✓' : '✗'}
            </span>
            <span>Leaf hash matches gift + salt</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <span className={verificationResult.proofValid ? 'text-green-600' : 'text-red-600'}>
              {verificationResult.proofValid ? '✓' : '✗'}
            </span>
            <span>Merkle proof is valid</span>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-700">
            <p className={`text-sm font-medium ${
              verificationResult.valid 
                ? 'text-green-700 dark:text-green-300' 
                : 'text-red-700 dark:text-red-300'
            }`}>
              {verificationResult.details}
            </p>
          </div>

          {/* Technical details (collapsible) */}
          {dayReveal && (
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                Show Technical Details
              </summary>
              <div className="mt-3 space-y-2 font-mono bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto">
                <div>
                  <strong>Commitment Root:</strong>
                  <div className="break-all text-gray-600 dark:text-gray-400">{commitmentRoot}</div>
                </div>
                <div>
                  <strong>Leaf Hash:</strong>
                  <div className="break-all text-gray-600 dark:text-gray-400">{dayReveal.leaf}</div>
                </div>
                <div>
                  <strong>Salt:</strong>
                  <div className="break-all text-gray-600 dark:text-gray-400">{dayReveal.salt}</div>
                </div>
                {dayReveal.proof && dayReveal.proof.length > 0 && (
                  <div>
                    <strong>Proof Path ({dayReveal.proof.length} siblings):</strong>
                    <div className="space-y-1 text-gray-600 dark:text-gray-400">
                      {dayReveal.proof.map((hash, i) => (
                        <div key={i} className="break-all">
                          {i + 1}. {hash}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
        <p>
          <strong>What is this?</strong> This verifies that the gift for Day {day} was committed 
          before December 1st and hasn&apos;t been changed. The Merkle proof cryptographically proves 
          this gift was part of the original commitment.
        </p>
      </div>
    </div>
  )
}

