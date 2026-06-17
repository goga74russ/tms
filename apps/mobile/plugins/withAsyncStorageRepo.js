// Expo config-plugin: чинит резолв нативного ядра async-storage v3.
//
// async-storage@3 поставляет storage-android:1.0.0 как встроенный maven
// local_repo внутри самого пакета, но под pnpm НЕ инжектит его в репозитории
// приложения → gradle падает: "Could not find ...storage-android:1.0.0".
// Локальная правка android/build.gradle не durable (prebuild перегенерит и
// EAS prebuild'ит заново). Этот плагин добавляет local_repo в
// allprojects.repositories при КАЖДОМ prebuild — и локально, и на EAS.
//
// Путь hash-free: ${rootDir}/../node_modules/... → apps/mobile/node_modules/...
// (pnpm-симлинк на реальный пакет; работает и на Linux-воркере EAS).
const { withProjectBuildGradle } = require('@expo/config-plugins');

const SNIPPET =
    '    maven { url "${rootDir}/../node_modules/@react-native-async-storage/async-storage/android/local_repo" }';

module.exports = function withAsyncStorageRepo(config) {
    return withProjectBuildGradle(config, (cfg) => {
        if (cfg.modResults.language !== 'groovy') return cfg;
        if (cfg.modResults.contents.includes('async-storage/android/local_repo')) return cfg;
        cfg.modResults.contents = cfg.modResults.contents.replace(
            /allprojects\s*\{\s*repositories\s*\{/,
            (match) => match + '\n' + SNIPPET,
        );
        return cfg;
    });
};
