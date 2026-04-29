# Mobile Pilot Evidence Runbook

Updated: 2026-04-29

This runbook prepares the mandatory mobile pilot gate without assuming that Android Studio, an emulator, or a device is already available. Do not skip the device/emulator UI evidence: `scripts/mobile-smoke.ps1` proves the API contract, but it does not prove camera, signature canvas, SecureStore, WatermelonDB, Expo runtime, or LAN networking.

## Scope

Use this for the v2 mobile driver flow in:

```text
D:\Ai\TMS-prod\apps\mobile
```

The app entrypoint is:

```text
apps/mobile/index.ts -> apps/mobile/App.tsx -> src/navigation/AppNavigator.tsx
```

## Prerequisites

- Backend stack is running from `D:\Ai\TMS-prod`.
- `docker-compose.prod.yml` exposes nginx on host port `80`.
- `.env` exists and contains `SEED_PASSWORD`.
- Mobile dependencies are installed.
- Android device or Android emulator is available and can reach the workstation over the network.
- Device/emulator camera permission prompts can be accepted during the run.
- The pilot operator knows the exact API URL used by the app and records it in the evidence.

Do not paste `SEED_PASSWORD` into screenshots, docs, commits, tickets, or chat. The pilot login uses the seeded password from `.env`, but the evidence should only say that the password came from `SEED_PASSWORD`.

## Readiness Helper

Run the helper first. It prints local readiness, LAN URL candidates, and whether the credential source exists. It intentionally does not print secrets.

```powershell
cd D:\Ai\TMS-prod
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\mobile-pilot-readiness.ps1
```

Expected readiness:

- `.env` exists.
- `SEED_PASSWORD` is present, value hidden.
- `scripts\mobile-smoke.ps1` exists.
- `apps\mobile\package.json` exists.
- `http://localhost/api/health` returns HTTP 2xx when the stack is up.
- At least one LAN URL candidate is printed, usually `http://<host-lan-ip>/api`.

If no LAN IP is printed, run `ipconfig` and use the IPv4 address for the active Wi-Fi/Ethernet adapter.

## Prepare API Data

Before launching the app, run the API-level mobile smoke once. This creates/refreshes the idempotent driver trip `MOB-SMOKE-DRIVER1` and verifies login, sync pull, checkpoint event push, and completion event push.

```powershell
cd D:\Ai\TMS-prod
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\mobile-smoke.ps1 -BaseUrl http://localhost/api
```

Expected result:

- `login: ok`
- `me: ok`
- `hasDriverId: true`
- `syncPull: ok`
- `pulledTrips` is at least `1`
- `pulledRoutePoints` is at least `1`
- `checkpointPush: ok`
- `tripCompletionPush: ok`

If the smoke fails, stop and fix the backend/test data before collecting UI evidence.

## LAN API URL

Physical Android devices cannot use the workstation's `localhost`. Use the workstation LAN URL:

```text
http://<host-lan-ip>/api
```

For this compose stack, prefer nginx on port `80`, not the internal API container port:

```text
EXPO_PUBLIC_API_URL=http://<host-lan-ip>/api
```

