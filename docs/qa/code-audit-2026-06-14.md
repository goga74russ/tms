# Полный код-аудит TMS-prod — 2026-06-14

- **Роль:** QA
- **Метод:** сплошной аудит репозитория, fan-out по 39 сегментам (аудитор читает зону на 100%) + adversarial-верификация КАЖДОЙ находки независимым скептиком (вердикт REAL / FALSE_POSITIVE / BY_DESIGN / KNOWN / CLOSED_BUT_OPEN) + дедуп по `file:line`. В отчёт идут только REAL и CLOSED_BUT_OPEN.
- **Дата:** 2026-06-14
- **HEAD:** `7d4c118`
- **Покрытие:** ~128 026 LOC (apps/api, apps/web, apps/mobile, packages/shared, drizzle)
- **Источник:** workflow `wf_48e19b4a-2ad`, слияние двух проходов верификации (API-плотный + web/mobile/shared/drizzle) по `file:line`. Итого **179** уникальных верифицированных находок.

## Cross-role review
- [x] QA — 2026-06-14, аудит, 179 находок (P0=0/P1=27/P2=69/P3=83)
- [ ] PM — триаж и приоритизация
- [ ] TransPult — приём в работу
- [ ] Jurist — юр-блок (signatures / documents / mchd / print — проверить P1/P2 на юр-недействительность)

## ⚠️ Неполнота верификации (читать первым)

Аудит шёл под устойчивым серверным overload (`429`/`529`/session-limit). **Аудиторы отработали по всем 39 сегментам**, но adversarial-верификация достроилась НЕ везде: часть верификаторов срезана throttle, их находки by design в отчёт НЕ включены (без подтверждения скептиком).

