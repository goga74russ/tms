# Roadmap

Updated: 2026-05-12. Replaces 2026-05-10 version.

The free-box (no paid integrations required) is feature-complete after waves W1–W6. Phase 1 (Pilot stabilization) and Phase 7 (AI co-pilot MVP) are substantially complete after Rounds 1–7. See [wave-summary.md](../operations/wave-summary.md).

## Where we are now

- **End-to-end chain works** in code: order → trip → inspections → release → delivery → document return → billing. Verified by `scripts/smoke-chain.mjs`.
- **Mocks** for every paid integration: Wialon, ETRN-operator, EDI, fuel cards, ГИБДД, DaData, geo, signatures, marking, OSAGO, OFD. See [integrations-status.md](../operations/integrations-status.md).
- **Test coverage**: **140/140 unit tests** across RBAC, utils, finance.service, eta.service, cold-chain, rto, scoring, ddd-parser, billing, import, inspections/service. Playwright happy-path scaffold (`apps/web/tests/e2e/happy-path.spec.ts`) — 4 tests, advisory in CI until DB env wired.
- **CI**: typecheck, lint, audit, drizzle drift, vitest blocking. Playwright job advisory.
- **Web**: 47+ pages on a unified design system (14 UI primitives + DataTable + Cockpit v2).
- **Mobile**: 10 screens, visual redesign v2 на theme tokens + 8 UI components.
- **Self-serve signup + 6-step onboarding wizard** + admin/integrations cabinet live.
- **Monetization**: plans/subscriptions/payments/usage_counters + plan-guard wired + ЮKassa webhook.
- **AI co-pilot**: MVP (10 tools + SSE + mock fallback) on dispatcher page + floating FAB.

## Now → Pilot launch

Concrete checklist before opening to beta-signups:

- [ ] Реальные ключи провайдеров: `ANTHROPIC_API_KEY` (AI co-pilot), `YOOKASSA_*` (payments + webhook secret), `DADATA_TOKEN`, минимум один EDI оператор (Диадок sandbox → production).
- [ ] Юр-лицо для расчётов: ОГРН/ИНН/КПП заполнены в env + договор с ОФД-провайдером (Платформа ОФД / Такском-Касса).
- [ ] Legal-review всех 3 documents в `docs/legal/` (privacy/terms/personal-data) — снять ПРОЕКТ banner.
- [ ] Прогон `scripts/smoke-chain.mjs` на staging deployment (postgres + redis + minio + api + web + nginx). Capture artifact в `docs/operations/smoke-evidence-<YYYY-MM-DD>.md`.
- [ ] Playwright happy-path с реальной БД — снять `continue-on-error: true` в p0-gate.yml.
- [ ] Sentry / Glitchtip / self-hosted error sink wired (A-2 в audit).
- [ ] MOCK_MODE env-gate на всех `*.mock.ts` импортах (A-4 в audit).
- [ ] Беta-signup форма на landing → отправляет в внутреннюю очередь (manual approval).
- [ ] Roll-back evidence — миграционный downgrade или snapshot strategy задокументирован.

ETA: 2–3 недели реальной работы с человеком на провайдер-аккредитациях.

## Phase 1 — Pilot stabilization — substantially DONE

Сделано (Round 1 + Round 3):

- E2E Playwright scaffold (`apps/web/playwright.config.ts` + happy-path.spec.ts).
- 60% coverage цель на `apps/api/src/modules/` — частично закрыто: finance/eta/cold-chain/rto/scoring/ddd-parser/billing/import тесты добавлены. Tarification и edi сервисы остаются без тестов.
- Pino logger plumbing — 4 worker + redis + queue setup.
- 0005 migration gap — investigated, документировано как harmless (см. `migration-investigation-2026-05-12.md`).
- 0008 — investigated, не drift.
- `drizzle-kit check` уже blocking в CI.
- Edge JWT verify в `apps/web/src/middleware.ts`.
- Helmet CSP locked down + Swagger carve-out.

Осталось (низкий приоритет):

- Tarification + EDI service тесты для покрытия edi-state-machine.
- Prometheus metrics endpoint.
- Error sink (Glitchtip / Sentry-OSS).
- Smoke evidence pack от реального deployment.

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

## Phase 7 — AI dispatcher co-pilot

### MVP — DONE (Round 1, commit `282cc2a`)

- 10 tool-функций wrapping existing services (list_active_trips, get_trip_details, get_driver_hos_status, list_trips_at_risk, get_temperature_breaches, compute_trip_cost, propose_reassignment, list_pending_invoices, get_monthly_margin, track_contractor_orders).
- Russian system prompt с safety rules.
- Anthropic SDK с mock-fallback когда ключ отсутствует.
- `POST /api/copilot/chat` SSE streaming + conversation history.
- Per-org daily limit (`COPILOT_DAILY_LIMIT`, default 500).
- Web `CopilotChat.tsx` + floating `CopilotFab.tsx` (Cockpit v2).
- Plan-guard gated on `ai_copilot` feature (Round 3).

### Production polish — pending

- `ANTHROPIC_API_KEY` provisioning + payment routing через юр-лицо в другой юрисдикции (export restrictions для РФ).
- Расширение от 10 → 30 tools для Top-10 demo scenarios.
- Cost dashboards (per-org daily $$, per-query tokens).
- Hallucination tests на deliberate edge cases.
- YandexGPT-5 / GigaChat-MAX alternative deployment для customer'ов из реестра отечественного ПО.

### Why this is feasible right now (2026)

