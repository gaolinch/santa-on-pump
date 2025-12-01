'use client'

// Generate particles with a seeded random for consistency (avoids hydration mismatch)
const generateParticles = (seed: number) => {
  const seededRandom = (index: number) => {
    const x = Math.sin(seed + index * 12.9898) * 43758.5453123;
    return x - Math.floor(x);
  };
  
  // Round to 2 decimal places to ensure server/client match
  const round = (num: number) => Math.round(num * 100) / 100;
  
  return [...Array(40)].map((_, i) => ({
    left: `${round(seededRandom(i * 4) * 100)}%`,
    width: `${round(seededRandom(i * 4 + 1) * 5 + 2)}px`,
    height: `${round(seededRandom(i * 4 + 2) * 5 + 2)}px`,
    animationDelay: `${round(seededRandom(i * 4 + 3) * 20)}s`,
    animationDuration: `${round(seededRandom(i * 4 + 4) * 12 + 15)}s`,
  }));
};

// Generate particles once with a fixed seed - consistent on server and client
const PARTICLES = generateParticles(42);

export default function BackgroundIcons() {

  return (
    <div className="floating-icons">
      {/* Snowflakes */}
      <div className="floating-icon slow" style={{ width: '60px', height: '60px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <path d="M12 2L12 22M12 2L8 6M12 2L16 6M12 22L8 18M12 22L16 18M2 12L22 12M2 12L6 8M2 12L6 16M22 12L18 8M22 12L18 16M5.64 5.64L18.36 18.36M5.64 5.64L8.5 8.5M18.36 18.36L15.5 15.5M5.64 18.36L18.36 5.64M5.64 18.36L8.5 15.5M18.36 5.64L15.5 8.5" 
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Circular tech rings */}
      <div className="floating-icon" style={{ width: '80px', height: '80px' }}>
        <svg viewBox="0 0 100 100" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="2" opacity="0.6" />
          <circle cx="50" cy="50" r="30" stroke="currentColor" strokeWidth="2" opacity="0.4" />
          <circle cx="50" cy="50" r="20" stroke="currentColor" strokeWidth="2" opacity="0.3" />
        </svg>
      </div>

      {/* Plus symbols */}
      <div className="floating-icon fast" style={{ width: '40px', height: '40px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Gift boxes */}
      <div className="floating-icon slow" style={{ width: '55px', height: '55px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <rect x="3" y="8" width="18" height="13" rx="1" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 12h18M12 8v13" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 8c0-1.657-1.343-3-3-3S6 6.343 6 8h6zM12 8c0-1.657 1.343-3 3-3s3 1.343 3 3h-6z" 
                stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>

      {/* VR/Tech elements */}
      <div className="floating-icon" style={{ width: '65px', height: '65px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <rect x="2" y="8" width="20" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="8" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="16" cy="13" r="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Stars */}
      <div className="floating-icon fast" style={{ width: '45px', height: '45px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <path d="M12 2L14.09 8.26L20.18 9.27L16.09 13.14L17.18 19.02L12 15.77L6.82 19.02L7.91 13.14L3.82 9.27L9.91 8.26L12 2Z" 
                stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </div>

      {/* Crypto Coins */}
      <div className="floating-icon fast" style={{ width: '60px', height: '60px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1" opacity="0.5" />
        </svg>
      </div>

      <div className="floating-icon slow" style={{ width: '55px', height: '55px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 9h4c1.1 0 2 .9 2 2s-.9 2-2 2H9m4 0h-4m4 0c1.1 0 2 .9 2 2s-.9 2-2 2H9m3-10V7m0 10v2" 
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Dollar Sign */}
      <div className="floating-icon fast" style={{ width: '55px', height: '55px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <path d="M12 3v18M8 7h5a3 3 0 1 1 0 6H8m5 0h-5m5 0a3 3 0 1 1 0 6H8" 
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* Blockchain/Crypto themed */}
      <div className="floating-icon" style={{ width: '65px', height: '65px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <rect x="3" y="3" width="7" height="7" stroke="currentColor" strokeWidth="1.5" rx="1" />
          <rect x="14" y="3" width="7" height="7" stroke="currentColor" strokeWidth="1.5" rx="1" />
          <rect x="3" y="14" width="7" height="7" stroke="currentColor" strokeWidth="1.5" rx="1" />
          <rect x="14" y="14" width="7" height="7" stroke="currentColor" strokeWidth="1.5" rx="1" />
          <path d="M10 6.5h4M10 17.5h4M6.5 10v4M17.5 10v4" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Token/Coin stack */}
      <div className="floating-icon fast" style={{ width: '55px', height: '55px' }}>
        <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-festive-green-500 dark:text-festive-green-400">
          <ellipse cx="12" cy="8" rx="7" ry="3" stroke="currentColor" strokeWidth="1.5" />
          <ellipse cx="12" cy="12" rx="7" ry="3" stroke="currentColor" strokeWidth="1.5" />
          <ellipse cx="12" cy="16" rx="7" ry="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 8v8M19 8v8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Floating particles - more snow! */}
      <div className="particles-container">
        {PARTICLES.map((particle, i) => (
          <div
            key={`particle-${i}`}
            className="particle"
            style={particle}
          />
        ))}
      </div>
    </div>
  )
}

