# Integrations Status: Mock → Real Provider Map

Updated: 2026-05-10.

The free-box version uses mocks for every paid integration. This document maps each mock to the real provider that will eventually replace it, with realistic effort estimates and pricing notes for РФ market.

> **Realistic timeline rule of thumb:** every real provider integration takes 2–3 weeks of calendar time, not 3–5 days. Reasons: sandbox access requires signed contracts (5–10 business days), real testing needs production-grade test contractors with both sides accredited, edge cases (rejections, retries, race conditions) need actual production traffic to discover.

## Status legend

- 🟢 **In code** — endpoint exists, mock is realistic enough for demo
- 🟡 **Stub** — endpoint exists but mock is trivial; needs upgrade or replacement
- 🔴 **Missing** — no endpoint yet, must build

---

## DaData (party / address suggestions)

| Aspect | Value |
|---|---|
| Status | 🟢 In code (`apps/api/src/integrations/mocks/dadata.mock.ts`) |
| Endpoints | `GET /integrations/dadata/lookup/:inn`, `GET /integrations/dadata/suggest-address` |
| Real provider | DaData.ru |
| Pricing | Free tier: 10 000 suggestions / day. Standard plan: ~5 000 ₽/mo. Party (ИНН) lookups counted separately |
| Replace effort | 3 days |
| Plan | Replace mock with HTTP client to `https://suggestions.dadata.ru/suggestions/api/4_1/rs/`. Cache results in Redis (key by ИНН / address hash, TTL 24 h). Fallback to FIAS / FNS XML if quota exhausted |
| Caveats | DaData free tier counts SUGGESTIONS only; party lookup is on a separate quota. Read pricing carefully before committing |

## Wialon GPS / fleet telematics

| Aspect | Value |
|---|---|
| Status | 🟢 In code (`apps/api/src/integrations/mocks/wialon-track-generator.ts`) — realistic haversine simulator added in W3 |
| Endpoints | `POST /integrations/wialon-mock/{start,stop}`, `GET /integrations/wialon-mock/{positions,status}` |
| Real provider | Wialon Hosting (Gurtam) |
| Pricing | Per-vehicle license; ~150 ₽/vehicle/mo via local distributor. Customer typically pays this, not us |
| Replace effort | 1 week (auth + units list + position polling) + 1 week (handling delays, gaps, reconnects) |
| Plan | Build `WialonClient` calling Wialon Remote API. UI in onboarding wizard to enter customer's API token. Map Wialon objects → our vehicles (manual matching wizard for ~30 ТС, then auto-match by `гос_номер`-like field) |
| Caveats | Wialon objects often store license plate in arbitrary custom fields. Manual matching wizard is mandatory, not optional. Real-world `unit.profile` schema varies by reseller |

## Электронный документооборот (Diadoc / SBIS / Kontur)

| Aspect | Value |
|---|---|
| Status | 🟡 Stub state machine (`apps/api/src/modules/edi/service.ts`) — uses `setTimeout` for progression |
| Endpoints | `POST /transport-documents/:id/edi/send`, `GET /edi/history`, `POST /edi/mock-progress` |
| Real provider | Контур.Диадок / СБИС / Калуга Астрал / Такском |
| Pricing | Operator subscription paid by customer (~3 000–10 000 ₽/mo per legal entity). Outgoing document fees ~5–25 ₽ per document |
| Replace effort | 2–3 weeks per operator. Total for Diadoc + SBIS + Kontur: ~6–8 weeks of calendar time |
| Plan | Build `DiadocEdiAdapter`, `SbisEdiAdapter`, `KonturEdiAdapter` implementing the existing `EdiProvider` interface (mirror of `EtrnProviderAdapter` pattern). Add OAuth-like flow per operator (most use API tokens, not OAuth 2.0) |
| Caveats | Контур API uses HTTP Basic with token-derived header, not standard OAuth despite vendor docs sometimes saying "OAuth". Diadoc has hard rate limits (~60 req/min/account) — bulk contractor import requires throttling |

## ЭТрН / ГИС ЭПД (electronic transport waybill)

