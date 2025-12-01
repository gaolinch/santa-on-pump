import { buildMetadata } from '@/lib/seo'
import { getAllGifts, getGiftTypeName, getGiftDescription, getCommitmentInfo } from '@/lib/gifts'

export const metadata = buildMetadata({
  title: 'Daily Gift Hashes',
  description: 'View the cryptographic hash for each day&apos;s gift commitment',
  path: '/hashes',
})

export default async function HashesPage() {
  const gifts = await getAllGifts()
  const dailyGifts = gifts.map(gift => ({
    day: gift.day,
    type: getGiftTypeName(gift.type),
    description: getGiftDescription(gift),
    hash: gift.hash || 'Not yet generated',
    notes: gift.notes
  }))

  const commitmentInfo = getCommitmentInfo()
  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
          Daily Gift Hashes
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Each day&apos;s gift is cryptographically committed before the season begins.
          These hashes prove that all gifts were predetermined and cannot be changed.
        </p>

        <div className="mb-8 bg-festive-green-50 dark:bg-festive-green-900/20 rounded-lg p-6 border-2 border-festive-green-500 dark:border-festive-green-700">
          <h2 className="text-2xl font-bold mb-3 text-festive-green-800 dark:text-festive-green-200">
            🎄 Master Commitment Hash
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
            This is the cryptographic commitment for all 24 gifts, published on {new Date(commitmentInfo.timestamp).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
          <p className="font-mono text-sm break-all bg-white dark:bg-gray-900 p-4 rounded border border-festive-green-300 dark:border-festive-green-700 text-gray-900 dark:text-gray-100">
            {commitmentInfo.hash}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
            Season: {commitmentInfo.season}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dailyGifts.map((gift) => (
            <div
              key={gift.day}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:border-festive-green-500 dark:hover:border-festive-green-500 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-2xl font-bold text-festive-green-600 dark:text-festive-green-400">
                  Day {gift.day}
                </h2>
                <span className="text-xs font-semibold px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                  Dec {gift.day}
                </span>
              </div>
              
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {gift.type}
              </p>

              <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
                {gift.description}
              </p>

              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  Commitment Hash:
                </p>
                <p className="font-mono text-xs break-all bg-gray-100 dark:bg-gray-900 p-2 rounded text-gray-800 dark:text-gray-200">
                  {gift.hash}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 bg-festive-green-50 dark:bg-festive-green-900/20 rounded-lg p-6 border border-festive-green-200 dark:border-festive-green-800">
          <h3 className="text-lg font-semibold mb-2 text-festive-green-800 dark:text-festive-green-200">
            🔒 How Commitment Works
          </h3>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Before December 1st, we publish the hash of each day&apos;s gift configuration.
            These hashes are cryptographic commitments that prove:
          </p>
          <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
            <li>All 24 gifts were decided before the season started</li>
            <li>The gifts cannot be changed after commitment</li>
            <li>The distribution is fair and transparent</li>
            <li>Anyone can verify the commitments match the revealed gifts</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

