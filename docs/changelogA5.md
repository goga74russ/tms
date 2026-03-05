# Changelog — Агент 5: Финансы + KPI

## 2026-03-04 Backend Finance Logic Implemented
- Created `apps/api/src/modules/finance/schemas.ts` for request validation shapes.
- Created `tarification.service.ts` to encapsulate complex trip cost calculation logic based on tariff types and modifiers.
- Add unit tests for `tarification.service.ts` to ensure mathematically correct calculations.
- Created `finance.service.ts` for handling invoice generation, fuel efficiency analysis, retrieving KPI data, and exporting formatted JSON data for 1C.
- Registered endpoints in `routes.ts` and attached them to the Fastify instance in `server.ts`.
- Endpoints added:
  - `GET /api/finance/trips/:id/cost`
  - `GET /api/finance/invoices`
  - `POST /api/finance/invoices`
  - `GET /api/finance/fuel-analysis`
  - `GET /api/finance/kpi`
  - `GET /api/finance/export/1c`

## 2026-03-04 Frontend Finance & KPI Dashboards Implemented
- Created Accountant Dashboard (`apps/web/src/app/finance/page.tsx`) for managing invoices, debts, and penalties.
- Created Executive Dashboard (`apps/web/src/app/kpi/page.tsx`) with Recharts demonstrating revenue, margins, and fleet utilization.
- Added navigation links in global sidebar.

## 2026-03-04 Backend Hardening (Iteration 2)
- **Tarification**: Implemented all 7 modifiers:
  - Night ×1.5 (22:00–06:00), Weekend ×1.2, Urgent ×1.3 (<4h), Return +50%, Cancellation fee
  - Idle (hourly rate beyond free limit), Extra points (per point)
- **Rounding**: Configurable precision (1₽ / 10₽ / 100₽) via tariff setting
- **Invoice Numbering**: Sequential zero-padded format (`INV-2026-00001`)
- **Invoice Status**: Added `PUT /api/finance/invoices/:id/status` endpoint
- **Fuel Analysis**: Winter coefficient (+10%), vehicle filter, normalized output
- **Cost Breakdown**: Base cost + fuel + salary + amortization + tolls → margin calculation
- **Zod Validation**: POST /invoices body validated with `InvoiceCreateSchema`
- **Unit Tests**: 10 tests covering all modifiers, rounding, VAT, margin → all pass

## 2026-03-04 Frontend Enhancements (Iteration 2)
- **KPI Dashboard**: Added TrafficLight component for debtor/fine status indicators
- **AreaChart**: Maintenance + repair cost trends with gradient fills
- **Margin by Client**: Horizontal bar chart showing profitability per client
- All charts use light theme consistent with shadcn/ui design system

## 2026-03-04 Sprint 4.1: Finance + KPI → Live API
- **Finance Dashboard** (`/finance`):
  - Connected to `GET /api/finance/invoices` — real invoice data
  - Summary cards computed from live data (pending, overdue, paid)
  - Invoice generation via `POST /api/finance/invoices`
  - 1C XML export via `GET /api/finance/export/1c` as file download
  - Invoice detail modal with status transitions via `PUT /api/finance/invoices/:id/status`
  - Filters: search by invoice number, filter by status
- **KPI Dashboard** (`/kpi`):
  - Connected to `GET /api/finance/kpi` and `GET /api/finance/fuel-analysis`
  - MetricCards: revenue, margin%, trips completed, repairs cost — all from API
  - TrafficLights driven by `debtorLight` / `finesLight` from API response
  - Date-range picker for period selection
  - Fuel analysis chart from real data
  - Cost breakdown pie chart computed from KPI response
- **Tariffs Page** (`/tariffs`) [NEW]:
  - Table: tariff type, rate, modifiers, VAT config, min cost, active status
  - Mock data structured for future `GET /api/finance/tariffs`
  - Added to sidebar navigation (accountant, manager roles)
- **UI Components** [NEW]: Table, Badge, Input, Select, Dialog primitives

