# @tms/mobile

Водительское мобильное приложение. Expo 55 (SDK) + React Native 0.83 +
WatermelonDB (offline-first sync) + React Navigation 7. 10 экранов,
визуальный редизайн Mobile v2 на theme tokens + 8 UI-компонентах.

## Стек

- **Expo SDK 55** (managed workflow + EAS Build для production).
- **React Native 0.83**, **React 19.2**.
- **WatermelonDB** — локальная offline-БД, push/pull sync через `/sync` API.
- **expo-camera / expo-location / expo-notifications / expo-secure-store** — нативные возможности.
- **react-native-signature-canvas** — рисование подписи водителя при delivery confirmation.

## Запуск

```
pnpm --filter @tms/mobile start         # Expo dev server (Metro)
pnpm --filter @tms/mobile android       # запустить на Android emulator
pnpm --filter @tms/mobile ios           # запустить на iOS simulator (macOS)
pnpm --filter @tms/mobile web           # web preview (limited)
pnpm --filter @tms/mobile typecheck     # tsc --noEmit
```

Production-сборка: `eas build` (см. `eas.json`). EAS аккаунт нужен.

### Подключение к API

API endpoint конфигурируется через `expo-constants` / `app.json` extras
(или env-переменную при сборке). По умолчанию dev — `http://10.0.2.2:3001`
для Android emulator, `http://localhost:3001` для iOS simulator.

### Запуск на физическом устройстве

1. Установить Expo Go (Android/iOS).
2. `pnpm --filter @tms/mobile start` — отсканировать QR.
3. Убедиться, что устройство и dev-машина в одной сети, API доступен по
   LAN IP (не `localhost`).

## Раскладка `src/`

```
src/api/           API-клиенты (waybills, trips, inspections, sync, ...)
src/screens/       Экраны (Login, Home, WaybillList, TripDetails,
                   TempLog, DeliveryConfirmation, Documents, History, ...)
src/components/    UI-примитивы (Button, Input, Card, Pill, Badge,
                   EmptyState, Skeleton, Toast — Mobile v2)
src/db/            WatermelonDB модели + миграции локальной БД
src/navigation/    React Navigation стек
src/offline/       offlineQueue — буфер мутаций пока нет сети
src/theme/         theme tokens (цвета, отступы, типографика)
```

## Особенности

- **Offline-first:** все мутации (inspections, temperature readings, delivery confirmation, document scans) идут через offlineQueue. При появлении сети — push в API, при ошибке — retry с backoff.
- **Push-уведомления** — `expo-notifications`. Локальное уведомление на cold-chain breach триггерится из `TemperatureLogScreen` при `response.breach=true` (см. D27 в `docs/operations/wave-summary.md`).
- **Signature canvas** через WebView; результат — base64 PNG, загружается через `/uploads` presigned URL.

## Связанные доки

- `docs/users/driver-mobile-guide.md` — гайд для водителя.
- `docs/users/cold-chain.md` — температурный SLA, авторежим 60s.
- `docs/operations/wave-summary.md` (раздел Mobile v2) — текущее состояние.
- `docs/mobile/migration.md` — исторический документ о миграции из старого workspace.
