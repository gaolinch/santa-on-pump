'use client';

import { useState, useEffect } from 'react';
import { verifyDayReveal, DayReveal } from '@/lib/merkle';
import { getCommitmentHash } from '@/lib/gifts';

interface MerkleProofVerifierProps {
  day: number;
  dayReveal: DayReveal | null;
  className?: string;
}

export default function MerkleProofVerifier({ day, dayReveal, className = '' }: MerkleProofVerifierProps) {
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{
    valid: boolean;
    leafMatches: boolean;
    proofValid: boolean;
    rootMatches: boolean;
    details: string;
  } | null>(null);

  const commitmentRoot = getCommitmentHash();

  useEffect(() => {
    // Auto-verify when dayReveal is loaded
    if (dayReveal && !verificationResult) {
      handleVerify();
    }
  }, [dayReveal]);

  const handleVerify = async () => {
    if (!dayReveal) return;

    setVerifying(true);
    try {
      const result = await verifyDayReveal(dayReveal, commitmentRoot);
      setVerificationResult(result);
    } catch (error) {
      console.error('Verification error:', error);
      setVerificationResult({
        valid: false,
        leafMatches: false,
        proofValid: false,
        rootMatches: false,
        details: 'Verification failed due to an error'
      });
    } finally {
      setVerifying(false);
    }
  };

  if (!dayReveal) {
    return (
      <div className={`border border-gray-300 dark:border-gray-700 rounded-lg p-6 ${className}`}>
        <h3 className="text-lg font-semibold mb-3">🔒 Gift Not Yet Revealed</h3>
        <p className="text-gray-600 dark:text-gray-400">
          This gift will be revealed on December {day}. Check back then!
        </p>
      </div>
    );
  }

  // Handle hint-only phase (no proof data available yet)
  if (dayReveal.hint_only) {
    return (
      <div className={`border border-yellow-500 bg-yellow-50 dark:bg-yellow-950 rounded-lg p-6 ${className}`}>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <span>💡</span>
          <span>Hint Revealed</span>
        </h3>
        <div className="space-y-2">
          <p className="text-gray-700 dark:text-gray-300 font-medium">
            {dayReveal.hint}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {dayReveal.sub_hint || 'Full details and verification will be available tomorrow'}
          </p>
        </div>
        <div className="mt-4 pt-4 border-t border-yellow-300 dark:border-yellow-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            🔒 Merkle proof verification will be enabled once the full gift details are revealed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-lg p-6 ${className} ${
      verificationResult?.valid 
        ? 'border-green-500 bg-green-50 dark:bg-green-950' 
        : verificationResult 
        ? 'border-red-500 bg-red-50 dark:bg-red-950'
        : 'border-gray-300 dark:border-gray-700'
    }`}>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span>{verificationResult?.valid ? '✅' : verificationResult ? '❌' : '🔍'}</span>
        <span>Merkle Proof Verification</span>
      </h3>

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
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
              Show Technical Details
            </summary>
            <div className="mt-3 space-y-2 font-mono bg-gray-100 dark:bg-gray-900 p-3 rounded overflow-x-auto">
              <div>
                <strong>Commitment Root:</strong>
                <div className="break-all text-gray-600 dark:text-gray-400">{commitmentRoot}</div>
              </div>
              {dayReveal.leaf && (
                <div>
                  <strong>Leaf Hash:</strong>
                  <div className="break-all text-gray-600 dark:text-gray-400">{dayReveal.leaf}</div>
                </div>
              )}
              {dayReveal.salt && (
                <div>
                  <strong>Salt:</strong>
                  <div className="break-all text-gray-600 dark:text-gray-400">{dayReveal.salt}</div>
                </div>
              )}
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
        </div>
      )}

      {!verifying && !verificationResult && (
        <button
          onClick={handleVerify}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          Verify Proof
        </button>
      )}

      <div className="mt-4 pt-4 border-t border-gray-300 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400">
        <p>
          <strong>What is this?</strong> This verifies that the gift for Day {day} was committed 
          before December 1st and hasn't been changed. The Merkle proof cryptographically proves 
          this gift was part of the original commitment.
        </p>
      </div>
    </div>
  );
}

