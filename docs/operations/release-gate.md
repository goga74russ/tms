# Release Gate

Updated: 2026-04-29

## Required Before A v2 Release Candidate

- API build passes.
- Web build passes.
- Shared package build passes when contracts change.
- Relevant API regression tests pass.
- GitHub Actions P0 gate passes on the target branch.
- Web smoke passes for the main roles.
- UI workflow smoke passes for logist/trips/claims/finance/dispatcher pages and the close-gate/claims/exceptions APIs.
- New `/print/*` routes are included in UI workflow smoke before they are counted as done.
- Mobile smoke uses the same delivery/checkpoint/completion endpoints as the app, including `/sync/events` for driver checkpoint and completion events.
- Mobile pilot evidence runbook is current before mobile is included in a pilot build.
- Database migrations apply on a clean database.
- Database migrations apply on an upgraded database.
- `scripts/db-integrity-check.sql` has zero violations.
- `/api/health` returns OK.
- `/api/health/ready` returns OK.
- Demo/staging credentials are reset from `SEED_PASSWORD` before smoke checks.
- Backup exists before any migration.
- `scripts/backup-restore-drill.ps1` passes against a scratch database.
- `scripts/multi-tenant-smoke.ps1` passes.
- ETRN/provider changes include local mock/XSD fixture validation, or are explicitly marked operator-blocked.
- Rollback path is verified.

## Required Before Pilot

- Multi-organization access paths have explicit evidence.
- Login rate limiting and production API docs behavior are verified.
- Main operational flow is smoke-tested:
  - order
  - trip
  - waybill
  - inspections
  - release
  - delivery
  - documents
  - billing
- Mobile scope is decided and verified if included in pilot.
- If mobile is included, Android device/emulator test against LAN API URL is mandatory, with UI evidence for login, trip list, checkpoint photo/signature, offline/sync replay, and completion. Use `docs/mobile/pilot-evidence.md` as the runbook and checklist.

## Required Before Market-Ready

- Full external EPD/ETRN scope is either implemented or explicitly excluded from claims.
- Observability and alerting are configured.
- Support and incident response process exists.
- Customer-facing documentation exists.
- Demo environment and demo data are prepared.