The "wow" feature for monetization. The dispatcher is the most loaded role in any transport company — 30–50 orders/day, 10–30 active trips, constant phone calls. Russian TMS competitors (1С, АТИ, TopLog, Топлог) are all CRUD interfaces with filters. None offer a natural-language co-pilot. Window of differentiation: ~12–18 months before they catch up.

- LLM function calling is production-grade (Claude / GPT / Gemini all reliable).
- Russian language quality near parity with English in modern frontier models.
- All required data is already exposed via our 200+ API endpoints from W1–W6.
- Mocks vs real providers irrelevant — co-pilot works on either.
- Cost: Claude Haiku 4.5 at ~$1/M input + $5/M output. A typical query (5 K in + 500 out) ≈ $0.008. 100 queries/day per dispatcher ≈ ~25 USD/mo. Easily covered by paid-tier subscription.

### Top demo scenarios (build in this order)

1. **«Какие рейсы под риском опоздания?»** — model fetches `in_transit` trips, compares ETA to window-end, returns ranked list with reasons (traffic / loading delay / driver issue) and inline action buttons (notify client, extend window).
2. **«У водителя X завтра превышение РТО — переназначь»** — checks `hos-status`, identifies conflicting trips, proposes reassignment to a driver with lower weekly hours and matching cargo / ADR compatibility, explains tradeoffs.
3. **«Где сейчас груз клиента Y?»** — finds active trips for the contractor, returns last GPS position, ETA, current route point status.
4. **«Сколько стоит рейс Москва→Воронеж по нашему среднему?»** — calls `tarification.service` with current tariff, shows breakdown.
5. **«Покажи маржу за неделю»** — generates a chart inline from finance data, top / bottom orders.
6. **«Создай заказ для нового клиента ИНН ...»** — DaData lookup → contractor draft → order template form pre-filled.
7. **«Распредели завтрашние 30 заказов между свободными машинами»** — multi-step plan: filter compatible vehicles, balance by HOS, propose assignments with explanations.
8. **«Что случилось с рейсом #1234?»** — reads full trip dossier, summarizes events timeline including incidents and breaches.
9. **«Сколько простоев в этом месяце и где?»** — aggregates downtime records, breaks down by reason / contractor / vehicle.
10. **«Уведоми клиента что рейс задерживается на час»** — drafts message text, asks for confirmation, sends via Telegram or e-mail.

### Technical scope

**Architecture:**
- New module `apps/api/src/modules/copilot/` with:
  - `tools/` — wrappers around our existing endpoints, defined as JSON schemas for LLM function calling (~30 tools for MVP)
  - `prompt.ts` — domain system prompt teaching the model about waybill/ETrN/HOS/cold chain semantics
  - `service.ts` — streaming chat orchestrator (LangChain or direct Anthropic SDK)
  - `routes.ts` — `POST /api/copilot/chat` (SSE stream), `GET /api/copilot/conversations`, `POST /api/copilot/feedback`
- New table `copilot_conversations` (id, user_id, organization_id, started_at, message_count) and `copilot_messages` (id, conversation_id, role, content, tool_calls, tool_results, created_at).
- Web: chat panel docked to right side of dispatcher dashboard, expandable to full screen. Streaming responses, tool-call visualization, click-to-execute action buttons.
- LLM choice: Claude Haiku 4.5 default (cost), Claude Sonnet 4.6 toggle for complex reasoning ("распредели 30 заказов"). Both via Anthropic SDK with prompt caching.

**Safety / quality:**
- All write operations require explicit confirmation button (model never silently mutates state).
- Tool call results validated against Zod schemas before returning to model.
- Hallucination guard: model is instructed to say "не нашёл данных" rather than invent. Critical for legal / financial answers.
- Audit log of every chat / tool call linked to user_id for compliance review.
- Per-organization rate limit (default 500 messages/day on paid tier, 50 on trial).

**Effort breakdown:**
- Week 1: 30 tool definitions + system prompt + token-counting + cost dashboards.
- Week 2: Chat UI on dispatcher page with streaming, tool-call rendering, action confirmation.
- Week 3: Top-10 scenarios QA, prompt iteration, hallucination tests with deliberate edge cases.
- Week 4: Polish, conversation history, feedback widget, kill-switch flag, paid-tier gating.

### Monetization hook

- **Free tier:** co-pilot disabled, banner "Включить ИИ-копилота за 2 990 ₽/мес".
- **Paid tier:** unlimited within 500 messages/day soft limit.
- **Enterprise tier:** dedicated rate limit, custom system prompt with company terminology, audit log export.

This is the natural upsell path: dispatcher uses free-box for two months, gets buried in spreadsheets, sees the co-pilot ad once a week, eventually upgrades. **Free-box stays free; co-pilot is the first thing worth paying for.**

### Risks

- **LLM provider dependency:** Anthropic / OpenAI export restrictions to РФ — payment routing through legal entity in another jurisdiction is required. Already a known constraint for any modern SaaS in РФ.
- **Hallucinations on legal questions:** mitigated by tool-only architecture (model can only return data we showed it) and explicit "не уверен" instruction in prompt.
- **Russian IT-sanctions registry compatibility:** if registered in реестр отечественного ПО is required for state customers, AI co-pilot using foreign LLM may disqualify. Mitigation: offer alternative deployment with YandexGPT-5 or GigaChat-MAX (both API-compatible function calling).
- **Adoption:** dispatchers may resist AI initially. Mitigation: keep all CRUD UIs intact, co-pilot is additive not replacement.

**Phase 7 deliverable:** Paid-tier killer feature live. Demo answers user's question in <2 seconds. First 100 paid customers self-serve.

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
