'use client'

import { useEffect, useState } from 'react'

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<'festive' | 'charity'>('charity')

  useEffect(() => {
    // Check for theme in localStorage or body class
    const savedTheme = localStorage.getItem('site-theme') as 'festive' | 'charity' | null
    const bodyTheme = document.body.classList.contains('theme-charity') ? 'charity' : 'festive'
    const currentTheme = savedTheme || bodyTheme
    
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
    localStorage.setItem('site-theme', newTheme)
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

