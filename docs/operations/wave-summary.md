# Wave Implementation Summary

Updated: 2026-05-10. Branch: `claude/dazzling-robinson-91868a`. Commits: `53f5171` → `4fb5d51`.

End-to-end pass to deliver the free-box version of TMS v2. Total: **7 commits, 90 files, +10 813 / −370 lines, 5 new migrations (0014–0018)**.

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
- **W5 EDI mock progression** uses `setTimeout.unref()`. Loses pending timers on server restart. Acceptable for demo, not for production.
- **W5 driver scoring** computed on demand, no cache. Fine for current scale.
