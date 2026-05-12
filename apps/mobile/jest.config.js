/**
 * Mobile test config.
 *
 * Design decision: we use plain `ts-jest` with the node environment instead of
 * `jest-expo`. Rationale:
 *
 *  - jest-expo pulls in the whole RN native-module mock stack (>200 MB), and
 *    its peer-deps disagree with our pinned React 19.2.4 (it expects 19.2.0).
 *  - The tests we actually need are pure-logic: offline queue, fetch retry,
 *    sync wrapper, role priority. None of them render a component tree.
 *  - We replace the native deps (AsyncStorage, NetInfo, expo-secure-store,
 *    WatermelonDB synchronize) with manual mocks in __mocks__/ — that keeps
 *    the runtime small and deterministic.
 *
 * If/when we add screen-level tests we should revisit and migrate to jest-expo
 * (with react-test-renderer) for those specific suites.
 */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: ['**/src/**/*.test.ts', '**/src/**/*.test.tsx'],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    moduleNameMapper: {
        '^@react-native-async-storage/async-storage$': '<rootDir>/test/mocks/async-storage.ts',
        '^@react-native-community/netinfo$': '<rootDir>/test/mocks/netinfo.ts',
        '^expo-secure-store$': '<rootDir>/test/mocks/expo-secure-store.ts',
        '^react-native$': '<rootDir>/test/mocks/react-native.ts',
        '^@nozbe/watermelondb/sync$': '<rootDir>/test/mocks/watermelondb-sync.ts',
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
    clearMocks: true,
    resetMocks: false,
};
