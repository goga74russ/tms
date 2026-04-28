# Mobile Migration

Updated: 2026-04-28

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
- trip completion offline event capture
- delivery confirmation with recipient, photo, signature, online submit, and offline queue fallback
- mechanic inspection flow
- upload API integration
- WatermelonDB sync through `/api/sync/pull` and `/api/sync/events`
- offline queue replay when connectivity returns

## P1 Changes Applied

1. Switched mobile package entrypoint from `expo-router/entry` to `index.ts`.
2. Normalized backend `roles[]` into the mobile `role` field so mechanic/driver routing works.
3. Triggered WatermelonDB sync after login and after stored-token restoration.
4. Aligned trip status API client with backend `POST /trips/:id/status`.
5. Aligned checkpoint confirmation helper with backend `/sync/events` contract.
6. Added repeatable full mobile smoke script:

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
- `/api/sync/events` accepts `route_point_completed` and `trip_status_changed` events
- prepared smoke trip reaches `completed` and its route point reaches `completed`

## Remaining Mobile Debt

- Run the app on a real Android device or emulator against a LAN API URL.
- Add mobile UI evidence/screenshots for login, trip list, checkpoint, and completion.
- Decide whether mobile should keep mechanic/medic flows in the same app or split driver/mechanic builds.
- Add EAS build profile and pilot installation notes.
- Add UI pass for Russian texts, empty states, offline banners, and sync status indicators.
