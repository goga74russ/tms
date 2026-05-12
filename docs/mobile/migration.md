# Mobile Migration

Updated: 2026-04-29

> **Исторический документ.** Мобильное приложение уже реализовано в `apps/mobile/` и прошло визуальный редизайн Mobile v2 (10 экранов, theme tokens, 8 UI-компонентов). Текущее состояние см. в `docs/operations/wave-summary.md` (раздел post-Mobile v2).

## Current State

The mobile app is now part of the v2 workspace as a first-class package:

```text
D:\Ai\TMS-prod\apps\mobile
```

The archive source remains available for comparison:

```text
D:\Ai\TMS\apps\mobile
```

## Runtime Entrypoint

The active mobile entrypoint is the React Navigation driver/mechanic flow:

```text
apps/mobile/index.ts -> apps/mobile/App.tsx -> src/navigation/AppNavigator.tsx
```

`package.json` uses `main: "index.ts"`. This avoids starting the older Expo Router demo screens that were copied with the archive.

## Available Mobile Capabilities

- bearer-token mobile login through `/api/auth/mobile/login`
- `/api/auth/me` profile hydration with `driverId`
- driver trip list and trip details from local WatermelonDB sync tables
- route point checkpoint screen with photo/signature event capture
- checkpoint photo review with retake/replace/continue-without-photo actions
- trip completion offline event capture
- trip blocker display for missing/blocked operational prerequisites
- completion correction reason UX when blockers are present
- delivery confirmation with recipient, photo, signature, online submit, and offline queue fallback
- mechanic inspection flow
- upload API integration
- WatermelonDB sync through `/api/sync/pull` and `/api/sync/events`
- offline queue replay for checkpoint and completion events when connectivity returns
- offline queue duplicate/conflict hint in trip details

## P1 Changes Applied

1. Switched mobile package entrypoint from `expo-router/entry` to `index.ts`.
2. Normalized backend `roles[]` into the mobile `role` field so mechanic/driver routing works.
3. Triggered WatermelonDB sync after login and after stored-token restoration.
4. Aligned trip status API client with backend `POST /trips/:id/status`.
5. Aligned checkpoint confirmation helper with backend `/sync/events` contract.
6. Added repeatable full mobile smoke script.
7. Added mobile trip blocker visibility in driver trip context.
8. Added offline replay coverage for checkpoint and trip completion events.
9. Added free execution-polish UI for checkpoint retake, offline conflict/duplicate hints, and completion correction reasons.

```powershell
D:\Ai\TMS-prod\scripts\mobile-smoke.ps1
```

The smoke script prepares an idempotent trip `MOB-SMOKE-DRIVER1`, verifies non-empty pull, pushes checkpoint completion, then pushes trip completion.

## Verification

Latest evidence: `docs/operations/mobile-smoke-evidence-2026-04-28.md`.

Verified:

- `corepack pnpm --filter @tms/mobile typecheck`
- mobile mojibake scan: `files 0`
- mobile login smoke for `driver1@tms.local`
- `/api/auth/me` returns driver role and `driverId`
- `/api/sync/pull` returns `success=true` with one prepared smoke trip and one route point
- `/api/sync/events` accepts and replays `route_point_completed` and `trip_status_changed` events
- prepared smoke trip reaches `completed` and its route point reaches `completed`
- driver trip blockers are represented in the mobile trip context
- `corepack pnpm --filter @tms/mobile typecheck` after checkpoint retake/conflict/correction UI polish

## Required Device Gate

Before any mobile pilot or release, run the app on a real Android device or Android emulator against a LAN API URL, not only localhost contract smoke. Capture UI evidence for login, trip list, checkpoint photo/signature, trip blockers, offline/sync replay, and trip completion.

This is mandatory because camera, signature canvas, SecureStore, WatermelonDB, network addressing, and Expo runtime behavior can differ from API-level smoke tests.

Runbook: `docs/mobile/pilot-evidence.md`.

## Remaining Mobile Debt

- Complete the required Android device/emulator gate.
- Add mobile UI evidence/screenshots for login, trip list, checkpoint, completion, trip blockers, and offline replay.
- Decide whether mobile should keep mechanic/medic flows in the same app or split driver/mechanic builds.
- Add EAS build profile and pilot installation notes.
- Add UI pass for Russian texts, empty states, offline banners, and sync status indicators.