Android emulator fallback, only if the LAN URL cannot reach the host from the emulator:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2/api
```

Record the exact URL used in the evidence. Do not claim physical-device coverage if the run was emulator-only.

## Start Mobile App

In a PowerShell session:

```powershell
cd D:\Ai\TMS-prod
$env:EXPO_PUBLIC_API_URL = "http://<host-lan-ip>/api"
corepack pnpm --filter @tms/mobile start
```

Then open the Expo app on the Android device/emulator. If the environment is already configured for direct Android launch, this is also acceptable:

```powershell
cd D:\Ai\TMS-prod
$env:EXPO_PUBLIC_API_URL = "http://<host-lan-ip>/api"
corepack pnpm --filter @tms/mobile android
```

Do not spend time trying to install or fix Android tooling as part of this runbook task. If Android tooling is missing, record the blocker and stop before the pilot gate is marked complete.

## Login

Use:

```text
Email: driver1@tms.local
Password: value of SEED_PASSWORD from D:\Ai\TMS-prod\.env
```

Expected evidence:

- Screenshot `01-login-screen.png`: login screen before submit. Password field must be empty or obscured.
- Screenshot `02-trip-list.png`: successful login and non-empty trip list.
- Note the API URL used by `EXPO_PUBLIC_API_URL`.

## Evidence Scenarios

### 1. Trip List

Steps:

1. Login as `driver1@tms.local`.
2. Wait for sync after login.
3. Open the driver trip list.
4. Select the prepared trip if present.

Expected screenshots/checks:

- `02-trip-list.png`: trip list is visible.
- `03-trip-details.png`: trip detail opens.
- Trip detail shows route points.
- If blockers/warnings exist, the cockpit/blocker card is visible.
- If offline queue has entries, the offline queue badge is visible.

### 2. Checkpoint Photo And Signature

Steps:

1. From trip details, open a pending route point.
2. Enter a short note.
3. Tap the photo/signature action.
4. Allow camera permission if prompted.
5. Capture a test photo.
6. Draw a signature and save.

Expected screenshots/checks:

- `04-checkpoint-form.png`: checkpoint form with notes.
- `05-camera-permission-or-camera.png`: permission prompt or camera view.
- `06-signature.png`: signature canvas before save.
- `07-checkpoint-success.png`: success/offline queued confirmation.
- Route point completion is accepted online or queued offline.

### 3. Offline And Sync Replay

Steps:

1. Open a prepared trip while online.
2. Disable network for the device/emulator.
3. Complete a checkpoint or trip completion action.
4. Confirm the app shows an offline queued/saved message.
5. Return to trip details and verify the offline queue badge increments.
6. Re-enable network.
7. Wait for auto replay when connectivity returns.
8. Refresh/reopen trip details.

Expected screenshots/checks:

- `08-offline-before-action.png`: device network disabled or app unable to reach API.
- `09-offline-queued.png`: offline saved/queued confirmation.
- `10-offline-badge.png`: trip detail shows offline queue count.
- `11-replay-after-network.png`: queue drains or server state reflects replay.

Checkpoint replay uses `/sync/events` event type `route_point_completed`. Completion replay uses `/sync/events` event type `trip_status_changed`.

### 4. Trip Completion

Steps:

1. From trip details, tap complete trip.
2. If blockers are shown, capture the blocker prompt/card and continue only for pilot evidence.
3. Enter odometer and fuel values.
4. Submit completion online.
5. Repeat once offline if offline replay was not already captured through checkpoint.

Expected screenshots/checks:

- `12-completion-form.png`: odometer and fuel fields visible.
- `13-completion-success.png`: success or offline queued message.
- `14-trip-list-after-completion.png`: completed trip is no longer shown in active list, or backend evidence shows completed status.

## Evidence Checklist

Save the evidence summary as a markdown file under `docs/operations/`, for example:

```text
docs/operations/mobile-pilot-evidence-YYYY-MM-DD.md
```

Minimum checklist:

- Date, tester, device/emulator model, Android version.
- Exact `EXPO_PUBLIC_API_URL`.
- Backend stack identifier or commit SHA.
- `scripts/mobile-pilot-readiness.ps1` output summary with secrets omitted.
- `scripts/mobile-smoke.ps1` result summary.
- Login screenshot.
- Trip list screenshot.
- Trip details screenshot with route points.
- Trip blocker/cockpit screenshot if blockers are present.
- Checkpoint form screenshot.
- Camera permission/camera screenshot.
- Signature screenshot.
- Checkpoint success or offline queued screenshot.
- Offline queue badge screenshot.
- Replay-after-network screenshot or backend confirmation.
- Completion form screenshot.
- Completion success/offline queued screenshot.
- Notes for any failures, skipped steps, or environment blockers.

## Pass Criteria

The mobile pilot gate can pass only when:

- API smoke passes.
- The app runs on Android device or emulator against a non-localhost API URL reachable from Android.
- Login works for `driver1@tms.local`.
- Trip list and trip detail load from sync data.
- Checkpoint photo/signature flow is captured.
- Offline queue and replay are captured for checkpoint or completion, preferably both.
- Trip completion flow is captured.
- Remaining issues are documented and do not block the agreed pilot scope.

If any item depends on unavailable Android tooling, mark the gate blocked rather than passing it on API smoke alone.
