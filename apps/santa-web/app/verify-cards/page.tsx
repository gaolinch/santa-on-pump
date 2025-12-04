import { buildMetadata } from '@/lib/seo'
import { getCommitmentInfo } from '@/lib/gifts'
import VerifyCards from '@/components/VerifyCards'

export const metadata = buildMetadata({
  title: 'Verify Gifts',
  description: 'Verify the cryptographic proofs for each day&apos;s gift commitment',
  path: '/verify-cards',
})

export default function VerifyCardsPage() {
  const commitment = getCommitmentInfo()

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
          Verify Gift Commitments
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          All 24 gifts were committed before December 1st using a Merkle tree. Each day, we reveal one gift along with its cryptographic proof. You can verify that any revealed gift was part of the original commitment.
        </p>

        <div className="mb-8 bg-festive-green-50 dark:bg-festive-green-900/20 rounded-lg p-6 border-2 border-festive-green-500 dark:border-festive-green-700">
          <h2 className="text-3xl font-bold mb-3 text-gray-900 dark:text-white">
            🎄 Merkle Root Commitment
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            Published on {new Date(commitment.timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} • Season: {commitment.season}
          </p>
          <p className="font-mono text-sm break-all bg-white dark:bg-gray-900 p-4 rounded border border-festive-green-300 dark:border-festive-green-700 text-gray-900 dark:text-gray-100">
            {commitment.hash}
          </p>
        </div>

        <VerifyCards />

        <div className="grid md:grid-cols-2 gap-6 mt-12">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
              🌲 What is a Merkle Tree?
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              A Merkle tree is a cryptographic data structure that allows efficient verification of data integrity. 
              Each leaf represents a hash of a gift, and parent nodes are hashes of their children, up to a single root hash.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
              🔒 Why Use This Approach?
            </h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              This ensures transparency and fairness. By publishing the Merkle root before December 1st, 
              we cryptographically commit to all 24 gifts. We cannot change them later, but we can reveal 
              them one at a time while proving each was part of the original commitment.
            </p>
          </div>
        </div>

        <div className="mt-6 bg-festive-green-50 dark:bg-festive-green-900/20 rounded-lg p-6 border border-festive-green-200 dark:border-festive-green-800">
          <h3 className="text-lg font-semibold mb-3 text-festive-green-800 dark:text-festive-green-200">
            ✅ Verification Process
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            For each revealed gift, we provide:
          </p>
          <ul className="list-disc list-inside text-sm space-y-2 text-gray-700 dark:text-gray-300 ml-4">
            <li>The gift data (type, parameters, etc.)</li>
            <li>A random salt (prevents preimage attacks)</li>
            <li>A Merkle proof (sibling hashes from leaf to root)</li>
          </ul>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-3">
            The verifier recomputes the leaf hash from the gift + salt, then uses the proof 
            to compute up the tree. If the result matches the published root, the gift is verified.
          </p>
        </div>
      </div>
    </div>
  )
}

