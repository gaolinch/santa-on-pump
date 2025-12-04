'use client'

import { useState } from 'react'

interface NGOLogoProps {
  logoImage: string | null
  name: string
  className?: string
  fallbackClassName?: string
}

export default function NGOLogo({ logoImage, name, className = "w-16 h-16 rounded-lg object-contain bg-white p-2", fallbackClassName = "w-16 h-16 rounded-lg bg-red-600 dark:bg-red-700 flex items-center justify-center text-white text-2xl font-bold" }: NGOLogoProps) {
  const [imageError, setImageError] = useState(false)

  if (!logoImage || imageError) {
    return (
      <div className={fallbackClassName}>
        {name.charAt(0)}
      </div>
    )
  }

  return (
    <img 
      src={logoImage} 
      alt={`${name} logo`}
      className={className}
      onError={() => setImageError(true)}
    />
  )
}

