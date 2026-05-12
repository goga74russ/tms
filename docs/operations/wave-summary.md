# Wave Implementation Summary

Updated: 2026-05-12. Branch: `claude/dazzling-robinson-91868a`. Commits: `53f5171` → `35a5fc5`.

Sections W1–W6 cover the initial free-box pass. Sections Round 1 onwards cover post-free-box deepening: AI co-pilot, monetization, compliance breadth, design system, lazyweb-driven redesigns.

Initial pass total (W1–W6): **7 commits, 90 files, +10 813 / −370 lines, 5 new migrations (0014–0018)**.

## Audit (commit `53f5171`)

Pre-wave hardening based on a full repo audit. See [audit-2026-05-10.md](audit-2026-05-10.md) for findings.

- Deleted `apps/api/reset-passwords.ts` (reset every user password to a hardcoded value).
- Gated `seed-demo.ts` super-user behind `NODE_ENV !== 'production' || ALLOW_DEMO_SEED=true`.
- Injected `request.orgId` in the `authenticate` decorator (defense-in-depth for multi-tenant org scope). Marked the dead `registerOrgMiddleware` as deprecated.
- Stripped UTF-8 BOM from `apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/api/src/db/schema.ts`, `.github/workflows/p0-gate.yml`.
- Extended P0 gate: `pnpm -r --if-present lint`, `pnpm audit --prod` (advisory), `drizzle-kit check` (advisory), blocking `pnpm test`.
- Added `apps/api/vitest.config.ts` and 42 unit tests (RBAC + utils).

## W1 — Close the chain (commit `ce09f84`)

Goal: dispatcher / mechanic / medic / accountant / driver can complete a full order → trip → invoice cycle through UI without manual API calls.

### API

- `POST /api/waybills/:id/sync-status` — recompute waybill status from inspections.
- Auto-call `syncWaybillStateForTrip` when `tech_inspections` or `med_inspections` are approved (`apps/api/src/modules/inspections/service.ts`).
- `POST /api/trips/:id/delivery-confirmation/v2` — driver signature + photo URLs + condition. Legacy v1 kept for back-compat.
- `GET / POST /api/trips/:id/document-returns` and `PUT /api/document-returns/:id` — registry of original document returns.
- `POST /api/trips/:id/start { odometerStart }` — guarded transition `waybill_issued → loading → in_transit`, records odometer.
- `POST /api/trips/:id/complete { odometerEnd, notes? }` — guarded transition to `completed` with all-points-done check.
- New PDF generators: `apps/api/src/modules/documents/{tech,med}-inspection-pdf.ts` + `GET /api/inspections/{tech,med}/:id/pdf`.

### Web

- `apps/web/src/app/trips/page.tsx` — Start/Complete trip dialogs with odometer entry.
- New `apps/web/src/app/trips/[id]/documents/page.tsx` — document-returns table (add / mark received / mark lost).
- `apps/web/src/app/{mechanic,medic}/page.tsx` — PDF act link (approve/reject deferred — needs a separate decision endpoint).
- Waybill row + detail: "Пересчитать статус" button.

### Mobile

- New `apps/mobile/src/screens/MyWaybillScreen.tsx` + `apps/mobile/src/api/waybills.ts`.
- TripDetailsScreen: Start / Complete trip with odometer modal.
- DeliveryConfirmationScreen: wired to `/v2` with cargo condition mapping.
- offlineQueue supports both legacy and v2 delivery payloads.
- TripListScreen: Active / Completed / All filter chips.

## W2 — Cold chain v0 (commit `cd81bbc`)

Goal: monitor cargo temperature against an SLA, detect breaches, surface alerts. Real sensor integration is paid → mocked.

### DB (`0014_cold_chain_v0.sql`)

- New `temperature_readings` (trip_id, recorded_at, temp_c, source ∈ {sensor, manual, mock}, breach, lat/lng, sensor_id) + indexes on `(trip_id, recorded_at desc)`.
- `orders.cold_chain_required`, `orders.temperature_min_c`, `orders.temperature_max_c`.
- `temperature_reading_source` enum.

### API (`apps/api/src/modules/cold-chain/`)

- `POST /api/trips/:id/temperature-readings` — Zod-validated insert with breach detection. Auto-creates an incident on breach (`type='cargo'`, severity=`critical` if delta > 5°C else `medium`).
- `GET /api/trips/:id/temperature-readings` — paginated.
- `GET /api/trips/:id/temperature-summary` — aggregated min/max/avg + breach count.
- `POST /api/trips/:id/temperature-mock-tick` — admin-only, generates one mock reading (90% in-range, 10% breach).
- `mock-sensor.ts` — pure synthetic-reading generator.

### Web

- Trip card 🌡 badge (red 🌡⚠ N on breach), lazy summary fetch.
- New `apps/web/src/components/TemperaturePanel.tsx` — recharts LineChart with SLA reference lines, breach-styled red dots, last-50 readings table, Refresh / Add manual / Mock-tick controls.
- `CreateOrderModal.tsx` — cold-chain checkbox + min/max temp inputs (range `-50..50`).
- Dispatcher dashboard — 24h breach widget polling every 60s.

### Mobile

- New `apps/mobile/src/screens/TemperatureLogScreen.tsx` — SLA header, manual entry with GPS, last-30 readings, opt-in auto-mode (60s ±0.3°C random walker).
- New `apps/mobile/src/api/temperature.ts` with offline-queue fallback.

## W3 — РТО + delivery windows + Wialon mock (commit `43901d1`)

Goal: РФ driver-hours compliance, delivery time windows, basic route ordering, realistic GPS simulator. Real Wialon is paid → mocked.

### DB (`0015_rto_windows_positions.sql`)

- `route_points.window_from`, `route_points.window_to`.
- New `vehicle_positions` (vehicle_id, recorded_at, lat/lon, speed_kmh, heading_deg, source) + index on `(vehicle_id, recorded_at desc)`.

### API

- New `apps/api/src/modules/rto/` — `GET /api/drivers/:id/hos-status` and `/hours-summary`. Russian limits: 9 h/day, 56 h/week. Computed from `tachograph_records`.
- `POST /api/trips/:id/sort-route-points` — sorts by `window_from asc` with feasibility warnings (warn-only).
- New track generator `apps/api/src/integrations/mocks/wialon-track-generator.ts` — haversine waypoint walker, ~10 s ticks, 60 ± 10 km/h cruise, slowdown near waypoints, deterministic GPS jitter.
- New runner `apps/api/src/integrations/mocks/wialon-mock-runner.ts` — per-vehicle setInterval inserter into `vehicle_positions`.
- `POST /api/integrations/wialon-mock/{start,stop}`, `GET /api/integrations/wialon-mock/{positions,status}` (admin).
- Wialon worker emits one sample per active in-transit trip per cycle.

