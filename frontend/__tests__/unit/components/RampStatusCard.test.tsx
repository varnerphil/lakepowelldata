/**
 * Unit tests for RampStatusCard component.
 * Following TDD: Write tests first, then implement to make tests pass.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RampStatusCard from '@/components/ramp-status/RampStatusCard'

describe('RampStatusCard', () => {
  it('displays "Open and Usable" for accessible ramp', () => {
    // Given: Ramp with status "Open and Usable"
    const ramp = {
      id: 1,
      name: 'Wahweap Main Launch',
      status: 'Open and Usable' as const,
      current_elevation: 3550.0,
      elevation_difference: 0.0,
      min_safe_elevation: 3550.0,
      min_usable_elevation: 3549.0,
      location: 'Wahweap, AZ'
    }
    // When: Component renders
    render(<RampStatusCard ramp={ramp} />)
    // Then: Shows green indicator and correct text
    expect(screen.getByText('Open and Usable')).toBeInTheDocument()
    expect(screen.getByText('Wahweap Main Launch')).toBeInTheDocument()
  })

  it('displays "Use at Own Risk" for marginal ramp', () => {
    // Given: Ramp with status "Use at Own Risk"
    const ramp = {
      id: 1,
      name: 'Wahweap Main Launch',
      status: 'Use at Own Risk' as const,
      current_elevation: 3549.5,
      elevation_difference: -0.5,
      min_safe_elevation: 3550.0,
      min_usable_elevation: 3549.0,
      location: 'Wahweap, AZ'
    }
    // When: Component renders
    render(<RampStatusCard ramp={ramp} />)
    // Then: Shows warning indicator and correct text
    expect(screen.getByText('Use at Own Risk')).toBeInTheDocument()
  })

  it('displays "Unusable" for inaccessible ramp', () => {
    // Given: Ramp with status "Unusable"
    const ramp = {
      id: 1,
      name: 'Wahweap Main Launch',
      status: 'Unusable' as const,
      current_elevation: 3548.0,
      elevation_difference: -2.0,
      min_safe_elevation: 3550.0,
      min_usable_elevation: 3549.0,
      location: 'Wahweap, AZ'
    }
    // When: Component renders
    render(<RampStatusCard ramp={ramp} />)
    // Then: Shows red indicator and correct text
    expect(screen.getByText('Unusable')).toBeInTheDocument()
  })
})






