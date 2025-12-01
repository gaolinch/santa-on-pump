import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import '../styles/prose.css'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import BackgroundIcons from '@/components/BackgroundIcons'

const inter = Inter({ subsets: ['latin'] })
const spaceGrotesk = Space_Grotesk({ 
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['700'],
})

export const metadata: Metadata = {
  title: 'Santa — On-Chain Advent Calendar',
  description:
    'A Solana-based token with daily gift revelations from December 1st to 24th.',
  icons: {
    icon: '/santa-logo.png',
    apple: '/santa-logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              document.documentElement.classList.add('dark');
              localStorage.theme = 'dark';
            `,
          }}
        />
      </head>
      <body className={`${inter.className} ${spaceGrotesk.variable}`}>
        <BackgroundIcons />
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  )
}

