import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import { join } from 'path'

export const runtime = 'edge'

export async function GET() {
  // Fetch the Santa logo
  const logoUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/santa-logo.png`
  
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f2027',
          backgroundImage: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="Santa Logo"
            width={200}
            height={200}
            style={{
              marginBottom: 30,
              borderRadius: '50%',
            }}
          />
          <div
            style={{
              fontSize: 80,
              fontWeight: 'bold',
              background: 'linear-gradient(90deg, #16a34a 0%, #22c55e 100%)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              marginBottom: 20,
            }}
          >
            Santa
          </div>
          <div
            style={{
              fontSize: 48,
              color: '#ffffff',
              textAlign: 'center',
              maxWidth: '80%',
            }}
          >
            The On-Chain Advent Calendar
          </div>
          <div
            style={{
              fontSize: 32,
              color: '#94a3b8',
              textAlign: 'center',
              maxWidth: '80%',
              marginTop: 30,
            }}
          >
            24 Days of Crypto Gifts on Solana
          </div>
          <div
            style={{
              fontSize: 28,
              color: '#22c55e',
              textAlign: 'center',
              marginTop: 40,
              padding: '15px 40px',
              border: '3px solid #22c55e',
              borderRadius: '12px',
            }}
          >
            December 1-24, 2025
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}

