import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        setupFiles: ['src/__tests__/setup.ts'],
        testTimeout: 10000,
        coverage: {
            provider: 'v8',
            include: ['src/modules/**/*.ts', 'src/auth/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/db/seed.ts'],
        },
    },
    resolve: {
        alias: {
            '@': './src',
            '@tms/shared': '../../packages/shared/src/index.ts',
        },
    },
});
