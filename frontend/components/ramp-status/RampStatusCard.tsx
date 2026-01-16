'use client'

interface RampStatusCardProps {
  ramp: {
    id: number
    name: string
    status: 'Open and Usable' | 'Use at Own Risk' | 'Unusable'
    current_elevation: number
    elevation_difference: number
    min_safe_elevation: number
    min_usable_elevation: number
    location: string | null
  }
}

export default function RampStatusCard({ ramp }: RampStatusCardProps) {
  const getStatusColor = () => {
    switch (ramp.status) {
      case 'Open and Usable':
        return {
          bg: 'bg-[#f0f5ed]',
          border: 'border-3 border-[#8b9a6b]',
          text: 'text-[#5a6a4a]',
          accent: 'text-[#8b9a6b]'
        }
      case 'Use at Own Risk':
        return {
          bg: 'bg-[#faf5f0]',
          border: 'border-3 border-[#d4a574]',
          text: 'text-[#8b6a4a]',
          accent: 'text-[#d4a574]'
        }
      case 'Unusable':
        return {
          bg: 'bg-[#faf0f0]',
          border: 'border-3 border-[#c99a7a]',
          text: 'text-[#8b5a4a]',
          accent: 'text-[#c99a7a]'
        }
    }
  }

  const getStatusIcon = () => {
    switch (ramp.status) {
      case 'Open and Usable':
        return '✓'
      case 'Use at Own Risk':
        return '⚠'
      case 'Unusable':
        return '✗'
    }
  }

  const colors = getStatusColor()

  return (
    <div className={`card ${colors.border} ${colors.bg} p-6 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start mb-4">
        <div className={`flex-shrink-0 w-10 h-10 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center mr-4`}>
          <span className={`${colors.accent} text-lg font-light`}>{getStatusIcon()}</span>
        </div>
        <div className="flex-1">
          <h3 className={`font-light text-lg ${colors.text} mb-1`}>{ramp.name}</h3>
          <div className={`text-sm font-light ${colors.text}`}>{ramp.status}</div>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Current Elevation</div>
          <div className={`font-light ${colors.text}`}>{ramp.current_elevation.toFixed(2)} <span className="text-gray-500">ft</span></div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Min Safe</div>
          <div className={`font-light ${colors.text}`}>{ramp.min_safe_elevation.toFixed(2)} <span className="text-gray-500">ft</span></div>
        </div>
        {ramp.elevation_difference !== 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-gray-500 mb-1 font-light">Difference</div>
            <div className={`font-light ${colors.text}`}>
              {ramp.elevation_difference > 0 ? '+' : ''}
              {ramp.elevation_difference.toFixed(2)} <span className="text-gray-500">ft</span>
            </div>
          </div>
        )}
        {ramp.location && (
          <div className="pt-3 border-t border-gray-200">
            <div className="text-xs text-gray-500 font-light">{ramp.location}</div>
          </div>
        )}
      </div>
    </div>
  )
}



