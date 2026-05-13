// ============================================================
// Integration test config — kept separate from the unit-test
// vitest.config.ts so the default `pnpm test` stays fast and
// doesn't require Docker / Postgres on the host.
//
// Run with:
//   pnpm --filter @tms/api test:integration
// after starting the test stack:
//   pnpm --filter @tms/api test:integration:up
// ============================================================
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        globals: false,
        include: ['test/integration/**/*.test.ts'],
        // 30s — DB boot + migrations can be slow on first run.
        testTimeout: 30_000,
        hookTimeout: 60_000,
        // Single fork → sequential execution against the shared test DB.
        // Parallel tests would fight over fixture rows + truncate races.
        pool: 'forks',
        // vitest 4 hoisted forks options to the top level
        fileParallelism: false,
        // Don't bail on first failure — we want to see every regression.
        bail: 0,
    },
});