### Web

- Drivers page: ⏱ / 🔴⚠ HOS badge per row, 7-day BarChart dialog on click.
- Dispatcher AssignmentPanel: window inputs for loading / unloading.
- Trip dossier: window column with overdue red highlighting + "Сортировать маршрут" button.
- DispatcherMap: live 🚛 markers with heading rotation, plate / speed / last-update tooltip.
- New `useWialonPositions` hook (15 s polling).
- Admin "Симулятор GPS" panel: per-trip start / stop.

### Mobile

- New `MyHoursScreen` + `apps/mobile/src/api/rto.ts`.
- Trip details: route-point cards show window time, red border when overdue.
- Trip start / complete also calls wialon-mock start / stop best-effort.
- Trip list: ⏰ Просрочено chip when any point is past `window_to`.

## W4 — Auto-billing + ETA + carriers (commit `76e31b1`)

Goal: invoices generated automatically on trip completion, ETA shown to dispatcher and driver, carriers (subcontracted transporters) modeled distinctly from clients.

### DB (`0016_carrier_subcontracting.sql`)

- `contractors.is_carrier` (indexed).
- New `carrier_contracts` (number, dates, default rates, status ∈ {draft, active, terminated}, organization-scoped).
- `trips.carrier_contractor_id` nullable FK.

### API

- `apps/api/src/modules/finance/finance.service.ts`:
  - `tryAutoCreateInvoice(tripId)` — idempotent, called after `changeTripStatus → completed`.
  - `bulkGenerateInvoices({ from, to, contractorId? })` — groups completed trips without invoice by contractor + contract.
- `POST /api/finance/invoices/bulk-generate` (admin / accountant).
- BullMQ `billing.daily` cron at `0 2 * * *` + new `billing.worker.ts`.
- New `apps/api/src/modules/trips/eta.service.ts` — haversine + 50 km/h flat. Returns `null` with `reason: no_gps | no_pending_points`.
- `GET /api/trips/:id/eta`.
- ETA recomputed on every `vehicle_positions` insert and broadcast as `trip.eta_updated` WS event.
- New module `apps/api/src/modules/carriers/` — `GET /carriers`, `POST /carriers/:id/promote` (admin), `POST /carrier-contracts`, `POST /trips/:id/assign-carrier`.

### Web

- Finance: bulk-invoice dialog with date range + contractor filter.
- Trips dossier: amber ETA badge that polls every 60 s when `in_transit`.
- New `/admin/carriers` page with promote and contract dialogs.
- Trip dossier: assign-carrier select, purple carrier badge on row.

### Mobile

- TripDetailsScreen: cyan ETA card during `in_transit` with 60 s polling.
- `apps/mobile/src/api/trips.ts:getTripEta` with safe error fallback.

## W5 — ADR / hazmat + EDI mock + driver scoring (commit `3f25a97`)

Goal: hazmat order classification with compatibility validation, EDI (Diadoc / SBIS / Kontur) document state machine for demo, driver scorecard.

### DB (`0017_adr_edi_scoring.sql`)

- `orders.adr_class` (UN ADR classes 1, 2, 3, 4.1..9), `orders.adr_un_number`.
- `drivers.adr_certificate_expiry`.
- `vehicles.adr_equipped`.
- `transport_documents.edi_status / edi_provider / edi_external_id / edi_sent_at`.
- New `edi_events` (audit trail of EDI lifecycle).

### API

- New `apps/api/src/modules/adr/` — `GET /api/orders/:id/adr-validation?vehicleId=&driverId=` returns localized errors (cert expired, vehicle not equipped, etc.). Hooked into `assignTrip` as **warn-only** (does not block).
- New `apps/api/src/modules/edi/`:
  - `POST /api/transport-documents/:id/edi/send { provider }` — provider ∈ {`diadoc`, `sbis`, `kontur`}. Schedules mock progression via `setTimeout.unref()`: `sent` → `signed_by_carrier` (5 s) → `signed_by_client` (10 s).
  - `GET /api/transport-documents/:id/edi/history`.
  - `POST /api/transport-documents/:id/edi/mock-progress` (admin) — manually advances state, cancels pending timers.
- New `apps/api/src/modules/scoring/`:
  - `computeDriverScore(driverId, from, to)` — composite 0–100 from RTO breaches (−5 each), cold breaches (−3 each), fines (−2 each), on-time delivery % (−10 if < 80%). On-demand, no cache, no new tables.
  - `GET /api/drivers/:id/score`, `GET /api/drivers/scoreboard`.

### Web

- `CreateOrderModal`: ADR checkbox → class select + UN-number with `^UN\d{4}$` validation.
- Driver create: ADR cert expiry. Vehicle create: `adrEquipped` checkbox.
- Red ⚠ ADR-{class} badge on order cards, kanban, trip dossier.
- AssignmentPanel: amber ADR validation warnings panel (non-blocking).
- Trip dossier transport-docs: EDI badges, provider buttons (admin), Mock-progress dropdown, "История EDI" dialog.
- KPI page: driver scoreboard top-5 / bottom-5 + per-driver breakdown.

## W6 — Realistic mocks + docs (commit `4fb5d51`)

Goal: replace stub-level mocks with realistic ones so demo and pilot work without paid integrations.

### DB (`0018_wave6_fuel_record_source.sql`)

- `fuel_records.source` (default `manual`) — distinguish mock vs real entries.

### API

- `apps/api/src/modules/geo/geocoding.service.ts` rewritten: 50-city Russian dataset (Москва … Магадан, Якутск, Калининград, Сочи, etc.), longest-alias matching, deterministic 0.001–0.01° jitter, haversine reverse-lookup. Fallback to Moscow center on miss.
- `apps/api/src/integrations/mocks/fuel-card.mock.ts` adds `generateTransactionsInRange(vehicleId, from, to, { tankLiters })`. Stations: Лукойл / Роснефть / Газпромнефть / Татнефть / Shell. 1–3 fills per week, 50–300 L (capped to tank), 55–75 RUB / L.
- `POST /api/integrations/fuel-card-mock/sync` (admin) — bulk-inserts into `fuel_records` with `source='fuel_card_mock'`.
- `dadata.mock.ts` and `gibdd.mock.ts` flagged with `TODO(wave6)` headers as paid-tier replacement candidates.

