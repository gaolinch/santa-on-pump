// API fetchers for stats, proofs, and commitment data

export type DayProof = {
  day: number;
  gift: {
    name: string;
    type:
      | 'full_donation_to_ngo'
      | 'top_buyers_airdrop'
      | 'last_second_hour'
      | 'deterministic_random'
      | 'proportional_holders';
    params: Record<string, unknown>;
    distribution_source: 'treasury_daily_fees' | 'treasury_reserve';
    notes?: string;
  };
  salt: string; // hex
  leaf: string; // sha256 hex
  proof: string[]; // hex sibling nodes
  root: string; // merkle root hex
  executions: {
    close_at_utc: string; // ISO
    tx_hashes: string[];
    published_at_utc: string;
  };
}

export type StatsToday = {
  date_utc: string;
  holders: number;
  volume_24h: number;
  fees_24h: number;
  treasury_balance: number;
}

export type Commitment = {
  root: string;
  hash: string;
  published_at_utc: string;
  metadata?: {
    season: number;
    year: number;
  };
}

// Helper to construct absolute URLs for server-side fetching
function getAbsoluteUrl(path: string): string {
  // If it's already an absolute URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  
  // For server-side rendering, construct absolute URL
  if (typeof window === 'undefined') {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    return `${baseUrl}${path}`
  }
  
  // For client-side, relative paths work fine
  return path
}


export async function getStatsToday(): Promise<StatsToday> {
  const apiUrl = process.env.NEXT_PUBLIC_STATS_API
  if (!apiUrl) {
    throw new Error('NEXT_PUBLIC_STATS_API not configured')
  }
  const url = getAbsoluteUrl(`${apiUrl}.json`)
  
  try {
    const res = await fetch(url, { 
      next: { revalidate: 60 } // Revalidate every 60 seconds
    })
    if (!res.ok) throw new Error('Stats not available')
    return res.json()
  } catch (error) {
    console.error('Failed to fetch stats:', error)
    throw error
  }
}

export async function getProof(day: string): Promise<DayProof | null> {
  const apiUrl = process.env.NEXT_PUBLIC_PROOFS_API
  if (!apiUrl) {
    console.warn('NEXT_PUBLIC_PROOFS_API not configured')
    return null
  }
  const relativeUrl = `${apiUrl}/${day}.json`
  const url = getAbsoluteUrl(relativeUrl)
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🎅 [getProof] Fetching proof for day ${day} from: ${url}`)
  }
  
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
    })
    if (!res.ok) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🎅 [getProof] Failed to fetch from ${url}: ${res.status} ${res.statusText}`)
      }
      return null
    }
    const data = await res.json()
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎅 [getProof] Successfully loaded proof for day ${day}`)
    }
    return data
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`🎅 [getProof] Failed to load proof for day ${day}:`, error)
    }
    return null
  }
}

export async function getCommitmentRoot(): Promise<Commitment | null> {
  const relativeUrl = process.env.NEXT_PUBLIC_COMMITMENT_URL
  if (!relativeUrl) {
    console.warn('NEXT_PUBLIC_COMMITMENT_URL not configured')
    return null
  }
  const url = getAbsoluteUrl(relativeUrl)
  
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) return null
    return res.json()
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`🎅 [getCommitmentRoot] Failed to fetch commitment:`, error)
    }
    return null
  }
}