| Aspect | Value |
|---|---|
| Status | 🟡 Internal mock provider (`apps/api/src/modules/trips/etrn-provider.ts:52` `InternalMockEtrnProviderAdapter`) — implements full state machine |
| Endpoints | `GET /waybills/:id/etrn`, `POST /trips/:id/transport-documents/:id/send`, `POST .../exchange/{attempts,receipts}`, `POST .../provider-callback` |
| Real provider | ГИС ЭПД (ФНС) — accessed only through accredited operators (Контур / Тензор / Такском / Калуга Астрал) |
| Pricing | Customer pays operator (see EDI row). No direct ФНС subscription |
| Replace effort | 3–4 weeks for the first operator (sandbox accreditation + XSD compliance + production switch) |
| Plan | Implement `DiadocEtrnProviderAdapter` first (largest market share). Reuse existing `EtrnProviderAdapter` interface. Sandbox in Diadoc test contour, then prod after ФНС accreditation |
| Caveats | **There is no free channel for ETRN in РФ.** ЭДО.Лайт от ФНС is for invoices only, not transport waybills. Customer must use an accredited operator |

## Цифровая подпись (КЭП / Госключ / cadesplugin)

| Aspect | Value |
|---|---|
| Status | 🔴 Missing — no `SignatureProvider` abstraction, only stubs in inspection routes |
| Endpoints | `POST /trips/:id/transport-documents/:id/signatures` (accepts pre-signed payload, no signing flow) |
| Real provider | Госключ (free for individuals via Госуслуги) / Контур.Подпись / Saby Sign / КриптоПро Browser plugin |
| Pricing | Госключ: free for individuals and ИП. КЭП for legal entity (ООО): 1 500–4 000 ₽/year per certificate. КриптоПро plugin: free if user already owns a certificate token |
| Replace effort | 5 days for `GosklyuchProvider` (deeplink + verify) + 4 days each for `KonturSignProvider`, `SbisSignProvider`, `CadesPluginProvider` = ~3 weeks |
| Plan | Create `apps/api/src/modules/trips/signature-provider.ts` mirroring `etrn-provider.ts`. Implement 4 providers. UI: signature method selector in delivery confirmation, inspection sign-off, finance act / invoice |
| Caveats | Госключ for legal entities (ООО) currently has limited document type support. For office roles (accountant, dispatcher) you generally need full КЭП — Госключ alone won't cover everything. Госключ deeplink scheme (`gosuslugiv://...`) requires installed Госуслуги app of recent version |

## Топливные карты

| Aspect | Value |
|---|---|
| Status | 🟢 Realistic mock (`apps/api/src/integrations/mocks/fuel-card.mock.ts`) — generates synthetic transactions per W6 |
| Endpoints | `POST /integrations/fuel-card-mock/sync` |
| Real provider | Лукойл-Smart, Роснефть, Газпромнефть, Татнефть |
| Pricing | No public APIs. Corporate contracts only, typically require ~500 K ₽/mo fuel volume commitment |
| Replace effort | Per provider: 1 week if API access granted, blocked otherwise |
| Plan | Practical alternative for free-box: build CSV import for fuel-card statements (every operator exports periodic CSV / Excel). Endpoint: `POST /api/fuel/import-csv`. Drop the "real API" goal until a single large customer demands it |
| Caveats | "Лукойл API" / "Роснефть API" advertised by integrators usually means a contracted partnership through АвтоКод or similar middleware, not a self-serve API |

## ГИБДД / штрафы (traffic fines)

| Aspect | Value |
|---|---|
| Status | 🟡 Stub (`apps/api/src/integrations/mocks/gibdd.mock.ts`) |
| Endpoints | `BullMQ finesSyncQueue` worker (no public REST endpoint) |
| Real provider | АвтоКод / АвтоТека / direct ГИБДД API (paid) |
| Pricing | Per-request fees ~5–15 ₽. ФССП open API (executions) is free but covers a different use case |
| Replace effort | 1–2 weeks |
| Plan | Build adapter to АвтоКод for plate-based fine lookup. ФССП for execution status. Cache aggressively (24 h TTL) |
| Caveats | ГИБДД itself does not offer a direct B2B API for routine fine queries. All providers route through MVD-authorized aggregators |

## Геокодирование / адреса

| Aspect | Value |
|---|---|
| Status | 🟢 Realistic 50-city Russian dataset (`apps/api/src/modules/geo/geocoding.service.ts`) — replaced trivial stub in W6 |
| Endpoints | `GET /geo/geocode`, `POST /geo/geocode/batch`, `GET /geo/reverse`, `POST /geo/distance-matrix` |
| Real provider | Yandex Geocoder / 2GIS Catalog / Nominatim (open source) |
| Pricing | Yandex: 10 000 free / day, then ~30 K ₽/mo for higher tiers. 2GIS: free for low volume |
| Replace effort | 2–3 days when first customer needs precise street-level lookup |
| Plan | The current 50-city mock is sufficient for МВП-routes. Replace when customer regularly delivers outside major cities |
| Caveats | Yandex license restricts using results outside their map ecosystem in some scenarios — read TOS before storing geocoded data |

