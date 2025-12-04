import Link from 'next/link'
import Image from 'next/image'
import Countdown from '@/components/Countdown'
import Counter from '@/components/Counter'
import AdventGrid, { type AdventDay } from '@/components/AdventGrid'
import RewardsPieChart from '@/components/RewardsPieChart'
import { getStatsToday } from '@/lib/api'
import { buildMetadata } from '@/lib/seo'
import { getCurrentDate, getDecember1st } from '@/lib/date-simulator'
import { getAllGifts } from '@/lib/gifts'

export const metadata = buildMetadata({
  title: 'The On-Chain Advent Calendar',
  description:
    'Join Santa for 24 days of crypto gifts! Daily airdrops, charity donations, and rewards from Dec 1-24. All cryptographically committed and verifiable on Solana.',
})

async function getDaysStatus(): Promise<AdventDay[]> {
  // Fetch all gifts from API to determine status
  const gifts = await getAllGifts()
  const days: AdventDay[] = []

  // Create a map of revealed days from API response
  const revealedDaysMap = new Map(
    gifts.map(gift => [gift.day, gift.hint_only ? 'hint' : 'revealed'])
  )

  for (let i = 1; i <= 24; i++) {
    const apiStatus = revealedDaysMap.get(i)
    let status: 'locked' | 'revealed' | 'today' = 'locked'
    
    if (apiStatus === 'revealed') {
      // Fully revealed (past days)
      status = 'revealed'
    } else if (apiStatus === 'hint') {
      // Hint phase (current day)
      status = 'today'
    }
    // else: locked (future days not in API response)
    
    days.push({ day: i, status })
  }

  return days
}

