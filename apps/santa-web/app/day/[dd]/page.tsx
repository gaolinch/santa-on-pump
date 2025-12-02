import { notFound } from 'next/navigation'
import { getProof } from '@/lib/api'
import { buildDayMetadata } from '@/lib/seo'
import { formatDate } from '@/lib/format'
import { getGiftByDay, getGiftTypeName, getGiftDescription, getNGOInfo } from '@/lib/gifts'

type PageProps = {
  params: Promise<{ dd: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { dd } = await params
  const day = parseInt(dd, 10)
  if (isNaN(day) || day < 1 || day > 24) {
    return {
      title: 'Day Not Found',
    }
  }

  // Ensure zero-padding for API calls (01, 02, etc.)
  const paddedDay = day.toString().padStart(2, '0')
  const proof = await getProof(paddedDay)
  return buildDayMetadata(day, proof)
}

export default async function DayPage({ params }: PageProps) {
  const { dd } = await params
  const day = parseInt(dd, 10)

  if (isNaN(day) || day < 1 || day > 24) {
    notFound()
  }

  // Ensure zero-padding for API calls (01, 02, etc.)
  const paddedDay = day.toString().padStart(2, '0')
  const proof = await getProof(paddedDay)
  const giftInfo = await getGiftByDay(day)
  
  // Fetch reveal data from API - this determines what we can show
  let revealData = null
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const response = await fetch(`${apiUrl}/reveals/day-${paddedDay}`, {
      cache: 'no-store'
    })
    if (response.ok) {
      revealData = await response.json()
      console.log(`🎅 [Day ${day}] Loaded reveal data:`, revealData.hint_only ? 'hint only' : 'full reveal')
    } else if (response.status === 403) {
      console.log(`🎅 [Day ${day}] Not yet revealed (403)`)
    } else {
      console.log(`🎅 [Day ${day}] No reveal data available: ${response.status}`)
    }
  } catch (err) {
    console.log(`🎅 [Day ${day}] Error fetching reveal data:`, err)
  }

  // Fetch execution data (winners, logs, transfers)
  let executionData = null
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    const response = await fetch(`${apiUrl}/executions/day-${paddedDay}`, {
      cache: 'no-store'
    })
    if (response.ok) {
      executionData = await response.json()
      console.log(`🎅 [Day ${day}] Loaded execution data:`, executionData.winners?.length || 0, 'winners')
    } else if (response.status === 404) {
      console.log(`🎅 [Day ${day}] No execution data available (404)`)
    } else {
      console.log(`🎅 [Day ${day}] Error fetching execution data: ${response.status}`)
    }
  } catch (err) {
    console.log(`🎅 [Day ${day}] Error fetching execution data:`, err)
  }

  // If no reveal data from API, show locked state
  if (!revealData) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-6xl mb-6">🔒</div>
            <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
              Day {day} — Coming Soon
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">
              This gift will be revealed on December {day}, 2025.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Leaf Hash
            </h2>
            <p className="font-mono text-sm break-all bg-gray-100 dark:bg-gray-900 p-3 rounded text-gray-800 dark:text-gray-200">
              {'X'.repeat(64)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
              This hash will be revealed on December {day}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Hint phase - show only the hint (based on API response)
  if (revealData?.hint_only) {
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-6xl mb-6">💡</div>
            <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
              Day {day} — Hint Revealed
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">
              December {day}, 2025
            </p>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-500 dark:border-yellow-700 rounded-lg p-8">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-yellow-800 dark:text-yellow-200 mb-3">
                {revealData.hint}
              </h2>
              <p className="text-lg text-yellow-700 dark:text-yellow-300">
                {revealData.sub_hint || 'Full details will be revealed tomorrow'}
              </p>
            </div>

            <div className="mt-6 pt-6 border-t border-yellow-300 dark:border-yellow-700">
              <p className="text-sm text-center text-yellow-700 dark:text-yellow-300">
                🔒 Full gift details, execution information, and verification will be available tomorrow at midnight.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Time to reveal but no proof data available - check if we have reveal data
  if (!proof) {
    if (revealData && giftInfo) {
      // We have reveal data, show simplified page (but include execution data if available)
      return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
                Day {day} — {getGiftTypeName(giftInfo.type)}
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400">
                Gift Type: <span className="font-semibold">{getGiftTypeName(giftInfo.type)}</span>
              </p>
            </div>

            <div className="grid gap-6 mb-8">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-semibold mb-4">Gift Details</h2>
                <div className="space-y-2">
                  <p>
                    <span className="font-semibold">Type:</span> {getGiftTypeName(giftInfo.type)}
                  </p>
                  <p>
                    <span className="font-semibold">Description:</span> {getGiftDescription(giftInfo)}
                  </p>
                  {giftInfo.notes && (
                    <p>
                      <span className="font-semibold">Notes:</span> {giftInfo.notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Execution Details - Show even without proof */}
              {executionData?.execution && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="text-2xl font-semibold mb-4">Execution Details</h2>
                  <div className="space-y-2">
                    <p>
                      <span className="font-semibold">Execution Time:</span>{' '}
                      {formatDate(new Date(executionData.execution.execution_time))}
                    </p>
                    <p>
                      <span className="font-semibold">Status:</span>{' '}
                      <span className={`inline-block px-2 py-1 rounded text-sm ${
                        executionData.execution.status === 'executed' || executionData.execution.status === 'confirmed'
                          ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          : executionData.execution.status === 'failed'
                          ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                      }`}>
                        {executionData.execution.status}
                      </span>
                    </p>
                    <p>
                      <span className="font-semibold">Total Distributed:</span>{' '}
                      {executionData.execution.total_distributed_sol} SOL
                    </p>
                    {executionData.summary && (
                      <>
                        <p>
                          <span className="font-semibold">Winners:</span>{' '}
                          {executionData.summary.winner_count || executionData.winners?.length || 0}
                        </p>
                        {executionData.summary.duration_ms && (
                          <p>
                            <span className="font-semibold">Execution Duration:</span>{' '}
                            {(executionData.summary.duration_ms / 1000).toFixed(2)}s
                          </p>
                        )}
                      </>
                    )}
                    {(executionData?.execution?.tx_hashes || []).length > 0 && (
                      <div>
                        <span className="font-semibold">Transactions:</span>
                        <ul className="list-disc list-inside mt-2 space-y-1">
                          {(executionData.execution.tx_hashes || []).map((hash: string, idx: number) => (
                            <li key={idx}>
                              <a
                                href={`https://solscan.io/tx/${hash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-festive-green-600 dark:text-festive-green-400 hover:underline font-mono text-sm"
                              >
                                {hash.slice(0, 16)}...{hash.slice(-8)}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Winners List */}
              {executionData?.winners && executionData.winners.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="text-2xl font-semibold mb-4">
                    Winners ({executionData.winners.length})
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3">Rank</th>
                          <th className="text-left py-2 px-3">Wallet Address</th>
                          <th className="text-right py-2 px-3">Reward (SOL)</th>
                          {executionData.winners[0]?.balance && (
                            <th className="text-right py-2 px-3">Balance</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {executionData.winners
                          .sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
                          .map((winner: any, idx: number) => (
                            <tr key={winner.wallet} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="py-2 px-3">{idx + 1}</td>
                              <td className="py-2 px-3 font-mono text-xs">
                                <a
                                  href={`https://solscan.io/account/${winner.wallet}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-festive-green-600 dark:text-festive-green-400 hover:underline"
                                >
                                  {winner.wallet.slice(0, 8)}...{winner.wallet.slice(-8)}
                                </a>
                              </td>
                              <td className="text-right py-2 px-3 font-semibold">
                                {Number(winner.amount_sol).toFixed(9)}
                              </td>
                              {winner.balance && (
                                <td className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">
                                  {Number(winner.balance) / 1e9} tokens
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Execution Logs */}
              {executionData?.logs && executionData.logs.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="text-2xl font-semibold mb-4">
                    Execution Logs ({executionData.logs.length} steps)
                  </h2>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {executionData.logs.map((log: any, idx: number) => (
                      <div
                        key={idx}
                        className={`p-3 rounded border-l-4 ${
                          log.log_level === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
                            : log.log_level === 'warn'
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'
                            : 'bg-gray-50 dark:bg-gray-900/50 border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-xs uppercase">
                                {log.step_name}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                log.step_status === 'completed'
                                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                  : log.step_status === 'failed'
                                  ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                  : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                              }`}>
                                {log.step_status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {log.message}
                            </p>
                            {log.data && Object.keys(log.data).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                                  View details
                                </summary>
                                <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(log.data, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          {log.duration_ms && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-4">
                              {log.duration_ms}ms
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h2 className="text-2xl font-semibold mb-4">Leaf Hash</h2>
                <p className="font-mono text-sm break-all bg-gray-100 dark:bg-gray-900 p-3 rounded">
                  {revealData.leaf}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                  This is the leaf hash for Day {day} in the Merkle tree.
                </p>
              </div>

            </div>
          </div>
        </div>
      )
    }
    
    // No proof and no reveal data - but check if we have execution data
    if (executionData) {
      // Show execution data even without proof/reveal
      return (
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-4xl mx-auto">
            <div className="mb-8">
              <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
                Day {day} — {giftInfo ? getGiftTypeName(giftInfo.type) : 'Execution Results'}
              </h1>
            </div>

            <div className="grid gap-6 mb-8">
              {/* Execution Details */}
              {executionData?.execution && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="text-2xl font-semibold mb-4">Execution Details</h2>
                  <div className="space-y-2">
                    <p>
                      <span className="font-semibold">Execution Time:</span>{' '}
                      {formatDate(new Date(executionData.execution.execution_time))}
                    </p>
                    <p>
                      <span className="font-semibold">Status:</span>{' '}
                      <span className={`inline-block px-2 py-1 rounded text-sm ${
                        executionData.execution.status === 'executed' || executionData.execution.status === 'confirmed'
                          ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          : executionData.execution.status === 'failed'
                          ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                          : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                      }`}>
                        {executionData.execution.status}
                      </span>
                    </p>
                    <p>
                      <span className="font-semibold">Total Distributed:</span>{' '}
                      {executionData.execution.total_distributed_sol} SOL
                    </p>
                    {executionData.summary && (
                      <>
                        <p>
                          <span className="font-semibold">Winners:</span>{' '}
                          {executionData.summary.winner_count || executionData.winners?.length || 0}
                        </p>
                        {executionData.summary.duration_ms && (
                          <p>
                            <span className="font-semibold">Execution Duration:</span>{' '}
                            {(executionData.summary.duration_ms / 1000).toFixed(2)}s
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Winners List */}
              {executionData?.winners && executionData.winners.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="text-2xl font-semibold mb-4">
                    Winners ({executionData.winners.length})
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-3">Rank</th>
                          <th className="text-left py-2 px-3">Wallet Address</th>
                          <th className="text-right py-2 px-3">Reward (SOL)</th>
                          {executionData.winners[0]?.balance && (
                            <th className="text-right py-2 px-3">Balance</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {executionData.winners
                          .sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
                          .map((winner: any, idx: number) => (
                            <tr key={winner.wallet} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="py-2 px-3">{idx + 1}</td>
                              <td className="py-2 px-3 font-mono text-xs">
                                <a
                                  href={`https://solscan.io/account/${winner.wallet}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-festive-green-600 dark:text-festive-green-400 hover:underline"
                                >
                                  {winner.wallet.slice(0, 8)}...{winner.wallet.slice(-8)}
                                </a>
                              </td>
                              <td className="text-right py-2 px-3 font-semibold">
                                {Number(winner.amount_sol).toFixed(9)}
                              </td>
                              {winner.balance && (
                                <td className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">
                                  {Number(winner.balance) / 1e9} tokens
                                </td>
                              )}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Execution Logs */}
              {executionData?.logs && executionData.logs.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                  <h2 className="text-2xl font-semibold mb-4">
                    Execution Logs ({executionData.logs.length} steps)
                  </h2>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {executionData.logs.map((log: any, idx: number) => (
                      <div
                        key={idx}
                        className={`p-3 rounded border-l-4 ${
                          log.log_level === 'error'
                            ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
                            : log.log_level === 'warn'
                            ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'
                            : 'bg-gray-50 dark:bg-gray-900/50 border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-xs uppercase">
                                {log.step_name}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                log.step_status === 'completed'
                                  ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                  : log.step_status === 'failed'
                                  ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                                  : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                              }`}>
                                {log.step_status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              {log.message}
                            </p>
                            {log.data && Object.keys(log.data).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                                  View details
                                </summary>
                                <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(log.data, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          {log.duration_ms && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-4">
                              {log.duration_ms}ms
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    // No proof, no reveal data, and no execution data
    const isDev = process.env.NODE_ENV === 'development'
    const isSimulated = !!process.env.NEXT_PUBLIC_SIMULATE_DATE
    const currentDate = new Date(process.env.NEXT_PUBLIC_SIMULATE_DATE || Date.now())
    const currentDay = currentDate.getDate()
    
    return (
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="text-6xl mb-6">🔒</div>
            <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-white">
              Day {day} — Coming Soon
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">
              This gift will be revealed on December {day}, 2025.
            </p>
            {isDev && isSimulated && (
              <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-500 dark:border-yellow-700 rounded-lg p-4">
                <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
                  🛠️ Development Mode: Date Simulated
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                  Current simulated date: <strong>{currentDate.toLocaleDateString()}</strong> (Day {currentDay})
                </p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  No proof data available for Day {day}. To test this day, create mock data at:
                  <code className="block mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/40 rounded text-xs font-mono">
                    /public/mock/day/{paddedDay}.json
                  </code>
                </p>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
              Leaf Hash
            </h2>
            <p className="font-mono text-sm break-all bg-gray-100 dark:bg-gray-900 p-3 rounded text-gray-800 dark:text-gray-200">
              {'X'.repeat(64)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
              This hash will be revealed on December {day}.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const ngoInfo = giftInfo ? getNGOInfo(giftInfo) : null

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
            Day {day} — {proof.gift.name}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Gift Type: <span className="font-semibold">{giftInfo ? getGiftTypeName(giftInfo.type) : proof.gift.type}</span>
          </p>
        </div>

        <div className="grid gap-6 mb-8">
          {ngoInfo && (
            <div className="bg-festive-green-50 dark:bg-festive-green-900/20 rounded-lg p-6 border-2 border-festive-green-500 dark:border-festive-green-700">
              <div className="flex items-start gap-4 mb-4">
                {ngoInfo.logo_image ? (
                  <img 
                    src={ngoInfo.logo_image} 
                    alt={`${ngoInfo.name} logo`}
                    className="w-16 h-16 rounded-lg object-contain bg-white p-2"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-festive-green-600 dark:bg-festive-green-700 flex items-center justify-center text-white text-2xl font-bold">
                    {ngoInfo.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold mb-2 text-festive-green-800 dark:text-festive-green-200">
                    🎁 {ngoInfo.name}
                  </h2>
                  {ngoInfo.notes && (
                    <p className="text-sm text-festive-green-700 dark:text-festive-green-300 mb-3">
                      {ngoInfo.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-festive-green-700 dark:text-festive-green-300">🌐 Website:</span>
                  <a 
                    href={ngoInfo.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-festive-green-600 dark:text-festive-green-400 hover:underline"
                  >
                    {ngoInfo.website}
                  </a>
                </div>

                {ngoInfo.twitter && (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-festive-green-700 dark:text-festive-green-300">𝕏 Twitter:</span>
                    <a 
                      href={ngoInfo.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-festive-green-600 dark:text-festive-green-400 hover:underline"
                    >
                      {ngoInfo.twitter.replace('https://x.com/', '@')}
                    </a>
                  </div>
                )}

                {ngoInfo.sol_address && (
                  <div>
                    <span className="font-semibold text-festive-green-700 dark:text-festive-green-300">◎ Solana Wallet:</span>
                    <p className="font-mono text-xs break-all bg-white dark:bg-gray-900 p-2 rounded mt-1 text-festive-green-900 dark:text-festive-green-100">
                      {ngoInfo.sol_address}
                    </p>
                  </div>
                )}

                {ngoInfo.eth_address && (
                  <div>
                    <span className="font-semibold text-festive-green-700 dark:text-festive-green-300">Ξ Ethereum Wallet:</span>
                    <p className="font-mono text-xs break-all bg-white dark:bg-gray-900 p-2 rounded mt-1 text-festive-green-900 dark:text-festive-green-100">
                      {ngoInfo.eth_address}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold mb-4">Gift Details</h2>
            <div className="space-y-2">
              <p>
                <span className="font-semibold">Name:</span> {proof.gift.name}
              </p>
              <p>
                <span className="font-semibold">Type:</span> {giftInfo ? getGiftTypeName(giftInfo.type) : proof.gift.type}
              </p>
              {giftInfo && (
                <p>
                  <span className="font-semibold">Description:</span> {getGiftDescription(giftInfo)}
                </p>
              )}
              <p>
                <span className="font-semibold">Distribution Source:</span>{' '}
                {proof.gift.distribution_source}
              </p>
              {proof.gift.notes && !ngoInfo && (
                <p>
                  <span className="font-semibold">Notes:</span>{' '}
                  {proof.gift.notes}
                </p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold mb-4">Execution Details</h2>
            <div className="space-y-2">
              {executionData?.execution && (
                <>
                  <p>
                    <span className="font-semibold">Execution Time:</span>{' '}
                    {formatDate(new Date(executionData.execution.execution_time))}
                  </p>
                  <p>
                    <span className="font-semibold">Status:</span>{' '}
                    <span className={`inline-block px-2 py-1 rounded text-sm ${
                      executionData.execution.status === 'executed' || executionData.execution.status === 'confirmed'
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                        : executionData.execution.status === 'failed'
                        ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                        : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                    }`}>
                      {executionData.execution.status}
                    </span>
                  </p>
                  <p>
                    <span className="font-semibold">Total Distributed:</span>{' '}
                    {executionData.execution.total_distributed_sol} SOL
                  </p>
                  {executionData.summary && (
                    <>
                      <p>
                        <span className="font-semibold">Winners:</span>{' '}
                        {executionData.summary.winner_count || executionData.winners?.length || 0}
                      </p>
                      {executionData.summary.duration_ms && (
                        <p>
                          <span className="font-semibold">Execution Duration:</span>{' '}
                          {(executionData.summary.duration_ms / 1000).toFixed(2)}s
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              {proof.executions && (
                <>
                  <p>
                    <span className="font-semibold">Published:</span>{' '}
                    {formatDate(proof.executions.published_at_utc)}
                  </p>
                  <p>
                    <span className="font-semibold">Closed At:</span>{' '}
                    {formatDate(proof.executions.close_at_utc)}
                  </p>
                </>
              )}
              {(executionData?.execution?.tx_hashes || proof.executions?.tx_hashes || []).length > 0 && (
                <div>
                  <span className="font-semibold">Transactions:</span>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    {(executionData?.execution?.tx_hashes || proof.executions?.tx_hashes || []).map((hash: string, idx: number) => (
                      <li key={idx}>
                        <a
                          href={`https://solscan.io/tx/${hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-festive-green-600 dark:text-festive-green-400 hover:underline font-mono text-sm"
                        >
                          {hash.slice(0, 16)}...{hash.slice(-8)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Winners List */}
          {executionData?.winners && executionData.winners.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-semibold mb-4">
                Winners ({executionData.winners.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3">Rank</th>
                      <th className="text-left py-2 px-3">Wallet Address</th>
                      <th className="text-right py-2 px-3">Reward (SOL)</th>
                      {executionData.winners[0]?.balance && (
                        <th className="text-right py-2 px-3">Balance</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {executionData.winners
                      .sort((a: any, b: any) => Number(b.amount) - Number(a.amount))
                      .map((winner: any, idx: number) => (
                        <tr key={winner.wallet} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="py-2 px-3">{idx + 1}</td>
                          <td className="py-2 px-3 font-mono text-xs">
                            <a
                              href={`https://solscan.io/account/${winner.wallet}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-festive-green-600 dark:text-festive-green-400 hover:underline"
                            >
                              {winner.wallet.slice(0, 8)}...{winner.wallet.slice(-8)}
                            </a>
                          </td>
                          <td className="text-right py-2 px-3 font-semibold">
                            {Number(winner.amount_sol).toFixed(9)}
                          </td>
                          {winner.balance && (
                            <td className="text-right py-2 px-3 text-gray-600 dark:text-gray-400">
                              {Number(winner.balance) / 1e9} tokens
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Execution Logs */}
          {executionData?.logs && executionData.logs.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h2 className="text-2xl font-semibold mb-4">
                Execution Logs ({executionData.logs.length} steps)
              </h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {executionData.logs.map((log: any, idx: number) => (
                  <div
                    key={idx}
                    className={`p-3 rounded border-l-4 ${
                      log.log_level === 'error'
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-500'
                        : log.log_level === 'warn'
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500'
                        : 'bg-gray-50 dark:bg-gray-900/50 border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-xs uppercase">
                            {log.step_name}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            log.step_status === 'completed'
                              ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                              : log.step_status === 'failed'
                              ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                              : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                          }`}>
                            {log.step_status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          {log.message}
                        </p>
                        {log.data && Object.keys(log.data).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                              View details
                            </summary>
                            <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                      {log.duration_ms && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-4">
                          {log.duration_ms}ms
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
            <h2 className="text-2xl font-semibold mb-4">Leaf Hash</h2>
            <p className="font-mono text-sm break-all bg-gray-100 dark:bg-gray-900 p-3 rounded">
              {proof.leaf}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
              This is the leaf hash for Day {day} in the Merkle tree. It was computed from the gift data and salt before December 1st.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}

