/**
 * Integration tests for ramps API routes.
 * Following TDD: Write tests first, then implement to make tests pass.
 */
import { describe, it, expect } from 'vitest'

describe('GET /api/ramps/status', () => {
  it('returns status for all ramps', async () => {
    // Given: Current water elevation and ramp definitions
    // When: GET /api/ramps/status is called
    const response = await fetch('http://localhost:3000/api/ramps/status')
    // Then: Returns array with status for each ramp
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('id')
      expect(data[0]).toHaveProperty('name')
      expect(data[0]).toHaveProperty('status')
      expect(['Open and Usable', 'Use at Own Risk', 'Unusable']).toContain(data[0].status)
    }
  })
})