### Docs

- README: Next Priorities rewritten to reflect free-box completion.
- `audit-2026-05-10.md`: H-3 / M-11 status updates, Wave Implementation Status table.
- New `docs/operations/free-box-checklist.md` (15 stages, ~140 lines).

## Verification matrix

| Check | Result |
|---|---|
| `pnpm --filter @tms/api test` | 42 / 42 passed |
| `pnpm --filter @tms/api exec tsc --noEmit` | clean |
| `pnpm --filter @tms/web exec tsc --noEmit` | clean |
| `pnpm --filter @tms/mobile typecheck` | clean |
| `pnpm --filter @tms/shared exec tsc -p tsconfig.json` | clean |

## Known compromises documented per wave

- **W1 mobile PDF download** uses `Linking.openURL` with token in query string — `expo-file-system` not in deps. Acceptable for MVP.
- **W1 mechanic / medic approve / reject** in web queues deferred — current API expects full checklist payload, no `POST /:id/decision` endpoint exists yet.
- **W1 document-return enum** in DB is `ttn | upd | act | other` and `pending | received | overdue`. Wider semantic values (`waybill`, `cmr`, `lost`, `damaged`) are stored in `notes`.
- **W4 ETA** uses flat 50 km/h. No traffic, no road graph. Acceptable for free-box.
- **W4 carrier subcontracting v0** — assignment only, no settlement / billing-with-carrier flow.
- **W5 EDI mock progression** uses `setTimeout.unref()`. Loses pending timers on server restart. Acceptable for demo, not for production. **Resolved in Round 3 — D20 BullMQ refactor.**
- **W5 driver scoring** computed on demand, no cache. Fine for current scale.

---

## Round 1 — AI co-pilot + provider framework + Phase 1 stabilization (commit `282cc2a`)

Three streams in parallel. Migrations `0019_copilot.sql`, `0021_provider_framework.sql`.

### AI co-pilot MVP (Phase 7 vertical slice)

- `apps/api/src/modules/copilot/` — 10 tools wrapping existing services with org-scoping: `list_active_trips`, `get_trip_details`, `get_driver_hos_status`, `list_trips_at_risk`, `get_temperature_breaches`, `compute_trip_cost`, `propose_reassignment` (proposed-only), `list_pending_invoices`, `get_monthly_margin`, `track_contractor_orders`.
- Russian system prompt with safety rules (proposed actions, citations, uncertainty markers, anti-hallucination).
- Anthropic SDK с mock-fallback когда `ANTHROPIC_API_KEY` отсутствует.
- `POST /api/copilot/chat` (SSE stream), conversation list/replay.
- Per-org daily limit (`COPILOT_DAILY_LIMIT`, default 500).
- Web: `apps/web/src/components/CopilotChat.tsx` — collapsible right-dock 250→480px, streaming + tool-call blocks + confirmation buttons. Mounted on dispatcher.
- +7 tool input-validation tests.

### Provider adapter framework

- `0021_provider_framework.sql` — `provider_credentials` с AES-256-GCM шифрованием, unique `(org_id, type, name)`.
- `apps/api/src/providers/` — 8 типов: `signature` (gosklyuch/kontur/sbis/cadesplugin), `edi` (diadoc/sbis/kontur), `telematics` (wialon/omnicomm/glonasssoft), `fuel-card` (lukoil/rosneft/gazpromneft/csv-import), `fines` (autocode/fssp/gibdd), `marking` (crpt), `payment` (yookassa/tinkoff/cloudpayments), `email` (console/smtp/unisender). Каждый — interface + mock + 1–4 скелета с TODO в точке HTTP-вызова.
- `GET/POST/DELETE /api/integrations/credentials` (admin), `POST /api/integrations/credentials/:id/test` → healthCheck(), persists `last_health_check_at` + `last_error`.

### Phase 1 stabilization

- `apps/web/playwright.config.ts` + `tests/e2e/happy-path.spec.ts` — login → order → assign → inspect → start → cold-chain mock-tick → finish → invoice. 4 теста, advisory в CI пока DB env не подключен.
- `apps/web/src/middleware.ts` — заменил `/auth/me` fetch на `jose.jwtVerify` в edge runtime. No more per-request roundtrip.
- Pino logger plumbing — `start*Worker(logger)` в 4 воркерах (wialon/fines/notification/billing), `testRedisConnection(logger?)`, `setupRepeatableJobs(logger?)`, `console.*` → `app.log.*` с structured payloads.

**Tests: 42 → 49.** TSC clean across api/web/mobile/shared.

---

## Round 1B — self-serve signup + 6-step wizard (commit `36f2ca9`)

Migration `0020_signup_onboarding.sql`. **Tests: 49/49 pass.**

### DB

- `email_verifications` (email, code char(6), 15-min TTL).
- `users.email_verified_at`.
- `organizations.onboarding_step / onboarding_completed_at / onboarding_scenario / kpp / ogrn / legal_address / bank_bik / bank_account`.

### API

- `POST /api/auth/signup` — создаёт inactive user + organization, шлёт 6-digit код через `providers/email selectAdapter` (console fallback). Идемпотентен на re-signup.
- `POST /api/auth/verify-email` — активирует, ставит cookie.
- `POST /api/auth/resend-code` — 1/min/email rate limit.
- Module `onboarding/` — status, inn-lookup, profile, select-scenario, save-integration-choice, invite-team, complete.

### Web

- `/signup` — email/password/name/phone/companyName.
- `/signup/verify` — 6-digit код + 60s resend cooldown.
- `/onboarding` — 6-step wizard: ИНН lookup → company profile → scenario (Малый / Средний-Контур / Средний-СБИС / Крупный) → ЭДО оператор → способ подписи → команда. Resumes from server step on mount.
- `/admin/integrations` cabinet — 8 типов провайдеров со status badges, Подключить + Тест, credential modal per provider.
- `middleware.ts` — `/signup`, `/signup/verify`, `/onboarding` public.

### Shared

- `packages/shared/src/onboarding.ts` — типы, scenarios, provider names.

