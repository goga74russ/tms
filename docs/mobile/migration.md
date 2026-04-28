# Mobile Migration

Updated: 2026-04-28

## Current State

The mobile app has been copied into the v2 workspace:

```text
D:\Ai\TMS-prod\apps\mobile
```

The archive source remains available for comparison:

```text
D:\Ai\TMS\apps\mobile
```

## Archived Mobile Capabilities

The archived app is an Expo / React Native app with:

- Expo Router entrypoint
- React Navigation
- auth context
- mobile login API
- trip list
- trip details
- checkpoint screen
- delivery confirmation screen
- trip completion screen
- mechanic inspection screen
- upload API
- sync API
- offline queue replay
- WatermelonDB local database models for trips, route points, and app events

## Migration Goal

Bring mobile into v2 as a first-class workspace package:

```text
apps/mobile
```

## Migration Steps

1. Copied `D:\Ai\TMS\apps\mobile` into `D:\Ai\TMS-prod\apps\mobile`.
2. Removed copied `node_modules` and local `.env` from the v2 copy; workspace-managed `node_modules` was recreated by `corepack pnpm install --offline`.
3. Added `.env.example`.
4. Update root workspace metadata if needed.
5. Verify package versions against the v2 lockfile.
6. Reinstall dependencies only after reviewing lockfile impact.
7. Verify TypeScript with `pnpm --filter @tms/mobile typecheck`.
8. Verify API compatibility:
   - `/api/auth/mobile/login`
   - `/api/auth/me`
   - trip list and details
   - checkpoints
   - delivery confirmation
   - inspections
   - uploads
   - sync/offline replay
9. Decide release scope:
   - pilot-only mobile app
   - production mobile app
   - compliance-driver app for EPD/ETRN documents

## Open Questions

- Does v2 mobile need offline document access for EPD/ETRN QR checks?
- Should mobile use the existing driver role only, or also support mechanic, medic, and recipient flows?
- Should signatures be implemented inside the app or delegated to an operator/Goskey flow?

