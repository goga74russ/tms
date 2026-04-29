# Operational Core v2 Design

Updated: 2026-04-29

Goal: evolve TMS from a mostly happy-path model (`order -> trip`) into a Russian road-freight operating core that supports partial shipments, consolidated trips, loading/delivery facts, document close gates, claims, and dispatcher exception work.

This is a design document, not an implementation migration. Code changes should be sliced and smoke-tested after each step.

## Current State In Code

| Area | Current implementation | Consequence |
|---|---|---|
| Order cargo | `orders.cargoWeightKg`, `cargoVolumeM3`, `cargoPlaces`, `cargoType`, temperature/loading flags | Order stores total cargo, but not planned vs fulfilled portions. |
| Order -> trip | `orders.tripId` plus `trip_orders` join table | Join table exists, but `orders.tripId` still makes one order behave as if it belongs to one active trip. |
| Multi-order trip | `CreateTripInput.orderIds`, `linkOrdersToTripTx`, route points per linked order | Consolidation foundation exists. Needs segment-level quantities and UI clarity. |
| Capacity warning | `assignTrip` sums linked order `cargoWeightKg` and compares to `vehicle.payloadCapacityKg` | A 100-ton order cannot be planned into five 20-ton trips; it is just overweight. |
| Route execution | `route_points`, mobile sync/events, delivery confirmations | Good foundation, but facts are mostly point/trip-level, not shipment-lot-level. |
| Documents | `waybills`, `transport_documents`, exchange attempts/receipts/events | Strong foundation; needs document dossier and segment/order close gate. |
| Claims/incidents | `incidents` and `claims` exist | Useful base, but claims should link to loading/delivery facts and optionally segment/doc evidence. |
| Fleet readiness | vehicle docs, driver docs, inspections, tachograph, maintenance, incidents | Good release-gate base; needs cargo compatibility and post-trip close gate. |

## Domain Model Target

The product should treat the transport chain as:

`order -> shipment lots -> trip assignments -> route point facts -> documents -> billing/claims -> close gate`

Simple cases still work:

- one order
- one shipment lot generated automatically
- one trip assignment
- one loading point
- one unloading point

Complex cases become first-class:

- one order split across many vehicles/trips
- one trip carrying lots from many orders
- partial loading/delivery
- shortage/damage/return
- separate documents and financial lines per lot/trip

## Proposed New Tables

### `shipment_lots`

Represents a planned transportable part of an order.

| Field | Purpose |
|---|---|
| `id` | Lot id. |
| `organization_id` | Tenant isolation. |
| `order_id` | Parent order. |
| `sequence` | Human ordering inside order. |
| `status` | `planned`, `assigned`, `loading`, `in_transit`, `delivered`, `partially_delivered`, `returned`, `cancelled`. |
| `planned_weight_kg`, `planned_volume_m3`, `planned_places` | Planned lot quantities. |
| `loaded_weight_kg`, `loaded_volume_m3`, `loaded_places` | Fact at loading. |
| `delivered_weight_kg`, `delivered_volume_m3`, `delivered_places` | Fact at delivery. |
| `remaining_weight_kg`, `remaining_volume_m3`, `remaining_places` | Derived or persisted balance for reporting. |
| `cargo_description`, `cargo_type` | Optional override from order. |
| `loading_address/date/window` | Optional override if lot differs from order. |
| `unloading_address/date/window` | Optional override if lot differs from order. |
| `requirements_snapshot` | Snapshot of cargo requirements at planning time. |
| `created_by`, `created_at`, `updated_at` | Audit. |

Rule: when an order is created without explicit lots, create one default lot equal to the order totals.

### `trip_lot_assignments`

Replaces segment-level meaning currently approximated by `trip_orders`.

| Field | Purpose |
|---|---|
| `id` | Assignment id. |
| `organization_id` | Tenant isolation. |
| `trip_id` | Trip carrying this lot or part of lot. |
| `order_id` | Denormalized for joins and RLS. |
| `shipment_lot_id` | Assigned lot. |
| `assigned_weight_kg`, `assigned_volume_m3`, `assigned_places` | Planned quantity on this trip. |
| `status` | `planned`, `loaded`, `in_transit`, `delivered`, `short`, `damaged`, `returned`, `cancelled`. |
| `loading_route_point_id`, `unloading_route_point_id` | Connect assignment to route execution. |
| `document_group_id` | Optional grouping for dossier/docs. |
| `created_by`, `created_at`, `updated_at` | Audit. |

Rule: one lot may have multiple trip assignments only if the sum of assigned quantities does not exceed lot remaining quantities, except when an authorized override creates an over-assignment warning.

### `shipment_facts`

