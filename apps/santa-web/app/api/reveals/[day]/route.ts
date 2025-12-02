import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ day: string }> }
) {
  try {
    const { day } = await params
    
    // Validate day format (should be day-01, day-02, etc.)
    if (!day || !day.match(/^day-\d{2}$/)) {
      return NextResponse.json(
        { error: 'Invalid day format. Use day-01, day-02, etc.' },
        { status: 400 }
      )
    }

    // Get backend API URL
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
    
    // Proxy request to backend
    const backendUrl = `${apiUrl}/reveals/${day}`
    const response = await fetch(backendUrl, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Forward the response
    const data = await response.json()
    
    return NextResponse.json(data, {
      status: response.status,
    })
  } catch (error) {
    console.error('Error proxying reveal request:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reveal data' },
      { status: 500 }
    )
  }
}