---

## Round 2 — compliance breadth + monetization + landing + legal (commit `1811d80`)

Migrations `0022_compliance.sql`, `0023_monetization.sql`. **Tests: 49 → 61 (+12).**

### 2A — Compliance breadth

DB: `osago_checks`, `marking_verifications`, `tachograph_uploads`, `drivers.tachograph_card_number`, `organizations.adr_strict_mode`.

API (`apps/api/src/modules/compliance/`):
- **tachograph** — best-effort EU 2016/799 Annex 1C parser (.DDD/.ESM): header parse, activity records, 45-min reset rule, continuous driving aggregator. TODOs flag СКЗИ-aware Russian-tachograph parts. `POST /api/compliance/tachograph/upload` (multipart), links by card number to driver, inserts daily aggregates.
- **osago** — `GET /check/:vehicleId`, `POST /sync` (admin), `GET /status` (latest-per-vehicle via lateral join). Mock 90/10 детерминистический по plate. RSA-AIS skeleton с TODO at SOAP call.
- **marking** — `POST /verify`, `POST /scan-batch`, GET routes. ЦРПТ skeleton.
- **adr** — `validateAdrHard` обёртка W5 soft-check + strict-mode toggle (org-level).

Web: `/admin/compliance` — 4-tab dashboard (ОСАГО / Тахограф / Маркировка / ADR).

### 2B — Monetization framework

DB: `plans` (seeded Free / Pro 4 990₽ / Business 14 990₽ / Enterprise), `subscriptions`, `payments`, `usage_counters`.

API (`apps/api/src/modules/billing/`):
- service: `getActiveSubscription`, `startTrial`, `createPayment`, `handlePaymentCallback` (вызывает ОФД на success), `recordUsage`, `checkLimit`, `getUsageReport`, `listPayments`, `listAllSubscriptionsForAdmin`.
- routes: `GET /plans` (public), subscription, subscribe, cancel, usage, payments, `webhook/yookassa` (idempotent), admin/overview.

Plan-guard (`apps/api/src/auth/plan-guard.ts`):
- `requireFeature(name)` → 402 PLAN_FEATURE_LOCKED.
- `requireWithinLimit(type)` → 402 PLAN_LIMIT_EXCEEDED.
- Wiring documented, enforcement в Round 3.

Provider `ofd/` — mock + Платформа ОФД / OFD.ru / Такском-Касса скелеты.

Web: `/billing` (current plan, trial countdown, usage bars), `/admin/billing` (KPI cards, filters, table), reusable `Paywall.tsx` modal.

### 2C — Landing + legal + user docs

- `apps/web/src/app/landing/` — Hero, Features (6), HowItWorks, Pricing (3 tiers), FAQ (8), Footer. Mobile-responsive.
- `apps/web/src/app/legal/` — privacy/terms/personal-data, shared layout, ПРОЕКТ amber banner.
- Root redirect: `/` → `/dispatcher` (or role) если authed, иначе `/landing`.
- `docs/legal/` — 3 RU draft docs (помечены ПРОЕКТ).
- `docs/users/` — 8 guides (quickstart, onboarding, dispatcher, driver, accountant, integrations-setup, cold-chain, troubleshooting).

---

## Round 3 — 15 internal debts closed (commit `ec19b74`)

**Tests: 61 → 134 (+73, 13 файлов).** No external deps added. TSC clean across api/web/mobile/shared.

### 3A — Backend wiring + security

- **D1 plan-guard wiring** — `requireFeature()` применён к copilot (`ai_copilot`), edi, marking, osago_monitoring, tachograph, adr. Plan seed extended: Free=none, Pro=ai_copilot/edi/marking, Business=all.
- **D5 inspection decision endpoints** — `POST /inspections/{tech,med}/:id/decision`, вызывает `syncWaybillStateForTrip` on approval, журналит `inspection.decision_changed`. Mechanic/medic web pages — per-row Допустить/Не допускать в journal tab.
- **D15 helmet CSP** — заменил `false` на locked-down directives. Swagger требует unsafe-inline для scripts/styles.
- **D19 ADR strict mode** — `assignTrip` проверяет `org.adr_strict_mode`, эмитит `ADR_BLOCKED` hard error когда true + errors present.
- **D22 per-user rate limit** — keyGenerator buckets authed users by `user:{userId}`, anon by ip. Copilot SSE excluded.

### 3B — UX additions

- **D8 demo data generator** — `POST /demo/generate` (admin), идемпотентен через `[ДЕМО]`/`DEMO-` prefix. Создаёт contractor + 2 vehicles + 2 drivers + 1 completed trip + 1 active trip with mock GPS + 1 cold-chain order. `DELETE /demo/cleanup`. Web `/admin/demo`.
- **D9 onboarding tour** — `apps/web/src/components/OnboardingTour.tsx` (React + Tailwind + portal, SVG mask spotlight). 6 steps + `data-tour` markers. Persists в localStorage.
- **D10 audit log UI** — `GET /audit-log` (admin/manager) читает существующую `events` таблицу + filters + pagination. Page `/admin/audit-log` с filter bar, expandable JSON rows, CSV export with UTF-8 BOM.
- **D11 bulk import** — `xlsx` в API deps. `buildTemplate(type)` + `parseTemplate(type, buf)` для contractors/vehicles/drivers/orders. `GET /import/templates/:type`, `POST /import/:type/preview`, commit endpoints. Rebuilt `/import` page с 4 entity cards, preview row-error highlighting. 12 unit tests.

### 3C — Tests + tech debt sweep

- **D13 +61 unit tests** — finance.service (14), eta.service (11), cold-chain/service (16), rto/service (12), scoring/service (8). Pure unit, no DB.
- **D14 migration-history.md** — full 0000–0024 listing, 0005 gap explained as harmless, 0008 documented as drift signal.
- **D17 web ESLint** — `.eslintrc.json` с `next/core-web-vitals` + `next/typescript`. Errors → warns where blocking.
- **D20 EDI BullMQ refactor** — заменил `setTimeout.unref()` на delayed BullMQ jobs (`edi.progression` queue + `edi.worker.ts`). Survives restart. Job IDs `edi:{documentId}:{stage}`.
- **D21 perf indexes** (`0024_perf_indexes.sql`) — 12 `CREATE INDEX IF NOT EXISTS` на trips/orders (org+status), route_points (sequence), events (audit lookup), invoice_trips, tachograph, fines.
- **D27 mobile push на cold breach** — `TemperatureLogScreen.tsx` запрашивает `expo-notifications` permission once on mount. `submitTemperature` schedules immediate local notification when `response.breach=true`.