Append-only evidence for loading, unloading, discrepancies, returns, and corrections.

| Field | Purpose |
|---|---|
| `id` | Fact id. |
| `organization_id` | Tenant isolation. |
| `trip_id`, `order_id`, `shipment_lot_id`, `trip_lot_assignment_id` | Context. |
| `route_point_id` | Where fact was captured. |
| `fact_type` | `loading`, `unloading`, `return`, `correction`, `discrepancy`. |
| `weight_kg`, `volume_m3`, `places` | Actual quantities. |
| `cargo_condition` | `intact`, `damaged`, `partial`. |
| `discrepancy_code` | `shortage`, `overage`, `damage`, `refusal`, `wrong_docs`, `other`. |
| `notes` | Operator/driver note. |
| `attachments` | Photos, signatures, scans. |
| `gps_lat`, `gps_lon`, `captured_at`, `captured_by` | Mobile evidence. |
| `source` | `web`, `mobile`, `sync`, `operator_callback`. |

Rule: facts update assignment/lot aggregate status through service logic, not direct DB triggers at first.

### `document_dossier_items`

Required document checklist per order/trip/lot.

| Field | Purpose |
|---|---|
| `id` | Item id. |
| `organization_id` | Tenant isolation. |
| `scope_type` | `order`, `trip`, `shipment_lot`, `trip_lot_assignment`. |
| `scope_id` | Entity id. |
| `document_type` | `waybill`, `transport_note`, `etrn`, `act`, `invoice`, `upd`, `photo`, `epd_receipt`, `paper_exception`. |
| `required` | Close gate flag. |
| `status` | `missing`, `draft`, `sent`, `signed`, `received`, `accepted`, `rejected`, `exceptioned`. |
| `source_document_id` | `transport_documents.id`, `waybills.id`, upload id, etc. |
| `due_at`, `completed_at`, `blocked_reason` | Control. |

Rule: trip/order close gate checks required dossier items before `completed -> billed` or final order closure.

## Keep Or Deprecate

| Existing field/table | Decision |
|---|---|
| `orders.tripId` | Keep during migration as legacy/current-primary-trip pointer. Stop using it for business truth after assignments ship. Later deprecate. |
| `trip_orders` | Keep as compatibility and fast trip/order list. Populate from `trip_lot_assignments`. Later it becomes derived/compatibility only. |
| `route_points.orderId` | Keep. Add optional `shipment_lot_id` / `trip_lot_assignment_id` when implementing. |
| `claims.orderId/tripId` | Keep. Add optional `shipment_lot_id`, `trip_lot_assignment_id`, `shipment_fact_id`, `transport_document_id` later. |
| `transport_documents.orderIds` | Keep. Add dossier linkage instead of overloading JSON for close logic. |

## Status Rules

### Order status

Order status should be aggregate, derived from lots:

| Order status | Derived condition |
|---|---|
| `confirmed` | Has planned lots, no active assignment. |
| `assigned` | At least one lot/assignment assigned, none in transit yet. |
| `in_transit` | At least one assignment in transit/loading, not fully delivered/returned. |
| `delivered` | All non-cancelled lots delivered with acceptable facts and document close gate satisfied or ready for billing. |
| `returned` | All remaining lots returned/cancelled with documented reason. |
| `cancelled` | No active lots. |

### Trip status

Trip status remains operational, but completion must not automatically mark whole order delivered unless all assigned lot quantities were delivered or exceptioned.

### Quantity invariants

- `sum(shipment_lots.planned_weight_kg) <= orders.cargoWeightKg`, unless intentional overage is recorded.
- `sum(trip_lot_assignments.assigned_weight_kg active) <= shipment_lots.planned_weight_kg - delivered/returned/cancelled`, unless override.
- `sum(assignments on trip) <= vehicle.payloadCapacityKg`, hard warning/block unless override role allows planning but dispatch blocks.
- Delivered facts can be lower than assigned quantities; shortage creates discrepancy and optional claim.

## API Slices

### Slice A. Lots foundation

- `POST /orders/:id/lots` create lot.
- `GET /orders/:id/lots` list lots with balances.
- `PATCH /orders/:id/lots/:lotId` update while not assigned.
- `POST /orders/:id/lots/auto-split` split by max weight/places/vehicle capacity.
- `GET /orders/:id/fulfillment` aggregate planned/assigned/loaded/delivered/remaining.

### Slice B. Trip assignments

- `POST /trips/:id/lot-assignments` assign lot quantity to trip.
- `DELETE /trips/:id/lot-assignments/:assignmentId` unassign while not loaded.
- `GET /trips/:id/load-plan` show lots, orders, addresses, weights, volume, places, warnings.
- Update existing `POST /trips` to accept either legacy `orderIds` or new `lotAssignments`.

