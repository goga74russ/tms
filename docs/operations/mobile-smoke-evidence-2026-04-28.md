# Mobile Smoke Evidence - 2026-04-28

Scope: P1 mobile entrypoint and API-contract verification after moving mobile into v2.

## Code Changes Verified

| Area | Result |
| --- | --- |
| Entrypoint | `apps/mobile/package.json` starts `index.ts` / `App.tsx` |
| Auth user shape | backend `roles[]` normalized for mobile `role` checks |
| Sync lifecycle | WatermelonDB sync starts after login and token restore |
| Trip status client | aligned with backend `POST /trips/:id/status` |
| Checkpoint helper | aligned with backend `/sync/events` contract |

## Static Checks

| Check | Result |
| --- | --- |
| `corepack pnpm --filter @tms/mobile typecheck` | passed |
| mobile mojibake scan | `files 0` |

## Full API Contract Smoke

Command:

```powershell
D:\Ai\TMS-prod\scripts\mobile-smoke.ps1
```

The script prepares an idempotent smoke trip `MOB-SMOKE-DRIVER1` for `driver1@tms.local`, then verifies login, profile hydration, non-empty sync pull, checkpoint push, and trip completion push.

Result:

```json
{
  "login": "ok",
  "me": "ok",
  "email": "driver1@tms.local",
  "roles": "driver",
  "hasDriverId": true,
  "syncPull": "ok",
  "pulledTrips": 1,
  "pulledRoutePoints": 1,
  "preparedTrip": "MOB-SMOKE-DRIVER1",
  "checkpointPush": "ok",
  "tripCompletionPush": "ok"
}
```

## Database Result

After the smoke run:

```json
{
  "tripNumber": "MOB-SMOKE-DRIVER1",
  "tripStatus": "completed",
  "routePointStatus": "completed",
  "odometerEnd": 100123,
  "fuelEnd": 42,
  "routePointPhotoCount": 1,
  "hasRoutePointSignature": true
}
```

## Remaining Mobile Debt

- Run the app on a real Android device or emulator against a LAN API URL.
- Add mobile UI evidence/screenshots for login, trip list, checkpoint, and completion.
- Decide whether mechanic/medic flows stay in this app or become separate builds.
- Add EAS build profile and pilot installation notes.
