# Security

Updated: 2026-04-28

> **NOTE:** This snapshot dates from 2026-04-28. Most P0/P1 items called out here are now closed — see the deep audit [`docs/operations/audit-2026-05-12-deep.md`](audit-2026-05-12-deep.md) for the current security posture (ЮKassa HMAC, credentials-key fail-fast, CSPRNG IDs, error-handler hardening, Pino redact, etc.).

## Current Security Posture

Existing security foundation:

- JWT auth.
- httpOnly cookie for web.
- bearer token contract for mobile.
- RBAC roles.
- multi-organization scope on key entities.
- centralized entity access guards for important routes.
- login rate limiting.
- production API docs disabled by default.
- required env vars for critical secrets and infrastructure.

## P0 Cleanup

- Remove or quarantine bulk password reset scripts from production workspace.
- Fix user-facing mojibake in errors, logs, and API docs metadata.
- Verify all admin routes are organization-scoped where needed.
- Verify all create paths assign `organizationId` consistently.
- Verify all direct entity access paths call the appropriate guard.

## P1 Hardening

- Add security regression tests back into v2.
- Add audit log coverage for sensitive admin actions.
- Add provider callback verification before real EPD/ETRN integration.
- Add secret rotation notes.
- Add backup encryption and retention policy.

## P2 Enterprise Readiness

- Observability and alerting.
- SIEM-friendly structured logs.
- Role review and least-privilege policy.
- Tenant isolation evidence pack.
- Threat model for KEP/MChD/certificate handling.

