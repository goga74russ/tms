# ADR-0002: AES-256-GCM encryption for provider credentials with fail-fast `CREDENTIALS_KEY`

- **Status:** Accepted
- **Date:** 2026-04-30 (hardened during audit batch A-P0-2)
- **Deciders:** TMS core team

## Context

Provider integrations (Госключ signature, Diadoc EDI, Wialon telematics, ЦРПТ marking, ЮKassa payments, SMTP, ОФД) require per-organization credentials — API keys, OAuth tokens, certificates, secrets. These live in `integration_credentials.credentials` as encrypted blobs in Postgres.

The original implementation had a deterministic fallback key (`sha256("tms-dev-credentials-key")`) when `CREDENTIALS_KEY` was unset. That meant any operator with DB access plus public source code could decrypt every customer's provider credentials. Audit item A-P0-2.

Alternatives considered:

- **AWS KMS / GCP KMS** — Strong, audited, well-supported. Adds a hard cloud dependency, latency on every credential read, and a setup step for self-hosters. Deferred until customers demand it.
- **HashiCorp Vault** — Same trade-offs as KMS plus operating Vault itself. Overkill at pilot scale.
- **App-managed key with rotation hooks** — What we picked. Cheap, fast, no external dependency, upgradeable later by re-encrypting under a new key.

## Decision

Credentials are encrypted with AES-256-GCM using a key derived from the `CREDENTIALS_KEY` env var. The packed blob is `base64(iv || tag || ciphertext)` where `iv` is 12 bytes (GCM standard) and `tag` is 16 bytes.

The key must be 32 bytes — either 64 hex chars or 44 base64 chars. Anything else is rejected at startup with a clear error pointing to `openssl rand -hex 32`.

In production (`NODE_ENV=production`) we **fail fast** if `CREDENTIALS_KEY` is unset. In development we warn loudly and use a dev-only deterministic key clearly named `…-DO-NOT-USE-IN-PROD`.

## Consequences

**Positive**
- All at-rest credentials are confidential against a DB-only breach.
- No external dependency — works for self-hosters out of the box.
- Authenticated encryption (GCM) gives tamper detection for free.
- Migration path to KMS is clear: change `getKey()` to fetch from KMS, re-encrypt rows lazily on next read.

**Negative**
- Key is held in process memory and in the deployment's env-var store (Docker secrets, systemd, etc.). A memory dump of the API container exposes it.
- Key rotation is manual: rotate `CREDENTIALS_KEY`, re-encrypt every row, then deploy. No KMS-style automatic rotation. Acceptable while we have low credential count.

**Neutral**
- The credentials cache (`providers/credentials-cache.test.ts`) holds decrypted credentials briefly in RAM with a TTL — same threat model as the key itself.

## References

- Code: `apps/api/src/providers/base.ts` (lines 51–118)
- Migration: `apps/api/drizzle/0021_provider_framework.sql`
- Audit: A-P0-2 (`docs/operations/audit-2026-05-12-deep.md`)
- Related: ADR-0005 (provider registry consumes these decrypted creds)