### Open after Round 3 (require external)

D2 SMTP_HOST creds, D3 legal review, D4 ANTHROPIC_API_KEY, D6 expo-file-system, D7 YOOKASSA_WEBHOOK_SECRET, D26 SMS gateway.

---

## Round 4A — Design system foundation + 3 anchor pages (commit `463b083`)

**Tests: 134/134.** Полный инвентарь: [design-system.md](design-system.md).

### Primitives (`apps/web/src/components/ui/`)

- **Toast** — custom ToastProvider + useToast hook (no new pkg). 5 variants, portal-mounted top-right, ARIA `role=status`, action buttons, auto-dismiss.
- **Skeleton / SkeletonRow / SkeletonTable** — shimmer gradient.
- **EmptyState** — icon + title + description + CTA, 5 tones.
- **Stat** — number/label/trend/icon card.
- **ErrorBoundary** — class boundary с friendly RU fallback.
- **Button upgraded** — `isLoading` (spinner + disabled + `aria-busy`), `leftIcon`/`rightIcon`, `fullWidth`, новый `brand` variant, default `type='button'`.
- **Input upgraded** — `label`/`error`/`helperText`/`leftAddon`/`rightAddon`, `aria-invalid`/`aria-describedby`, auto-generated id.

### Theme tokens

- `tailwind.config.js` — semantic color scales (success/warning/danger/info/neutral), `borderRadius.xl=0.875rem`, `boxShadow.soft / soft-md / soft-lg`, keyframes для slide-in / fade-in / shimmer.
- `globals.css` — refined thin scrollbar, selection color, native form reset, scoped transitions (убран `* {transition}` perf footgun), `.prose` для legal pages.

### Pages

- `/login` — centered card max-w 400px, radial-gradient bg, inline валидация, Toast on success/error.
- `/dispatcher` — 4 Stat cards, Live/Offline pill + Refresh, Skeleton on initial load, EmptyState for vehicle list, useToast replaces ad-hoc div toast.
- `/trips` — 4 Stat cards, SkeletonRow×6, context-aware EmptyState с Сбросить фильтры CTA. Surgical change on 3067-line file.

---

## Round 4B + 4C — 47 pages with new design system (commit `1715cbc`)

**Tests: 134/134. 51 file modified, 2 new components (StickyHeader, LegalPageShell).**

### 4B — Role-based + admin pages

Deep polish (heavy use of Stat/Skeleton/EmptyState/Toast):
- `/finance` — 4 Stat (pending/overdue/paid/total), Wallet header, SkeletonTable, toasts на generate/bulk/payment/1C-export.
- `/drivers` — 4 Stat (total/active/license-expiring/med-expiring).
- `/claims` — 7-Stat row.
- `/logist` — brand header, 5-status Stat row.
- `/mechanic` + `/medic` — 4 Stat each, card-grid skeleton.
- `/waybills` — 4 Stat (surgical change on 1689-line file).
- `/admin/users`, `/admin/billing`, `/admin/compliance` — deep treatment.

Light polish: `/fleet`, `/incidents`, `/kpi`, `/tariffs`, `/contractors`, `/client`, `/repair`, `/admin/audit-log`, `/admin/demo`, `/admin/integrations`, `/admin/carriers`, `/admin/checklists`, `/admin/settings`, `/admin/tariffs`, `/billing`, `/analytics`, `/import`.

### 4C — Public funnel

- Landing redesign — hero с brand-gradient, fake-browser screenshot mockup, 6-card features 2×3, HowItWorks с numbered connectors, Pricing monthly/yearly toggle, FAQ 12 questions, 5-column footer, new `StickyHeader.tsx`.
- Signup — radial gradient bg, password strength meter, 152-ФЗ checkbox.
- Signup/verify — 6 separate large code inputs с auto-advance, backspace nav, paste-distributes, animated cooldown.
- Onboarding wizard — 6-circle progress с success-color completed states, fade between steps, all 6 steps polished.
- Legal — new `LegalPageShell.tsx` с sticky right TOC + IntersectionObserver active-section highlight.

---

## Round 5 — 16-bug fix sweep from UI walkthrough (commit `3ca734f`)

Подробности — [bug-tracker.md](bug-tracker.md). **Tests: 134 → 138 (+4 inspections/service).**

### API

- **B-1 (P0)** — `prevent_inspection_modification()` рефакторен, разрешает UPDATE если меняются только `decision`/`comment` (NULL-safe `IS NOT DISTINCT FROM`). DELETE по-прежнему запрещён. Branch on `TG_TABLE_NAME`. Migration `0025_inspection_decision_trigger.sql`.
- **B-2 (P1)** — `/finance/export/1c` крашился: `db.query.invoices.findMany({ with: { contractor } })` без `relations()` блоков. Переписал на plain `leftJoin(contractors)`.
- **B-14 (P1)** — "No organization in token" утекал на `/billing` и `/copilot` для seed users без `org_id`. `getActiveSubscription` принимает null orgId, возвращает synthetic Free plan. plan-guard bypass для admin/super_admin без org.

### Web i18n + structure

- **B-4 + B-5 (P2)** — Dispatcher cockpit blocker rows показывали ?????? mojibake + English titles. Russian i18n mapping в `dispatcher/page.tsx` keyed off `OperationException.type`.
- **B-8 (P2)** — Logist kanban переполнялся: `overflow-x-auto + min-w-max + 280px column min-width`.
- **B-11 (P2)** — Admin sidebar показывал только 4 из 9 admin pages. Добавил все 9 + grouping "Справочники"/"Эксплуатация".
- **B-15 (P2)** — Billing рендерил raw English API errors. Теперь amber localized banner + Повторить.
- **B-17 (P2)** — `/admin/compliance` header "Compliance" → "Контроль соответствия: ОСАГО, тахограф, маркировка, ADR".

### Web polish

- **B-10 (P2)** — Long invoice numbers `СЧ-2504-20260429205232193` truncated via `shortInvoiceNo` helper to prefix(16)…suffix(4). Full на hover via `title=`.
- **B-12 + B-13 (P3)** — Audit log brand variant + truncation с `title=`.
- **B-16 (P3)** — Compliance OSAGO badges bumped `*-50/700` → `*-100/800` + `font-semibold`.

