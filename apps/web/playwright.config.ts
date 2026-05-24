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
        // F2: один раз логинит все роли и сохраняет storage state в
        // tests/.auth/<role>.json. Все остальные projects зависят от него.
        {
            name: 'setup',
            testMatch: /auth\.setup\.ts/,
        },
        // Базовый happy-path и любые тесты, которые сами делают login.
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            dependencies: ['setup'],
        },
        // Per-role projects — тесты под этой ролью видят готовое
        // storage state. Тест-файл может сам делать test.use({ storageState })
        // если нужно прыгать между ролями, но базовый use на проекте
        // удобнее для multi-role smoke-набора.
        //
        // Имена ролей синхронны с fixtures/auth.ts:ROLE_USERS.role.
        // testMatch покрывает spec'и в tests/e2e/role/<role>/ —
        // эту папку команда QA создаёт по мере необходимости.
        {
            name: 'role-admin',
            use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/admin.json' },
            testMatch: /e2e\/role\/admin\/.*\.spec\.ts/,
            dependencies: ['setup'],
        },
        {
            name: 'role-driver',
            use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/driver1.json' },
            testMatch: /e2e\/role\/driver\/.*\.spec\.ts/,
            dependencies: ['setup'],
        },
        {
            name: 'role-dispatcher',
            use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/dispatcher.json' },
            testMatch: /e2e\/role\/dispatcher\/.*\.spec\.ts/,
            dependencies: ['setup'],
        },
        {
            name: 'role-logist',
            use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/logist.json' },
            testMatch: /e2e\/role\/logist\/.*\.spec\.ts/,
            dependencies: ['setup'],
        },
        // Cross-org-leak: открытие как admin@org-b и проверка, что Org-A
        // данные не видны. Тесты живут в tests/e2e/cross-org/.
        {
            name: 'cross-org',
            use: { ...devices['Desktop Chrome'], storageState: 'tests/.auth/admin_org_b.json' },
            testMatch: /e2e\/cross-org\/.*\.spec\.ts/,
            dependencies: ['setup'],
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