## 1С Бухгалтерия

| Aspect | Value |
|---|---|
| Status | 🟢 One-way XML export in code (`apps/api/src/modules/finance/xml-export.service.ts`) |
| Endpoints | `GET /finance/export/1c` |
| Real provider | Native 1С EnterpriseData / CommerceML / OData |
| Pricing | Free if customer has 1С-Bukh 8.3 license |
| Replace effort | 1 week (CommerceML schema match + customer-side import config) |
| Plan | Extend XML to full CommerceML 2.x. Two-way sync (reading payments back from 1С) is a separate 2–3 week project |
| Caveats | Customer's 1С version dictates schema; 8.3 vs 7.7 are very different. Always verify customer's version before claiming compatibility |

## Тахограф

| Aspect | Value |
|---|---|
| Status | 🔴 Missing — `tachograph_records` table populated only by manual entry |
| Endpoints | None |
| Real provider | Continental VDO / Atol Drive / Stoneridge tachograph readers |
| Pricing | Reader hardware ~10 000 ₽ one-time. Software adapters per device |
| Replace effort | 3 days for DDD-file (digital tacho download) parser + UI upload. 2 weeks for live reader integration |
| Plan | **MVP path:** Build `POST /api/drivers/:id/upload-tachogram` accepting `.DDD` / `.ESM` files. Parse with open-source library (`tachoreader-js` or similar). Insert into `tachograph_records`. Without this, the W3 РТО aggregation operates on synthetic data only |
| Caveats | DDD format is binary and EU-standardized but Russian tachographs (СКЗИ-equipped) have additional encrypted fields |

## Маркировка «Честный знак»

| Aspect | Value |
|---|---|
| Status | 🔴 Missing entirely |
| Endpoints | None |
| Real provider | ЦРПТ (Государственная информационная система мониторинга) |
| Pricing | Free API access; per-verification queries |
| Replace effort | 2–3 weeks (registration + product code lookup + verification per shipment) |
| Plan | Required for cargo categories: dairy, footwear, tobacco, clothing, perfume, medicine, photo equipment, tires, water. If customer ships any marked goods, integration is mandatory by law |
| Caveats | Sanctions regularly extend categories. Stay current with ЦРПТ releases |

## ОФД / 54-ФЗ

| Aspect | Value |
|---|---|
| Status | 🔴 Missing |
| Endpoints | None |
| Real provider | Платформа ОФД, OFD.ru, Такском-Касса, ЯКасса |
| Pricing | ~3 000 ₽/year per fiscal driver |
| Replace effort | 1–2 weeks when paywall ships |
| Plan | Required only when we charge customers directly (paid SaaS tier). Not relevant while in free-box |

## ОСАГО / страхование грузов

| Aspect | Value |
|---|---|
| Status | 🔴 Missing |
| Endpoints | None |
| Real provider | РСА API for ОСАГО status, individual insurer APIs for cargo |
| Pricing | РСА: free with accreditation. Cargo insurance: per-policy |
| Replace effort | 1 week ОСАГО status check (RSA-AIS) + 2 weeks cargo policy management |
| Plan | Add `vehicles.osago_expires_at` field + monthly check job. Cargo insurance is per-shipment, more complex |

---

## Summary table — replacement priority for first paid release

| # | Integration | Effort | Why now |
|---|---|---|---|
| 1 | КЭП / Госключ (`SignatureProvider`) | 3 weeks | Without signature, no document closes legally |
| 2 | DaData live | 3 days | Already wired, mock confuses pilots |
| 3 | Diadoc EDI + ETRN adapter | 4 weeks | First operator unblocks document-flow demos with real customers |
| 4 | Тахограф DDD-upload | 3 days | Without it, the W3 РТО aggregation is synthetic |
| 5 | Wialon live | 2 weeks | Customers with telematics expect their data on the dispatcher map day one |
| 6 | 1С CommerceML | 1 week | Required for any client running 1С |

Total to ship the first paid release: **~10 weeks of calendar time** (roughly 2.5 months) with one engineer working solo plus AI assistance.

Subsequent integrations (SBIS / Kontur EDI, Honest Sign, fuel cards, ГИБДД) can ship incrementally as customer demand surfaces.
