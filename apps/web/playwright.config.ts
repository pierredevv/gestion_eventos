import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const webDir = __dirname;
const rootDir = path.resolve(webDir, '../..');

if (!process.env.TEST_DATABASE_URL) {
  process.loadEnvFile(path.join(rootDir, '.env'));
}
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required for the E2E suite');
}
const apiWrapper = path.join(webDir, 'e2e/support/start-api.mjs');
const apiLogFile = process.env.E2E_API_LOG_FILE ?? '/tmp/opencode/eventos-api-e2e.log';
process.env.E2E_API_LOG_FILE = apiLogFile;

const apiEnv: Record<string, string> = {
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL,
  TEST_DIRECT_URL: process.env.TEST_DIRECT_URL ?? process.env.TEST_DATABASE_URL,
  E2E_API_LOG_FILE: apiLogFile,
};

const webEnv: Record<string, string> = {
  NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000/api/v1',
  NEXT_PUBLIC_API_DOCS_URL: 'http://localhost:4000/api/docs',
  NEXT_PUBLIC_API_HEALTH_URL: 'http://localhost:4000/api/v1/health/ready',
  NEXT_PUBLIC_RESERVATION_MINUTES: '25',
  NEXT_PUBLIC_PAYMENT_QR_URL: '',
};

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // The durable notification worker is scheduled every minute, so a single
  // browser flow can legitimately span several minutes on slow filesystems.
  timeout: 480_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: 'http://localhost:3000',
    headless: true,
    actionTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `node "${apiWrapper}"`,
      cwd: rootDir,
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: apiEnv,
    },
    {
      command: 'pnpm --filter @eventos/web dev',
      cwd: rootDir,
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 120_000,
      env: webEnv,
    },
  ],
});