- **Полностью/плотно покрыт:** API-слой + инфра (auth, finance, billing, documents, signatures, trips, orders, import, providers и т.д.).
- **Покрыт частично (тонко):** web/* , mobile, shared, drizzle — верификация добрана лишь частью (см. счётчики в таблице сегментов; многие фронт/мобайл/схема-находки аудиторов остались неподтверждёнными).
- **0 верифицированных находок** (НЕ значит «чисто» — значит «верификация не достроилась», нужен отдельный проход): `web/lib`, `drizzle`.

**Вывод по охвату:** этот отчёт — це́льный аудит API/инфры + выборочно фронт. Для фронта/мобайла/схемы нужен **follow-up verify-проход**, когда платформа разгрузится. Severity/находки ниже — подтверждённые, им можно верить.

### Охват сегментов

| Сегмент | Категория | Аудит | Верифиц. находок |
|---|---|---|---|
| api/auth | security | да | 9 |
| api/billing | money | да | 5 |
| api/carriers | correctness | да | 5 |
| api/claims | correctness | да | 4 |
| api/cold-chain | correctness | да | 6 |
| api/compliance+adr | compliance | да | 5 |
| api/copilot | correctness | да | 7 |
| api/documents | legal-validity | да | 9 |
| api/edi | integration | да | 4 |
| api/finance | money | да | 8 |
| api/fleet | correctness | да | 5 |
| api/geo | correctness | да | 4 |
| api/import | data-integrity | да | 8 |
| api/inspections | correctness | да | 4 |
| api/integrations | security | да | 4 |
| api/mchd | legal-validity | да | 5 |
| api/notifications | correctness | да | 3 |
| api/onboarding | correctness | да | 5 |
| api/operational | correctness | да | 8 |
| api/orders | correctness | да | 7 |
| api/repairs | correctness | да | 7 |
| api/rto+scoring | correctness | да | 6 |
| api/signatures | legal-validity | да | 5 |
| api/sync+sprint9 | data-integrity | да | 5 |
| api/trips | correctness | да | 7 |
| api/uploads+waybills | correctness | да | 5 |
| api/misc-modules | correctness | да | 6 |
| api/providers | integration | да | 5 |
| api/infra | data-integrity | да | 4 |
| web/admin | security | да | 2 |
| web/ops1 | correctness | да | 2 |
| web/ops2 | correctness | да | 2 |
| web/finance | money | да | 2 |
| web/print | legal-validity | да | 1 |
| web/public | security | да | 2 |
| web/lib | correctness | да | 0 |
| mobile | correctness | да | 2 |
| shared | correctness | да | 1 |
| drizzle | data-integrity | да | 0 |

## Сводка по severity

| Severity | Кол-во |
|---|---|
| P0 | 0 |
| P1 | 27 |
| P2 | 69 |
| P3 | 83 |
| **Всего** | **179** |
| из них «закрыто-но-открыто» | 8 |

**Отсеяно верификатором** (в отчёт НЕ вошли): FALSE_POSITIVE ≈ 13, BY_DESIGN ≈ 10, KNOWN ≈ 2 (суммарно по двум проходам; точные числа разнятся от прогона к прогону из-за частичной верификации).

## Прогресс закрытия P1 (сессия 2026-06-15)

Живой лог. Отметка `✅ ЗАКРЫТО:` ставится также в самой находке ниже. Коммиты — на ветке `main`.

| # | Находка | Коммит | Статус |
|---|---|---|---|
| 9 | НДС tarification string-concat | `385dfdd` | ✅ ЗАКРЫТО |
| 8 | corrective_upd 1а/заголовок (A1, /jurist) | `3d432b0` | ✅ ЗАКРЫТО |
| 4 | assign-carrier executionMode (A2) | `b632f47` | ✅ ЗАКРЫТО |
| — | ЭТрН consignee address (A3/A4) | `b632f47` | ✅ ЗАКРЫТО |
| — | МЧД ИНН/ОГРН regex + scope (A5/A6) | `b632f47` | ✅ ЗАКРЫТО |
| — | 54-ФЗ чек контакт покупателя (A7) | `b632f47` | ✅ ЗАКРЫТО |
| 2 | billing: смена тарифа не меняла planId | `6ff8fb4` | ✅ ЗАКРЫТО |
| 3 | billing: refund webhook no-op (payment_id) | `6ff8fb4` | ✅ ЗАКРЫТО |
| 5 | claim FSM пере-resolve (перезапись денег) | `6ff8fb4` | ✅ ЗАКРЫТО |
| 10 | recordPartialPayment без статус-гейта | `6ff8fb4` | ✅ ЗАКРЫТО |
| — | KPI topDrivers без org-фильтра | `4c749eb` | ✅ ЗАКРЫТО |
| — | GET /orders customerPrice (K3) | `4c749eb` | ✅ ЗАКРЫТО |
| — | fleet listVehicles/getVehicle org-less DENY | `4c749eb` | ✅ ЗАКРЫТО |
| — | repairs IDOR (read+write, org-less) | `4c749eb` | ✅ ЗАКРЫТО |
| — | adr IDOR (vehicleId/driverId ownership) | `e9c3bf1` | ✅ ЗАКРЫТО |
| — | createOrder cross-tenant FK-инъекция | `e9c3bf1` | ✅ ЗАКРЫТО |
| 1 | login rate-limit XFF-спуф (trustProxy) | `28207d2` | ✅ ЗАКРЫТО |
| — | analytics NPE-краш maintenance-alerts | `791f1d5` | ✅ ЗАКРЫТО |
| — | credentials /test не сбрасывал error | `791f1d5` | ✅ ЗАКРЫТО |
| — | fleet PUT молча терял status/odo/archived | `791f1d5` | ✅ ЗАКРЫТО |
| — | confirmationMode bypass (forcedByDispatcher) | `28207d2` | ✅ ЗАКРЫТО |
| — | gosklyuch HMAC отвергал реальные callback'и | `28207d2` | ✅ ЗАКРЫТО |
| — | inspections decision-flip каскад (ТС/ремонт) | `28207d2` | ✅ ЗАКРЫТО |
| — | documents docType collapse (enum waybill/cmr) | `4069f83` | ✅ ЗАКРЫТО |
| — | import orders.number → per-org (0051) | `4069f83` | ✅ ЗАКРЫТО |
| — | invite-team email oracle/silent-drop | `4069f83` | ✅ ЗАКРЫТО |
| — | repairs parts catalog cross-tenant гидрация | `4069f83` | ✅ ЗАКРЫТО |
| — | repair_part_catalog global UNIQUE(code) → per-org (0052) | `4069f83` | ✅ ЗАКРЫТО |

**Закрыто на 2026-06-15: 26 из 27 P1.** code-only волны (21) + миграционный батч (5:
documents docType, orders.number, invite-team, parts-гидрация, catalog UNIQUE). Плюс
P2-легальные A4/A5/A6/A7. Миграции 0050-0052 провалидированы на чистом PG16.

**Остаётся 1 P1 — требует продуктового решения (не делал):**
- **Telegram deep-link** (notifications/routes.ts:33-86): привязка chatId к орг по
  непроверяемому userId из payload. Нужно решить: one-time nonce из UI vs in-app
  подтверждение. Реализую после выбора подхода.

**⚠️ Деплой:** миграции 0050-0052 меняют прод-схему (DROP/CREATE INDEX, ALTER TYPE).
Применяются `deploy.sh` атомарно (BEGIN/COMMIT, ON_ERROR_STOP). Перед накатом —
pg_dump (deploy делает pre-deploy backup). Идемпотентны при повторном прогоне.

## Главный вывод — системные паттерны

Топ-классы по частоте: `корректность` ×31, `correctness` ×26, `security` ×21, `error-handling` ×17, `целостность данных` ×16, `безопасность` ×13.

Системно повторяется по модулям несколько классов: **(1)** атомарность/целостность — read-modify-write и проверка-затем-запись вне транзакций (TOCTOU) в финансах, инспекциях, onboarding, заявках; **(2)** harden-пробелы аутентификации/анти-bruteforce (см. P1 по `trustProxy`/rate-limit, накопление кодов verify-email); **(3)** рассинхрон слоёв — ссылки на несуществующие роли/поля, расхождения `schema.ts` ↔ миграции ↔ runtime; **(4)** error-handling — утечки сырых ошибок/имён ограничений и недостаточная нормализация ответов. Слабость процесса: точечные фиксы по одному модулю не разносятся на соседние с тем же паттерном — нужен **sweep по классу**, а не по отдельной находке (повтор вывода аудита 2026-05-28).

## TOP-10 на немедленную починку

1. `apps/api/src/server.ts:221-226` — Login rate-limit bypass: trustProxy:true + loopback allowList → X-Forwarded-For spoof  → /transpult  _(P1/HIGH, api/auth)_
2. `apps/api/src/modules/billing/service.ts:174-220` — Смена тарифа: клиент платит цену нового плана, но planId подписки не меняется  → /transpult  _(P1/HIGH, api/billing)_
3. `apps/api/src/modules/billing/routes.ts:255-267` — Webhook возврата (refund.succeeded) ищет платёж по id рефанда → всегда no-op, возврат не фиксируется  → /transpult  _(P1/HIGH, api/billing)_
4. `apps/api/src/modules/carriers/routes.ts:162-230` — assign-carrier ставит carrierContractorId, но не переключает executionMode на 'subcontract'  → /transpult  _(P1/HIGH, api/carriers)_
5. `apps/api/src/modules/claims/service.ts:209-265` — Claim FSM не проверяет текущий статус: терминальные resolved/rejected можно переоткрыть и пере-resolve'ить (перезапись денег)  → /transpult  _(P1/HIGH, api/claims)_
6. `apps/api/src/modules/adr/routes.ts:52-65` — Cross-tenant IDOR в /orders/:id/adr-validation — vehicleId/driverId не проверяются на принадлежность орг  → /transpult  _(P1/HIGH, api/compliance+adr)_
7. `apps/api/src/modules/documents/routes.ts:21-146` — Несколько разных типов документов схлопываются в docType='other'/'upd' → unique-constraint 409 не даёт зарегистрировать второй оригинал по рейсу  → /transpult  _(P1/HIGH, api/documents)_
8. `apps/api/src/modules/documents/upd-pdf.ts:56-160` — corrective_upd печатается тем же generateUpdPdf со status:1 без строки исправления (1а) — корректировочный/исправленный УПД юридически неотличим от первичного  → /jurist  _(P1/HIGH, api/documents)_
9. `apps/api/src/modules/finance/tarification.service.ts:393-402` — НДС считается неверно для vatIncluded-тарифа: string-конкатенация в (100 + tariff.vatRate)  → /transpult  _(P1/HIGH, api/finance)_
10. `apps/api/src/modules/finance/finance.service.ts:601-636` — recordPartialPayment (/payments) не проверяет статус счёта — оплата draft/cancelled и FSM-обход  → /transpult  _(P1/HIGH, api/finance)_

## ЗАКРЫТО-НО-ОТКРЫТО

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/adr/routes.ts:52-65` — Cross-tenant IDOR в /orders/:id/adr-validation — vehicleId/driverId не проверяются на принадлежность орг  -> /transpult  _(api/compliance+adr, безопасность)_
- **✅ ЗАКРЫТО (`e9c3bf1`, 2026-06-15):** добавлены assertVehicleAccess + assertDriverAccess (помимо assertOrderAccess) — vehicleId/driverId из query проверяются на принадлежность орг.

- **Что не так:** Роут GET /api/orders/:id/adr-validation?vehicleId=&driverId= вызывает только `await assertOrderAccess(params.data.id, user)`, после чего `validateAdrCompatibility(params.data.id, query.data.vehicleId, query.data.driverId)`. Сам сервис (service.ts:61-74) тянет vehicle и driver ТОЛЬКО по `eq(vehicles.id, vehicleId)` / `eq(drivers.id, driverId)` без org-фильтра. vehicleId/driverId из query НЕ проходят assertVehicleAccess/assertDriverAccess. Staff-пользователь org A, имея свою заявку с adrClass, может подставить vehicleId/driverId чужой орг B и получить в ответе: `adrEquipped` чужого ТС и состояние ADR-сертификата чужого водителя (нет/истёк/действует) — то есть подтверждение существования сущностей и их compliance-атрибутов другого тенанта.
- **Воспроизведение:** 1. Логин staff org A (admin/manager). 2. Взять свой orderId с заполненным adr_class. 3. GET /api/orders/{orderIdA}/adr-validation?vehicleId={vehicleIdB}&driverId={driverIdB}, где B-сущности принадлежат другой орг. 4. Ответ data.errors раскрывает, оборудовано ли чужое ТС под ADR и истёк ли ADR-сертификат чужого водителя (200 вместо 403).
- **Направление фикса:** В роуте Wave5 после assertOrderAccess добавить assertVehicleAccess(query.vehicleId, user) и assertDriverAccess(query.driverId, user) (как уже сделано в compliance/adr/routes.ts validate-hard, строки 95-97), либо протолкнуть organizationId в validateAdrCompatibility и фильтровать vehicle/driver по орг.
- **Верификация:** apps/api/src/modules/adr/routes.ts:1-68; apps/api/src/modules/adr/service.ts:29-96; apps/api/src/modules/compliance/adr/routes.ts:81-105 (C3 fix comment + assertVehicleAccess/assertDriverAccess); apps/api/src/auth/guards.ts:260-292 (org-scope enforcement); server.ts:383 (route registered)
- **QA-корректировка:** Эквивалентная дыра закрыта в compliance/adr/routes.ts (validate-hard, комментарий «C3 механизм а», assertVehicleAccess/assertDriverAccess добавлены), но старый Wave5-роут /orders/:id/adr-validation тем же фиксом НЕ покрыт и остаётся уязвим. Числится закрытым в духе ремедиации C3 cross-tenant; фактически для этого эндпоинта отсутствует.

#### [P2][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/compliance/tachograph/service.ts:63-89` — TOCTOU: check-then-insert tachograph_records после добавления уникального индекса → 500 вместо идемпотентности  -> /transpult  _(api/compliance+adr, целостность данных)_

- **Что не так:** ingestDddBuffer делает SELECT-существование (`existing.length > 0` → continue) и затем `db.insert(tachographRecords)` без onConflict. Но в schema.ts:1047 добавлен `uniqueIndex('uq_tachograph_driver_date_source').on(driverId, date, source)` (C9, миг.0044). При двух одновременных загрузках одного .DDD оба запроса проходят SELECT (запись ещё не вставлена), затем второй INSERT падает на unique-violation → необработанный PG-error всплывает в глобальный обработчик как 5xx. Идемпотентность через application-level SELECT теперь конкурирует с БД-констрейнтом и при гонке ломается.
- **Воспроизведение:** 1. admin/manager/mechanic. 2. Дважды конкурентно (или ретраем при таймауте) POST /api/compliance/tachograph/upload с одним и тем же .DDD одного водителя на одну дату. 3. Один из запросов получает 500 (в dev — текст PG unique-violation; в prod — 'Внутренняя ошибка сервера') вместо тихого пропуска дубля.
- **Направление фикса:** Заменить SELECT-then-INSERT на `db.insert(...).onConflictDoNothing({ target: [driverId, date, source] })` (использовать сам уникальный индекс как источник идемпотентности), либо обернуть в транзакцию с обработкой ошибки unique-violation. SELECT-проверку можно убрать.
- **Верификация:** apps/api/src/modules/compliance/tachograph/service.ts:49-120 (плоский insert без onConflict, стале-комментарий 66-68); apps/api/src/db/schema.ts:1029-1048 (uniqueIndex uq_tachograph_driver_date_source на driverId,date,source); apps/api/drizzle/0044_tachograph_unique_driver_date_source.sql:1-31 (реальный CREATE UNIQUE INDEX); apps/api/src/modules/compliance/tachograph/routes.ts:24-105 (вызов ingestDddBuffer без try/catch, ошибка → глобальный handler)
- **QA-корректировка:** Идемпотентность .DDD числится закрытой дважды: комментарий в service.ts:69-71 (application-level SELECT) и C9/миг.0044 уникальный индекс в schema.ts:1046. Фактически слой кода не использует onConflict под новый индекс — под конкуренцией дубль-загрузка падает в 500 вместо идемпотентного скипа.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/fleet/routes.ts:125-127` — PUT /fleet/vehicles/:id silently drops status, currentOdometerKm, isArchived (Zod strips fields VehicleCreateSchema omits)  -> /transpult  _(api/fleet, correctness)_
- **✅ ЗАКРЫТО (`791f1d5`, 2026-06-15):** новая VehicleUpdateSchema (omit только id/createdAt/updatedAt, .partial()) включает status/currentOdometerKm/isArchived; updateVehicle их уже применяет.

- **Что не так:** Route validates the update body with `VehicleCreateSchema.partial().safeParse(request.body)` (routes.ts:125). VehicleCreateSchema (packages/shared/src/schemas.ts:146-149) explicitly `.omit({ ... status: true, isArchived: true, currentOdometerKm: true })`. Zod object schemas strip unknown keys by default, so `parsed.data` never contains status/currentOdometerKm/isArchived. The service `updateVehicle` (service.ts:281-286) lists `currentOdometerKm`,`isArchived` in `directFields` and handles `if (data.status) updateData.status = data.status` — but those keys were already removed, so the branches are dead. Net effect: manual vehicle status changes (e.g. available→in_repair), archiving a vehicle, and odometer correction via the PUT endpoint all silently no-op (200 OK, nothing written). The status-change event recorder at service.ts:302-311 can never fire.
- **Воспроизведение:** As manager/admin (update Vehicle ability) call PUT /fleet/vehicles/{id} with body {"status":"in_repair"} or {"isArchived":true} or {"currentOdometerKm":150000}. Response 200 with data, but DB row status/is_archived/current_odometer_km unchanged. Re-GET confirms no change and no vehicle.status_changed event in journal.
- **Направление фикса:** Use a dedicated VehicleUpdateSchema that explicitly permits the mutable operational fields (status, currentOdometerKm, isArchived, document expiries) instead of VehicleCreateSchema.partial(); keep create/update DTOs distinct (same pattern already used for Driver/Order). Verify the status-change event then fires.
- **Верификация:** apps/api/src/modules/fleet/routes.ts:117-132; packages/shared/src/schemas.ts:120-149; apps/api/src/modules/fleet/service.ts:277-313; docs/qa/code-audit-2026-05-28.md:825-830,1247
- **QA-корректировка:** docs/qa/code-audit-2026-05-28.md:1247 (web-fleet-1) flags this same VehicleCreateSchema.partial() strip but only names the `isBlocked` field (a phantom field) as [HIGH] layer-drift. The operationally severe consequence — that the real domain fields status / currentOdometerKm / isArchived are also stripped, so vehicle status transitions, archiving and odometer correction via PUT are dead — is not called out and remains open.

#### [P1][MEDIUM] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/fleet/service.ts:84-86` — Fleet GET list endpoints lack org-less DENY — misconfigured org-less non-admin reads all tenants  -> /transpult  _(api/fleet, security)_
- **✅ ЗАКРЫТО (`4c749eb`, 2026-06-15):** listVehicles/getVehicle: org-less не-super-admin → DENY (sql`false`); crossTenant=isPlatformSuperAdmin(user) из роутов.

- **Что не так:** Every fleet list reader scopes tenancy only with `if (filters.organizationId) conditions.push(eq(..., organizationId))` — e.g. listVehicles (service.ts:84-86), listDrivers (343-345), listContractors (503-505), listFuelRecords (988), listOdometerReadings (1082), listDowntimeRecords (1132), listMaintenanceSchedule (1198), listPermits via scopedVehicleCondition (771), listFines (856), finesAnalytics (1406). When organizationId is undefined the WHERE simply has no tenant filter, returning ALL tenants' rows. The route handlers (routes.ts GET /fleet/*) gate only with `requireAbility(...)` (RBAC) and never call assertOrganizationScope, so an org-less account that is NOT the platform super-admin (a misconfig, which guards.ts:57-60 is explicitly written to DENY elsewhere) reads cross-tenant fleet data.
- **Воспроизведение:** Provision a privileged role (e.g. manager) with organizationId=null but not role 'admin'. Call GET /fleet/vehicles (or /fleet/fuel-records, /fleet/fines, etc.). isPlatformSuperAdmin=false yet the list returns vehicles/fuel/fines of every organization, because the service applies no filter when organizationId is falsy and no guard runs on the read path.
- **Направление фикса:** Route org-less non-super-admin to DENY (or empty) on these read paths, mirroring the C3 «б» pattern already applied to tariffs/invoices/telegram/settings/adr/incidents/sprint9-trailers: in the service, when organizationId is absent, require isPlatformSuperAdmin or return empty/403 rather than an unscoped query.
- **Верификация:** apps/api/src/modules/fleet/service.ts:41-109 (listVehicles, vehicleOrgScope), 335-350 (listDrivers); apps/api/src/modules/fleet/routes.ts:60-99 (GET /fleet/vehicles → requireAbility + organizationId proxied, no assert*); apps/api/src/auth/guards.ts:40-79 (isPlatformSuperAdmin, assertOrganizationScope org-less DENY); apps/api/src/auth/rbac.ts:256-278 (requireAbility — only role, ignores organizationId); docs/qa/remediation-tracker.md:146-178 (matrix tests + enumerated fixed list endpoints; fleet reads absent).
- **QA-корректировка:** docs/qa/remediation-tracker.md:153 claims the C3 mechanism «б» root is closed via assertOrganizationScope in auth/guards.ts ('закрывает org-less-аспект для всех guard-защищённых роутов разом'), and lines 158-174 enumerate the individual hand-rolled list endpoints that were additionally fixed (tariffs, invoices, telegram, settings, adr, incidents, sprint9 trailers). Fleet GET list endpoints route through requireAbility only — not through any assert*-guard — and are NOT in that enumerated list (only the fleet create dup-checks 195-196 were touched), so the org-less leak remains open for fleet reads.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/inspections/service.ts:954-1083` — Decision-флип approved→rejected не блокирует ТС и не создаёт ремонт-заявку (каскад пропущен)  -> /transpult  _(api/inspections, correctness)_
- **✅ ЗАКРЫТО (`28207d2`, 2026-06-15):** updateTech при *→rejected реплицирует каскад createTech (ТС→broken + repairRequest + события); updateMed пишет trip.driver_cleared. Идемпотентно (previous!=='rejected'). Lock-in тест обновлён + тест идемпотентности.

- **Что не так:** updateTechInspectionDecision при смене approved→rejected делает только `tx.update(techInspections).set({decision, comment})` (стр.975-979) и журналит inspection.decision_changed — НЕ ставит vehicles.status='broken' и НЕ создаёт repairRequests, в отличие от createTechInspection (стр.363-397, где rejection блокирует ТС + создаёт заявку). Аналогично updateMedInspectionDecision (стр.1041-1072): при approved→rejected нет события trip.driver_cleared, которое createMedInspection пишет на rejection (стр.667-679). Тест service.test.ts:143 фиксирует, что set-payload — ровно {comment, decision}, т.е. отсутствие каскада сейчас закреплено как «ожидаемое». Итог: ТС, забракованное через быстрый эндпоинт очереди, остаётся в рабочем статусе и без заявки на ремонт — может уйти в рейс.
- **Воспроизведение:** 1) Механик создаёт техосмотр decision=approved (ТС available). 2) В UI очереди жмёт «отклонить»: POST /api/inspections/tech/:id/decision {decision:'rejected', notes:'тормоза'}. 3) Запись становится rejected, но vehicles.status НЕ меняется на broken и repairRequests не создаётся → ТС остаётся доступным для назначения. Для медосмотра: POST /api/inspections/med/:id/decision {decision:'rejected', notes:...} — нет события очистки водителя с рейса.
- **Направление фикса:** В updateTechInspectionDecision при переходе *→rejected внутри той же tx выполнять тот же каскад, что createTechInspection: vehicles.status='broken'/'maintenance' + repairRequests + событие vehicle.status_changed (идемпотентно, чтобы не задвоить при повторном rejected). В updateMedInspectionDecision при *→rejected писать trip.driver_cleared.
- **Верификация:** apps/api/src/modules/inspections/service.ts:340-405 (createTech cascade), :640-686 (createMed driver_cleared), :954-1083 (updateTech/MedInspectionDecision); service.test.ts:124-189 (lock-in test); routes.ts:23-25,626-674 (pure delegation)
- **QA-корректировка:** Числится закрытым: docs/qa/code-audit-2026-05-28.md:527-540 (P1 updateTech/MedInspectionDecision immutability/note). Иммутабельность rejected→approved и note-required действительно добавлены (стр.964-970, 1032-1039) и подтверждены тестами. Но обратный переход approved→rejected без каскада блокировки ТС/создания ремонта в аудите не разбирался и остаётся открытым.

#### [P2][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/onboarding/routes.ts:217-222` — save-integration-choice: onboardingStep выставляется константой (4/5), даёт регрессию шага — тот же класс бага, что C9 чинил в profile через GREATEST  -> /transpult  _(api/onboarding, correctness)_

- **Что не так:** `if (providerType === 'edi') { await db.update(organizations).set({ onboardingStep: 4 })... } else if (providerType === 'signature') { ... onboardingStep: 5 ... }` — шаг присваивается жёсткой константой без GREATEST. В profile (line 143) тот же паттерн уже признан багом C9 и исправлен на `GREATEST(${organizations.onboardingStep}, 2)` именно чтобы не регрессировать продвинувшихся юзеров. Здесь регрессия реальна: пользователь дошёл до шага 5 (signature), затем правит ранее выбранный EDI-провайдер (повторный POST с providerType='edi') → onboardingStep откатывается 5 → 4. Аналогично complete (step=6) с последующим редактированием EDI откатит 6→4.
- **Воспроизведение:** 1) admin проходит мастер до signature: onboardingStep=5. 2) Возвращается изменить EDI-провайдера: POST /onboarding/save-integration-choice {providerType:'edi',providerName:'diadoc',defer:false,credentials:{...}}. 3) В БД onboardingStep=4 — мастер откатывает прогресс на UI.
- **Направление фикса:** Применить тот же приём, что в profile: вместо константы использовать GREATEST(onboardingStep, 4) / GREATEST(onboardingStep, 5), чтобы повторное сохранение интеграции не понижало достигнутый шаг.
- **Верификация:** apps/api/src/modules/onboarding/routes.ts:120-146 (C9 GREATEST в /profile), :169-227 (/save-integration-choice, константы 4/5 на lines 217-222 + update existing 200-206), :148-167 (/select-scenario const 3), :302-317 (/complete const 6), :1-5 (комментарий: EDI=step4, signature=step5 один эндпоинт)
- **QA-корректировка:** C9 числится закрытым для onboardingStep (см. комментарий routes.ts:141-143 'C9: было Math.max(2,0) ... GREATEST не даёт регресс'). Фикс применён только к /profile; в /save-integration-choice (edi/signature) и /complete остался прежний паттерн жёсткой константы — тот же регрессионный баг не закрыт в этих ветках.

#### [P2][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/signatures/gosklyuch-callback.integration.test.ts:267-559` — 6 из 8 integration-тестов callback'а отключены через describe.skip (FIXME W1-test-debt) — критичные ветки chain-of-trust не покрыты  -> /pm  _(api/signatures, undone)_

- **Что не так:** После коммита de5ec68 (B3.1 'UPDATE+INSERT in tx') 5 describe-блоков помечены describe.skip с комментарием `FIXME(W1-test-debt): ... падают с 500 ... Skip'аем до спец-сессии`. Реально пропущены 6 блоков (lines 272,310,346,433,475,514). Это именно те тесты, что проверяют сердцевину chain-of-trust: production игнорирует body.mchdId, pendingSignatures-резолюция, удаление pending после успеха, merge signatureState, INN-mismatch→critical+pending_review, shape signatureEntry. Сейчас активны только HMAC/lookup/null-org ветки. Регрессии в seal-гейте и pendingSignatures пройдут незамеченными.
- **Воспроизведение:** Запустить vitest по файлу — 6 describe.skip не исполняются; покрытие production-ветки и pendingSignatures = 0.
- **Направление фикса:** Починить mock db.transaction (комментарий указывает на ESM hoist + drizzle helper symbols) и снять .skip; до починки не считать chain-of-trust протестированным.
- **Верификация:** apps/api/src/modules/signatures/gosklyuch-callback.integration.test.ts:1-26 (header/intent), :179-265 (active describe-блоки HMAC/lookup/null-org), :267-559 (FIXME-комментарий + 6 describe.skip); docs/qa/remediation-tracker.md:211-225,528-529 (B3.x tx-safety помечен [x]); git log de5ec68 (Batch 3+4+5 tx safety)
- **QA-корректировка:** B3.1 (tx UPDATE+INSERT) числится закрытым в комментарии теста (commit de5ec68) и в remediation-трекере как реализованный, но интеграционные тесты, доказывающие корректность этой и смежных веток, отключены skip'ом — фактически поведение под tx в проде не верифицировано тестами.

#### [P2][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/providers/signature/kontur-sign.ts:24-31` — Go-live trap: skeleton adapters report healthCheck ok:true while all methods throw (PROV-P0-2 applied unevenly)  -> /transpult  _(api/providers, integration)_

- **Что не так:** PROV-P0-2 fixed the go-live trap (skeleton must report ok:false) only for the ~9 adapters wired into realAdapterFactories (gosklyuch, diadoc, wialon/omnicomm/glonasssoft, crpt, yookassa, tinkoff). The remaining real skeletons still return ok:true when creds are merely present, e.g. kontur-sign.ts:26 `ok: Boolean(this.creds.apiKey && this.creds.certificateId)` with detail 'kontur sign credentials present' — yet sign()/verify() throw 'not yet implemented'. Same pattern: sbis-sign.ts:28, cadesplugin.ts:33 (`ok:true` hardcoded, verify() throws), fines/gibdd.ts:27, fines/fssp.ts:28, fines/autocode.ts:27, fuel-card/lukoil.ts:26, fuel-card/rosneft.ts:35, fuel-card/gazpromneft.ts:26, edi/kontur.ts:31, edi/sbis.ts:30, ofd/ofd-ru.ts:21. An operator who later wires any of these into realAdapterFactories (index.ts:61) inherits the exact 'production healthy' false signal PROV-P0-2 was meant to kill; the credential-test endpoint (modules/integrations/credentials/routes.ts:268) would write lastError=null/status stays active, then selectAdapter() routes live traffic to a method that throws.
- **Воспроизведение:** 1) Add `['signature:kontur_sign', c => new KonturSignSignatureProvider(c)]` to realAdapterFactories. 2) As admin POST /integrations/credentials {providerType:'signature',providerName:'kontur_sign',credentials:{apiKey:'x',certificateId:'y'},status:'active'}. 3) POST /integrations/credentials/:id/test → returns ok:true, lastError cleared. 4) Trigger a real sign → KonturSignSignatureProvider.sign() throws 'not yet implemented'. Admin saw 'healthy'.
- **Направление фикса:** Apply the PROV-P0-2 invariant uniformly: every adapter whose execute/sign/send/verify/sync paths are stubs must return ok:false from healthCheck with a 'skeleton — integration not live' detail, regardless of creds presence. Mirror the already-correct gosklyuch.ts/diadoc.ts/wialon.ts pattern. Alternatively centralize a `notLiveHealth()` helper so new skeletons can't regress.
- **Верификация:** apps/api/src/providers/signature/kontur-sign.ts:24-31,37-63; apps/api/src/providers/signature/gosklyuch.ts:34-45 (PROV-P0-2 ok:false); apps/api/src/providers/signature/sbis-sign.ts:26-33; apps/api/src/providers/index.ts:61-106,133-149 (realAdapterFactories без kontur_sign/sbis_sign/прочих скелетов); grep ok: по cadesplugin/fines(gibdd,fssp,autocode)/fuel-card(lukoil,rosneft,gazpromneft)/edi(kontur,sbis)/ofd-ru — все ok:true|Boolean(creds); apps/api/src/modules/integrations/credentials/routes.ts:239-290 (instantiateRealAdapter gate + lastError clearing)
- **QA-корректировка:** PROV-P0-2 (see commit/doc references in gosklyuch.ts:35, diadoc.ts:31, wialon.ts:41 and signatures.test.ts:68) claims the skeleton-healthCheck go-live trap is closed. It is closed only for the adapters present in realAdapterFactories (index.ts:61-78). The 13 unwired skeletons listed above never received the fix, so the trap is fully reintroduced the moment any of them is registered. Currently latent because they are unreachable via selectAdapter/instantiateRealAdapter, hence P2 not P1.

## Разбор по severity

### P0

P0 не обнаружено в верифицированном наборе.

### P1 — 27 (полный формат)

#### [P1][HIGH] `apps/api/src/server.ts:221-226` — Login rate-limit bypass: trustProxy:true + loopback allowList → X-Forwarded-For spoof  -> /transpult  _(api/auth, security)_
- **✅ ЗАКРЫТО (`28207d2`, 2026-06-15):** allowList проверяет `request.socket.remoteAddress` (реальный TCP-пир), а не spoof-able `request.ip` из XFF.

- **Что не так:** Глобальный rate-limit (включая /api/auth/login, /signup, /verify-email, /forgot-password — все наследуют LOGIN_RATE_LIMIT_MAX через config.rateLimit в auth.ts) полностью отключается для loopback: `allowList: (request) => { if (request.ip === '127.0.0.1' || request.ip === '::1') return true; ... }`. При этом сервер сконфигурирован `trustProxy: true` (server.ts:116) — Fastify безусловно доверяет ВСЕЙ цепочке X-Forwarded-For. Внешний атакующий шлёт заголовок `X-Forwarded-For: 127.0.0.1`, Fastify вычисляет request.ip='127.0.0.1', allowList возвращает true → brute-force логина/кодов подтверждения без какого-либо лимита. keyGenerator (server.ts:217-219) тоже становится управляемым: ротация подделанного XFF даёт новый бакет на каждый запрос.
- **Воспроизведение:** 1) curl -X POST https://host/api/auth/login -H 'X-Forwarded-For: 127.0.0.1' -d '{"email":"victim@org","password":"guess1"}'. 2) Повторить >5 раз/мин с тем же заголовком — 429 не наступает (allowList exempt). 3) Перебирать пароль/6-значный код verify-email неограниченно.
- **Направление фикса:** trustProxy не должен быть `true` (доверие всей цепочке). Ограничить доверие конкретным hop'ом прокси (trustProxy: <nginx IP> или число хопов), чтобы клиент не мог инъектировать loopback в XFF. Дополнительно: loopback-exempt в allowList завязать на проверку, что соединение реально пришло с loopback-сокета (request.socket.remoteAddress), а не на производный request.ip; либо вынести exempt только для внутренних health/SSE-путей, не для auth.
- **Верификация:** apps/api/src/server.ts:35-39,116,209-227 (RATE_LIMIT/trustProxy/allowList); apps/api/src/auth/auth.ts:62-66,147-149,218-220,1338-1340,1449-1451,1532-1534 (per-route LOGIN_RATE_LIMIT через тот же плагин); nginx/default.conf:33 и nginx/default-ssl.conf:50 ($proxy_add_x_forwarded_for, нет real_ip директив); живой Fastify-тест trustProxy:true → request.ip берётся из левого элемента подделанного XFF

#### [P1][HIGH] `apps/api/src/modules/billing/service.ts:174-220` — Смена тарифа: клиент платит цену нового плана, но planId подписки не меняется  -> /transpult  _(api/billing, money/корректность)_
- **✅ ЗАКРЫТО (`6ff8fb4`, 2026-06-15):** целевой `planId` сохраняется в `payment.providerMetadata.targetPlanId` при checkout и применяется к подписке на webhook'е `succeeded` (handlePaymentCallback). До оплаты планId не меняется.

- **Что не так:** В createPayment при СУЩЕСТВУЮЩЕЙ подписке planId никогда не обновляется. Если орг уже имеет подписку на 'pro' и оформляет 'business', цена платежа берётся из нового плана (`amountKopecks: plan.priceMonthlyKopecks`, строки 186-190), но в подписке обновляются только paymentProvider/paymentExternalId (строки 207-213). startTrial (где planId всё-таки пишется) вызывается ТОЛЬКО когда подписки нет (строка 176-178). В payment-строку запрошенный planId тоже не сохраняется, поэтому webhook не знает, какой план куплен — handlePaymentCallback в succeeded-ветке (строки 342-351) обновляет status/период, но НЕ planId. Итог: клиент оплачивает цену business, а получает pro (или наоборот при downgrade платит больше/меньше реального плана).
- **Воспроизведение:** 1) Орг с активной подпиской planId='pro'. 2) admin вызывает POST /billing/subscribe {planId:'business'} (при ALLOW_ONLINE_PAYMENTS=true). 3) Создаётся payment на цену business. 4) ЮKassa шлёт succeeded webhook. 5) subscriptions.planId остаётся 'pro', период продлён, при этом списана сумма business. Лимиты/фичи остаются от pro.
- **Направление фикса:** Сохранять запрошенный planId в payments (новая колонка или providerMetadata) на момент создания платежа; в succeeded-ветке handlePaymentCallback применять этот planId к подписке (set planId). Либо в createPayment для существующей подписки явно фиксировать целевой план как pending-change. Покрыть тестом upgrade pro→business.
- **Верификация:** apps/api/src/modules/billing/service.ts:160-220 (createPayment), :96-138 (startTrial — planId только тут), :315-351 (webhook succeeded), :79-93 (getActiveSubscription); apps/api/src/db/schema.ts:1858-1876 (payments без plan_id); apps/api/src/modules/billing/routes.ts:137-162 (subscribe→createPayment без отдельного plan-update)

#### [P1][HIGH] `apps/api/src/modules/billing/routes.ts:255-267` — Webhook возврата (refund.succeeded) ищет платёж по id рефанда → всегда no-op, возврат не фиксируется  -> /transpult  _(api/billing, money/корректность)_
- **✅ ЗАКРЫТО (`6ff8fb4`, 2026-06-15):** схема извлекает `object.payment_id`; для refund.succeeded lookup идёт по нему (а не по id рефанда). Нет payment_id → 400 + warn-лог.

- **Что не так:** Для события refund.succeeded mapYookassaStatus возвращает 'refunded' (строка 287), но в route всегда передаётся `externalId: object.id` (строка 263). В конверте ЮKassa для refund.succeeded `object` — это объект Возврата, чей `id` — id рефанда, а связанный платёж лежит в отдельном поле `object.payment_id` (которое YookassaWebhookSchema даже не извлекает, строки 102-114). handlePaymentCallback ищет `payments.providerPaymentId == object.id` (id рефанда) — совпадения НЕТ → возвращает {paymentId:null,...} (service.ts:280-282). Платёж никогда не помечается 'refunded', refunded-ветка service.ts:410-419 недостижима по реальному вебхуку.
- **Воспроизведение:** 1) Успешный платёж pay-1 с providerPaymentId='2c85...' (id платежа). 2) Оператор делает возврат в ЮKassa → прилетает refund.succeeded, object.id='3a72...' (id рефанда), object.payment_id='2c85...'. 3) Route шлёт externalId='3a72...'. 4) Поиск payments по providerPaymentId='3a72...' пуст → no-op. Платёж остаётся 'succeeded'.
- **Направление фикса:** Добавить в YookassaWebhookSchema поле object.payment_id; для refund-событий передавать externalId = object.payment_id (id исходного платежа), а dedup eventId строить от object.id рефанда. Покрыть тестом refund.succeeded с разными id рефанда и платежа.
- **Верификация:** apps/api/src/modules/billing/routes.ts:102-114 (схема без payment_id), :255-267 (externalId=object.id), :286-295 (mapYookassaStatus); apps/api/src/modules/billing/service.ts:184-204 (providerPaymentId=id платежа), :270-282 (lookup и no-op), :410-419 (refunded-ветка)

#### [P1][HIGH] `apps/api/src/modules/carriers/routes.ts:162-230` — assign-carrier ставит carrierContractorId, но не переключает executionMode на 'subcontract'  -> /transpult  _(api/carriers, correctness)_
- **✅ ЗАКРЫТО (A2, `b632f47`, 2026-06-15):** UPDATE в той же транзакции ставит `execution_mode='subcontract'` и обнуляет `own_cost_estimate` (XOR-CHECK `trips_cost_matches_mode`). 21 carriers-тест зелёный.

- **Что не так:** POST /trips/:id/assign-carrier делает только `db.update(trips).set({ carrierContractorId: ..., updatedAt: ... })` (стр. 221-225). executionMode и subcontractorCost не трогаются. В схеме executionMode по умолчанию 'own' (schema.ts:517). При этом именно executionMode === 'subcontract' управляет: (а) расчётом маржи — margin.ts:72-84 берёт subcontractorCost/ownCostEstimate, costSource классифицируется по этим полям, не по carrierContractorId; (б) выпуском ПЛ — waybills/service.ts:467 и etrn-guard.ts:37 блокируют/меняют логику при 'subcontract'; (в) ролью в ЭТрН — sign-endpoint.ts:197 меняет структуру/роль перевозчика в ЭТрН при 'subcontract'. Итог: рейс реально отдан субподрядчику, но система продолжает считать его собственным — маржа считается по own_cost_estimate, ПЛ выпускается как на свой транспорт, роль в ЭТрН неверна.
- **Воспроизведение:** 1. Роль logist/admin, рейс в статусе planning. 2. POST /trips/{id}/assign-carrier {carrierContractorId: <uuid>}. 3. Прочитать trip: carrier_contractor_id заполнен, но execution_mode='own'. 4. Запросить маржу рейса — берётся own_cost_estimate (а не стоимость субподряда); попытка выпуска ПЛ/ЭТрН трактует рейс как собственный.
- **Направление фикса:** В том же UPDATE (внутри транзакции) выставлять executionMode='subcontract'; продумать привязку/перенос стоимости в subcontractorCost (хотя бы дефолтные ставки из carrier_contracts). Либо явно задокументировать, что assign-carrier — отдельный шаг, и заблокировать выпуск ПЛ/ЭТрН до проставленного executionMode. Согласовать с /jurist корректность роли в ЭТрН.
- **Верификация:** apps/api/src/modules/carriers/routes.ts:162-230; apps/api/src/db/schema.ts:507-519; apps/api/src/modules/trips/margin.ts:60-109; apps/api/src/modules/trips/service.ts:408-410 (grep); apps/api/src/modules/waybills/service.ts:460-476; grep executionMode по apps/api/src (только service.ts:408 пишет, нет update-пути)

#### [P1][HIGH] `apps/api/src/modules/claims/service.ts:209-265` — Claim FSM не проверяет текущий статус: терминальные resolved/rejected можно переоткрыть и пере-resolve'ить (перезапись денег)  -> /transpult  _(api/claims, correctness)_
- **✅ ЗАКРЫТО (`6ff8fb4`, 2026-06-15):** updateStatus/resolve в транзакции с SELECT FOR UPDATE + `isTerminalClaimStatus()`-гард; терминальный claim → `ClaimFsmError` → 409. Чистый хелпер `isTerminalClaimStatus` покрыт unit-тестами (раньше тест проверял только Zod).

- **Что не так:** updateStatus и resolve обновляют claim безусловно по id, без чтения и проверки текущего status. updateStatus: `db.update(claims).set({ status: update.status, ... }).where(eq(claims.id, id))` — route /claims/:id/status принимает status open|investigating без проверки, что claim ещё не терминальный, поэтому resolved/rejected претензию можно вернуть в open/investigating. resolve: `.set({ status: data.status, resolvedAmount: ..., resolvedBy, resolvedAt: new Date(), resolution })` — уже resolved претензию можно повторно resolve с другой суммой, перезатирая resolvedAmount/resolvedBy/resolvedAt/resolution (resolution даже не сохраняет прежнее значение — appendSettlementNote(data.resolution, note) строит с нуля). Тест claims-service.test.ts:73 утверждает «resolve endpoint only accepts terminal states / cannot move a claim back to open», но проверяет ТОЛЬКО Zod-схему, а не runtime-FSM — фактической защиты нет.
- **Воспроизведение:** 1) logist/admin: POST /claims/:id/resolve {status:'resolved', resolvedAmount:8000, resolution:'согласовано'} → claim терминальный, resolvedAmount=8000, resolvedAt зафиксирован. 2a) PATCH /claims/:id/status {status:'open'} → 200, claim снова open (settlement откатан без следа в resolvedAmount). 2b) повторно POST /claims/:id/resolve {status:'resolved', resolvedAmount:99999, resolution:'другое'} → 200, resolvedAmount перезаписан на 99999, resolvedBy/resolvedAt переписаны.
- **Направление фикса:** Ввести явный FSM-guard: перед updateStatus/resolve читать текущий status (в той же транзакции / через условие в WHERE: AND status IN ('open','investigating')) и отклонять переходы из терминальных resolved/rejected (409/400). resolve должен запрещаться для уже-терминальных претензий. Рассмотреть единую таблицу допустимых переходов в claim-policy. Сделать update+проверку атомарными (status в WHERE + проверка affected rows).
- **Верификация:** apps/api/src/modules/claims/service.ts:209-265 (updateStatus, resolve); apps/api/src/modules/claims/routes.ts:30-40,228-274 (ClaimStatusSchema/ClaimResolveSchema, status+resolve routes, ensureClaimAccess 50-95); apps/api/src/modules/claims/claims-service.test.ts:59-93 (тест только schema-валидация); apps/api/src/db/schema.ts:1486,1499 (claimStatusEnum, status notNull default open, без CHECK на FSM)

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/adr/routes.ts:52-65` — Cross-tenant IDOR в /orders/:id/adr-validation — vehicleId/driverId не проверяются на принадлежность орг  -> /transpult  _(api/compliance+adr, безопасность)_
- **✅ ЗАКРЫТО (`e9c3bf1`, 2026-06-15):** добавлены assertVehicleAccess + assertDriverAccess (помимо assertOrderAccess) — vehicleId/driverId из query проверяются на принадлежность орг.

- **Что не так:** Роут GET /api/orders/:id/adr-validation?vehicleId=&driverId= вызывает только `await assertOrderAccess(params.data.id, user)`, после чего `validateAdrCompatibility(params.data.id, query.data.vehicleId, query.data.driverId)`. Сам сервис (service.ts:61-74) тянет vehicle и driver ТОЛЬКО по `eq(vehicles.id, vehicleId)` / `eq(drivers.id, driverId)` без org-фильтра. vehicleId/driverId из query НЕ проходят assertVehicleAccess/assertDriverAccess. Staff-пользователь org A, имея свою заявку с adrClass, может подставить vehicleId/driverId чужой орг B и получить в ответе: `adrEquipped` чужого ТС и состояние ADR-сертификата чужого водителя (нет/истёк/действует) — то есть подтверждение существования сущностей и их compliance-атрибутов другого тенанта.
- **Воспроизведение:** 1. Логин staff org A (admin/manager). 2. Взять свой orderId с заполненным adr_class. 3. GET /api/orders/{orderIdA}/adr-validation?vehicleId={vehicleIdB}&driverId={driverIdB}, где B-сущности принадлежат другой орг. 4. Ответ data.errors раскрывает, оборудовано ли чужое ТС под ADR и истёк ли ADR-сертификат чужого водителя (200 вместо 403).
- **Направление фикса:** В роуте Wave5 после assertOrderAccess добавить assertVehicleAccess(query.vehicleId, user) и assertDriverAccess(query.driverId, user) (как уже сделано в compliance/adr/routes.ts validate-hard, строки 95-97), либо протолкнуть organizationId в validateAdrCompatibility и фильтровать vehicle/driver по орг.
- **Верификация:** apps/api/src/modules/adr/routes.ts:1-68; apps/api/src/modules/adr/service.ts:29-96; apps/api/src/modules/compliance/adr/routes.ts:81-105 (C3 fix comment + assertVehicleAccess/assertDriverAccess); apps/api/src/auth/guards.ts:260-292 (org-scope enforcement); server.ts:383 (route registered)
- **QA-корректировка:** Эквивалентная дыра закрыта в compliance/adr/routes.ts (validate-hard, комментарий «C3 механизм а», assertVehicleAccess/assertDriverAccess добавлены), но старый Wave5-роут /orders/:id/adr-validation тем же фиксом НЕ покрыт и остаётся уязвим. Числится закрытым в духе ремедиации C3 cross-tenant; фактически для этого эндпоинта отсутствует.

#### [P1][HIGH] `apps/api/src/modules/documents/routes.ts:21-146` — Несколько разных типов документов схлопываются в docType='other'/'upd' → unique-constraint 409 не даёт зарегистрировать второй оригинал по рейсу  -> /transpult  _(api/documents, корректность)_
- **✅ ЗАКРЫТО (`4069f83`, 2026-06-15):** миграция 0050 добавила в enum document_return_type значения 'waybill'/'cmr'; DocReturnTypeMap различимый (waybill→waybill, cmr→cmr). unique(tripId,docType) больше не путает типы — накладная и CMR регистрируются оба. Провалидировано на PG16.

- **Что не так:** DocReturnTypeMap маппит сразу несколько входных типов в один enum БД: waybill→'other', cmr→'other', other→'other', invoice→'upd' (routes.ts:21-28). Таблица documentReturns имеет уникальный индекс idx_doc_returns_trip_type на (tripId, docType) (schema.ts:1299). POST вставляет .values({ tripId: id, docType, ... }) (routes.ts:118-125). Значит на один рейс можно зарегистрировать ТОЛЬКО ОДИН оригинал из группы {waybill, cmr, other}: первый insert проходит, второй (например cmr после waybill) ловит unique-conflict и возвращается как 409 'Не удалось создать запись' (routes.ts:144-147). Семантический тег documentType=cmr пишется в notes, но строка отклоняется — реестр оригиналов теряет документы.
- **Воспроизведение:** Роль с ability manage DocumentReturn. 1) POST /api/trips/{id}/document-returns {documentType:'waybill'} → 201. 2) POST /api/trips/{id}/document-returns {documentType:'cmr'} → 409 'Не удалось создать запись' (та же пара tripId,'other'). Реестр содержит только waybill; CMR зарегистрировать невозможно.
- **Направление фикса:** Либо расширить enum документов-возвратов до полного набора (waybill/cmr/invoice как отдельные значения) и снять схлопывание, либо изменить уникальность на (tripId, docType, semanticType) / на (tripId, исходный_тип), либо хранить исходный тип в отдельной колонке и включить её в unique-индекс. Ошибку unique перестать выдавать как общий 409.
- **Верификация:** apps/api/src/modules/documents/routes.ts:1-160 (map :21-28, insert :115-125, 409 catch :144-147); apps/api/src/db/schema.ts:1286-1301 (enum + uniqueIndex :1299); apps/api/drizzle/0000_full_schema.sql:651 (CREATE UNIQUE INDEX idx_doc_returns_trip_type confirms enforcement in DB)

#### [P1][HIGH] `apps/api/src/modules/documents/upd-pdf.ts:56-160` — corrective_upd печатается тем же generateUpdPdf со status:1 без строки исправления (1а) — корректировочный/исправленный УПД юридически неотличим от первичного  -> /jurist  _(api/documents, корректность)_
- **✅ ЗАКРЫТО (A1, `3d432b0`, 2026-06-15):** `UpdPdfInput` += correctionKind/correctionNumber/correctionDate; заголовок КУПД/ИУПД + строка-ссылка 1б/1а; helper `resolveUpdCorrection()` подтягивает реквизиты исходного УПД по relatedInvoiceId во все 3 пути печати. Ожидает re-acceptance юриста (P1-5 был отозван).

- **Что не так:** generateUpdPdf не имеет полей correctionNumber/correctionDate и не печатает строку 1а (исправление), в отличие от sf-pdf.ts (sf-pdf.ts:36-37,54-59). Вызывающий finance/routes.ts направляет invoice.type==='corrective_upd' в этот же generateUpdPdf с захардкоженным status:1 (finance/routes.ts:621,626-642 и 864,867-883), не передавая никаких реквизитов исправления. Итоговый PDF корректировочного/исправленного УПД ничем не помечен как исправление: тот же заголовок 'УНИВЕРСАЛЬНЫЙ ПЕРЕДАТОЧНЫЙ ДОКУМЕНТ', тот же статус 1, нет ссылки на исправляемый документ. Для НДС/первички это делает документ дефектным (нельзя идентифицировать, что и когда исправлено).
- **Воспроизведение:** Создать invoice type='corrective_upd', выпустить PDF (GET .../pdf). PDF идентичен первичному УПД: нет строки '1а Исправление № __ от __', нет упоминания корректировки. Покупатель/ФНС не может отличить исправленный УПД от оригинала.
- **Направление фикса:** Добавить в UpdPdfInput поля исправления (correctionNumber/correctionDate) и блок строки 1а по аналогии с sf-pdf; отрисовывать пометку 'корректировочный/исправленный' для type corrective_upd. Согласовать с Jurist форму (КУД vs исправленный УПД — это разные документы).
- **Верификация:** apps/api/src/modules/documents/upd-pdf.ts:23-54 (нет полей исправления в UpdPdfInput), :56-257 (нет печати строки 1а); apps/api/src/modules/finance/routes.ts:621-642 и :864-883 (corrective_upd → generateUpdPdf, status:1, без correction-реквизитов); apps/api/src/modules/documents/sf-pdf.ts:36-38,54-59 (референс: строка 1а реализована для ИСФ)

#### [P1][HIGH] `apps/api/src/modules/finance/tarification.service.ts:393-402` — НДС считается неверно для vatIncluded-тарифа: string-конкатенация в (100 + tariff.vatRate)  -> /transpult  _(api/finance, money)_
- **✅ ЗАКРЫТО (`385dfdd`, 2026-06-15):** `tariff.vatRate`/`minTripCost` обёрнуты в `num()` — устранена string-конкатенация. 755 api-тестов зелёных.

- **Что не так:** В ветке `if (tariff.vatIncluded)` (default = true, schema.ts:313): `vatAmount = subtotal * (tariff.vatRate / (100 + tariff.vatRate))`. drizzle `numeric(...).$type<number>()` возвращает в рантайме СТРОКУ (по всему модулю tariff-поля оборачивают в num()/toFiniteNumber — ratePerKm:299, ratePerTon:303 и т.д. — именно потому что это строки). Здесь же vatRate НЕ обёрнут. `100 + "20.00"` даёт строку "10020.00" (конкатенация), затем `"20.00" / "10020.00"` ≈ 0.001996 вместо 20/120 ≈ 0.1667. НДС занижается в ~83 раза. Ветка vatIncluded=false (line 400) случайно корректна, т.к. `"20.00"/100` = деление, которое коэрсит к числу.
- **Воспроизведение:** Тариф с vatIncluded=true (значение по умолчанию), vatRate=20, рейс завершён. Любой путь расчёта стоимости: GET /finance/trips/:id/cost, авто-биллинг tryAutoCreateInvoice, generateInvoices, bulkGenerateInvoices. Ожидается vatAmount = total*20/120; фактически vatAmount ≈ subtotal*0.002, subtotal завышается на почти весь НДС. Счёт/СФ/УПД печатается и экспортируется в 1С с неверной суммой НДС.
- **Направление фикса:** Привести tariff.vatRate к числу через num()/toFiniteNumber перед арифметикой (как у остальных tariff-полей), либо вычислять rate один раз: const vr = num(tariff.vatRate); vatAmount = subtotal * vr/(100+vr). Также обернуть minTripCost (line 388) при присваивании в subtotal.
- **Верификация:** apps/api/src/modules/finance/tarification.service.ts:92-96 (num helper), :133-170 (raw tariff from db), :297-341 (other fields wrapped in num), :393-402 (the bug); apps/api/src/db/schema.ts:313-314 (vatIncluded default true, vatRate numeric().$type<number>()); apps/api/src/auth/auth.ts:1033 + finance/routes.ts:617 (Number(vatRate) coercion elsewhere confirming string at runtime); apps/api/test/integration/setup.ts:433-434 (fixture vatIncluded:true,vatRate:20)

#### [P1][HIGH] `apps/api/src/modules/finance/finance.service.ts:601-636` — recordPartialPayment (/payments) не проверяет статус счёта — оплата draft/cancelled и FSM-обход  -> /transpult  _(api/finance, correctness)_
- **✅ ЗАКРЫТО (`6ff8fb4`, 2026-06-15):** статус-гейт после SELECT FOR UPDATE — оплата допускается только для issued/paid_partial (как registerPayment), иначе 400.

- **Что не так:** Легаси-путь оплаты `recordPartialPayment` (route POST /finance/invoices/:invoiceId/payments, routes.ts:1138) внутри tx читает invoice FOR UPDATE, но НИКОГДА не проверяет invoice.status. Затем безусловно: `if (remainingAmount === 0 ... ) tx.update({status:'paid_full'})` / `else if (... invoice.status==='issued') paid_partial`. Для status='draft' первая ветка переведёт черновик сразу в paid_full (DB-триггер invoice_immutable пропускает, т.к. OLD.status='draft', а paid_amount/status не в whitelist). Для status='cancelled' аннулированный счёт можно перевести в paid_full (триггер не запрещает менять status/paid_amount). Параллельный новый registerPayment (invoice-workflow) корректно гейтит `['issued','paid_partial']` — здесь гейта нет.
- **Воспроизведение:** accountant: POST /finance/invoices/{draftId}/payments {amount: <total>} → черновик становится paid_full минуя выпуск (issued). Либо POST на cancelled-счёт с amount=remaining → аннулированный счёт «оплачен».
- **Направление фикса:** Добавить статус-гейт как в registerPayment: разрешать оплату только для issued/paid_partial, иначе InvoiceWorkflowError/400. По-хорошему этот легаси-путь свести к единому registerPayment (см. отдельную находку про дубль систем оплаты).
- **Верификация:** apps/api/src/modules/finance/finance.service.ts:584-647; apps/api/src/modules/finance/routes.ts:53-83,1138-1169; apps/api/src/modules/finance/invoice-workflow.service.ts:706-752 (gate at 711); apps/api/drizzle/0036_invoice_schema_rebuild.sql:148-198 (trigger invoice_check_immutable_fields)

#### [P1][HIGH] `apps/api/src/modules/finance/finance.service.ts:393-409` — KPI topDrivers без organizationId-фильтра — cross-tenant утечка водителей чужих орг  -> /transpult  _(api/finance, security)_
- **✅ ЗАКРЫТО (`4c749eb`, 2026-06-15):** добавлен `organizationId ? eq(trips.organizationId, organizationId) : undefined` в where (как в соседних KPI-запросах).

- **Что не так:** В getKpiMetrics все агрегаты в Promise.all отфильтрованы по organizationId (vehicles/contractors/trips...), КРОМЕ topDrivers (line 394-409): запрос trips→drivers→users имеет только условия status='completed' и диапазон дат, без `organizationId ? inArray(trips.vehicleId, ...)` или `eq(trips.organizationId, ...)`. Дашборд KPI одной организации показывает топ-водителей по рейсам ВСЕХ организаций (имена из users.fullName), плюс цифры рейсов смешиваются между тенантами.
- **Воспроизведение:** Залогиниться staff'ом орг A → GET /finance/kpi. В ответе topDrivers содержит ФИО водителей орг B/C с их счётчиком рейсов.
- **Направление фикса:** Добавить в where topDrivers тот же org-гейт, что и у tripCount (line 378-380): при organizationId — inArray(trips.vehicleId, vehicles этой орг) или eq(trips.organizationId, organizationId).
- **Верификация:** apps/api/src/modules/finance/finance.service.ts:340-410 (topDrivers query lines 393-409, WHERE 402-406 без org-фильтра; для сравнения org-фильтры на строках 343,352,361,370,378-380,390) и маппинг topDrivers 424-429

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/fleet/routes.ts:125-127` — PUT /fleet/vehicles/:id silently drops status, currentOdometerKm, isArchived (Zod strips fields VehicleCreateSchema omits)  -> /transpult  _(api/fleet, correctness)_
- **✅ ЗАКРЫТО (`791f1d5`, 2026-06-15):** новая VehicleUpdateSchema (omit только id/createdAt/updatedAt, .partial()) включает status/currentOdometerKm/isArchived; updateVehicle их уже применяет.

- **Что не так:** Route validates the update body with `VehicleCreateSchema.partial().safeParse(request.body)` (routes.ts:125). VehicleCreateSchema (packages/shared/src/schemas.ts:146-149) explicitly `.omit({ ... status: true, isArchived: true, currentOdometerKm: true })`. Zod object schemas strip unknown keys by default, so `parsed.data` never contains status/currentOdometerKm/isArchived. The service `updateVehicle` (service.ts:281-286) lists `currentOdometerKm`,`isArchived` in `directFields` and handles `if (data.status) updateData.status = data.status` — but those keys were already removed, so the branches are dead. Net effect: manual vehicle status changes (e.g. available→in_repair), archiving a vehicle, and odometer correction via the PUT endpoint all silently no-op (200 OK, nothing written). The status-change event recorder at service.ts:302-311 can never fire.
- **Воспроизведение:** As manager/admin (update Vehicle ability) call PUT /fleet/vehicles/{id} with body {"status":"in_repair"} or {"isArchived":true} or {"currentOdometerKm":150000}. Response 200 with data, but DB row status/is_archived/current_odometer_km unchanged. Re-GET confirms no change and no vehicle.status_changed event in journal.
- **Направление фикса:** Use a dedicated VehicleUpdateSchema that explicitly permits the mutable operational fields (status, currentOdometerKm, isArchived, document expiries) instead of VehicleCreateSchema.partial(); keep create/update DTOs distinct (same pattern already used for Driver/Order). Verify the status-change event then fires.
- **Верификация:** apps/api/src/modules/fleet/routes.ts:117-132; packages/shared/src/schemas.ts:120-149; apps/api/src/modules/fleet/service.ts:277-313; docs/qa/code-audit-2026-05-28.md:825-830,1247
- **QA-корректировка:** docs/qa/code-audit-2026-05-28.md:1247 (web-fleet-1) flags this same VehicleCreateSchema.partial() strip but only names the `isBlocked` field (a phantom field) as [HIGH] layer-drift. The operationally severe consequence — that the real domain fields status / currentOdometerKm / isArchived are also stripped, so vehicle status transitions, archiving and odometer correction via PUT are dead — is not called out and remains open.

#### [P1][MEDIUM] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/fleet/service.ts:84-86` — Fleet GET list endpoints lack org-less DENY — misconfigured org-less non-admin reads all tenants  -> /transpult  _(api/fleet, security)_
- **✅ ЗАКРЫТО (`4c749eb`, 2026-06-15):** listVehicles/getVehicle: org-less не-super-admin → DENY (sql`false`); crossTenant=isPlatformSuperAdmin(user) из роутов.

- **Что не так:** Every fleet list reader scopes tenancy only with `if (filters.organizationId) conditions.push(eq(..., organizationId))` — e.g. listVehicles (service.ts:84-86), listDrivers (343-345), listContractors (503-505), listFuelRecords (988), listOdometerReadings (1082), listDowntimeRecords (1132), listMaintenanceSchedule (1198), listPermits via scopedVehicleCondition (771), listFines (856), finesAnalytics (1406). When organizationId is undefined the WHERE simply has no tenant filter, returning ALL tenants' rows. The route handlers (routes.ts GET /fleet/*) gate only with `requireAbility(...)` (RBAC) and never call assertOrganizationScope, so an org-less account that is NOT the platform super-admin (a misconfig, which guards.ts:57-60 is explicitly written to DENY elsewhere) reads cross-tenant fleet data.
- **Воспроизведение:** Provision a privileged role (e.g. manager) with organizationId=null but not role 'admin'. Call GET /fleet/vehicles (or /fleet/fuel-records, /fleet/fines, etc.). isPlatformSuperAdmin=false yet the list returns vehicles/fuel/fines of every organization, because the service applies no filter when organizationId is falsy and no guard runs on the read path.
- **Направление фикса:** Route org-less non-super-admin to DENY (or empty) on these read paths, mirroring the C3 «б» pattern already applied to tariffs/invoices/telegram/settings/adr/incidents/sprint9-trailers: in the service, when organizationId is absent, require isPlatformSuperAdmin or return empty/403 rather than an unscoped query.
- **Верификация:** apps/api/src/modules/fleet/service.ts:41-109 (listVehicles, vehicleOrgScope), 335-350 (listDrivers); apps/api/src/modules/fleet/routes.ts:60-99 (GET /fleet/vehicles → requireAbility + organizationId proxied, no assert*); apps/api/src/auth/guards.ts:40-79 (isPlatformSuperAdmin, assertOrganizationScope org-less DENY); apps/api/src/auth/rbac.ts:256-278 (requireAbility — only role, ignores organizationId); docs/qa/remediation-tracker.md:146-178 (matrix tests + enumerated fixed list endpoints; fleet reads absent).
- **QA-корректировка:** docs/qa/remediation-tracker.md:153 claims the C3 mechanism «б» root is closed via assertOrganizationScope in auth/guards.ts ('закрывает org-less-аспект для всех guard-защищённых роутов разом'), and lines 158-174 enumerate the individual hand-rolled list endpoints that were additionally fixed (tariffs, invoices, telegram, settings, adr, incidents, sprint9 trailers). Fleet GET list endpoints route through requireAbility only — not through any assert*-guard — and are NOT in that enumerated list (only the fleet create dup-checks 195-196 were touched), so the org-less leak remains open for fleet reads.

#### [P1][HIGH] `apps/api/src/modules/import/routes.ts:357-361` — Импорт заявок: глобальная (не per-org) уникальность orders.number → cross-tenant коллизия и existence-leak  -> /transpult  _(api/import, security)_
- **✅ ЗАКРЫТО (`4069f83`, 2026-06-15):** миграция 0051 сняла глобальные orders_number_unique + idx_orders_number, добавила composite (organization_id, number) + частичный nullorg-индекс. schema.ts синхронизирован. Проверено на PG16: cross-org один номер ОК, same-org — конфликт.

- **Что не так:** orders.number имеет ГЛОБАЛЬНЫЙ unique (schema.ts:418 `.unique()` + schema.ts:478 `uniqueIndex('idx_orders_number').on(table.number)` — по одной колонке, без organizationId, в отличие от vehicles/contractors, которые уже переведены на per-org composite в C4). При импорте org A номера 'ORD-2025-001', который уже занят org B, INSERT падает с 23505 → mapPgErrorToFriendlyRu(...,'orders') → 'дубликат номера заявки' (routes.ts:358-360), и весь батч откатывается. Это (а) межтенантная утечка факта существования номера чужой орг, (б) DoS на импорт: чужая орг может «занять» номера и блокировать ваш импорт. Контракт C4 (per-org уникальность) применён к ТС/контрагентам, но НЕ к orders.number.
- **Воспроизведение:** 1) org B создаёт/импортирует заявку number='ORD-2025-001'. 2) admin org A: POST /import/orders {items:[{number:'ORD-2025-001',...валидная...}]}. 3) Контрагент свой найден, INSERT падает 23505, ответ 'Импорт отменён: дубликат номера заявки' — хотя у org A такого номера нет.
- **Направление фикса:** Привести orders.number к той же модели, что vehicles/contractors после C4: уникальность per-(organizationId, number) вместо глобальной; миграция drop глобального idx_orders_number + inline unique, add composite unique. Импорт-маппинг 23505 тогда станет корректным внутри тенанта.
- **Верификация:** apps/api/src/modules/import/routes.ts:300-365; apps/api/src/db/schema.ts:416-482 (orders), :274 (contractors per-org), :371-372 (vehicles per-org), :952 (invoices per-org), :1936+комм. (mchd); apps/api/drizzle/0000_full_schema.sql:295,678 (глобальный unique/index для orders); миграции 0039/0041/0043 (per-org конверсия для invoices/contractors/vehicles/mchd, orders отсутствует); validators.ts:61-65 (mapPgErrorToFriendlyRu 23505→«дубликат номера заявки»)

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/inspections/service.ts:954-1083` — Decision-флип approved→rejected не блокирует ТС и не создаёт ремонт-заявку (каскад пропущен)  -> /transpult  _(api/inspections, correctness)_
- **✅ ЗАКРЫТО (`28207d2`, 2026-06-15):** updateTech при *→rejected реплицирует каскад createTech (ТС→broken + repairRequest + события); updateMed пишет trip.driver_cleared. Идемпотентно (previous!=='rejected'). Lock-in тест обновлён + тест идемпотентности.

- **Что не так:** updateTechInspectionDecision при смене approved→rejected делает только `tx.update(techInspections).set({decision, comment})` (стр.975-979) и журналит inspection.decision_changed — НЕ ставит vehicles.status='broken' и НЕ создаёт repairRequests, в отличие от createTechInspection (стр.363-397, где rejection блокирует ТС + создаёт заявку). Аналогично updateMedInspectionDecision (стр.1041-1072): при approved→rejected нет события trip.driver_cleared, которое createMedInspection пишет на rejection (стр.667-679). Тест service.test.ts:143 фиксирует, что set-payload — ровно {comment, decision}, т.е. отсутствие каскада сейчас закреплено как «ожидаемое». Итог: ТС, забракованное через быстрый эндпоинт очереди, остаётся в рабочем статусе и без заявки на ремонт — может уйти в рейс.
- **Воспроизведение:** 1) Механик создаёт техосмотр decision=approved (ТС available). 2) В UI очереди жмёт «отклонить»: POST /api/inspections/tech/:id/decision {decision:'rejected', notes:'тормоза'}. 3) Запись становится rejected, но vehicles.status НЕ меняется на broken и repairRequests не создаётся → ТС остаётся доступным для назначения. Для медосмотра: POST /api/inspections/med/:id/decision {decision:'rejected', notes:...} — нет события очистки водителя с рейса.
- **Направление фикса:** В updateTechInspectionDecision при переходе *→rejected внутри той же tx выполнять тот же каскад, что createTechInspection: vehicles.status='broken'/'maintenance' + repairRequests + событие vehicle.status_changed (идемпотентно, чтобы не задвоить при повторном rejected). В updateMedInspectionDecision при *→rejected писать trip.driver_cleared.
- **Верификация:** apps/api/src/modules/inspections/service.ts:340-405 (createTech cascade), :640-686 (createMed driver_cleared), :954-1083 (updateTech/MedInspectionDecision); service.test.ts:124-189 (lock-in test); routes.ts:23-25,626-674 (pure delegation)
- **QA-корректировка:** Числится закрытым: docs/qa/code-audit-2026-05-28.md:527-540 (P1 updateTech/MedInspectionDecision immutability/note). Иммутабельность rejected→approved и note-required действительно добавлены (стр.964-970, 1032-1039) и подтверждены тестами. Но обратный переход approved→rejected без каскада блокировки ТС/создания ремонта в аудите не разбирался и остаётся открытым.

#### [P1][HIGH] `apps/api/src/modules/integrations/credentials/routes.ts:267-277` — Успешный /test не сбрасывает status='error' → провайдер навсегда остаётся неактивным в selectAdapter  -> /transpult  _(api/integrations, корректность)_
- **✅ ЗАКРЫТО (`791f1d5`, 2026-06-15):** при health.ok строка восстанавливается 'error'→'sandbox'. Авто-промоут в 'active' не делаем (решение оператора для signature/payment go-live).

- **Что не так:** В success-ветке health-check апдейт пишет только lastHealthCheckAt и lastError, но НЕ status: `.set({ lastHealthCheckAt: new Date(), lastError: health.ok ? null : (health.detail ?? 'unknown'), updatedAt: new Date() })`. Если строка ранее ушла в status='error' (через decrypt-failure в base.ts loadCredentials, или через прошлый упавший /test на строках 261/286), то после успешной проверки соединения status остаётся 'error'. А selectAdapter() (base.ts:316) выбирает реальный адаптер ТОЛЬКО при status==='active'||'sandbox'. Итог: админ жмёт «Проверить соединение», видит зелёный ok, но рантайм (подпись/платёж/телематика) продолжает молча падать в mock/не использовать провайдера.
- **Воспроизведение:** 1. Админ сохраняет креды провайдера (status='sandbox'). 2. Битый CREDENTIALS_KEY / временная сетевая ошибка → loadCredentials или /test ставит status='error'. 3. Проблема устранена, админ жмёт POST /integrations/credentials/:id/test → health.ok=true, ответ success. 4. status в БД остаётся 'error'. 5. Любой рабочий поток через selectAdapter() для этого providerType игнорирует реальный адаптер.
- **Направление фикса:** В success-ветке health-check, если health.ok, выставлять status в рабочее значение (active или sandbox — согласовать политику go-live), а не оставлять прежнее. Учесть, что для juridically-значимых провайдеров (signature/payment) перевод в active по успешному health-check может быть нежелателен — тогда хотя бы поднимать 'error'→'sandbox'.
- **Верификация:** apps/api/src/modules/integrations/credentials/routes.ts:108-155,234-291; apps/api/src/providers/base.ts:213-263 (loadCredentials decrypt→status='error'), 306-340 (selectAdapter status==='active'||'sandbox' gate)

#### [P1][HIGH] `apps/api/src/modules/notifications/routes.ts:33-86` — Telegram /start deep-link binds any chatId to an arbitrary victim org → cross-tenant notification leak  -> /transpult  _(api/notifications, security)_

- **Что не так:** В обработчике /start userId берётся прямо из payload deep-link и НЕ проверяется на принадлежность отправителю: `const parts = update.message.text.split(' '); const userId = parts[1] || null;` затем `db.select({organizationId}).from(users).where(eq(users.id, userId))` и `organizationId = u?.organizationId`. Дальше upsert подписки с этим organizationId и telegramChatId отправителя (его собственный чат). Никакой верификации, что пишущий в бота человек владеет userId, нет — payload полностью контролируется атакующим (любой может открыть t.me/<bot>?start=<чужой-uuid> или просто отправить `/start <uuid>`). notification.worker.ts:53-58 рассылает события строго подписчикам organizationId события, поэтому привязав свой chatId к чужой орг, атакующий начинает получать ВСЕ её уведомления (рейсы, заявки, ремонты, счета с суммами invoice.created `Сумма: ...₽`, сроки СФ).
- **Воспроизведение:** 1) Атакующий узнаёт/угадывает userId сотрудника орг-жертвы (UUID; утекает из URL, экспорта, audit-логов, или брутфорс). 2) В Telegram пишет боту `/start <victim-userId>` со своего аккаунта (свой chatId). 3) routes.ts:46-48 резолвит organizationId жертвы, строки 52-67 апсертят подписку {userId: victim, organizationId: victimOrg, telegramChatId: attackerChat, eventTypes:['*'], isActive:true}. 4) Любое событие орг-жертвы (например invoice.created) воркером (worker:53-72) уходит в чат атакующего. Утечка PII и коммерческой тайны (суммы счетов, контрагенты, маршруты).
- **Направление фикса:** Привязку нельзя авторизовать по непроверяемому payload. Варианты: (а) one-time nonce/токен, выдаваемый авторизованному пользователю в UI и проверяемый при /start (single-use, TTL, привязан к userId), вместо сырого userId; (б) после /start не активировать подписку, а требовать подтверждения внутри приложения авторизованным пользователем (он связывает свой chatId сам). organizationId должен выводиться из доказанной личности, а не из произвольного userId в тексте.
- **Верификация:** apps/api/src/modules/notifications/routes.ts:13-86; apps/api/src/integrations/workers/notification.worker.ts:26-86; apps/api/src/db/schema.ts:1155-1169

#### [P1][HIGH] `apps/api/src/modules/onboarding/routes.ts:254-273` — invite-team: глобальный unique на users.email → cross-tenant молчаливый пропуск + утечка-оракул существования email  -> /transpult  _(api/onboarding, security)_
- **✅ ЗАКРЫТО (`4069f83`, 2026-06-15):** НЕ миграция — email остаётся глобально уникальным (auth.ts логинит по eq(users.email) без org, per-org сломал бы вход). Тихий continue заменён на единообразный `alreadyRegistered` (in-org/out-org неразличимы) → закрыт оракул + silent data loss. Тест ответа обновлён.

- **Что не так:** users.email объявлен глобально уникальным (schema.ts:231 `email ... .notNull().unique()`). Проверка существования в invite-team тоже глобальная и без фильтра по organizationId: `const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, invite.email)).limit(1); if (existing) continue;`. Если email принадлежит пользователю ДРУГОЙ организации, приглашение тихо пропускается (continue), считается успехом и НЕ попадает в failedToEmail. Это (а) делает невозможным легитимное приглашение сотрудника, чей email уже зарегистрирован в чужой орге, и (б) превращает endpoint в оракул: admin org A может перебором email'ов определить, какие адреса уже зарегистрированы в системе (invitedCount не растёт, в failedToEmail не попадает) — кросс-тенантная утечка факта регистрации.
- **Воспроизведение:** 1) В org B существует user bob@x.com. 2) admin org A: POST /api/onboarding/invite-team {invites:[{email:'bob@x.com',fullName:'Bob',roles:['driver']}]}. 3) Ответ success, invitedCount=0, failedToEmail=[]. Никакого пользователя в org A не создано, никакой ошибки/предупреждения админу. Перебирая адреса, A узнаёт, кто зарегистрирован в системе глобально.
- **Направление фикса:** Решить продуктово: email должен быть уникален per-org (uniqueIndex(organizationId,email)) или глобально. Если глобально — при коллизии с чужой оргой возвращать явную ошибку/добавлять в отдельный список 'занято', а не тихий continue; не различать существование внутри/вне org в ответе, чтобы не давать оракул. Существующий continue оправдан только для повторного приглашения внутри СВОЕЙ org — добавить фильтр eq(users.organizationId, orgId) в проверку.
- **Верификация:** apps/api/src/db/schema.ts:229-246 (email .notNull().unique()); apps/api/src/modules/onboarding/routes.ts:252-300 (глобальный existence-check + silent continue + ответ); apps/api/src/modules/onboarding/validators.ts:76-86 (buildInviteResponse — только invitedCount/failedToEmail)

#### [P1][HIGH] `apps/api/src/modules/orders/routes.ts:81-93` — GET /orders отдаёт customerPrice не-финансовым ролям — нет K3-фильтра, в отличие от /orders/list и /orders/:id  -> /transpult  _(api/orders, security)_
- **✅ ЗАКРЫТО (`4c749eb`, 2026-06-15):** добавлена та же canViewFinance-redaction (customerPrice/IncludesVat → null), что на /orders/list.

- **Что не так:** Хендлер GET /orders просто возвращает `return { success: true, ...result }` где result = getOrders(...), а getOrders делает `db.select()` полной строки orders, включая customerPrice / customerPriceCurrency / customerPriceIncludesVat. K3-защита коммерческой цены реализована ТОЛЬКО на двух соседних эндпоинтах: /orders/list (routes.ts:139-148 `canViewFinance ... result.data.map(r => ({...r, customerPrice: null}))`) и /orders/:id (routes.ts:236-275). На plain GET /orders аналогичного фильтра нет вообще. Любая роль с ability read Order (logist, dispatcher, driver, client) получает цену заказчика.
- **Воспроизведение:** 1) Войти как logist (или dispatcher) тенанта. 2) GET /api/orders. 3) В ответе data[].customerPrice содержит коммерческую цену заказчика, которую K3 на /orders/list и /orders/:id специально скрывает от этих же ролей. Logist/dispatcher видят все заявки своей организации (org-scope, но не RLS), т.е. утечка цены по всему тенанту.
- **Направление фикса:** Применить тот же canViewFinance-фильтр (manager/accountant/admin), что и на /orders/list: после getOrders маппить data, обнуляя customerPrice/customerPriceIncludesVat для не-финансовых ролей. Либо вынести finance-redaction в общий helper и вызвать на всех трёх list/detail-эндпоинтах, чтобы исключить рассинхрон.
- **Верификация:** apps/api/src/modules/orders/routes.ts:50-94 (handler без фильтра), :139-150 (/orders/list K3), :236-275 (/orders/:id K3); apps/api/src/modules/orders/service.ts:330-394 (getOrders db.select() полной строки); apps/api/src/db/schema.ts:471-473 (customerPrice* колонки); apps/api/src/auth/rbac.ts:50-51,71-72,94-95,166-167 (logist/dispatcher read Order, manager/accountant финансы)

#### [P1][MEDIUM] `apps/api/src/modules/orders/service.ts:109-151` — createOrder/updateOrder не проверяют, что contractorId/contractId/consigneeContractorId принадлежат организации автора — cross-tenant FK-инъекция  -> /transpult  _(api/orders, security)_
- **✅ ЗАКРЫТО (`e9c3bf1`, 2026-06-15):** createOrder валидирует contractorId/contractId против effectiveOrgId перед insert (contracts — через contractor.organizationId); createOrderFromTemplate делегирует сюда. OrderValidationError→400. *Примечание:* updateOrder через OrderUpdateSchema не принимает contractorId/contractId (вектор — create), отдельно не трогал.

- **Что не так:** createOrder вставляет `contractorId: input.contractorId` и `contractId: input.contractId` напрямую из тела запроса без проверки, что эти сущности принадлежат author.organizationId. organizationId самой заявки ставится корректно (author.organizationId), но FK на контрагента/договор берётся как есть. Тот же паттерн в updateOrder для полей, приходящих через OrderUpdateSchema (хотя там contractorId исключён, contractId тоже не входит — но customerPrice/адреса меняются; основной вектор — create). Для шаблонов C3-фикс (service.ts:534-538) закрыл org-проверку самого шаблона, но contractorId внутри шаблона/overrides не валидируется против org. Это позволяет привязать заявку (и далее печатные документы — договор-заявку, ТТН с реквизитами контрагента) к UUID контрагента другого тенанта.
- **Воспроизведение:** 1) Войти как logist Org-A. 2) Узнать/перебрать UUID контрагента Org-B. 3) POST /orders с contractorId=<UUID контрагента Org-B>, прочими валидными полями. 4) Заявка создаётся в Org-A, но GET /orders/:id/ttn и /contract подтянут name/inn/legalAddress чужого контрагента (routes.ts:304-307, 402-405) → реквизиты Org-B в документе Org-A.
- **Направление фикса:** В createOrder (и пути from-template) перед insert проверять, что contractor (и contractId, consigneeContractorId если задан) имеют organizationId == author.organizationId; иначе 400/404. Делать проверку в транзакции/одним select по contractors с org-фильтром.
- **Верификация:** apps/api/src/modules/orders/service.ts:100-180 (createOrder), :527-559 (createOrderFromTemplate, C3 guard line 536), :396-418 (getOrderById/updateOrder); apps/api/src/modules/orders/routes.ts:295-314,402-406 (doc contractor lookup by id, no org filter), :473-540 (POST/PUT create+update); apps/api/src/db/schema.ts:267-274 (contractors.organizationId, per-org INN uniqueness)

#### [P1][HIGH] `apps/api/src/modules/repairs/service.ts:602-612` — Cross-tenant утечка ремонтов: org-less аккаунт обходит scope-фильтр (read+write IDOR)  -> /transpult  _(api/repairs, безопасность)_
- **✅ ЗАКРЫТО (`4c749eb`, 2026-06-15):** scopedRepairCondition/listRepairs/getRepair: org-less не-super-admin → DENY (sql`false`); write-пути (updateRepair/Status) передают isPlatformSuperAdmin(user). Вырождение scope в eq(id) устранено.

- **Что не так:** scopedRepairCondition и listRepairs применяют tenant-фильтр ТОЛЬКО при наличии organizationId: `return organizationId ? and(eq(repairRequests.id, id), inArray(... vehicles.organizationId = organizationId)) : eq(repairRequests.id, id)`. Когда organizationId == null/undefined, фильтр по организации полностью отбрасывается и условие вырождается в `eq(repairRequests.id, id)` (а в listRepairs — вообще без org-condition). repair_requests не имеет собственного organization_id и скоупится исключительно через vehicleId→vehicles.organizationId. В отличие от guards.ts (assertOrganizationScope), где org-less не-super-admin = DENY, маршруты /repairs/:id (GET/PUT/PUT status) и GET /repairs вообще не вызывают assertVehicleAccess/assertRepairAccess — они передают organizationId прямо в сервис. Любой аутентифицированный аккаунт без organizationId (мисконфигурированный repair_service/mechanic, или баг резолва org в токене) читает и ПИШЕТ заявки всех тенантов.
- **Воспроизведение:** 1) Аккаунт с ролью repair_service (проходит requireAbility('read'/'update','RepairRequest')) но без organizationId в JWT. 2) GET /repairs → возвращает заявки всех организаций (listRepairs: filters.organizationId falsy → org-condition не добавлен). 3) GET /repairs/<id чужого тенанта> → 200 с данными. 4) PUT /repairs/<chужой id> {totalCost, partsUsed} → запись проходит (scopedRepairCondition без org-фильтра). 5) PUT /repairs/<chужой id>/status → смена статуса чужой заявки + статуса чужого ТС.
- **Направление фикса:** Маршруты repair-by-id (GET/PUT/PUT status) должны проходить через явный guard ownership (по аналогии с assertVehicleAccess: загрузить vehicleId заявки → assertVehicleAccess(vehicleId, user)), который для org-less не-super-admin кидает AccessDeniedError. Либо в сервисе различать null-org так же, как assertOrganizationScope: super-admin → cross-tenant, прочий org-less → пустой результат/ошибка, а не отбрасывать фильтр. Не допускать вырождения scope в безусловный eq(id).
- **Верификация:** apps/api/src/modules/repairs/service.ts:602-612 (scopedRepairCondition), 641-645 (listRepairs org-cond), 662-663 (getRepair), 744-775 (updateRepairStatus write через scopedRepairCondition), 829+ (updateRepair); apps/api/src/modules/repairs/routes.ts:43-54,127-136,156-195 (нет assert*Access, organizationId напрямую); apps/api/src/auth/guards.ts:45-79 (isPlatformSuperAdmin + assertOrganizationScope DENY для org-less не-super-admin), 260-274 (assertVehicleAccess); apps/api/src/auth/auth.ts:179-180,304-309,337,638,712-715 (org-less достижим: super-admin, DELETE /me/organization, legacy, user-create); apps/api/src/auth/rbac.ts:117-121,140-141 (mechanic/repair_service manage RepairRequest, org-агностично); docs/qa/remediation-tracker.md:178,533 (C3 cross-tenant объявлен закрытым; repairs-IDOR не в списке).

#### [P1][HIGH] `apps/api/src/modules/repairs/service.ts:328-339` — Cross-tenant утечка справочника запчастей через alias-поиск и глобальные записи  -> /transpult  _(api/repairs, безопасность)_
- **✅ ЗАКРЫТО (`4069f83`, 2026-06-15):** ensureRepairPartCatalogHydrated теперь PER-ORG (partsUsed читаются только своего org через join vehicles.organizationId, пишутся с organization_id тенанта); org-less чтение каталога → только глобальные сиды (isNull), не чужие тенантские. Сопутствует миграции 0052.

- **Что не так:** loadRepairPartCatalogItems фильтрует по org как `or(isNull(repairPartCatalog.organizationId), eq(organizationId, options.organizationId))` ТОЛЬКО при наличии options.organizationId (строка 328). Для org-less аккаунта org-условие не добавляется → видны позиции всех тенантов. Кроме того, при наличии org возвращаются ещё и все global-записи (isNull org). Эти global-записи создаёт ensureRepairPartCatalogHydrated (строки 304-310: вставка кандидатов БЕЗ organizationId, т.е. organization_id=NULL) из partsUsed заявок ПЕРВОГО тенанта, который дёрнул каталог — данные одного тенанта (названия/категории/цены запчастей) становятся видны всем как global.
- **Воспроизведение:** 1) Тенант A впервые открывает /repairs/parts/catalog → ensureRepairPartCatalogHydrated читает repairRequests.partsUsed (limit 1000, без org-фильтра, строки 265-268) по ВСЕМ тенантам и вставляет их как organization_id=NULL. 2) Тенант B открывает каталог → видит позиции (названия/цены) тенанта A через isNull(organizationId) ветку. 3) org-less аккаунт: org-условие отсутствует → видит вообще всё.
- **Направление фикса:** Гидрация должна либо не выполняться кросс-тенантно (читать partsUsed только своего org через join vehicles.organizationId и писать organization_id=своего тенанта), либо вообще не материализовать чужие данные как global. listRepairPartCatalog/meta для org-less не-super-admin не должны отбрасывать org-фильтр. Пересмотреть семантику isNull(org) как 'общесистемный seed' vs 'утёкшие данные тенанта'.
- **Верификация:** apps/api/src/modules/repairs/service.ts:244-351 (hydrate+load), 384-385, 422-487 (create/sync, org присваивается явно); apps/api/src/modules/repairs/routes.ts:61-78 (organizationId из request.user); apps/api/src/db/schema.ts:849-866 (organizationId nullable, idx_repair_part_catalog_code уникален на одном code)

#### [P1][HIGH] `apps/api/src/db/schema.ts:858-863` — Глобальный UNIQUE(code) на per-org каталоге: коллизия и тихая потеря данных между тенантами  -> /transpult  _(api/repairs, целостность данных)_
- **✅ ЗАКРЫТО (`4069f83`, 2026-06-15):** миграция 0052 сняла глобальный idx_repair_part_catalog_code, добавила composite (organization_id, code) + частичный global-индекс (org IS NULL). schema.ts синхронизирован. create/sync используют onConflictDoNothing без таргета — совместимо.

- **Что не так:** repair_part_catalog имеет organization_id (строка 858), но уникальный индекс построен по одному code: `uniqueIndex('idx_repair_part_catalog_code').on(table.code)` (строка 863) — НЕ композитный (organization_id, code). code детерминированно генерится из name-category-unit (service.ts createCatalogCode/syncRepairCatalogFromParts строки 234-242, 466-495). Следствия: (1) createRepairPartCatalogItem (строки 435-448) у тенанта B падает unique-violation, если тенант A уже создал позицию с тем же name/category/unit — раскрытие существования чужих данных и невозможность завести свою позицию; (2) syncRepairCatalogFromParts/гидрация используют onConflictDoNothing → запчасть тенанта B молча не сохраняется в каталог, если совпал code с чужой записью (silent data loss).
- **Воспроизведение:** 1) Тенант A: POST /repairs/parts/catalog {name:'Масло 5W-30', category:'Масла', unit:'л'} → code 'масло-5w-30-масла-л'. 2) Тенант B: POST с тем же name/category/unit → INSERT нарушает глобальный idx_repair_part_catalog_code → 400 (а до санитайза — потенциальный constraint-name в логах). 3) Либо B сохраняет заявку с такой запчастью → syncRepairCatalogFromParts onConflictDoNothing → позиция B не попадает в его каталог.
- **Направление фикса:** Сделать уникальность композитной: (organization_id, code) с отдельным частичным индексом для global (organization_id IS NULL). Миграция: drop текущего uniqueIndex, создать новый. Проверить, что onConflictDoNothing/upsert в syncRepairCatalogFromParts и createCatalogCode согласованы с новым target-конфликтом.
- **Верификация:** apps/api/src/db/schema.ts:849-866 (organizationId:858, uniqueIndex(table.code):863); apps/api/src/modules/repairs/service.ts:234-242 (createCatalogCode детерминирован), 435-448 (insert с organizationId, без onConflict), 466-495 (syncRepairCatalogFromParts с onConflictDoNothing); apps/api/drizzle/0007_repair_parts_catalog.sql:12,18-19 (CREATE UNIQUE INDEX ON repair_part_catalog(code) — глобальный); проверено отсутствие переопределения индекса в 0008-0010.

#### [P1][HIGH] `apps/api/src/modules/signatures/gosklyuch-callback.ts:62-91` — HMAC-гейт отвергает реальные Госключ-callback'и в production (externalId='gk-...' без '.'-сегмента)  -> /transpult  _(api/signatures, correctness)_
- **✅ ЗАКРЫТО (`28207d2`, 2026-06-15):** verifyExternalIdHmac распознаёт gk-формат (`/^gk-[0-9a-f]{8}-\d+$/i`) и принимает его; якорь подлинности — существование externalId на документе (404 если нет) + IP-allowlist. Прочие форматы без HMAC по-прежнему reject.

- **Что не так:** verifyExternalIdHmac() при заданном секрете требует HMAC-сегмент: `const dot = externalId.lastIndexOf('.'); if (dot <= 0 || dot === externalId.length - 1) { return false; }`. Но канонический externalId для Госключа — это adapter-externalId формата `gk-<8>-<ts>` (providers/signature/gosklyuch.ts:60 `const externalId = \`gk-${documentId.slice(0,8)}-${Date.now()}\``), который sign-endpoint.ts:292 перезаписывает поверх HMAC-bearing buildExternalId() (`if (out.externalId) externalId = out.externalId;`). В нём нет точки. server.ts:193 требует GOSKLYUCH_CALLBACK_SECRET в prod → verifyExternalIdHmac работает в строгом режиме → lastIndexOf('.')=-1 → return false → callback отвечает 400 'Недействительный externalId'. То есть в проде НИ ОДИН реальный Госключ-callback не доставит подпись.
- **Воспроизведение:** 1) NODE_ENV=production, GOSKLYUCH_CALLBACK_SECRET задан (обязателен по boot-check). 2) POST /api/transport-documents/:id/sign provider=gosklyuch → сохраняется externalId='gk-xxxxxxxx-1700000000000' (без точки). 3) Госключ POST /api/signatures/gosklyuch/callback с этим externalId. 4) verifyExternalIdHmac → false → 400. Подпись теряется навсегда.
- **Направление фикса:** Либо вычислять/прикреплять HMAC поверх adapter-externalId перед сохранением (формат `gk-...` + '.' + hmac), либо в verifyExternalIdHmac трактовать отсутствие '.'-сегмента не как hard-reject, а распознавать gosklyuch-формат и проверять подлинность иначе (например, требовать существование externalId на документе как единственный якорь). Согласовать форматы buildExternalId и adapter.sign.
- **Верификация:** apps/api/src/modules/signatures/gosklyuch-callback.ts:61-91,131-138; apps/api/src/modules/signatures/sign-endpoint.ts:271-303; apps/api/src/providers/signature/gosklyuch.ts:60-88; apps/api/src/server.ts:193-196; apps/api/src/modules/signatures/gosklyuch-callback.integration.test.ts:180-218

#### [P1][HIGH] `apps/api/src/modules/trips/service.ts:1054-1073` — Обязательное подтверждение доставки (confirmationMode=required) обходится через POST /trips/:id/status с forcedByDispatcher  -> /transpult  _(api/trips, корректность)_
- **✅ ЗАКРЫТО (`28207d2`, 2026-06-15):** /status вычищает forcedByDispatcher из тела перед changeTripStatus; легитимное форсирование — только через delivery-confirmation роут с role-gate (dispatcher/admin).

- **Что не так:** В changeTripStatus гейт COMPLETED пропускается так: `const isForced = data?.forcedByDispatcher === true; if (!isForced) { ... requiresConfirmation ... throw 'Требуется подтверждение доставки' }`. Поле forcedByDispatcher берётся напрямую из `data`, которое в роуте POST /trips/:id/status (routes.ts:468 `changeTripStatus(id, body.status, ctx, body)`) — это весь request.body без какой-либо проверки роли. В отличие от выделенного роута delivery-confirmation (routes.ts:914), где стоит явный `if (body.data.forcedByDispatcher && !dispatcher && !admin) return 403`, на /status такой проверки НЕТ.
- **Воспроизведение:** 1) Рейс в in_transit, у связанной заявки confirmationMode='required', подтверждения доставки нет. 2) Любой пользователь с ability update/manage Trip шлёт POST /trips/:id/status {"status":"completed","forcedByDispatcher":true}. 3) Гейт обязательного подтверждения получателя пропущен, рейс закрывается без юр-значимого факта приёмки груза (ЭТрН title-05 грузополучателя по факту отсутствует, но рейс completed).
- **Направление фикса:** Не доверять forcedByDispatcher из произвольного тела на /status: либо вычищать это поле из data в этом роуте, либо продублировать role-gate (dispatcher/admin) как в delivery-confirmation роуте, либо переместить проверку роли внутрь changeTripStatus (author.role).
- **Верификация:** apps/api/src/modules/trips/service.ts:1048-1074 (гейт COMPLETED, isForced из data); apps/api/src/modules/trips/routes.ts:445-478 (POST /status, preHandler requireAbility('update','Trip'), body→data без role-check); apps/api/src/modules/trips/routes.ts:899-927 (delivery-confirmation роут с явным 403 на forcedByDispatcher для non-dispatcher/admin); packages/shared/src/schemas.ts:1035-1040 (forcedByDispatcher требует forcedReason); grep forcedByDispatcher по проекту

#### [P1][HIGH] `apps/api/src/modules/waybills/routes.ts:570-573` — ЭТрН: адрес грузополучателя = адрес разгрузки, а не юр-адрес контрагента  -> /jurist  _(api/uploads+waybills, correctness)_
- **✅ ЗАКРЫТО (A3, `b632f47`, 2026-06-15):** consigneeAddress = consigneeContractor.legalAddress в обоих титулах (1 и 4); место выгрузки остаётся отдельным unloadingAddress. Фронт-preview — A4.

- **Что не так:** В обоих маршрутах генерации ЭТрН поле <Получатель><Адрес> заполняется адресом точки разгрузки, а не юридическим адресом контрагента-грузополучателя. Титул 1 (строки 570-573): `consigneeName: consigneeContractor.name, consigneeInn: consigneeContractor.inn, consigneeKpp: consigneeContractor?.kpp, consigneeAddress: order?.order.unloadingAddress || '—'`. Титул 4 (строки 675-678) — то же самое. Для сравнения, грузоотправитель использует `shipperAddress: contractor?.legalAddress` (строка 565), а перевозчик — `carrierAddress: carrierOrg.legalAddress` (строка 569). У контрагента есть поле legalAddress (contractors.legal_address NOT NULL, schema.ts:262), которое и должно идти в <Адрес> участника по XSD ФНС ЕД-7-26/383@. Подмена юр-адреса участника на адрес склада/точки доставки делает реквизиты участника ЭТрН недостоверными.
- **Воспроизведение:** 1) logist/dispatcher с заполненным заказом (contractor с legalAddress, unloadingAddress = адрес склада). 2) GET /api/waybills/:id/etrn (или /etrn-title4). 3) В XML <Получатель><Адрес> содержит адрес разгрузки, а не legalAddress грузополучателя. Если consigneeContractor совпадает с отправителем — отправитель получает корректный legalAddress, а получатель тот же контрагент — адрес склада: внутренняя противоречивость одного и того же ЮЛ в документе.
- **Направление фикса:** Передавать `consigneeContractor.legalAddress` в consigneeAddress (как для shipper/carrier). Точку разгрузки оставить только в блоке <Маршрут>/<ПунктРазгрузки>, где она и должна быть.
- **Верификация:** apps/api/src/modules/waybills/routes.ts:529-579 (Титул1) и 631-684 (Титул4); apps/api/src/modules/waybills/etrn-generator.ts:140-222 (структура <Получатель>/<Маршрут>); apps/api/src/db/schema.ts:257-274 (contractors.legalAddress NOT NULL); orders/routes.ts:457 (consignee.legalAddress как образец)

#### [P1][HIGH] `apps/api/src/modules/analytics/routes.ts:144-152` — NPE-краш 500 на /analytics/maintenance-alerts: v.maintenanceNextKm.toLocaleString() при null  -> /transpult  _(api/misc-modules, error-handling)_
- **✅ ЗАКРЫТО (`791f1d5`, 2026-06-15):** сообщения используют уже-гарантированные локальные currentOdometerKm/plannedMaintenanceKm (guard выше), а не nullable v.*. Убран @ts-ignore.

- **Что не так:** В odometer-блоке плановый км берётся из плана ИЛИ ТС: `const plannedMaintenanceKm = nextMaintenancePlan?.plannedOdometerKm ?? v.maintenanceNextKm;` (стр.113). Дальше при kmLeft<=2000 формируется warning-сообщение, которое НАПРЯМУЮ читает поле ТС: `message: `До ТО ${kmLeft.toLocaleString()} км (${v.currentOdometerKm.toLocaleString()} / ${v.maintenanceNextKm.toLocaleString()})`` (стр.150) с предшествующим `// @ts-ignore legacy fallback text still references nullable field` (стр.149). Если плановый км пришёл из maintenanceSchedule.plannedOdometerKm (NOT NULL в этой строке плана), а у самого ТС vehicles.maintenanceNextKm = NULL (поле nullable, schema.ts:349), то `v.maintenanceNextKm` === null → `null.toLocaleString()` бросает TypeError → необработанный throw → 500 на весь endpoint. @ts-ignore прямо признаёт, что код ссылается на nullable-поле.
- **Воспроизведение:** 1) admin/manager/mechanic/dispatcher. 2) Создать ТС с vehicles.maintenanceNextKm = NULL (значение по умолчанию — поле nullable), currentOdometerKm например 100000. 3) Создать строку maintenance_schedule(status='planned', vehicleId=этого ТС, plannedOdometerKm=101000). 4) GET /api/analytics/maintenance-alerts. 5) plannedMaintenanceKm=101000 (из плана), currentOdometerKm=100000, kmLeft=1000 (<=2000) → ветка warning стр.144-152 → доступ к v.maintenanceNextKm(null).toLocaleString() → 500, весь список алертов недоступен.
- **Направление фикса:** Строить сообщение из локальных переменных plannedMaintenanceKm и currentOdometerKm (которые гарантированно числа в этой ветке), а не из сырых nullable-полей строки v. Убрать @ts-ignore и снять прямые обращения к v.maintenanceNextKm / v.currentOdometerKm в текстах сообщений; либо защитить ?? 0 / опциональный nullish.
- **Верификация:** apps/api/src/modules/analytics/routes.ts:22-30,108-154; apps/api/src/db/schema.ts:337,349,362,1586

### P2 — 69 (сжато, по сегментам)

> **Прогресс P2 (сессия 2026-06-15):** закрыто 14. A4-A7 (`b632f47`) + wave 1 cross-tenant
> (`20e1667`) + wave 2 money/finance (`39f83b6`: billing refund-отзыв, overdueDebt остаток,
> deleteAdjustment гейт, margin currency-mismatch, web sparkline остаток). По решению
> владельца — сначала HIGH-теги. Отметки `✅ ЗАКРЫТО` в строках ниже.
> **Wave 3** валидация/RBAC (`e0a901a`): claims status, import RBAC+ИНН, notifications
> userId-санитизация, carriers archived, verify-email. Закрыто 20/69. Дальше — остаток HIGH.

**api/auth**

- `apps/api/src/auth/auth.ts:1463-1481` — [HIGH] verify-email: накапливающиеся валидные коды + отсутствие лимита попыток на код → брутфорс 6-значного кода  → /transpult  **✅ ЗАКРЫТО `e0a901a`** (инвалидация старых кодов + существующий per-route rateLimit)

**api/billing**

- `apps/api/src/modules/billing/service.ts:410-419` — [HIGH] Возврат платежа не отзывает доступ: подписка остаётся active после refund  → /transpult  **✅ ЗАКРЫТО `39f83b6`** (refunded → подписка 'cancelled')
- `apps/api/src/modules/billing/routes.ts:262-266` — [HIGH] Фискализация всегда без email/телефона покупателя (54-ФЗ чек без контакта получателя)  → /jurist  **✅ ЗАКРЫТО `b632f47` (A7)**

**api/carriers**

- `apps/api/src/modules/carriers/routes.ts:200-215` — [HIGH] assign-carrier разрешает назначить архивного контрагента перевозчиком  → /transpult  **✅ ЗАКРЫТО `e0a901a`** (isArchived=false в условие)
- `apps/api/src/db/schema.ts:1645-1660` — [HIGH] carrier_contracts.number без уникального ограничения — дубли номеров договоров  → /transpult
- `apps/api/src/db/schema.ts:275-275` — [HIGH] Schema drift: idx_contractors_is_carrier и idx_trips_carrier_contractor — partial в миграции, plain в schema.ts  → /devops

**api/claims**

- `apps/api/src/modules/claims/routes.ts:98-119` — [HIGH] GET /claims: query-параметр status не валидируется → невалидное значение даёт 500 (raw PG enum error), а не 400  → /transpult  **✅ ЗАКРЫТО `e0a901a`**

**api/cold-chain**

- `apps/api/src/modules/cold-chain/service.ts:78-90` — [HIGH] Несовместимые SLA-диапазоны мульти-лот рейса дают инвертированную границу → ВСЕ замеры = breach  → /transpult
- `apps/api/src/modules/cold-chain/service.ts:110-145` — [HIGH] recordReading стампит input.orderId на замер без проверки принадлежности рейсу/тенанту  → /transpult
- `apps/api/src/modules/cold-chain/service.ts:241-247` — [HIGH] summarizeReadings: SLA-границы (resolveTripSla) возвращаются без org-фильтра — info-leak чужого рейса через copilot  → /transpult  **✅ ЗАКРЫТО `20e1667`** (guard принадлежности рейса до resolveTripSla)
- `apps/api/src/modules/cold-chain/service.ts:165-196` — [HIGH] recordEvent внутри транзакции делает SELECT users + сетевой enqueue с timeout 3с — транзакция держится открытой до 6с/замер  → /transpult

**api/compliance+adr**

- `apps/api/src/modules/compliance/tachograph/service.ts:63-89` — [HIGH] TOCTOU: check-then-insert tachograph_records после добавления уникального индекса → 500 вместо идемпотентности  → /transpult
- `apps/api/src/modules/compliance/marking/routes.ts:134-148` — [HIGH] by-shipment/:lotId не гейтит org-less пользователя — cross-tenant чтение проверок маркировки по lotId  → /transpult  **✅ ЗАКРЫТО `20e1667`** (org-less → пусто)
- `apps/api/src/modules/compliance/osago/service.ts:78-88` — [HIGH] runOrgOsagoSync: последовательные внешние вызовы + по-строчный insert на весь парк (N+1 / нет батча)  → /transpult

**api/copilot**

- `D:/Ai/TMS-prod/apps/api/src/modules/copilot/routes.ts:28-28` — [HIGH] План-квота copilot (requireWithinLimit('copilot_messages')) не подключена — лимит тарифа обходится  → /transpult  **✅ ЗАКРЫТО `3d0a8ed`**
- `D:/Ai/TMS-prod/apps/api/src/modules/copilot/service.ts:125-135` — [HIGH] loadHistory берёт 30 последних строк ВКЛЮЧАЯ tool-строки → реальный диалоговый контекст сильно урезается  → /transpult  **✅ ЗАКРЫТО `3d0a8ed`** (только user/assistant)
- `D:/Ai/TMS-prod/apps/api/src/modules/copilot/service.ts:302-306` — [HIGH] В Anthropic tool_result отдаётся весь result через JSON.stringify(result) — потенциальная утечка сырых полей/ошибок в контекст модели  → /transpult  **✅ ЗАКРЫТО `3d0a8ed`** (sanitizeToolResultForModel)
- `D:/Ai/TMS-prod/apps/api/src/modules/copilot/tools/index.ts:458-470` — [MEDIUM] track_contractor_orders: N+1 последовательные getTripById+computeTripEta в цикле по 50 заказам  → /transpult

**api/documents**

- `apps/api/src/modules/documents/sf-pdf.ts:124-158` — [HIGH] СФ: сумма построчных НДС/баз (back-calc по строкам) может не сходиться с итоговыми subtotal/vatAmount — копеечные расхождения в счёте-фактуре  → /transpult
- `apps/api/src/modules/documents/upd-pdf.ts:141-160` — [HIGH] УПД: построчные база/НДС back-calc из gross-amount, а итог берётся из vatAmount — потенциальное расхождение граф по строкам с итогом  → /transpult

**api/edi**

- `apps/api/src/modules/edi/service.ts:121-217` — [HIGH] sendDocumentToEdi не проверяет текущий ediStatus — повторная отправка затирает уже подписанный ЭТрН (signed_by_client → sent), обнуляет ediExternalId и перезапускает прогрессию  → /transpult  **✅ ЗАКРЫТО `3d0a8ed`** (гейт sent/signed/received/accepted)
- `apps/api/src/modules/edi/service.ts:113-163` — [HIGH] XSD-гейт ЭТрН перед отправкой в ЭДО фактически почти всегда пропускается: срабатывает только если payload содержит ключ 'xml'/'xmlContent', иначе тихий no-op  → /transpult

**api/finance**

- `apps/api/src/modules/finance/finance.service.ts:584-647` — [HIGH] Две несовместимые системы учёта оплат: events-based (/payments) vs column-based (/register-payment) затирают paidAmount  → /transpult
- `apps/api/src/modules/finance/finance.service.ts:383-391` — [HIGH] overdueDebt суммирует полный invoice.total без вычета paidAmount и без фильтра due_date  → /transpult  **✅ ЗАКРЫТО `39f83b6`** (sum(total-paidAmount); колонки due_date нет — отмечено)
- `apps/api/src/modules/finance/finance.service.ts:554-581` — [HIGH] deleteAdjustment без статус-гейта: на issued-счёте бросает сырое исключение триггера INVOICE_IMMUTABLE  → /transpult  **✅ ЗАКРЫТО `39f83b6`** (гейт draft-only → чистый 400)
- `apps/api/src/modules/finance/finance.service.ts:261-268` — [MEDIUM] analyzeFuel: organizationId-фильтр без INNER JOIN-гарантии при vehicleId-only — потенциальная межтенантная выборка  → /transpult

**api/fleet**

- `apps/api/src/modules/fleet/service.ts:413-426` — [MEDIUM] createDriver does not enforce one-driver-per-user; no DB unique on drivers.userId → nondeterministic driver-RLS  → /transpult

**api/geo**

- `apps/api/src/modules/geo/geocoding.service.ts:142-159` — [HIGH] Геокодер — заглушка: нераспознанный адрес молча возвращает координаты центра Москвы  → /transpult

**api/import**

- `apps/api/src/modules/import/routes.ts:393-410` — [HIGH] JSON bulk-import контрагентов НЕ валидирует формат ИНН (мусор попадает в БД)  → /transpult  **✅ ЗАКРЫТО `e0a901a`** (regex 10/12 цифр)
- `apps/api/src/modules/import/routes.ts:214-230` — [HIGH] GET /import/templates/:type без RBAC — любой аутентифицированный (driver/client/mechanic) качает шаблоны импорта  → /transpult  **✅ ЗАКРЫТО `e0a901a`** (hasPrivilege-гейт)

**api/inspections**

- `apps/api/src/modules/inspections/service.ts:159-162` — [HIGH] Org-скоуп очередей фильтрует рейсы по водителю — рейсы с driverId=null выпадают из техочереди  → /transpult  **✅ ЗАКРЫТО `ac3a3c1`** (тех-очередь: org через trips.organizationId)
- `apps/api/src/modules/inspections/service.ts:702-710` — [MEDIUM] listMedInspections скоупит тенант через users.organizationId, остальные med-запросы — через drivers.organizationId  → /transpult
- `apps/api/src/modules/inspections/service.ts:364-367` — [MEDIUM] Описание ремонт-заявки и причины брака пишутся сырым английским — i18n-утечка в персистентных данных  → /transpult

**api/mchd**

- `apps/api/src/modules/mchd/routes.ts:166-169` — [HIGH] Обещанный крон перевода МЧД в 'expired' не существует — status навсегда остаётся 'active' для истёкших доверенностей  → /transpult
- `apps/api/src/modules/mchd/routes.ts:33-38` — [HIGH] INN/ОГРН принимаются без проверки на цифры — в реестр МЧД можно записать нечисловой ИНН доверителя/доверенного  → /jurist  **✅ ЗАКРЫТО `b632f47` (A5)**
- `apps/api/src/modules/mchd/routes.ts:177-184` — [MEDIUM] scope МЧД проверяется только как опциональный substring в find-for-signer и НИГДЕ не валидируется при подписании  → /jurist  **✅ ЗАКРЫТО `b632f47` (A6)** (validateMchd проверяет scope при подписании)

**api/notifications**

- `apps/api/src/modules/notifications/routes.ts:45-48` — [HIGH] Нет try/catch вокруг DB-вызовов webhook: невалидный userId (не-UUID) роняет хэндлер в 500 и провоцирует ретраи Telegram  → /transpult  **✅ ЗАКРЫТО `e0a901a`** (санитизация userId → null при не-UUID)

**api/onboarding**

- `apps/api/src/modules/onboarding/routes.ts:217-222` — [HIGH] save-integration-choice: onboardingStep выставляется константой (4/5), даёт регрессию шага — тот же класс бага, что C9 чинил в profile через GREATEST  → /transpult

**api/operational**

- `apps/api/src/modules/operational-core/write-service.ts:96-133` — [HIGH] allowOverCapacity — клиент-управляемый флаг обходит проверку грузоподъёмности ТС  → /transpult  **✅ ЗАКРЫТО `ac3a3c1`** (гейт по привилегированной роли)
- `apps/api/src/modules/operational-core/write-service.ts:121-133` — [HIGH] Capacity-проверка лота/ТС только по весу — объём и места не проверяются при назначении  → /transpult  **✅ ЗАКРЫТО `ac3a3c1`** (+ проверка объёма payloadVolumeM3; места — нет колонки вместимости, отмечено)
- `apps/api/src/modules/operational-core/write-service.ts:42-48` — [MEDIUM] splitOrderIntoLots: при одновременных lotCount и maxWeightKg сумма веса лотов != весу заявки  → /transpult
- `apps/api/src/modules/operations/trip-change-service.ts:304-345` — [MEDIUM] recordRoutePointDowntime: захардкоженный freeMinutes=120 расходится с контрактным тарифом  → /transpult

**api/orders**

- `apps/api/src/modules/orders/validators.ts:42-119` — [HIGH] validateCargoBounds и validateTemperatureRange — мёртвый код: инварианты груза и cold-chain нигде не применяются на create/update  → /transpult
- `apps/api/src/modules/orders/service.ts:423-461` — [HIGH] updateOrder: numeric customerPrice читается строкой → audit-событие price_changed срабатывает на каждом update, oldValue логируется строкой  → /transpult  **✅ ЗАКРЫТО `ac3a3c1`** (Number-коэрция previous+new)
- `apps/api/src/modules/orders/routes.ts:65-91` — [MEDIUM] GET /orders: RLS fail-open для driver/client без записи driver/contractor — фильтр не применяется, видны все заявки организации  → /transpult  **✅ ЗАКРЫТО `20e1667`** (fail-closed → пусто)
- `apps/api/src/modules/orders/service.ts:573-616` — [MEDIUM] assignOrderToTrip не проверяет принадлежность trip организации автора (cross-tenant trip-assignment) — латентно, функция не подключена к роутам  → /transpult

**api/repairs**

- `apps/api/src/modules/repairs/service.ts:744-776` — [HIGH] TOCTOU в updateRepairStatus: чтение статуса вне транзакции, апдейт без оптимистичной блокировки  → /transpult  **✅ ЗАКРЫТО `8a697da`** (status в WHERE + проверка 0 строк)

**api/rto+scoring**

- `apps/api/src/modules/rto/service.ts:72-98` — [HIGH] getDriverHoursSummary никогда не детектит превышение недельного лимита (56 ч) — breaches содержит только дневные  → /transpult  **✅ ЗАКРЫТО `8a697da`** (weekly breach + kind)
- `apps/api/src/modules/rto/routes.ts:64-134` — [HIGH] GET-эндпоинты hours-summary/hos-status пишут событие rto.breach как side-effect на каждый запрос → дубли в журнале  → /transpult  **✅ ЗАКРЫТО `8a697da`** (убран side-effect из GET)
- `apps/api/src/modules/rto/service.ts:15-152` — [MEDIUM] Дневная агрегация РТО по UTC-дате при том, что РФ-водители работают в локальных TZ (MSK+) → записи у границы суток попадают не в тот день  → /transpult

**api/signatures**

- `apps/api/src/modules/signatures/gosklyuch-callback.integration.test.ts:267-559` — [HIGH] 6 из 8 integration-тестов callback'а отключены через describe.skip (FIXME W1-test-debt) — критичные ветки chain-of-trust не покрыты  → /pm

**api/sync+sprint9**

- `apps/api/src/modules/sync/routes.ts:153-165` — [HIGH] Sync pull: created/updated классификация route_points привязана к createdAt РОДИТЕЛЬСКОГО рейса, а не к самой точке  → /transpult  **✅ ЗАКРЫТО `3d0a8ed`** (по point.createdAt)
- `apps/api/src/modules/sync/routes.ts:126-128` — [HIGH] Sync pull: route_points выгружаются БЕЗ фильтра updatedAt — полная переотдача всех точек изменённых рейсов на каждый pull  → /transpult  **⏸ ОТЛОЖЕНО** (route_points не имеет колонки updated_at — дельта-фильтр требует миграцию)
- `apps/api/src/modules/sprint9/routes.ts:312-322` — [HIGH] waybillDrivers: сброс isPrimary + вставка нового водителя без транзакции — окно с нулём primary-водителей / гонка двух primary  → /transpult  **✅ ЗАКРЫТО `3d0a8ed`** (в транзакции)

**api/trips**

- `apps/api/src/modules/trips/service.ts:369-376` — [HIGH] При отмене рейса заявки отвязываются (tripId=null), но строки trip_orders и route_points не удаляются — рассинхрон слоёв  → /transpult  **✅ ЗАКРЫТО `8a697da`** (delete junction+route_points в tx)
- `apps/api/src/modules/trips/margin.ts:72-97` — [HIGH] computeTripMargin смешивает валюты revenue и cost — выдаёт финансово некорректную маржу  → /transpult  **✅ ЗАКРЫТО `39f83b6`** (margin=null + currencyMismatch при разных валютах)
- `apps/api/src/modules/trips/transport-documents-store.ts:487-520` — [MEDIUM] mergeStatus при ресинхроне может затереть провайдерский REJECTED более высоким производным статусом  → /transpult
- `apps/api/src/modules/trips/service.ts:1048-1074` — [MEDIUM] Проверки готовности к COMPLETED (route points, обязательное подтверждение) выполняются вне транзакции — TOCTOU  → /transpult

**api/misc-modules**

- `apps/api/src/modules/analytics/routes.ts:44-47` — [HIGH] maintenanceByVehicleId хранит САМЫЙ СТАРЫЙ план ТО на ТС, а не актуальный  → /transpult  **✅ ЗАКРЫТО `ac3a3c1`** (asc + Map-overwrite)
- `apps/api/src/modules/demo/service.ts:376-389` — [HIGH] Demo-события events пишутся без organizationId → невидимы в журнале аудита (152-ФЗ scope)  → /transpult  **✅ ЗАКРЫТО `20e1667`**
- `apps/api/src/modules/analytics/routes.ts:134-135` — [HIGH] Falsy-проверка пробега скрывает ТО-алерт для ТС с одометром 0  → /transpult  **✅ ЗАКРЫТО `ac3a3c1`** (!= null)

**api/providers**

- `apps/api/src/providers/signature/kontur-sign.ts:24-31` — [HIGH] Go-live trap: skeleton adapters report healthCheck ok:true while all methods throw (PROV-P0-2 applied unevenly)  → /transpult

**api/infra**

- `apps/api/src/integrations/websocket-filters.ts:64-70` — [HIGH] broadcastEvent: payload без organizationId доставляется ВСЕМ тенантам (cross-tenant утечка trip.eta_updated)  → /transpult  **✅ ЗАКРЫТО `20e1667`** (fail-closed дефолт)
- `apps/api/src/integrations/routes.ts:352-387` — [MEDIUM] fuel-card-mock/sync: нет идемпотентности — повторный вызов на тот же период дублирует fuel_records  → /transpult

**web/ops2**

- `apps/web/src/app/repair/page.tsx:126-145` — [MEDIUM] CreateRepairModal отправляет assignedTo/category, которые бэкенд может молча игнорировать  → /transpult

**web/finance**

- `apps/web/src/app/finance/page.tsx:273-288` — [HIGH] Спарклайн «К оплате» суммирует полный total вместо остатка — завышает по частично оплаченным счетам и рассинхрон с метрикой  → /transpult  **✅ ЗАКРЫТО `39f83b6`** (остаток total-paidAmount)

**web/print**

- `apps/web/src/app/print/etrn/[id]/page.tsx:106-109` — [MEDIUM] ЭТрН-preview: грузополучатель подставляется адресом, ИНН/КПП = «—» без гейта  → /jurist  **✅ ЗАКРЫТО `b632f47` (A4)**

**mobile**

- `apps/mobile/src/screens/DeliveryConfirmationScreen.tsx:127-166` — [HIGH] Офлайн-доставка: локальный file:// URI попадает в photoUrls и при replay уходит на сервер как битая ссылка  → /transpult
- `apps/mobile/src/api/offlineQueue.ts:219-259` — [HIGH] replayQueue: успешные действия теряются при сбое записи усечённой очереди (нет транзакции / порядок setItem)  → /transpult

### P3 — 83 (списком)

- `apps/api/src/auth/auth.ts:1402-1422` — signup: bcrypt (CPU-bound ~100мс) выполняется ВНУТРИ db-транзакции — держит соединение/блокировки  _(api/auth)_
- `apps/api/src/auth/auth.ts:1393-1396` — Незакрытый TODO(security P0-3) помечен в коде как открытый, но прежняя уязвимая ветка переписана — TODO устарел/вводит в заблуждение  _(api/auth)_
- `apps/api/src/auth/plan-guard.ts:49-49` — requireFeature проверяет роль 'super_admin', которой нет в APP_ROLES — мёртвая ветка / рассинхрон ролевой модели  _(api/auth)_
- `apps/api/src/auth/auth.ts:1483-1498` — verify-email активирует пользователя по совпадению email+код без проверки текущего состояния (re-activation деактивированного аккаунта)  _(api/auth)_
- `apps/api/src/auth/auth.ts:819-824` — PUT /users/:id: эскалация роли до 'admin' для произвольного пользователя org не дублирует lateral-super-admin guard из POST  _(api/auth)_
- `apps/api/src/auth/auth.ts:1528-1536` — Расхождение док/реализации: /resend-code документирован «1 раз в минуту на email», но rate-limit задан LOGIN_RATE_LIMIT_MAX=5  _(api/auth)_
- `apps/api/src/auth/auth.ts:740-743` — GET /users пагинация: некорректный/отрицательный page|limit не валидируется (parseInt без guard → NaN/negative offset)  _(api/auth)_
- `apps/api/src/modules/billing/service.ts:273-277` — Устаревший комментарий: idx_payments_provider_id описан как НЕуникальный, хотя миграция 0045 добавила partial-unique  _(api/billing)_
- `apps/api/src/modules/carriers/routes.ts:116-126` — POST /carrier-contracts не проверяет endDate >= startDate (инвариант проверяется только в неподключённом helper)  _(api/carriers)_
- `apps/api/src/modules/claims/routes.ts:205-221` — create: org-привязка claim берётся из contractor сервисом, но route валидирует org только у переданного contractorId — при создании по tripId/orderId без contractorId cross-tenant контроль опирается лишь на assert*Access  _(api/claims)_
- `apps/api/src/modules/claims/service.ts:119-149` — exposure() грузит все claims и агрегирует в JS вместо SQL-агрегации  _(api/claims)_
- `apps/api/src/modules/cold-chain/service.ts:121-134` — organizationId замера читается из trips ВНЕ транзакции; при отсутствии рейса пишется NULL без отказа  _(api/cold-chain)_
- `apps/api/src/modules/cold-chain/service.ts:147-163` — Авто-инцидент по breach не фиксирует, какой заказ/лот нарушен — у инцидента нет orderId  _(api/cold-chain)_
- `apps/api/src/modules/compliance/osago/service.ts:21-58` — OSAGO-проверка никогда не грузит per-org креды — всегда mock-адаптер, фиктивный статус сохраняется как достоверный  _(api/compliance+adr)_
- `D:/Ai/TMS-prod/apps/api/src/modules/copilot/service.ts:82-99` — ensureConversation не проверяет принадлежность беседы текущей организации — кросс-орг привязка сообщений  _(api/copilot)_
- `D:/Ai/TMS-prod/apps/api/src/modules/copilot/service.ts:117-122` — messageCount/lastActivityAt обновляются вне транзакции с insert сообщения — возможен дрейф счётчика  _(api/copilot)_
- `apps/api/src/modules/documents/routes.ts:115-147` — POST document-returns: любая ошибка БД маскируется под 409 'Не удалось создать запись'  _(api/documents)_
- `apps/api/src/modules/documents/routes.ts:116-141` — POST/PUT document-returns: insert/update + recordEvent + syncTransportDocumentsForTrip вне транзакции (частичная рассинхронизация)  _(api/documents)_
- `apps/api/src/modules/documents/sf-pdf.ts:36-140` — SF: поле includesVat объявлено, но не используется — НДС всегда back-calc из gross amount  _(api/documents)_
- `apps/api/src/modules/documents/waybill-pdf.ts:146-159` — Путевой лист: сырое значение mechanicDecision/medicDecision печатается как есть при значении != 'approved'  _(api/documents)_
- `apps/api/src/modules/documents/med-inspection-pdf.ts:92-92` — Акты осмотра: сырые enum inspectionType печатаются в документ ('pre_trip'/'post_trip' в поле «Тип осмотра»)  _(api/documents)_
- `apps/api/src/modules/edi/routes.ts:143-152` — Webhook /edi/webhook/:provider: нет валидации provider, нет проверки подписи/HMAC и логируется весь body (документированный stub A-P1-23)  _(api/edi)_
- `apps/api/src/modules/edi/service.ts:247-287` — progressEdiManually допускает повторный перевод в то же состояние (signed_by_carrier→signed_by_carrier) — дубликат события 'signed' в журнале  _(api/edi)_
- `apps/api/src/modules/finance/tarification.service.ts:386-391` — minTripCost присваивается в subtotal как строка (numeric) до round/VAT  _(api/finance)_
- `apps/api/src/modules/fleet/service.ts:1051-1066` — updateFuelRecord edits liters but never adjusts vehicles.totalFuelConsumedL accumulator → permanent drift  _(api/fleet)_
- `apps/api/src/modules/fleet/service.ts:101-106` — Mock GPS coordinates injected as real lat/lon in vehicle list/detail responses with no provenance flag  _(api/fleet)_
- `apps/api/src/modules/geo/routes.ts:10-16` — GeoPointSchema не валидирует диапазоны lat/lon — Haversine считает по бессмысленным координатам  _(api/geo)_
- `apps/api/src/modules/geo/distance.service.ts:97-100` — estimateDrivingDistance — фиксированный коэффициент 1.3 подаётся как «дорожное расстояние»  _(api/geo)_
- `apps/api/src/modules/geo/routes.ts:20-134` — Geo-эндпойнты без requireAbility — только authenticate (асимметрия с остальными модулями)  _(api/geo)_
- `apps/api/src/modules/import/routes.ts:88-103` — All-or-nothing батч: одна дубль/кривая строка откатывает весь импорт без указания строки  _(api/import)_
- `apps/api/src/modules/import/routes.ts:97-102` — mapPgErrorToFriendlyRu не покрывает 23502/22001/22P02 — частые ошибки импорта дают невнятный 'ошибка вставки' и сбрасывают весь батч  _(api/import)_
- `apps/api/src/modules/import/routes.ts:337-339` — Импорт заявок: невалидные даты погрузки/выгрузки молча уходят как NULL/Invalid Date  _(api/import)_
- `apps/api/src/modules/import/routes.ts:51-51` — org-less admin (organizationId=null) импортирует записи с NULL-org — обход per-org уникальности и multitenancy-несогласованность  _(api/import)_
- `apps/api/src/modules/import/routes.ts:252-267` — preview не ограничивает размер загружаемого XLSX — парсинг файла до проверки лимита строк  _(api/import)_
- `apps/api/src/modules/integrations/credentials/routes.ts:91-108` — providerType и providerName не валидируются на согласованность → возможен DPA-bypass + строки-сироты, которые никогда не инстанцируют адаптер  _(api/integrations)_
- `apps/api/src/modules/integrations/credentials/routes.ts:96-154` — POST принимает status='active' напрямую без обязательного успешного health-check → live-операции на непроверенных кредах  _(api/integrations)_
- `apps/api/src/modules/integrations/credentials/routes.ts:253-265` — /test для несуществующего/несовпадающего адаптера затирает корректный status строки на 'error'  _(api/integrations)_
- `apps/api/src/modules/mchd/routes.ts:252-258` — Проверка XML МЧД — только префикс '<?xml', реальная МЧД-структура/подпись ФНС не валидируется при загрузке  _(api/mchd)_
- `apps/api/src/modules/mchd/routes.ts:298-304` — Детекция дубля МЧД по подстроке текста ошибки вместо кода PG 23505 — хрупко  _(api/mchd)_
- `apps/api/src/modules/notifications/routes.ts:52-83` — /start без payload создаёт мёртвую подписку (org=null) но рапортует «уведомления подключены»  _(api/notifications)_
- `apps/api/src/modules/onboarding/routes.ts:252-295` — invite-team: вставка пользователей без транзакции + raw PG unique-violation клиенту при гонке  _(api/onboarding)_
- `apps/api/src/modules/onboarding/routes.ts:187-214` — save-integration-choice: при defer=true вместе с credentials шифрует и сохраняет ключи, помечая запись disabled — противоречивое состояние  _(api/onboarding)_
- `apps/api/src/modules/onboarding/routes.ts:102-116` — inn-lookup не имеет admin-гейта в отличие от остальных мутирующих/чувствительных шагов  _(api/onboarding)_
- `apps/api/src/modules/operational-core/write-service.ts:190-195` — Маршруты lot-assignments и shipment-facts без серверной zod-валидации тела  _(api/operational)_
- `apps/api/src/modules/operational-core/write-service.ts:357-361` — captureShipmentFact: overage/wrong_docs/refusal помечаются статусом 'short'  _(api/operational)_
- `apps/api/src/modules/operations/exceptions-service.ts:284-293` — Запрос events в exceptions-cockpit без org-фильтра (опирается на org-скоуп tripIds)  _(api/operational)_
- `apps/api/src/modules/operational-core/write-service.ts:131-132` — Сообщение об ошибке перегруза раскрывает внутренние числовые значения вместимости  _(api/operational)_
- `apps/api/src/modules/orders/service.ts:540-566` — createOrderFromTemplate строит input в обход Zod — loadingType/maxTiers из шаблона не ре-валидируются перед insert  _(api/orders)_
- `apps/api/src/modules/repairs/service.ts:510-558` — Платформенный super-admin (org-less) не может править/архивировать каталог (org-фильтр инвертирован)  _(api/repairs)_
- `apps/api/src/modules/repairs/routes.ts:182-195` — PUT /repairs/:id/status: status из body не валидируется схемой (raw string в FSM/PG enum)  _(api/repairs)_
- `apps/api/src/modules/repairs/service.ts:384-411` — getRepairPartCatalogMeta загружает до 1000 позиций для отдачи 8 featured + по 4 на категорию (over-fetch)  _(api/repairs)_
- `apps/api/src/modules/scoring/service.ts:67-167` — computeDriverScore меряет компоненты балла по рассинхронизированным временным полям/множествам → cold-chain и on-time молча теряют рейсы вне окна createdAt  _(api/rto+scoring)_
- `apps/api/src/modules/scoring/service.ts:159-188` — Скоринг штрафует водителя за ВСЕ штрафы в окне, включая обжалованные (appealed)  _(api/rto+scoring)_
- `apps/api/src/modules/scoring/service.ts:108-121` — On-time: completed-рейс с windowed-точкой без completedAt считается опоздавшим из-за пробелов в данных  _(api/rto+scoring)_
- `apps/api/src/modules/signatures/gosklyuch-callback.ts:124-129` — IP-allowlist обходится через подменяемый X-Forwarded-For (trustProxy:true доверяет всей цепочке)  _(api/signatures)_
- `apps/api/src/modules/signatures/gosklyuch-callback.ts:141-145` — Lookup документа по externalId без org-фильтра и без unique-constraint в схеме  _(api/signatures)_
- `apps/api/src/modules/signatures/sign-endpoint.ts:300-303` — При ошибке gosklyuch adapter.sign() endpoint молча падает на fallback-deeplink с локальным externalId → callback не найдёт документ  _(api/signatures)_
- `apps/api/src/modules/sprint9/routes.ts:355-378` — Waybill expenses (деньги): numeric-колонки сохраняются/читаются как string в рантайме при TS-типе number — рассинхрон слоёв на денежных полях  _(api/sync+sprint9)_
- `apps/api/src/modules/sync/service.ts:121-122` — Sync: обращение trip.status без null-guard после повторного SELECT в ветках route_point  _(api/sync+sprint9)_
- `apps/api/src/modules/trips/transport-documents-store.ts:1076-1101` — recordTransportDocumentSignature помечает ЭТрН 'signed' при ≥2 любых ролях — может переоценивать юр-завершённость  _(api/trips)_
- `apps/api/src/modules/trips/service.ts:863-871` — Дублирующая проверка MED_CERTIFICATE_EXPIRED в assignTrip (одинаковый hard-warning добавляется дважды)  _(api/trips)_
- `apps/api/src/modules/waybills/routes.ts:262-286` — Загрузка вложения ПЛ доверяет заявленному MIME (нет content-sniffing), в отличие от /uploads  _(api/uploads+waybills)_
- `apps/api/src/modules/waybills/etrn-titles-generator.ts:33-52` — Титулы 2/5/6 ЭТрН форматируют ДатаДок/ДатаВремя в локальной TZ сервера (off-by-one под Docker UTC)  _(api/uploads+waybills)_
- `apps/api/src/modules/waybills/routes.ts:274-286` — Загрузка вложения ПЛ: файл на диск пишется до INSERT, нет транзакции — orphan-файл при сбое  _(api/uploads+waybills)_
- `apps/api/src/modules/waybills/etrn-generator.ts:71-78` — escapeXml не вырезает запрещённые XML-1.0 управляющие символы → невалидный XML ЭТрН  _(api/uploads+waybills)_
- `apps/api/src/modules/demo/service.ts:126-305` — generateDemoData не транзакционен → при сбое посередине дублирование демо-набора при повторе  _(api/misc-modules)_
- `apps/api/src/modules/dpa/routes.ts:144-164` — POST /dpa/accept возвращает текущее время как acceptedAt при идемпотентном повторе  _(api/misc-modules)_
- `apps/api/src/providers/_errors.ts:64-69` — extractHttpStatus bare-number fallback can mis-classify provider errors by grabbing unrelated 100-599 numbers  _(api/providers)_
- `apps/api/src/providers/signature/mock.ts:35-41` — Mock signature interpolates documentId/userId into XML without escaping (breaks/forges envelope on special chars)  _(api/providers)_
- `apps/api/src/providers/telematics/wialon.ts:91-109` — Skeleton telematics methods return [] (silent empty success) instead of signalling not-implemented after the throwing token step  _(api/providers)_
- `apps/api/src/providers/ofd/interface.ts:10-12` — Layer drift: OFD interface doc references getDefaultRegistry().ofd which does not exist  _(api/providers)_
- `apps/api/src/integrations/workers/fines.worker.ts:37-80` — Дедупликация штрафов только на уровне приложения — нет БД-unique на (vehicleId, resolutionNumber), Set не обновляется после вставок  _(api/infra)_
- `apps/api/src/integrations/workers/wialon.worker.ts:25-119` — decideOdometerUpdate (экспортируемый pure-helper) не используется — логика продублирована inline, риск рассинхрона  _(api/infra)_
- `apps/web/src/app/admin/billing/page.tsx:62-84` — Cross-tenant биллинг-запрос уходит ДО клиентского super-admin-guard (ordering)  _(web/admin)_
- `D:/Ai/TMS-prod/apps/api/src/modules/copilot/service.ts:162-206` — Mock-fallback активен в проде при отсутствии ANTHROPIC_API_KEY — копилот молча отвечает заглушками  _(api/copilot)_
- `apps/web/src/app/admin/audit-log/page.tsx:130-142` — exportCsv: limit=500 перетирает limit из buildQuery, комментарий «5000» вводит в заблуждение  _(web/admin)_
- `apps/web/src/app/dispatcher/page.tsx:694-702` — Клик по блокеру/риску в левом рейле диспетчера — мёртвая интеракция (onSelectException не передан)  _(web/ops1)_
- `apps/web/src/app/dispatcher/components/AssignmentPanel.tsx:172-208` — Назначение из панели диспетчера не блокирует перевес при включённой проверке объёма, и проверяет вес только по одной заявке  _(web/ops1)_
- `apps/web/src/app/medic/page.tsx:350-404` — Медосмотр: «Допустить» не блокируется клиентом при положительном алкотесте / критических витальных  _(web/ops2)_
- `apps/web/src/app/analytics/page.tsx:281-283` — Кнопка «Обновить» в Аналитике перезагружает только 3 из 5 датасетов — Топливо и КТГ остаются устаревшими  _(web/finance)_
- `apps/web/src/app/landing/components/Pricing.tsx:171-184` — Годовой billing-toggle теряется при переходе в signup — выбор тарифного периода не пробрасывается  _(web/public)_
- `apps/web/src/app/login/page.tsx:102-108` — Несогласованный минимум длины пароля: login допускает 4 символа, signup/reset требуют 8  _(web/public)_
- `packages/shared/src/billing.ts:143-149` — formatKopecks некорректно форматирует отрицательные суммы  _(shared)_
