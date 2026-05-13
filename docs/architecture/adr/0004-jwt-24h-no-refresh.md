# ADR-0004: 24-hour JWT with no refresh / revocation (pilot-stage decision)

- **Status:** Accepted (with planned upgrade path)
- **Date:** 2026-02-20
- **Deciders:** TMS core team

## Context

Auth needed to ship for the pilot. The choices for session/auth shape are well-known:

1. Long-lived JWT (e.g. 24h) with no refresh + no revocation list.
2. Short access JWT (~15 min) + long refresh token + Redis-backed revocation.
3. Server-side sessions (no JWT) keyed by an opaque cookie.

Option 2 is the "right" answer for production-grade SaaS. The cost is: refresh-token table, rotation logic, blacklist on logout, revoke-all-sessions endpoint, mobile/web token-refresh middleware, plus the test surface area for all of it. Roughly a day of careful work.

The pilot's threat model is benign: small known user base, no high-value transactions through the API, low likelihood of a stolen token going undetected for 24 h. The opportunity cost of doing refresh now is one less domain feature shipped this sprint.

## Decision

Single JWT, signed with `JWT_SECRET` (HS256), 24-hour lifetime. Stored in an `httpOnly` cookie (`tms_token`) for web; passed as `Authorization: Bearer …` for mobile.

`JWT_SECRET` is **mandatory** at startup — no fallback. Server refuses to boot without it.

No refresh token. No revocation. Logout clears the cookie client-side; the JWT remains technically valid until its `exp` claim. Password change does **not** invalidate existing tokens — accepted risk for pilot.

## Consequences

**Positive**
- Trivial to implement, verify, debug.
- One round-trip auth, no Redis dependency on the hot path.
- No "expired refresh" UX edge cases.

**Negative**
- A stolen token is valid for up to 24 h. We have no way to revoke it short of rotating `JWT_SECRET` (which logs everyone out).
- Password-change → still-valid-token gap. If a user changes their password because they suspect compromise, the attacker keeps access until the token expires.
- "Log out all sessions" is impossible without secret rotation.

**Neutral**
- Acceptable for pilot scale; documented in audit as P2 (not blocking launch).

## Upgrade path (when to revisit)

Trigger for moving to refresh+revocation:

- We sell to a customer with a stricter security posture (anything healthcare-, finance-, or government-adjacent).
- We onboard > 100 active users — the blast radius of one stolen token grows.
- We add high-value mutations (payments, signing legally-binding docs) where a 24 h window of unauthorized access has real money cost.

Implementation sketch:

1. Add `refresh_tokens` table (`token_hash`, `user_id`, `org_id`, `expires_at`, `revoked_at`).
2. `/auth/login` returns access (15 min) + refresh (30 d) tokens; refresh stored as httpOnly cookie with `Path=/auth/refresh`.
3. `/auth/refresh` rotates the refresh token (one-time-use) and issues a new access.
4. Redis `SET jwt:revoked:<jti> EX 900` on logout/password-change; verify-token middleware checks this set.
5. `/auth/logout-all` revokes every refresh row for the user.

## References

- Code: `apps/api/src/auth/auth.ts` (constants at top)
- Audit: P2 note in `docs/operations/audit-2026-05-12-deep.md`
- Related: ADR-0002 (also fail-fast on a missing secret)
