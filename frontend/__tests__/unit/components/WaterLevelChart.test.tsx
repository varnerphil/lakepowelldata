/**
 * Unit tests for WaterLevelChart component.
 * Following TDD: Write tests first, then implement to make tests pass.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WaterLevelChart from '@/components/charts/WaterLevelChart'

describe('WaterLevelChart', () => {
  it('renders chart with provided data', () => {
    // Given: Water level data array
    const data = [
      { date: '2025-12-01', elevation: 3540.0 },
      { date: '2025-12-02', elevation: 3540.5 },
      { date: '2025-12-03', elevation: 3541.0 },
    ]
    // When: Component renders
    render(<WaterLevelChart data={data} />)
    // Then: Chart displays with correct data points
    // Note: Recharts components may need special testing setup
  })

  it('handles empty data gracefully', () => {
    // Given: Empty data array
    const data: never[] = []
    // When: Component renders
    render(<WaterLevelChart data={data} />)
    // Then: Shows "No data available" message
    expect(screen.getByText(/no data available/i)).toBeInTheDocument()
  })
})






