/**
 * Integration tests for water data API routes.
 * Following TDD: Write tests first, then implement to make tests pass.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

describe('GET /api/water/current', () => {
  it('returns latest water measurement', async () => {
    // Given: Database has water data
    // When: GET /api/water/current is called
    const response = await fetch('http://localhost:3000/api/water/current')
    // Then: Returns 200 with latest water data
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('date')
    expect(data).toHaveProperty('elevation')
    expect(data).toHaveProperty('content')
    expect(data).toHaveProperty('inflow')
    expect(data).toHaveProperty('outflow')
  })

  it('returns 404 when no data exists', async () => {
    // Given: Empty database
    // When: GET /api/water/current is called
    // Then: Returns 404
    // Note: This test would require a test database setup
  })
})

describe('GET /api/water/history', () => {
  it('returns data for date range', async () => {
    // Given: Date range query params
    const startDate = '2025-01-01'
    const endDate = '2025-01-31'
    // When: GET /api/water/history?start=2025-01-01&end=2025-01-31
    const response = await fetch(
      `http://localhost:3000/api/water/history?start=${startDate}&end=${endDate}`
    )
    // Then: Returns array of records in range
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(Array.isArray(data)).toBe(true)
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('date')
      expect(data[0]).toHaveProperty('elevation')
    }
  })

  it('validates date format', async () => {
    // Given: Invalid date format
    // When: GET /api/water/history?start=invalid
    const response = await fetch(
      'http://localhost:3000/api/water/history?start=invalid'
    )
    // Then: Returns 400 with error message
    expect(response.status).toBe(400)
  })
})

describe('GET /api/stats/averages', () => {
  it('returns historical averages', async () => {
    // Given: Database has historical data
    // When: GET /api/stats/averages is called
    const response = await fetch('http://localhost:3000/api/stats/averages')
    // Then: Returns 200 with averages data
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('allTime')
    expect(data).toHaveProperty('sinceFilled')
    expect(data).toHaveProperty('sinceWY2000')
  })
})