### Tooling

- `scripts/preview-proxy.mjs` — http proxy :3030 → :80 чтобы Claude Preview мог не занимать port 80.
- `.claude/launch.json` — preview server config.

---

## Round 6 — 9 internal debts closed (commit `64b4e43`)

### B-21 (P1) — `/finance/invoices?tripId=X` filter ignored

`finance/routes.ts` — добавил `tripId` в Zod query. Pre-query lookup в `invoice_trips` derives matching IDs, фильтр через `inArray(invoices.id, derivedIds)`. Применено к client (RLS) и admin branches. **+2 finance тестов (140 total).**

### D8 (P3) — Cold-chain demo Никитин contract

`db/seed.ts` — третий contract ДГ-2026/003 + per_km tariff 25₽/km min 5000 для ИП Никитин А.С. (771234567890). Cold-chain auto-invoice теперь fires вместо skip с `no_contract`.

### H-5 + M-9 — Migration drift investigation

`docs/operations/migration-investigation-2026-05-12.md`:
- 0005 был never файлом, harmless renumbering.
- 0008 не drift — 0000 создал non-unique `idx_waybills_trip`, 0001 добавил unique `idx_waybills_trip_unique` на тот же column, 0008 сбросил redundant.
- Real drift: `_journal.json` missing 0025 entry. Appended.

### B-16 (P3) — OSAGO badges still pale

`admin/compliance/page.tsx` — заменил 3 Badge pills на solid `<span>` inline-flex pills с `bg-{tone}-50 + border-{tone}-300 + text-{tone}-800` + иконы.

### B-19 (P2) — mojibake `вЂ` на /trips и /waybills

CP1251-as-UTF-8 byte sequences fixed byte-level: `trips/page.tsx` 8 occurrences, `waybills/page.tsx` 15 occurrences.

### B-20 (P3) — "ПЛ check" truncated → "ПЛ ✓" / "ПЛ ⚠".

### M-1 — 68 `as any` casts removed across 9 files

Введён `AuthUser` alias pattern, `typeof table.$inferSelect` для row types, типизированные `api.get<T>` generics. Remaining ~59 (down from 127 non-test baseline).

---

## Dispatcher Cockpit v2 — lazyweb-driven redesign (commit `4001702`)

References: Flightradar24 (dense left rail + dominant map + LIVE pills), Zeo Route Planner (driver list sidebar), Optibus (disruption management). Подход — [lazyweb-workflow.md](lazyweb-workflow.md).

### Layout

Заменил stacked Header → 4 Stat → Cockpit → Cold-chain → Tabs → 2/3+1/3 (был ~1295 lines vertical sprawl) на true 3-pane cockpit:

```
TopBar (h-12) → LeftRail (320px) + Map (flex-1) + RightPanel (360px)
```

### New components (`apps/web/src/app/dispatcher/components/`)

- **CockpitTopBar.tsx** — title, 3 color pills (blocker/risk/ok counts), search с `/` shortcut, Live/Offline, refresh, dark-mode toggle.
- **CockpitLeftRail.tsx** — 3 collapsible sections (Блокеры N / Риски N / OK N) + Live trips sorted by status priority.
- **CockpitRightPanel.tsx** — AssignmentPanel + Vehicles (search + status filter) + Cold chain alerts.

### AI Copilot FAB

`apps/web/src/components/CopilotFab.tsx` — floating 56px gradient FAB bottom-right. Hides while chat open. Esc to dismiss.

### Dark mode

Soft-launch toggle добавляет `dark` класс на `<html>`. <10 lines conditional. Cockpit chrome uses neutral tokens.

### Responsive

- ≥1280px: both rails open.
- 1024–1279px: right panel auto-collapses.
- <1024px: both collapse, map fills.

### B-22 (new) — blocker subtitles в Russian

`localizeExceptionMessage` в `dispatcher/page.tsx`: exact-match map (15 patterns) + prefix-regex map (5). Threaded into CockpitLeftRail via optional `localizeMessage` prop. Unknown strings pass through untranslated.

**Tests: 140/140 pass. TSC clean.**

---

## Mobile driver app v2 — lazyweb-driven visual redesign (commit `b966aa2`)

References: Uber Driver (dark bottom sheet + map), Zeo Route Planner Proof-of-Service (wizard photo → map → signature), DoorDash Order Complete (top map + bottom sheet + icon timeline).

### Theme + reusable UI

