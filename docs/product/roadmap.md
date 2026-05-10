# Roadmap

Updated: 2026-05-10. Replaces previous version.

The free-box (no paid integrations required) is feature-complete after waves W1–W6. See [wave-summary.md](../operations/wave-summary.md).

## Where we are now

- **End-to-end chain works** in code: order → trip → inspections → release → delivery → document return → billing.
- **Mocks** for every paid integration: Wialon, ETRN-operator, EDI, fuel cards, ГИБДД, DaData, geo. See [integrations-status.md](../operations/integrations-status.md).
- **Test coverage**: 42 unit tests on RBAC + utils. End-to-end Playwright tests are missing.
- **CI**: typecheck, lint, audit, drizzle drift, vitest. No e2e gate.
- **Pilot blockers**: see Phase 1 below.

## Phase 1 — Pilot stabilization (4–6 weeks)

The free-box is feature-complete but not yet pilot-grade. Before showing to a real customer:

### 1.1 Tests

- Add Playwright E2E for the happy path: login → create order → assign trip → run inspections → start trip → simulate GPS → temperature breach → delivery confirmation → complete trip → invoice draft → bulk invoice → 1С export. Block PRs on this in CI.
- Cover bizlogic with unit tests: `tarification.service`, `eta.service`, `cold-chain/service`, `edi/service`, `rto/service`, `auto-billing` flow. Goal: 60% coverage on `apps/api/src/modules/`.
- Add web component tests for critical flows (CreateOrderModal, AssignmentPanel, TemperaturePanel).

### 1.2 Observability

- Replace remaining `console.log` calls (~219 across the repo) with `pino` `app.log` / `request.log`. Where Fastify instance is unavailable (workers, redis init, queues) — refactor to accept a `logger` parameter.
- Add structured request-id propagation through BullMQ jobs.
- Add basic Prometheus metrics endpoint (request count, duration histogram, active trips, breach incidents).
- Send fatal errors to a self-hosted error sink (Glitchtip / Sentry-OSS) — paid Sentry not required.

### 1.3 Migration & schema cleanup

- Resolve the 0005 gap (verified harmless in audit but document or backfill).
- Drop the duplicate index that 0008 dropped — investigate root cause to prevent recurrence.
- Add CASCADE policy review across all FKs.
- Set up `drizzle-kit check` blocking in CI.

### 1.4 Auth / security gaps

- Cache `/auth/me` in Next.js middleware via JWT verify with `jose` in edge — current per-request fetch will not scale.
- Sweep ~474 `as any` casts; add proper types where reasonable.
- Add CSP headers for the Swagger UI route specifically.
- Document `ALLOW_DEMO_SEED` and other env safeguards in `docs/operations/security.md`.

### 1.5 Smoke evidence

- Run the full smoke checklist from `free-box-checklist.md` on a staging deployment.
- Capture browser screenshots and mobile screenshots for each step.
- File output as `docs/operations/smoke-evidence-<YYYY-MM-DD>.md`.

**Phase 1 deliverable:** A stable free-box deployment validated with E2E tests, observability dashboards, and smoke evidence pack.

## Phase 2 — First paid integrations (8–12 weeks)

Convert the most-requested mocks to real providers. Order matches `integrations-status.md` priority.

### 2.1 Signature provider abstraction (3 weeks)

- Create `apps/api/src/modules/trips/signature-provider.ts` mirroring `etrn-provider.ts`.
- Implement four adapters: `GosklyuchProvider`, `KonturSignProvider`, `SbisSignProvider`, `CadesPluginProvider`.
- Add UI selector at every signature point: delivery confirmation (mobile), inspection sign-off (web + mobile), finance act / invoice approval (web).
- **Without signatures, no document closes legally** — this is gate 1.

### 2.2 DaData live (3 days)

- Replace `dadata.mock.ts` with real client.
- Redis cache by ИНН / address hash, TTL 24 h.
- ФИАС / ФНС XML fallback when quota exhausted.

### 2.3 Diadoc adapter — both EDI and ETrN (4 weeks)

- `DiadocEdiAdapter` (replaces stub state machine in W5).
- `DiadocEtrnProviderAdapter` (replaces `InternalMockEtrnProviderAdapter`).
- Token-based API auth UI (we are NOT using OAuth despite some Контур docs calling it that).
- Sandbox accreditation → ФНС accreditation → production switch.

### 2.4 Tachograph DDD upload (3 days)

- `POST /api/drivers/:id/upload-tachogram` accepting `.DDD` / `.ESM`.
- Open-source parser to extract driving / rest periods.
- Insert into `tachograph_records`.
- Without this the W3 РТО aggregation runs on synthetic data, useless for compliance.

### 2.5 Wialon live (2 weeks)

- `WialonClient` against Wialon Remote API.
- UI in onboarding wizard: enter API token + map Wialon objects → our vehicles.
- Manual matching wizard for ~30 vehicles is mandatory (object naming varies wildly per reseller).

### 2.6 1С CommerceML two-way (1 week)

