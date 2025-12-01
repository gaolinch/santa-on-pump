// Utility functions for loading and processing gifts data
import commitmentData from './commitment-hash.json'

export type GiftType = 
  | 'proportional_holders'
  | 'deterministic_random'
  | 'top_buyers_airdrop'
  | 'full_donation_to_ngo'
  | 'last_second_hour'

export type Gift = {
  day: number
  type: GiftType
  hint?: string
  sub_hint?: string
  params?: Record<string, any>
  distribution_source?: 'treasury_daily_fees' | 'treasury_reserve'
  notes?: string
  hash?: string
  hint_only?: boolean
}

export type GiftsData = {
  gifts: Gift[]
  salt: string
}

export type CommitmentHash = {
  hash: string // This is now the Merkle root
  timestamp: string
  season: string
}

export type DayReveal = {
  day: number
  gift: Gift
  salt: string
  leaf: string
  proof: string[]
  root: string
}

export type NGO = {
  name: string
  website: string
  twitter: string | null
  eth_address: string | null
  sol_address: string | null
  ens_name: string | null
  logo_image: string | null
  notes: string
}

// Type-safe static data
const commitment = commitmentData as CommitmentHash

// Cache for gifts data fetched from API
let giftsCache: Gift[] = []
let fetchPromise: Promise<Gift[]> | null = null

// Fetch all gifts from the backend API
export async function fetchAllGifts(): Promise<Gift[]> {
  // Return cached data if available
  if (giftsCache.length > 0) {
    return giftsCache
  }

  // If a fetch is already in progress, return that promise
  if (fetchPromise) {
    return fetchPromise
  }

  // Start a new fetch
  const newFetchPromise = (async (): Promise<Gift[]> => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
      const url = `${apiUrl}/proofs/all/gifts`
      
      console.log('Fetching gifts from:', url)
      
      const response = await fetch(url, {
        next: { revalidate: 60 } // Cache for 60 seconds in Next.js
      })
      
      if (!response.ok) {
        console.error('Failed to fetch gifts from API:', response.status, response.statusText)
        console.error('API URL:', url)
        console.error('Make sure the backend is running on', apiUrl)
        return []
      }
      
      const data = await response.json()
      console.log('Fetched gifts:', data.gifts?.length || 0, 'gifts')
      giftsCache = data.gifts || []
      return giftsCache
    } catch (error) {
      console.error('Error fetching gifts:', error)
      console.error('Make sure NEXT_PUBLIC_API_URL is set correctly in .env')
      return []
    } finally {
      fetchPromise = null
    }
  })()

  fetchPromise = newFetchPromise
  return newFetchPromise
}

// Get all gifts (with commitment hash filled in)
export async function getAllGifts(): Promise<Gift[]> {
  const gifts = await fetchAllGifts()
  return gifts.map(gift => ({
    ...gift,
    hash: gift.hash || commitment.hash
  }))
}

// Get a specific gift by day (with commitment hash filled in)
export async function getGiftByDay(day: number): Promise<Gift | undefined> {
  const gifts = await fetchAllGifts()
  const gift = gifts.find(g => g.day === day)
  if (!gift) return undefined
  return {
    ...gift,
    hash: gift.hash || commitment.hash
  }
}

// Get the commitment hash (Merkle root) for the entire gift list
export function getCommitmentHash(): string {
  return commitment.hash
}

// Get full commitment information
export function getCommitmentInfo(): CommitmentHash {
  return commitment
}

// Load a day's reveal data from the API
export async function loadDayReveal(day: number): Promise<DayReveal | null> {
  try {
    const response = await fetch(`/api/reveals/day-${String(day).padStart(2, '0')}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`Failed to load reveal for day ${day}:`, error);
    return null;
  }
}

// Convert gift type to display name
export function getGiftTypeName(type: GiftType): string {
  const typeMap: Record<GiftType, string> = {
    proportional_holders: 'Proportional Holders',
    deterministic_random: 'Random Winners',
    top_buyers_airdrop: 'Top Buyers Airdrop',
    full_donation_to_ngo: 'NGO Donation',
    last_second_hour: 'Last Second Bonus'
  }
  return typeMap[type] || type
}

// Get a short description of the gift
export function getGiftDescription(gift: Gift): string {
  // If hint only, don't show description
  if (gift.hint_only || !gift.params) {
    return ''
  }

  switch (gift.type) {
    case 'proportional_holders':
      return `${gift.params.allocation_percent}% distributed proportionally to holders with minimum ${gift.params.min_balance} tokens`
    
    case 'deterministic_random':
      return `${gift.params.winner_count} random winners selected, ${gift.params.allocation_percent}% of daily fees (min balance: ${gift.params.min_balance})`
    
    case 'top_buyers_airdrop':
      return `Top ${gift.params.top_n} buyers receive ${gift.params.allocation_percent}% of daily fees`
    
    case 'full_donation_to_ngo':
      return `${gift.params.percent}% donation to ${gift.params.ngo_name}`
    
    case 'last_second_hour':
      return 'Bonus for last-second activity'
    
    default:
      return gift.notes || 'Special gift'
  }
}

// Get NGO info if the gift is an NGO donation
export function getNGOInfo(gift: Gift): NGO | null {
  if (gift.type === 'full_donation_to_ngo' && gift.params?.ngo_name) {
    const ngoName = gift.params.ngo_name as string
    
    // Return basic info from gift params
    return {
      name: ngoName,
      website: gift.params.ngo_website as string || '',
      sol_address: gift.params.ngo_wallet as string || '',
      twitter: null,
      eth_address: null,
      ens_name: null,
      logo_image: null,
      notes: gift.notes || ''
    }
  }
  return null
}

// Get all NGOs (deprecated - NGO data now comes from backend/database)
export function getAllNGOs(): NGO[] {
  return []
}

// Get a specific NGO by name (deprecated - NGO data now comes from backend/database)
export function getNGOByName(name: string): NGO | undefined {
  return undefined
}