export default async function HomePage() {
  const stats = await getStatsToday().catch(() => null)
  const dec1 = getDecember1st()
  const days = await getDaysStatus()
  
  // Find current day from the API response (the one with hint_only)
  const gifts = await getAllGifts()
  const currentDayGift = gifts.find(g => g.hint_only)
  const currentDay = currentDayGift?.day
  const now = getCurrentDate()

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero Section */}
      <section className="text-center mb-16">
        <div className="flex items-center justify-center mb-6">
          <div className="relative w-24 h-24 mr-4 logo-flip-container">
            <div className="logo-flip-inner">
              <div className="logo-flip-front">
                <Image
                  src="/santa-logo.png"
                  alt="Santa VR Logo"
                  width={96}
                  height={96}
                  className="object-contain rounded-full"
                  priority
                />
              </div>
              <div className="logo-flip-back">
                <div className="coin-back coin-back-large">
                  <div className="coin-inner-circle">
                    <span className="coin-text coin-text-large">$SANTA</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 dark:text-white font-space-grotesk tracking-tight laser-text neon-text">
            Santa
          </h1>
        </div>
        <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto hero-subtitle">
          Community-Driven and Social On-Chain Advent Calendar
        </p>
        <p className="text-lg text-gray-500 dark:text-gray-400 mb-12 max-w-2xl mx-auto hero-description">
          A Solana advent calendar that transforms trading fees into daily gifts. Each day from December 
          1st to 24th reveals a new surprise—all cryptographically committed in advance and distributed to $SANTA token 
          holders and NGOs.
        </p>

        {/* Countdown */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-6 text-gray-800 dark:text-gray-200">
            {now < dec1
              ? 'Countdown to Launch'
              : 'Advent Calendar Active'}
          </h2>
          <Countdown targetDate={dec1} />
        </div>

        {/* Stats - Only show when LIVE (after Dec 1st) */}
        {stats && now >= dec1 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
            <Counter
              value={stats.holders}
              label="Holders"
              prefix=""
              suffix=""
            />
            <Counter
              value={stats.volume_24h}
              label="24h Volume"
              prefix="$"
            />
            <Counter
              value={stats.fees_24h}
              label="24h Fees"
              prefix="$"
            />
            <Counter
              value={stats.treasury_balance}
              label="Treasury"
              prefix="$"
            />
          </div>
        )}

        {/* CTA */}
        <div className="flex justify-center">
          <Link
            href="/whitepaper"
            className="px-8 py-3 border-2 border-festive-green-600 text-festive-green-600 dark:text-festive-green-400 hover:bg-festive-green-50 dark:hover:bg-festive-green-900/20 rounded-lg font-semibold transition-colors"
          >
            Read Whitepaper
          </Link>
        </div>
      </section>

      {/* Preview Calendar */}
      <section className="mt-16">
        <h2 className="text-3xl font-bold mb-8 text-center text-gray-900 dark:text-white">
          Advent Calendar
        </h2>
        <AdventGrid days={days} currentDay={currentDay || undefined} />
      </section>

      {/* Concept & USPs */}
      <section className="mt-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
            The Santa Advantage
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            A revolutionary approach to community rewards combining cryptographic transparency with social impact
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {/* Card 1: Cryptographic Commitment */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-gray-200 dark:border-gray-700 hover:border-festive-green-500 dark:hover:border-festive-green-500 transition-all hover:shadow-lg">
            <div className="w-12 h-12 mb-4 text-festive-green-600 dark:text-festive-green-400">
              <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor">
                <rect x="5" y="11" width="14" height="10" rx="2" strokeWidth="2" />
                <path d="M12 11V7a3 3 0 0 1 6 0v4M12 11V7a3 3 0 0 0-6 0v4" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
              Cryptographically Committed
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              All 24 gifts are committed before December 1st using a Merkle tree. We can't change them—only reveal them one by one with cryptographic proof.
            </p>
          </div>

          {/* Card 2: Community-Driven */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-gray-200 dark:border-gray-700 hover:border-festive-green-500 dark:hover:border-festive-green-500 transition-all hover:shadow-lg">
            <div className="w-12 h-12 mb-4 text-festive-green-600 dark:text-festive-green-400">
              <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="9" cy="7" r="4" strokeWidth="2" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
              Community-Driven
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              Trading fees automatically flow into daily gifts. The more the community trades, the bigger the rewards—distributed fairly to token holders.
            </p>
          </div>

          {/* Card 3: Social Impact */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-gray-200 dark:border-gray-700 hover:border-festive-green-500 dark:hover:border-festive-green-500 transition-all hover:shadow-lg">
            <div className="w-12 h-12 mb-4 text-festive-green-600 dark:text-festive-green-400">
              <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" 
                      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
              Social Impact
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              A portion of every gift goes to verified NGOs. Trade, earn rewards, and contribute to meaningful causes—all in one platform.
            </p>
          </div>

          {/* Card 4: Transparent & Verifiable */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-gray-200 dark:border-gray-700 hover:border-festive-green-500 dark:hover:border-festive-green-500 transition-all hover:shadow-lg">
            <div className="w-12 h-12 mb-4 text-festive-green-600 dark:text-festive-green-400">
              <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor">
                <circle cx="11" cy="11" r="8" strokeWidth="2" />
                <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
                <path d="M11 8v6M8 11h6" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
              Fully Transparent
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              Every gift, every transaction, every distribution is on-chain and verifiable. No hidden mechanics, no surprises—just pure transparency.
            </p>
          </div>

          {/* Card 5: Daily Surprises */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-gray-200 dark:border-gray-700 hover:border-festive-green-500 dark:hover:border-festive-green-500 transition-all hover:shadow-lg">
            <div className="w-12 h-12 mb-4 text-festive-green-600 dark:text-festive-green-400">
              <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor">
                <path d="M20 12v10H4V12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M22 7H2l2 5h16l2-5z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zm0 0h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
              24 Days of Surprises
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              From airdrops to burns, from holder rewards to charity donations—each day brings a unique gift type designed to benefit the community.
            </p>
          </div>

          {/* Card 6: Built on Solana */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border-2 border-gray-200 dark:border-gray-700 hover:border-festive-green-500 dark:hover:border-festive-green-500 transition-all hover:shadow-lg">
            <div className="w-12 h-12 mb-4 text-festive-green-600 dark:text-festive-green-400">
              <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-3 text-gray-900 dark:text-white">
              Powered by Solana
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              Fast, low-cost transactions on Solana ensure efficient distributions and minimal fees—maximizing rewards for the community.
            </p>
          </div>
        </div>

        {/* How It Works Timeline */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-8 border border-gray-200 dark:border-gray-700">
          <h3 className="text-2xl font-bold mb-8 text-center text-gray-900 dark:text-white">
            How It Works
          </h3>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-transparent border-2 border-festive-green-600 dark:border-festive-green-500 rounded-full flex items-center justify-center text-festive-green-600 dark:text-festive-green-500 text-2xl font-bold mx-auto mb-4">
                1
              </div>
              <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">Commit</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                All 24 gifts are cryptographically committed before Dec 1st
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-transparent border-2 border-festive-green-600 dark:border-festive-green-500 rounded-full flex items-center justify-center text-festive-green-600 dark:text-festive-green-500 text-2xl font-bold mx-auto mb-4">
                2
              </div>
              <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">Trade</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Community trades $SANTA, generating fees for the treasury
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-transparent border-2 border-festive-green-600 dark:border-festive-green-500 rounded-full flex items-center justify-center text-festive-green-600 dark:text-festive-green-500 text-2xl font-bold mx-auto mb-4">
                3
              </div>
              <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">Reveal</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Each day, a new gift is revealed with cryptographic proof
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-transparent border-2 border-festive-green-600 dark:border-festive-green-500 rounded-full flex items-center justify-center text-festive-green-600 dark:text-festive-green-500 text-2xl font-bold mx-auto mb-4">
                4
              </div>
              <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">Distribute</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Rewards are automatically distributed to holders and NGOs
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Rewards Distribution */}
      <section className="mt-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
            Daily Rewards Distribution
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            All transaction fees are automatically distributed daily according to a transparent, pre-committed scheme
          </p>
        </div>
        <RewardsPieChart />
      </section>
    </div>
  )
}

