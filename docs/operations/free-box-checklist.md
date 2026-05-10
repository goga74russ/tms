# Free-Box Checklist

This is the list of features that must work end-to-end **without any paid
integrations**. It is the contract for a pilot deployment running on the
free tier (Wialon-mock, GIBDD-mock, DaData-mock, fuel-card mock, in-memory
geocoding). Each line is something a tester or pilot operator should be
able to do from a fresh DB after `db:migrate` + `db:seed`.

Stages follow the operational chain:

```text
order → trip → waybill → inspections → release → delivery → document-return → billing
```

## 1. Authentication & RBAC

- Log in with seeded admin / dispatcher / driver / mechanic / accountant accounts.
- HttpOnly cookie set on `/auth/login`; mobile bearer flow on `/auth/login/mobile`.
- WebSocket short-lived token via `/auth/ws-token`.
- CASL abilities enforced on every protected route; med-inspection details hidden even from admin.
- Login rate-limit (5/min/IP) blocks brute force.

## 2. Org & Reference Data

- DaData mock — `/integrations/dadata/lookup/:inn` returns Sber/Газпром/Яндекс + deterministic mock for any other valid INN.
- DaData mock — `/integrations/dadata/suggest-address` autocomplete.
- BIK validation passes for known banks (Сбер, Тинькофф, Альфа) and accepts any 9-digit BIK.
- Organization, contractors, drivers, vehicles, trailers all CRUD-able.

## 3. Order intake

- Create order with loading + unloading points, weight/volume, cargo class.
- ADR (hazmat) fields: UN-number, class, packing group; warn-only validation when assigning a non-equipped driver/vehicle.
- Cold-chain fields: `temperature_min/max` set per order.
- Geocoding — addresses resolve to coordinates via the 50-city dataset (Москва, СПб, Казань, … Владивосток, Магадан, Якутск). Falls back to Moscow center if no city matches.

## 4. Trip planning

- Trip created from order(s) with assigned vehicle, driver, optional trailer.
- Route windows — multi-leg trips ordered by `route_windows.position`.
- Distance matrix — `POST /api/geo/distance-matrix` returns NxN haversine + estimated driving distance for up to 20 points.
- Carrier subcontracting — `is_carrier` flag on contractors; trip can be marked subcontracted.
- HOS / РТО — `/api/rto/hos-status` returns 9-hours-driven / 56-hours-week with breach flags.

## 5. Waybill (путевой лист)

- Auto-sync waybill on trip start: vehicle, driver, route, fuel norm prefilled.
- Print-ready PDF via `/api/waybills/:id/pdf`.
- Append-only DB triggers prevent retroactive edits to issued waybills.

## 6. Inspections

- Pre-trip tech inspection — mechanic submits checklist; failures auto-create repair requests.
- Pre-trip med inspection — appended-only; doctor signature; details hidden from non-medical roles.
- PDF export for both inspection types.
- Post-trip versions of both, append-only.

## 7. Release & start

- Release decision: tech-pass + med-pass + waybill-issued → vehicle released.
- Trip status → `in_progress`.
- Wialon mock — realistic GPS track simulator writes positions every ~10 s into `vehicle_positions`. Driver location available on `/api/integrations/wialon-mock/positions`.

## 8. Delivery & in-transit events

- ETA — `GET /api/trips/:id/eta` computes remaining km + ETA based on current position.
- Cold chain — `temperature_readings` accepts manual + mock-sensor data (90% normal, 10% breach); breaches surface in the trip UI panel.
- Mobile app auto-mode pushes positions and temperature when online; queues offline.
- Driver actions: arrive at point, confirm load/unload, report incident.
- Document-returns CRUD — driver scans/photos client-signed CMR/TTN.
- Delivery confirmation v2 — multi-point, photo + signature evidence.

## 9. Document return & closing

- Signed documents matched against trip; missing-document warnings.
- ETRN XML export — provider-style state machine (mock); EDI / Diadoc / SBIS / Kontur statuses on `transport_documents`.
- Trip → `completed` when delivery confirmed and documents returned.

## 10. Billing

- Auto-create invoice on trip completion (`tryAutoCreateInvoice` hook).
- Daily 02:00 cron sweeps any trips that finished without an invoice.
- Tariffs per (organization, contractor, vehicle-class).
- Margin analytics on `/api/analytics/margin`.

## 11. Fleet operations (deep)

- Fuel records — manual entry + `POST /api/integrations/fuel-card-mock/sync` to backfill a date range with synthetic transactions (`source='fuel_card_mock'`, station chains Лукойл/Роснефть/Газпромнефть/Татнефть/Shell, 1–3 fills/week, 50–300 L, 55–75 RUB/L).
- Fuel summary — `/api/integrations/fuel/transactions/:vehicleId`.
- Odometer readings — manual / GPS / waybill / inspection sources.
- Repair requests — auto-created by inspection failures; parts catalog.
- Predictive maintenance — `/api/analytics/predictive-maintenance`.

## 12. Compliance & audit

- Append-only triggers on `events`, `med_inspections`, `tech_inspections`, `med_access_log`.
- Full event journal `/api/operations/events`.
- GIBDD-mock — `/api/integrations/fines/sync` triggers fine lookup; deterministic 0–3 fines per plate.
- Driver scoring v0 — `/api/scoring/drivers/:id` returns 0–100 score from existing tables (no new schema).

## 13. Web back-office

- All chain stages have a web view; PDF buttons use the API endpoints above.
- Cold-chain panel on trip detail.
- Carrier-subcontracting badge on trips.
- Margin and predictive-maintenance dashboards.

## 14. Mobile (driver)

- Offline-first via WatermelonDB; sync on reconnect.
- Auto-position push (every 30 s when moving).
- Auto-temperature push when sensor present (mock for free-box).
- Inspection forms with photo capture + offline queue.

## 15. Ops & infra

- `docker compose up` brings full stack: Postgres, Redis, MinIO, API, web, nginx.
- `pnpm --filter @tms/api db:migrate` applies all 18 migrations cleanly.
- `pnpm --filter @tms/api test` — 42/42 pass.
- `pnpm --filter @tms/api exec tsc --noEmit` — clean.
- BullMQ workers: wialon, fines, notifications, billing.
- Health: `/api/health`, readiness `/api/health/ready`.