- Extend XML export to full CommerceML 2.x.
- Add CommerceML import endpoint for receiving payment confirmations from 1С back to TMS.
- Validate against 1С-Bukh 8.3 (test with customer's actual 1С version before claiming compatibility).

**Phase 2 deliverable:** First paid release. The system can be deployed for a real customer with Контур.Диадок + Контур.Подпись + Wialon + 1С.

## Phase 3 — Self-serve onboarding (6–8 weeks)

Make new customers able to sign up and configure the system without engineering involvement.

### 3.1 Sign-up flow

- New `/signup` page (currently only `/login` exists).
- Email + OTP verification (use Mail.ru for Business or Unisender Free for low volume).
- 6-step wizard: company INN → profile from DaData → operator selection → signature method → telematics → invitation links for first users.

### 3.2 Integrations cabinet

- New `/admin/integrations` page showing status of every provider connection (DaData, EDI operator, signature method, telematics, fuel cards).
- Reconnect / re-auth buttons.
- Webhook health checks.

### 3.3 Onboarding scenarios

- Implement four packaged scenarios: «Малый перевозчик», «Средняя компания (Контур)», «Средняя компания (СБИС)», «Крупная — on-prem».
- Each scenario pre-fills a sensible default for every operator slot. Customer can override.

### 3.4 Bulk import flows

- Diadoc contractor import (with rate-limit handling).
- Wialon vehicle import (with manual matching wizard).
- Excel templates for orders / contractors / drivers.

### 3.5 Tutorial / first-run experience

- In-app tour for the dispatcher / logist roles.
- Sample order with synthetic data after first login.
- Help links to `free-box-checklist.md` translated as user-facing docs.

**Phase 3 deliverable:** A new customer can sign up and process their first real trip end-to-end in under 2 hours without our engineering help.

## Phase 4 — Compliance breadth (8–12 weeks)

Close РФ-specific compliance gaps that block specific verticals.

### 4.1 Marking «Честный знак» (3 weeks)

- ЦРПТ API integration: product code verification per shipment.
- New tables: `marked_products`, `shipment_marking`.
- UI on shipment for entering / scanning product codes.
- Required for: dairy, footwear, tobacco, clothing, perfume, medicine, tires, water.

### 4.2 ОСАГО / страхование грузов (3 weeks)

- РСА-AIS check for ОСАГО expiry per vehicle (monthly cron).
- Cargo insurance policy management per shipment for cargo > X RUB.
- Alert when any policy expires in <30 days.

### 4.3 ADR depth (1 week)

- W5 added basic ADR fields and warn-only validation. Now: harden to blocking validation in dispatcher when vehicle / driver lack ADR equipment / certificate.
- Add ADR-specific PDF stamps on transport documents.
- Permit management for hazmat routes.

### 4.4 Additional EDI operators (4 weeks)

- `SbisEdiAdapter` + `SbisEtrnProviderAdapter`.
- `KonturEdiAdapter` (Diadoc is Контур; «Контур.ЭДО» is a different product also worth supporting).
- Roaming between operators.

**Phase 4 deliverable:** TMS supports any cargo category and any major Russian EDI operator.

## Phase 5 — Monetization (6–10 weeks)

Free-box stays free. Paid tiers gate paid integrations and enterprise features.

### 5.1 Pricing model

Decide pricing dimension: per-vehicle / per-trip / per-organization. Dimensions interact with marketing positioning — see `docs/product/positioning.md`.

### 5.2 Billing module

- Subscription state machine: trial → active → past-due → suspended.
- Russian payment gateways: ЮKassa (most common), Тинькофф, CloudPayments. Stripe does not work reliably for РФ since 2022.
- Invoice generation for the customer (we use the same invoice tables we built for our customers' use cases).
- Fiscalization through ОФД (Russian 54-ФЗ requirement).

### 5.3 Paywall enforcement

- Feature flags per plan: which integrations are available, how many vehicles, etc.
- Soft block (banner + CTA) for first 7 days after limit hit.
- Hard block on day 8.

### 5.4 Self-serve plan upgrade / downgrade

- Customer-facing billing page.
- Pro-rata calculations.
- Receipt history.

**Phase 5 deliverable:** First revenue.

## Phase 6 — Operational maturity (continuous)

After product-market fit signals from Phase 5:

- Multi-region deployment (Москва + Новосибирск minimum).
- Read replicas for analytics queries.
- Background job sharding by tenant.
- Audit log retention policy (archive ≥ 5 years per ETRN regulations).
- SOC 2 / ISO 27001 prep (only if enterprise customers ask).
- 24/7 on-call rotation.

## Out of scope

These are explicitly NOT in the roadmap unless a customer asks:

- International freight (CMR / customs).
- Yard / warehouse management.
- Tendering / freight marketplace integrations.
- ML-driven route optimization (TSP / VRP solvers).
- Real-time IoT cargo tracking beyond the existing temperature-readings hook.
- Mobile native iOS / Android (we stay on Expo).

## Reality-check on timelines

**Common mistake:** "this provider integration is 3–5 days." It is not. Real provider integrations take 2–3 weeks of calendar time minimum because:

- Sandbox access requires signed contracts (5–10 business days).
- Real testing needs production-grade test contractors with both sides accredited.
- Edge cases (rejections, retries, race conditions) need actual production traffic to discover.
- ФНС accreditation for ETRN production access can take a month.

The phase estimates above use this calibration. If someone proposes a faster timeline for a paid integration, ask them to show their last successful integration with proof — not just unit tests, but a signed real-world document.

## Mock vs real on launch day

It's fine to ship to the first customer with mocks for everything except: signature, ETRN-operator, DaData. Other mocks (Wialon, fuel cards, ГИБДД, geocoding) can be progressively replaced as customer demand surfaces. Free-box is the floor, not the ceiling.

## Linked documents

- [wave-summary.md](../operations/wave-summary.md) — what was built in waves W1–W6.
- [integrations-status.md](../operations/integrations-status.md) — mock → real provider mapping.
- [free-box-checklist.md](../operations/free-box-checklist.md) — feature checklist organized by chain step.
- [audit-2026-05-10.md](../operations/audit-2026-05-10.md) — pre-wave audit findings and fix status.
- [positioning.md](positioning.md) — market positioning (informs Phase 5 pricing).
- [russian-transport-edge-cases.md](russian-transport-edge-cases.md) — domain-specific edge cases that influenced Phase 4.
