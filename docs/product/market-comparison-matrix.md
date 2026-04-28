# Market Comparison Matrix

Updated: 2026-04-28

This matrix captures strategic market-facing gaps for TMS v2. Items marked with `*` are not immediate P0 cleanup work, but they should remain visible as roadmap candidates when choosing market positioning.

| Direction | Our TMS After Completion | Competitors / Russian Market | Project Strength | Missing / Roadmap Candidate |
|---|---|---|---|---|
| Operational TMS core | Orders, trips, waybills, inspections, delivery, finance | AXELOT TMS, 1C:TMS, Saby TMS | End-to-end transport cycle is already covered | More production/UAT evidence |
| Fleet | Vehicles, drivers, trailers, readiness, repairs, maintenance, fuel, downtime | AXELOT, 1C:TMS, Saby | Strong fleet + repair + waybill connection | * More mature KTG analytics, fuel norms, telematics |
| Repairs | Plan/fact, requests, statuses, repair part catalog | Large TMS/Fleet suites | Useful own repair contour | * Warehouse, stock balances, receipts, write-offs, suppliers, procurement |
| Finance | Invoices, acts, tariffs, KPI, 1C/XML export | 1C:TMS, AXELOT | Finance is embedded into the operational flow | * Deeper reconciliation, claims, mutual settlements, accounting integrations |
| Routing | Trips, addresses, distances, dispatching | Yandex Routing, ANTOR | Can embed routing on top of operational TMS | * Strong VRP/solver: time windows, traffic, multi-warehouse, vehicle loading |
| Monitoring | Foundation for positions/WebSocket/GPS | Yandex, ANTOR, Saby | Live contour is architecturally present | * Real GPS/GLONASS/Wialon integration and plan/fact monitoring |
| Mobile app | Driver/field app is now copied into v2 workspace | Saby, Yandex, ANTOR | Mobile foundation exists | Finish driver app: statuses, photos, offline, signatures, documents |
| ETRN / EPD | XML, transport documents, exchange attempts, receipts, callbacks | Saby, Kontur.Logistics, Taxcom, Platforma EPD | Strong foundation inside TMS, not a separate EDO cabinet | Real IS EPD operator, KEP/MChD, GIS EPD, QR, roaming |
| Document workflow | Waybills, ETRN preview/export, trip dossier | Saby, Kontur, 1C:TMS | Transport dossier is a strong product idea | Legally meaningful signatures, archive, signing-status chain |
| Integrations | Mocks/services, API, storage, 1C/XML export | AXELOT, 1C, Saby, Yandex | Modern API-first architecture | * Ready connectors: 1C, SAP, WMS, EDO, DaData, GPS, fuel cards |
| Multi-tenant | Organization scope, guards, migrations | Enterprise TMS | Hardening and checks already exist | Full security audit and final multi-org evidence pack |
| Deploy / Operations | Docker, nginx, MinIO, backup, rollback, health checks | Enterprise/on-prem products | Good production skeleton | Observability, alerting, SLA, CI/CD release enforcement |
| UI / UX | Next.js web app with roles and main screens | 1C, Saby, AXELOT, Yandex | Can be more modern than classic boxed systems | * Role-based UX polish: dispatcher cockpit, next actions, empty/error states, Russian copy, browser screenshot evidence |
| Analytics | KPI, finance, fleet analytics | AXELOT, ANTOR, 1C | Analytics is already embedded | * Report builder, forecasts, plan/fact, scenario profitability |
| Market packaging | Currently closer to custom/internal product | AXELOT/1C/Saby sell mature products | Flexibility and modern stack | * Pricing, sales docs, demo stand, support, cases, Russian software registry |

## How To Use This Matrix

- P0/P1 work should come from security, production readiness, mobile verification, and release evidence.
- `*` items are strategic differentiators or market-readiness expansions.
- Compliance-first positioning should prioritize ETRN/EPD, mobile driver documents, signatures, and provider integration.
- Operational fleet positioning should prioritize GPS/Wialon, routing optimization, fuel norms, KTG, and repair stock.
