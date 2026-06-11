/**
 * Mobile test config.
 *
 * Design decision: we use plain `ts-jest` with the node environment instead of
 * `jest-expo`. Rationale:
 *
 *  - jest-expo pulls in the whole RN native-module mock stack (>200 MB), and
 *    its peer-deps disagree with our pinned React 19.2.4 (it expects 19.2.0).
 *  - We replace the native deps (AsyncStorage, NetInfo, expo-secure-store,
 *    WatermelonDB synchronize, react-native, expo-camera, ...) with manual
 *    mocks in test/mocks/ — keeps the runtime small and deterministic.
 *
 * Screen-level tests use @testing-library/react-native (13.x, classic
 * react-test-renderer backend) on top of a hand-written react-native mock
 * that returns simple host elements. See test/renderWithNav.tsx for the
 * shared screen harness.
 */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['**/src/**/*.test.ts', '**/src/**/*.test.tsx'],
    setupFiles: ['<rootDir>/test/setupTests.ts'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    moduleNameMapper: {
        // i18n: канон лейблов из workspace-пакета. Мапим на ИСХОДНИК (.ts), чтобы
        // ts-jest его трансформировал (dist — ESM, jest его не парсит). Strip '.js'
        // у относительных ESM-спецификаторов канона (export * from './labels.js')
        // — иначе ts-jest ищет несуществующий .js. В mobile src .js-импортов нет.
        '^@tms/shared$': '<rootDir>/../../packages/shared/src/index.ts',
        '^(\\.{1,2}/.*)\\.js$': '$1',
        // Native module stubs ───────────────────────────────────────────
        '^@react-native-async-storage/async-storage$': '<rootDir>/test/mocks/async-storage.ts',
        '^@react-native-community/netinfo$': '<rootDir>/test/mocks/netinfo.ts',
        '^expo-secure-store$': '<rootDir>/test/mocks/expo-secure-store.ts',
        '^expo-status-bar$': '<rootDir>/test/mocks/expo-status-bar.ts',
        '^expo-camera$': '<rootDir>/test/mocks/expo-camera.ts',
        '^expo-location$': '<rootDir>/test/mocks/expo-location.ts',
        '^expo-notifications$': '<rootDir>/test/mocks/expo-notifications.ts',
        '^react-native$': '<rootDir>/test/mocks/react-native.ts',
        '^react-native-safe-area-context$': '<rootDir>/test/mocks/safe-area-context.ts',
        '^react-native-signature-canvas$': '<rootDir>/test/mocks/signature-canvas.ts',
        // WatermelonDB — order matters: more specific paths first.
        '^@nozbe/watermelondb/sync$': '<rootDir>/test/mocks/watermelondb-sync.ts',
        '^@nozbe/watermelondb/decorators$': '<rootDir>/test/mocks/watermelondb-decorators.ts',
        '^@nozbe/watermelondb$': '<rootDir>/test/mocks/watermelondb.ts',
        // Local database singleton — relative imports from src/api, src/screens, etc.
        '^../database$': '<rootDir>/test/mocks/database.ts',
        '^../../database$': '<rootDir>/test/mocks/database.ts',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: {
                    target: 'ES2020',
                    module: 'commonjs',
                    moduleResolution: 'node',
                    esModuleInterop: true,
                    strict: false,
                    jsx: 'react-jsx',
                    experimentalDecorators: true,
                    emitDecoratorMetadata: true,
                    skipLibCheck: true,
                    isolatedModules: true,
                },
                diagnostics: false,
            },
        ],
    },
    transformIgnorePatterns: [
        // Allow ESM packages from @testing-library to be transformed.
        'node_modules/(?!(@testing-library|pretty-format)/)',
    ],
    clearMocks: true,
    resetMocks: false,
};
