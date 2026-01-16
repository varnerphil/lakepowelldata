/**
 * Unit tests for HistoricalAverages component.
 * Following TDD: Write tests first, then implement to make tests pass.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import HistoricalAverages from '@/components/water-level/HistoricalAverages'

describe('HistoricalAverages', () => {
  it('displays all-time averages', () => {
    // Given: Averages data with all-time values
    const averages = {
      allTime: {
        elevation: 3617.68,
        content: 14407732,
        inflow: 8105,
        outflow: 12427
      },
      sinceFilled: null,
      sinceWY2000: null
    }
    // When: Component renders
    render(<HistoricalAverages averages={averages} currentElevation={3540.60} />)
    // Then: Displays all-time average elevation
    expect(screen.getByText(/all-time/i)).toBeInTheDocument()
    expect(screen.getByText(/3617.68/i)).toBeInTheDocument()
  })

  it('displays comparison to current elevation', () => {
    // Given: Averages and current elevation
    const averages = {
      allTime: {
        elevation: 3617.68,
        content: 14407732,
        inflow: 8105,
        outflow: 12427
      },
      sinceFilled: null,
      sinceWY2000: null
    }
    const currentElevation = 3540.60
    // When: Component renders
    render(<HistoricalAverages averages={averages} currentElevation={currentElevation} />)
    // Then: Shows difference from average
    // Current is 77.08 feet below all-time average
    expect(screen.getByText(/-77.08/i)).toBeInTheDocument()
  })
})






