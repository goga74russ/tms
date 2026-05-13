import { defineConfig, devices } from '@playwright/test';

// ----------------------------------------------------------------
// Phase 1 Playwright config — happy-path E2E.
//
// Runs against `pnpm dev:web` (Next dev server on port 3000) which
// proxies API calls to a separately-running @tms/api instance with
// the demo seed loaded (see apps/api/src/db/seed-demo.ts).
//
// Locally / in CI without a backing Postgres + Redis the test will
// fail at login — the workflow marks this job advisory-only.
// ----------------------------------------------------------------

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 60_000,
    globalTimeout: 5 * 60_000,
    expect: { timeout: 10_000 },
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',

    use: {
        baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
        trace: 'retain-on-failure',
        video: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
        ? undefined
        : {
            command: 'pnpm --filter @tms/web dev',
            url: 'http://localhost:3000/login',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            stdout: 'pipe',
            stderr: 'pipe',
        },
});
