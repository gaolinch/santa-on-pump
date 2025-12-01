'use client'

import React, { useState } from 'react'

type RewardCategory = {
  name: string
  percentage: number
  color: string
  icon: React.ReactNode
  description: string
}

const rewardData: RewardCategory[] = [
  {
    name: 'Holders & Investors',
    percentage: 70,
    color: '#22c55e', // festive-green-500
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor">
        <rect x="3" y="5" width="18" height="14" rx="2" strokeWidth="2" />
        <path d="M3 10h18M7 15h.01M11 15h2" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    description: 'Daily airdrops or rewards to active wallets',
  },
  {
    name: 'Charities & NGOs',
    percentage: 25,
    color: '#ef4444', // festive-red-500
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" 
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    description: 'Direct on-chain donations to verified causes',
  },
  {
    name: 'Founders & Operations',
    percentage: 5,
    color: '#fbbf24', // amber-400
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full" stroke="currentColor">
        <circle cx="12" cy="12" r="3" strokeWidth="2" />
        <path d="M12 1v6m0 6v6M23 12h-6m-6 0H5" strokeWidth="2" strokeLinecap="round" />
        <path d="M18.36 5.64l-4.24 4.24m0 4.24l4.24 4.24M5.64 5.64l4.24 4.24m0 4.24l-4.24 4.24" 
              strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
    description: 'Sustaining the project, operations, audits',
  },
]

export default function RewardsPieChart() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Calculate pie chart segments
  const createPieSlice = (percentage: number, startAngle: number) => {
    const angle = (percentage / 100) * 360
    const endAngle = startAngle + angle
    
    const outerRadius = 45
    const innerRadius = 30 // Thinner ring
    
    const startRad = (startAngle - 90) * (Math.PI / 180)
    const endRad = (endAngle - 90) * (Math.PI / 180)
    
    const x1 = 50 + outerRadius * Math.cos(startRad)
    const y1 = 50 + outerRadius * Math.sin(startRad)
    const x2 = 50 + outerRadius * Math.cos(endRad)
    const y2 = 50 + outerRadius * Math.sin(endRad)
    
    const x3 = 50 + innerRadius * Math.cos(endRad)
    const y3 = 50 + innerRadius * Math.sin(endRad)
    const x4 = 50 + innerRadius * Math.cos(startRad)
    const y4 = 50 + innerRadius * Math.sin(startRad)
    
    const largeArc = angle > 180 ? 1 : 0
    
    return {
      path: `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`,
      endAngle,
    }
  }

  let currentAngle = 0
  const segments = rewardData.map((item, index) => {
    const slice = createPieSlice(item.percentage, currentAngle)
    currentAngle = slice.endAngle
    return { ...item, path: slice.path, index }
  })

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="grid md:grid-cols-2 gap-8 items-center">
        {/* Pie Chart */}
        <div className="relative">
          <svg
            viewBox="0 0 100 100"
            className="w-full max-w-md mx-auto"
            style={{ filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))' }}
          >
            {segments.map((segment, index) => (
              <path
                key={index}
                d={segment.path}
                fill={segment.color}
                opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.3}
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  transform:
                    hoveredIndex === index ? 'scale(1.05)' : 'scale(1)',
                  transformOrigin: '50% 50%',
                }}
              />
            ))}
            
            {/* Center text */}
            <text
              x="50"
              y="48"
              textAnchor="middle"
              className="text-[6px] font-bold fill-gray-800 dark:fill-gray-200"
            >
              Daily
            </text>
            <text
              x="50"
              y="54"
              textAnchor="middle"
              className="text-[6px] font-bold fill-gray-800 dark:fill-gray-200"
            >
              Rewards
            </text>
          </svg>
        </div>

        {/* Legend */}
        <div className="space-y-4">
          {rewardData.map((item, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border-2 transition-all duration-300 cursor-pointer ${
                hoveredIndex === index
                  ? 'border-current shadow-lg scale-105'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
              style={{
                borderColor:
                  hoveredIndex === index ? item.color : undefined,
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center p-2.5 flex-shrink-0"
                  style={{ 
                    backgroundColor: `${item.color}20`,
                    color: item.color 
                  }}
                >
                  {item.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                      {item.name}
                    </h3>
                    <span
                      className="text-2xl font-bold font-mono"
                      style={{ color: item.color }}
                    >
                      {item.percentage}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {item.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom note */}
      <div className="mt-8 p-4 bg-festive-green-50 dark:bg-festive-green-900/20 rounded-lg border border-festive-green-200 dark:border-festive-green-800">
        <p className="text-sm text-center text-gray-700 dark:text-gray-300">
          💡 All distributions are <span className="font-bold">automated</span>, <span className="font-bold">verifiable on-chain</span>, and executed according to pre-committed rules
        </p>
      </div>
    </div>
  )
}

