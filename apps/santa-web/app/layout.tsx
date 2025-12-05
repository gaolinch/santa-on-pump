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
              (function() {
                document.documentElement.classList.add('dark');
                localStorage.theme = 'dark';
                
                // Theme expiry helper functions (1 hour = 3600000 ms)
                function getThemeWithExpiry() {
                  const savedTheme = localStorage.getItem('site-theme');
                  const expiryTime = localStorage.getItem('site-theme-expiry');
                  
                  if (!savedTheme || !expiryTime) {
                    return 'festive'; // Default
                  }
                  
                  const now = Date.now();
                  const expiry = parseInt(expiryTime, 10);
                  
                  // Check if expired (more than 1 hour has passed)
                  if (now > expiry) {
                    // Expired - reset to default
                    localStorage.removeItem('site-theme');
                    localStorage.removeItem('site-theme-expiry');
                    return 'festive';
                  }
                  
                  return savedTheme;
                }
                
                function setThemeWithExpiry(theme) {
                  const now = Date.now();
                  const oneHour = 3600000; // 1 hour in milliseconds
                  const expiryTime = now + oneHour;
                  
                  localStorage.setItem('site-theme', theme);
                  localStorage.setItem('site-theme-expiry', expiryTime.toString());
                }
                
                // Initialize site theme - check expiry and default to festive
                const targetTheme = getThemeWithExpiry();
                
                // Apply theme
                if (targetTheme === 'charity') {
                  document.body.classList.add('theme-charity');
                  document.body.classList.remove('theme-festive');
                } else {
                  document.body.classList.add('theme-festive');
                  document.body.classList.remove('theme-charity');
                  // Set expiry for default theme
                  setThemeWithExpiry('festive');
                }
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} ${spaceGrotesk.variable} theme-festive`}>
        <BackgroundIcons />
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
      </body>
    </html>
  )
}

