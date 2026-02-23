import { execSync } from 'child_process'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')
const TEST_DB_URL = 'postgresql://test:test@localhost:5555/lake_powell_test'

function run(cmd: string, timeoutMs = 60_000) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', timeout: timeoutMs })
}

async function waitForPostgres(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      execSync(`psql "${TEST_DB_URL}" -c "SELECT 1"`, {
        cwd: ROOT,
        stdio: 'pipe',
        timeout: 5_000,
      })
      return
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  throw new Error('PostgreSQL did not become ready in time')
}

export default async function globalSetup() {
  console.log('\n[E2E Setup] Starting test database...')

  try {
    // Pull image first (may take a while on first run)
    run('docker compose -f docker-compose.test.yml pull', 120_000)

    // Start container
    run('docker compose -f docker-compose.test.yml up -d')

    // Wait for postgres to accept connections
    console.log('[E2E Setup] Waiting for PostgreSQL...')
    await waitForPostgres()

    // Apply schema and seed data
    console.log('[E2E Setup] Applying schema and seed data...')
    run(`psql "${TEST_DB_URL}" -f database/test-setup.sql`)

    console.log('[E2E Setup] Test database ready.\n')
  } catch (error: any) {
    console.error('[E2E Setup] Failed to start test database:', error.message)
    console.error('[E2E Setup] Make sure Docker is running.')
    throw error
  }
}
