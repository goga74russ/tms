// Metro config для pnpm-монорепо.
// Без него Metro берёт неправильный projectRoot и не резолвит точку входа
// (./index.ts) и workspace-пакеты (@tms/shared) → "Bundle JavaScript" падает
// и на EAS, и локально. Канон из доков Expo для монорепо + nodeModulesPaths
// на оба уровня (под pnpm-symlink-структуру).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Следим за всей монорепой (workspace-пакеты вроде @tms/shared).
config.watchFolders = [monorepoRoot];

// 2. Резолвим модули сначала из пакета, затем из корня монорепо.
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
