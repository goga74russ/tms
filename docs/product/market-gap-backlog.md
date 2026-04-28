# Market Gap Backlog

Updated: 2026-04-28

| Area | Current v2 Position | Market Reference | Gap |
|---|---|---|---|
| Operational TMS | Strong order -> billing core | AXELOT, 1C:TMS, Saby TMS | Final UAT and release evidence |
| Fleet | Vehicles, drivers, trailers, repairs, readiness | AXELOT, Saby, 1C:TMS | Deeper KTG, fuel norms, telematics |
| Repairs | Requests, lifecycle, catalog foundation | Fleet/TMS suites | Warehouse, stock balances, procurement |
| Finance | Tariffs, invoices, acts, KPI, export | 1C:TMS, AXELOT | Deeper reconciliation and accounting integrations |
| Route Optimization | Dispatching and distance foundation | Yandex Routing, ANTOR | VRP solver, traffic, multi-warehouse, time windows |
| Monitoring | WebSocket/GPS foundation | Yandex, ANTOR, Saby | Real provider integration and plan/fact |
| Mobile | Exists in archive | Saby, Yandex, ANTOR | Must migrate into v2 and verify |
| ETRN / EPD | Internal foundation and XML/export | Saby, Kontur, Taxcom | Accredited operator, KEP/MChD, GIS EPD, QR, roaming |
| Integrations | API and some mocks/foundations | Enterprise TMS market | Ready connectors for 1C, SAP, WMS, GPS, EDO |
| Operations | Docker, nginx, backup, rollback | Enterprise/on-prem products | Observability, alerting, CI/CD, SLA playbooks |
| UI / UX | Functional role screens and web smoke evidence | Saby, AXELOT, Yandex, 1C:TMS | * Role-based UX polish, dispatcher cockpit, better texts, empty/error states, browser screenshots |

## Recommended First Market Track

Compliance-first TMS should be prioritized first because the product already has a transport-document foundation and the Russian market is moving toward mandatory electronic transport documents.


## Related

- [Market Comparison Matrix](./market-comparison-matrix.md) keeps the broader starred strategic candidates from the market comparison.

