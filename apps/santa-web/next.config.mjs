import createMDX from '@next/mdx'

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
  reactStrictMode: true,
  
  // Fix CORS issues with RSC (React Server Components) on Vercel
  async headers() {
    // Define allowed origins based on environment
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.NEXT_PUBLIC_BASE_URL,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
      // Add your production domains here
      'https://santa-pump.fun'
    ].filter(Boolean) // Remove null/undefined values

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            // For RSC to work properly with Next.js, we need to allow same-origin
            // In production, replace '*' with your specific domain
            value: process.env.NODE_ENV === 'production' 
              ? (process.env.NEXT_PUBLIC_BASE_URL || '*')
              : '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, RSC, Next-Router-State-Tree, Next-Router-Prefetch',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
        ],
      },
    ]
  },
}

const withMDX = createMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
})

export default withMDX(nextConfig)

