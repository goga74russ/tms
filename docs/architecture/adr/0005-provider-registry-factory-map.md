# ADR-0005: Provider registry as a `${type}:${name}` factory map with per-org instance cache

- **Status:** Accepted
- **Date:** 2026-04-22 (formalised during A-P0-4)
- **Deciders:** TMS core team

## Context

TMS integrates with several external provider domains: signature (Госключ), EDI (Diadoc), telematics (Wialon), marking (ЦРПТ), payments (ЮKassa), SMTP, fiscal (ОФД). Within each domain we may have multiple implementations — `mock` for testing, the real provider, and (eventually) competing real providers (e.g. `signature:gosklyuch` vs `signature:contour`).

Requirements:

1. Adapter selection per organization — Org A uses Wialon, Org B uses a mock during onboarding.
2. Adapter selection per environment — dev / staging routinely run on `mock:*`.
3. Cheap repeated lookups — the hot paths (telematics worker tick, EDI dispatch) resolve the adapter many times per second.
4. Invalidation when credentials change — if an org rotates its Wialon API key, the next request must use the new key, not a cached client built with the old one.

Alternatives considered:

- **DI container (tsyringe, Awilix)** — Overkill. The cardinality of provider types is tiny and known statically; DI adds a learning tax and a layer of indirection.
- **Class registry (`registerProvider(SignatureProvider, GosklyuchAdapter)`)** — Works, but the "which adapter for which org" runtime decision still needs a separate lookup. We'd end up writing the map by hand around the registry.

## Decision

A single in-memory factory map keyed by `${type}:${name}` strings — e.g. `signature:gosklyuch`, `edi:diadoc`, `telematics:mock`. Each value is a factory `(loadedCred: LoadedCredential) => ProviderAdapter`.

`selectAdapter(orgId, type)`:

1. Looks up the org's configured credential row for that provider type.
2. Resolves the factory by `${type}:${cred.providerName}`.
3. Returns a per-org instance from a TTL-keyed cache.

Cache invalidation:

- TTL on cache entries (cred rotation that we don't observe directly still gets picked up within the TTL window).
- Explicit invalidation hook fired by the credentials API when the credential row is updated — bypasses the TTL for immediate effect.

The map is constructed once at module load (`getDefaultRegistry()`) — adapters self-register by import side effect. Tests can substitute a registry per case.

## Consequences

**Positive**
- O(1) lookup, no reflection, no DI metadata.
- Adding a new adapter is one file + one registry entry.
- Per-org isolation falls out of the cache key.
- Test surface is tiny: `providers/registry.test.ts` exercises the map; `providers/credentials-cache.test.ts` exercises the TTL + invalidation.

**Negative**
- The map is shared across all routes in the same process. A misbehaving adapter (e.g. one that throws during construction) blocks every org that uses that `${type}:${name}` combo. Mitigated by health checks and the cache TTL retrying.
- Adding a brand-new provider *type* (not just a new name within an existing type) still requires updating `ProviderType` union — slight cross-cutting change. Acceptable.

**Neutral**
- Adapters get constructed lazily, on first use per org. First-request-after-cache-miss latency is one factory-call slower than subsequent requests.

## References

- Code: `apps/api/src/providers/index.ts` (registry construction, `selectAdapter`), `apps/api/src/providers/base.ts` (adapter interface)
- Tests: `apps/api/src/providers/registry.test.ts`, `apps/api/src/providers/credentials-cache.test.ts`
- Audit: A-P0-4 (`docs/operations/audit-2026-05-12-deep.md`)
- Related: ADR-0002 (credentials are decrypted before the factory sees them)
