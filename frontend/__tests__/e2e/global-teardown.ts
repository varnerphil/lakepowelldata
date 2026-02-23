import { execSync } from 'child_process'
import path from 'path'

const ROOT = path.resolve(__dirname, '../../..')

export default async function globalTeardown() {
  console.log('\n[E2E Teardown] Stopping test database...')

  try {
    execSync('docker compose -f docker-compose.test.yml down -v', {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 15_000,
    })
    console.log('[E2E Teardown] Test database stopped.\n')
  } catch (error: any) {
    console.warn('[E2E Teardown] Warning: could not stop test database:', error.message)
  }
}
