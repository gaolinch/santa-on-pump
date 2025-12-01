import { Metadata } from 'next'
import type { DayProof } from './api'

export function buildMetadata({
  title,
  description,
  path = '',
  image,
}: {
  title: string
  description: string
  path?: string
  image?: string
}): Metadata {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://santa-pump.fun'
  const fullUrl = `${siteUrl}${path}`
  const ogImage = image || `${siteUrl}/santa-og.png`

  return {
    title: `${title} | Santa`,
    description,
    openGraph: {
      title: `${title} | Santa`,
      description,
      url: fullUrl,
      siteName: 'Santa — On-Chain Advent Calendar',
      type: 'website',
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: 'Santa — On-Chain Advent Calendar',
        },
      ],
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | Santa`,
      description,
      images: [ogImage],
      creator: '@santa_pump',
      site: '@santa_pump',
    },
    metadataBase: new URL(siteUrl),
  }
}

export function buildDayMetadata(day: number, proof: DayProof | null): Metadata {
  if (!proof) {
    return buildMetadata({
      title: `Day ${day}`,
      description: `Gift ${day} coming soon`,
      path: `/day/${String(day).padStart(2, '0')}`,
    })
  }

  return buildMetadata({
    title: `Day ${day} — ${proof.gift.name}`,
    description: `Gift type: ${proof.gift.type}. ${proof.gift.notes || ''}`,
    path: `/day/${String(day).padStart(2, '0')}`,
  })
}

export function buildJSONLD(data: {
  type: 'Organization' | 'Event'
  [key: string]: unknown
}): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    ...data,
  })
}