### Slice C. Facts and mobile

- `POST /trips/:id/lot-assignments/:assignmentId/facts` capture loading/unloading/discrepancy.
- Mobile sync accepts fact events with assignment/lot ids.
- Route point completion can include actual quantities and discrepancy data.
- Delivery confirmation links to shipment facts.

### Slice D. Dossier and close gates

- `GET /trips/:id/dossier` required documents and statuses.
- `POST /trips/:id/dossier/items/:itemId/exception` paper/manual exception with reason.
- Trip completion/billing checks required dossier items.
- Order fulfillment page shows missing docs by lot/trip.

### Slice E. Claims integration

- Add optional claim links to shipment fact, lot assignment, transport document.
- Auto-create draft claim for shortage/damage/refusal if configured.
- Finance can reserve amount until claim resolved.

## UI Slices

| Role | First UI change |
|---|---|
| Logist | Order page: lots tab, split wizard, fulfillment bar, remaining quantity. |
| Dispatcher | Trip load-plan builder: select lots, see capacity/volume/body/temperature warnings. |
| Driver mobile | Loading/delivery fact capture per assignment: actual weight/places, photo, signature, discrepancy reason. |
| Accountant | Billing sees delivered quantities and unresolved claims/shortages. |
| Manager | Exception cockpit: overweight, remaining lots, partial delivery, missing docs, open claims. |

## Migration Plan

### Phase 1. Schema only, no behavior change

- Add enums/tables: `shipment_lot_status`, `trip_lot_assignment_status`, `shipment_fact_type`, `shipment_discrepancy_code`.
- Add `shipment_lots`, `trip_lot_assignments`, `shipment_facts`, `document_dossier_items`.
- Backfill one default lot for every existing order.
- Backfill one trip assignment for every linked `orders.tripId` / `trip_orders` relation.
- Do not remove or reinterpret legacy fields.

### Phase 2. Read models

- Add order fulfillment read endpoint.
- Add trip load-plan read endpoint based on assignments.
- Keep current UI working by exposing legacy-compatible order lists.
- Add smoke tests that current P0 still passes.

### Phase 3. Write path for new lots

- Order create creates default lot.
- Add lot split API and UI.
- Add assignment API that updates compatibility `trip_orders` and `orders.tripId` only when safe.
- Add capacity checks on assigned quantities, not whole order weight.

### Phase 4. Facts and mobile

- Route point completion records `shipment_facts`.
- Mobile smoke adds partial loading/delivery test.
- Facts update lot/assignment aggregate statuses.

### Phase 5. Dossier and claims

- Generate dossier checklist from trip/order/EPD rules.
- Completion/billing gates use dossier items.
- Discrepancy facts can open claims.

### Phase 6. Deprecation

- Stop using `orders.tripId` for business decisions.
- Keep it as nullable display/cache field until all reads move to assignments.
- Mark `trip_orders` as compatibility/derived table or replace with view later.

## Acceptance Tests

| Scenario | Expected result |
|---|---|
| 100-ton order split into five 20-ton lots | Five lots, five trips can be assigned without overweight if vehicles fit. Order remains partially assigned/delivered until all lots close. |
| One trip carries lots from three orders | Trip load plan shows three orders, documents/dossier separated, billing per order remains possible. |
| Planned 20 tons, loaded 18.7 | Loading fact records actual, lot balance remains 1.3, discrepancy is visible. |
| Delivered 17 of 18 places | Delivery fact is partial, claim draft can be created, order not fully delivered without resolution. |
| Trip completed but docs missing | Operational trip can complete if allowed, but billing/final close is blocked or flagged by dossier gate. |
| Driver offline captures photos/signature | Facts sync later with idempotency and keep route point evidence. |
| Cargo requires refrigerator, vehicle is tent | Assignment warning blocks dispatch. |
| Order from another organization | Lot/assignment APIs reject cross-tenant access. |

## Implementation Priority

1. Schema + backfill + read endpoints.
2. Order lots tab and split wizard.
3. Trip load-plan assignments using lots.
4. Loading/delivery facts in API and mobile sync.
5. Dossier close gate.
6. Claims/finance hooks.
7. Dispatcher exception cockpit.

## Open Questions

- Should over-assignment ever be allowed for planning, or only with admin override?
- Do we store remaining quantities as persisted columns, materialized view, or computed read model?
- Which units are mandatory beyond kg/m3/places: pallets, boxes, meters, liters, tonnes?
- Should one shipment lot be allowed to change destination, or should переадресация create a new lot version?
- How strict should close gates be in pilot: hard block or warning with manager override?
