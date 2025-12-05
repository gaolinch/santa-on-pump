'use client'

import { useEffect, useState } from 'react'

// Theme expiry helper functions (1 hour = 3600000 ms)
function getThemeWithExpiry(): 'festive' | 'charity' {
  const savedTheme = localStorage.getItem('site-theme') as 'festive' | 'charity' | null
  const expiryTime = localStorage.getItem('site-theme-expiry')
  
  if (!savedTheme || !expiryTime) {
    return 'festive' // Default
  }
  
  const now = Date.now()
  const expiry = parseInt(expiryTime, 10)
  
  // Check if expired (more than 1 hour has passed)
  if (now > expiry) {
    // Expired - reset to default
    localStorage.removeItem('site-theme')
    localStorage.removeItem('site-theme-expiry')
    return 'festive'
  }
  
  return savedTheme
}

function setThemeWithExpiry(theme: 'festive' | 'charity'): void {
  const now = Date.now()
  const oneHour = 3600000 // 1 hour in milliseconds
  const expiryTime = now + oneHour
  
  localStorage.setItem('site-theme', theme)
  localStorage.setItem('site-theme-expiry', expiryTime.toString())
}

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<'festive' | 'charity'>('festive')

  useEffect(() => {
    // Check for theme in localStorage with expiry - default to festive
    const currentTheme = getThemeWithExpiry()
    
    setTheme(currentTheme)
    applyTheme(currentTheme)
  }, [])

  const applyTheme = (newTheme: 'festive' | 'charity') => {
    if (newTheme === 'charity') {
      document.body.classList.add('theme-charity')
      document.body.classList.remove('theme-festive')
    } else {
      document.body.classList.add('theme-festive')
      document.body.classList.remove('theme-charity')
    }
    setThemeWithExpiry(newTheme)
  }

  const toggleTheme = () => {
    const newTheme = theme === 'festive' ? 'charity' : 'festive'
    setTheme(newTheme)
    applyTheme(newTheme)
  }

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label={`Switch to ${theme === 'festive' ? 'charity' : 'festive'} theme`}
      title={`Current: ${theme === 'festive' ? 'Festive' : 'Charity'} theme. Click to switch.`}
    >
      {theme === 'festive' ? '🏥' : '🎄'}
    </button>
  )
}

