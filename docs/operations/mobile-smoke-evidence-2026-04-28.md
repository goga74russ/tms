# Mobile Smoke Evidence - 2026-04-28

Scope: P1 mobile entrypoint and API-contract verification after moving mobile into v2.

## Code Changes Verified

| Area | Result |
| --- | --- |
| Entrypoint | `apps/mobile/package.json` now starts `index.ts` / `App.tsx` |
| Auth user shape | backend `roles[]` normalized for mobile `role` checks |
| Sync lifecycle | WatermelonDB sync starts after login and token restore |
| Trip status client | aligned with backend `POST /trips/:id/status` |
| Checkpoint helper | aligned with backend `/sync/events` contract |

## Static Checks

| Check | Result |
| --- | --- |
| `corepack pnpm --filter @tms/mobile typecheck` | passed |
| mobile mojibake scan | `files 0` |

## API Contract Smoke

Command:

```powershell
D:\Ai\TMS-prod\scripts\mobile-smoke.ps1
```

Result:

```json
{
  "login": "ok",
  "me": "ok",
  "email": "driver1@tms.local",
  "roles": "driver",
  "hasDriverId": true,
  "syncPull": "ok",
  "pulledTrips": 0,
  "pulledRoutePoints": 0
}
```

Note: `pulledTrips` and `pulledRoutePoints` are currently zero in the local seed state. The next mobile test debt is to seed or assign a real active trip to `driver1@tms.local` and verify non-empty sync plus push events.