- `apps/mobile/src/theme/tokens.ts` — colors (brand indigo #6366f1, success/warning/danger, neutral 50–900, dark-mode surface + scrim), spacing 4–32, radius sm/md/lg/xl/pill, typography display/title/headline/body/caption/micro, 3 shadow tiers, touchTarget 44/56/64.
- `apps/mobile/src/components/ui/` — 8 reusable components: **Button** (6 variants × 3 sizes, isLoading/leftIcon/rightIcon/fullWidth), **Card** (3 tones × 3 elevations), **Pill** (6 tones), **ProgressSteps** (segmented bar), **IconTimeline** (DoorDash-style circles + line), **BottomSheet** (Animated + PanResponder, no reanimated dep), **EmptyState**, **KeyValueRow**.

**Zero new npm packages. All animations via bare Animated API.**

### Screen redesigns (все 10)

- **LoginScreen** — brand-gradient stacked overlay, big logo circle.
- **TripListScreen** — card-per-trip с Pill status + display-typo route + 5-segment ProgressSteps + plate. EmptyState для empty filter.
- **TripDetailsScreen** — hero "map" placeholder at top 36% + scrollable rounded sheet с handle, 5-stage ProgressSteps, next-point card с яндекс-навигатор deeplink, sticky bottom action bar.
- **CheckpointScreen** — focused single-action, animated GPS pulse, vertical stack of big toned action buttons.
- **DeliveryConfirmationScreen** — wizard Photo → Signature → Details. ProgressSteps dots at top of each step. Dashed-border tap-to-shoot, white canvas signature, card-style condition radios.
- **MechanicInspectionScreen** — restyled queue с EmptyState. OK/Не ОК toggles + photo + inline comment for faults. 3-step wizard.
- **TripCompletionScreen** — DoorDash-style success: hero map с green checkmark, IconTimeline (Назначен/Загрузка/В пути/Завершён), summary KeyValueRows.
- **MyWaybillScreen** — Cards с KeyValueRow lists, Pills для status и допуски.
- **TemperatureLogScreen** — header Card с breach Pill in corner, tone-aware stat cells, separate Manual/Auto cards.
- **MyHoursScreen** — big 48px stat cards с mini fill bars (breach state → red), list-style daily bars.

### TODO

- Map hero — decorative grid + dots. Когда добавится `react-native-maps`, drop in MapView в same 36–40% top region.
- BottomSheet built but не wired в TripDetailsScreen (static rounded sheet over the map для стабильности).

**Tests: 140/140 (api). Mobile typecheck — exit 0.**

---

## DataTable Phase 1 — primitive + 5 listing pages (commit `97686f5`)

Lazyweb references: Linear issues list (dense+sticky+hover), MLB-b admin (ultra-density), Stripe customers (search+pills+actions).

### Primitives (`apps/web/src/components/ui/`)

- **data-table.tsx** — main composable: sticky header + sticky-left column с shadow на h-scroll, per-column sort (visual chevron asc → desc → off), built-in search с `/` focus shortcut + `Esc` clear, filter dropdowns (controlled), bulk-select column, 3-dot hover row-actions menu, `onRowClick` keyboard-focusable, 3 density modes (compact 32 / comfortable 40 / dense 28), SkeletonRow × pageSize during loading, client-side pagination с jump-to-page + page-size select, column visibility menu (localStorage `dt-cols-<tableId>`).
- **data-table-toolbar.tsx** — search/filter/bulk-action strip extracted.
- **side-drawer.tsx** — right-side slide-in (sm/md/lg/xl), backdrop, Esc-close, body scroll lock, focus restore.

Exports `Pill` helper с 6 tones.

### 5 pages migrated

- **contractors** — sortable name/ИНН/status, sticky name, status filter, bulk archive + mailto.
- **admin/users** — sortable, sticky ФИО, status + role filters, bulk deactivate, row 3-dot.
- **drivers** — sortable ФИО/ВУ/expiry, sticky ФИО, bulk deactivate, HOS badge preserved.
- **trips** — server search + status pills kept; table replaced. Lifecycle buttons moved в row 3-dot menu.
- **waybills** — server search kept; 6 per-row icons collapsed в 3-dot menu (Подробности / Пересчитать / ЭТрН XML / PDF / Предпросмотр / Печать ПЛ).

### Compromises

- Trips/waybills disable internal pagination (server-paged).
- SideDrawer not yet plugged in — existing Dialogs preserved.

**Tests: 140/140.**

---

## DataTable Phase 2 — 5 more pages + 11 bug fixes (commit `35a5fc5`)

### 2A — DataTable migration (5 more = 10 total)

- **claims** — sticky description, sortable amount+createdAt, status filter, row actions (Открыть акт / В работу / Закрыть). 7-stat row preserved.
- **incidents** — sticky description, severity+status filters (server-driven), sortable severity (numeric ordering). Pills для severity/status/blocking.
- **tariffs** — sticky contractor, sortable rate, type filter via Pill tones, NDS+min cost columns.
- **admin/checklists** — мигрировал card grid → DataTable. Sticky name, type Pill (Техосмотр/Медосмотр), 4 new Stat cards.
- **fleet/VehiclesTable** — sticky госномер, sortable грузоподъёмность+пробег, status+bodyType filters, deadline dots preserved, bulk block.

### 2B — 11 bug fixes (B-23 → B-33)

- **B-23 (P2)** — `layout-shell.tsx` PUBLIC_PATH_PREFIXES list (`/landing /signup /onboarding /legal /login`). Matching pages render bare children, no sidebar.
- **B-24 (P2)** — sidebar logo label wrapped в `min-w-0 flex-1 + truncate`.
- **B-25 (P1)** — waybills odometer column → `toLocaleString('ru-RU')`, header "Одометр (км)", whitespace-nowrap.
- **B-26 (P3)** — claims Stat labels shortened.
- **B-27 (P2)** — claims English terms localized (Reserve→Резерв, Estimated→Оценка, etc.). EXPOSURE_BASIS_LABELS + CAUSE_LABELS dictionaries.
- **B-28 (P3)** — repair kanban per-column EmptyState с unique icon + tone + CTA.
- **B-29 (P3)** — admin/users "Администраторы" → "Админы".
- **B-30 (P1)** — integrations GET returns 200 + `note=no_organization_in_token` instead of 400. Neutral blue info banner.
- **B-31 (P2)** — admin/integrations PROVIDER_LABEL_RU map (26 entries: gosklyuch→Госключ, kontur_sign→Контур.Подпись, diadoc→Контур.Диадок, sbis_sign→СБИС, и т.д.).
- **B-32 (P3)** — admin/billing "MRR (active)" → "MRR (активные)".
- **B-33 (P3)** — admin/settings "Cost model" → "Модель себестоимости".

**Tests: 140/140 pass. TSC clean web+api.**

---

## Lazyweb-driven design passes (post-DataTable)

After DataTable Phase 1+2, all UI work shifted to lazyweb-driven design — pulling Mobbin-style references first, then synthesizing patterns into our primitives. Each pass covers one page-type across the entire app.

### Dashboard pass (commit `4001702`-adjacent)
References: **Stripe mobile / Userlane / Linear analytics**.
- New primitives: `PeriodSelector` (today / 7d / 30d / mtd / qtd / ytd / custom), `Sparkline` (recharts inline), `MetricCard` (label + value + delta + sparkline slot), `DashboardHeader` (icon-tile + title + period + actions).
- Applied to: `/finance` (KPI strip + sparkline trend bar), `/admin/billing` (MRR / Active / Past-due / MRR-by-plan donut), `/analytics`, `/cold-chain`.

### Kanban pass
References: **Monday.com / Linear / Trello modern**.
- New primitive: `Kanban` (KanbanBoard + KanbanColumn + KanbanCard) + `ViewTabs` for board/list switch. HTML5 native DnD, no external lib.
- Applied to: `/repair` (incident pipeline), `/claims` board view, `/dispatcher/orders` board.

### Queue pass
References: **GitHub PR queue / Medallion / Linear inbox**.
- Compact list rows with severity dot + meta strip + right-aligned actions; sticky filter bar; unread/priority dots.
- Applied to: `/inspections/queue`, `/finance/invoices/inbox`, mechanic / med inspector queues.

### Public funnel pass (commit `850b398`)
References: **Fishbowl / Navan / Luma**.
- New primitive: `AuthSplitLayout` (form left, brand-gradient right with organic SVG / illustration / showcase).
- Applied to: `/login` (remember-me + social buttons + ProductShowcase mockup), `/signup` (ShowcaseCarousel rotating cockpit/mobile/pricing), `/signup/verify` (paste-from-clipboard + email pill with edit + countdown + MailCheck illustration), `/onboarding` (vertical sidebar stepper 260px + per-step help panel 280px on xl+).

### Modal & confirm consolidation (wave-polish-5, commit pending)
After the admin cluster, 14 operational files still had ad-hoc modals (`<div className="fixed inset-0 z-50 ...">`) or native `window.confirm()` calls. Migrated all of them.

- **5 files with `confirm()`** → `<ConfirmDialog>` (state object pattern with `run`/`title`/`description`/`destructive`/`confirmLabel`):
  `admin/demo`, `contractors`, `drivers`, `fleet/ContractorsTable`, `fleet/VehiclesTable`.
- **9 files with ad-hoc modal** → `<Dialog>` (size sm/md/lg/xl):
  `claims` (2 modals — create + close), `repair`, `incidents`, `dispatcher` (force-close), `waybills` (2 modals — close + detail), `trips` (dossier), `logist/CreateTripModal`, `logist/CreateOrderModal`, `fleet/TrailersTable`, `fleet/AddVehicleModal`.
- Cleanup of unused `X` icon imports and unused `Card*` imports where modal bodies no longer needed them.
- Verification: `grep -E "fixed inset-0 z-50.*bg-(black|neutral-900|gray)"` → only the Dialog primitive itself + Paywall (out of scope). `grep window.confirm` → 0 hits. TSC clean web. API tests 140/140.

**Result**: every modal in the app now uses one shared primitive. Free Esc-to-close + focus trap + backdrop click + ARIA semantics in every dialog.

### Global palette unification (wave-polish-4, commit `3cbab29`)
Across every `apps/web/src/**/*.{ts,tsx}` file: `slate-*` → `neutral-*`. 76 files touched, +1717/-1717 (pure rename, zero structural changes). This finishes the palette consolidation begun in Round 4A — every page, every primitive, every component now uses the same grayscale ramp.

- Mechanical bulk replace via sed, then audit for collisions.
- One collision found: `-translate-x-1/2` / `-translate-y-1/2` Tailwind utility contains the substring `slate-`. Caught and reversed via second sed pass (`tranneutral-` → `translate-`). 17 files affected by the collision, all restored to correct form.
- Verification: precise grep `(^|[^a-z])slate-` returns **0** matches. TSC clean web. API tests 140/140 pass.

### Admin design-system consolidation (wave-polish-3, commit `b566556`)
After Detail/Settings + wave-bugs-2 walkthroughs, four admin pages still used the legacy pattern: hand-rolled icon-tile header, ad-hoc `fixed inset-0` modals, native `confirm()` dialogs, raw `<input>`/`<select>`, slate/indigo palette.

- **Dialog primitive enhanced**: native `<dialog>` for free Esc-close + focus trap, backdrop click → close, `size` prop (`sm`/`md`/`lg`/`xl`), optional `description`, palette swap slate → neutral. New `ConfirmDialog` helper replaces `window.confirm()` with styled RU-friendly dialog (destructive variant + loading state).
- `/admin/users`: `<PageHeader>` + `<Dialog>` for the user form + `<ConfirmDialog>` for bulk-deactivate (was `confirm()`); raw inputs → `<Input label="..." />`.
- `/admin/carriers`: `<PageHeader>` + palette sweep (already used Dialog).
- `/admin/tariffs`: `<PageHeader>` + `<Dialog size="lg">` + ~14 fields → `<Input>`/`<Select>`; brand palette for active filter pills + preview card.
- `/admin/checklists`: `<PageHeader>` + `<Dialog size="lg">` + version/name/type → `<Input>`/`<Select>`.

**Verification**: All four files have **zero** `slate-*` / `indigo-*` / `window.confirm(` / `fixed inset-0 z-50` occurrences after migration. TSC clean web. API tests 140/140.

### Detail/Settings pass (commit `63edcec`)
References: **Pendo / Calendly / Replit integrations marketplaces + Glean activity log**.
- New primitive: `PageHeader` (icon-tile + title + description + actions slot + meta strip + 6 tones). Replaces hand-rolled `<icon-tile> + <h1+sub>` repeated in every admin page.
- Admin layout sidebar refined: sticky vertical rail (240px), user-email in header, active-state left bar accent, neutral palette.
- `/admin/integrations` redesigned as marketplace:
  - Header strip with counts (Активны / Sandbox / Ошибки / Всего ключей).
  - Toolbar: search input + status pills (Все / Подключены / Не подключены / С ошибкой) + category filter pills.
  - Provider cards in 3-column grid (avatar-initial + status pill + connect/test buttons + hover lift).
  - Modal gains AES-256-GCM disclosure.
- `/admin/audit-log` redesigned:
  - Replaced "Filters" Card with compact collapsible toolbar: search + filter button (badge with active-count) + apply + reset.
  - Meta strip in header shows total records + active filter count.
  - Table palette swapped slate→neutral.
- `/admin/settings` redesigned:
  - Split layout `1fr / 320px` with help sidebar (sticky on xl+).
  - Each cost-model field becomes its own `SectionCard` with icon (Fuel / Briefcase / Wrench) + hint + source-badge ("настроено в БД" vs "fallback из .env").
  - Help cards: how-it-works explainer + cross-links to other admin pages.
- `/admin/demo` + `/admin/compliance`: PageHeader applied.

---

## Summary post-W6 stats

| Metric | After W6 | After 35a5fc5 | Delta |
|---|---|---|---|
| Migrations | 18 (0000–0018) | 26 (0000–0026, 0005 skipped) | +8 |
| DB tables | ~50 | 65 | +15 |
| API tests | 42 | 140 | +98 |
| Web pages | ~30 | 47+ | +17 |
| Mobile screens | 7 | 10 | +3 |
| Provider adapters | 0 framework | 8 types × 20+ skeletons | new |
| UI primitives (web) | 0 | 15 | new |
| UI primitives (mobile) | 0 | 8 | new |
| API routes (decl count) | ~194 | ~287 | +93 |
