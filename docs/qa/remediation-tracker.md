# Remediation Tracker — код-аудит 2026-05-28

> **Источник истины:** [`code-audit-2026-05-28.md`](./code-audit-2026-05-28.md) (закоммичен `776c8be`, sha-blob `09913d6`, 1338 строк).
> Этот файл — **рабочий план починки**, не дубль аудита. Аудит неизменяем; здесь — статусы.
> Роль: **TransPult**. Запущено: 2026-06-02.

## Зачем этот файл

Аудит нашёл **280 находок** (7×P0, 92×P1, 135×P2, 46×P3) + **11 пометок «ЗАКРЫТО-НО-ОТКРЫТО» (CBO)**
(8 raw до дедупа — источник: шапка аудита §«ЗАКРЫТО-НО-ОТКРЫТО (11)»).
«ЗАКРЫТО-НО-ОТКРЫТО» = места, где прошлый фикс (S2/S3/C2/E2/E6) объявлен закрытым, но реально
ушёл в один роут, а тот же класс остался в соседних. Цель этого трекера — **не повторить эту ошибку**.

> **11 CBO уже регрессировали один раз** (фикс был и отвалился). Каждому — **именной**
> regression-тест (не общий инвариант класса): самая дешёвая страховка от второго рецидива.
> CBO-находки помечены `(CBO)` в классах ниже.

> **⚠️ Платформенного super-admin в системе НЕТ.** `APP_ROLES` (rbac.ts) = admin(org-scoped)/
> manager/dispatcher/logist/accountant/mechanic/medic/repair_service/client/driver. Легитимного
> «org=null видит все тенанты» актора не существует. Поэтому **org-less привилегированный аккаунт =
> всегда мисконфиг/seed → DENY (403/пусто), НИКОГДА не bypass.** Это инвариант для всех org-scope фиксов
> (C3/C4). Именно `else if (user.organizationId)` без else-ветки сделал ensureInvoiceAccess/GET tariffs
> эксплуатируемыми.

## Метод (анти-рецидив) — обязателен для каждого класса

Единица работы = **класс/инвариант**, НЕ отдельная находка. Severity определяет порядок классов,
но НИКОГДА не режет класс. Внутри класса чиним все инстансы (P0+P1+P2+P3) разом. На каждый класс:

1. **Энумерация** — грепом/паттерном найти ВСЕ инстансы по всей кодовой базе, не только перечисленные
   аудитом (аудит мог пропустить). Записать список в раздел класса ниже.
2. **Починка всех** инстансов в одном заходе.
3. **Якорный инвариант-тест** — падает на *любом* инстансе класса (матрица «роут × сценарий»),
   не точечный кейс.
4. **Grep-acceptance** — анти-паттерн грепается в 0 (как в самом аудите: «`grep` → пусто»).
5. **Независимая ре-верификация** — свежий проход (отдельный агент / повторный греп) открывает
   класс заново и выносит вердикт «закрыт целиком». Без этого шага рецидив гарантирован.

**Definition of Done класса:** код пофикшен везде ✓ · инвариант-тест зелёный ✓ · grep-acceptance чист ✓
· schema↔migration не разъезжаются (`drizzle-kit check`, где применимо) ✓ · ре-верификация подтвердила ✓
· tsc(api+web) + unit зелёные ✓.

## Статусы

`TODO` · `WIP` · `FIX-DONE` (код готов, тест не закрыт) · `VERIFIED` (DoD выполнен полностью) · `DEFER` (осознанно отложено)

---

## Порядок классов

| # | Класс | Почему здесь | P0 | P1 | Статус |
|---|---|---|---|---|---|
| **C1** | Подпись / ПЭП-верификация / immutability осмотров | Single-tenant real + юр-сила. Маленький — обкатка метода | 1 | 7 | TODO |
| **C2** | Деньги: billing-replay + НДС-корректность + нумерация | Single-tenant real, реальные суммы/чеки | 0 | 10 | TODO |
| **C3** | Org-scope sweep (cross-tenant IDOR/leak) | Гейт мульти-тенант пилота. Самый большой класс | 5 | 23 | TODO |
| **C4** | Глобально-unique индексы → per-org | 1 миграция, ломает multitenancy | 0 | 4 | TODO |
| **C5** | TOCTOU / read-modify-write без транзакции | Гонки на деньгах/подписи/статусах | 0 | 13 | TODO |
| **C6** | Субподряд-ЭТрН-гейт (centralize assertEtrnAllowed) | Юр-блок обходится. Юр-оценка → /jurist | 1 | 1 | TODO |
| **C7** | Auth / JWT-revocation корректность | E6 неполон, ломает сессии | 0 | 3 | TODO |
| **C8** | Утечка raw-PG-ошибок клиенту | Раскрытие структуры БД | 0 | 4 | TODO |
| **C9** | Correctness / unfinished / perf / misc (catch-all) | Всё остальное P1; разнести по мере разбора | 0 | 27 | TODO |

**Сверка P0/P1 (все названы поимённо):** 7 P0 + (7+10+23+4+13+1+3+4+27 = **92 P1**). Все 92 P1 из
severity-секции аудита разнесены по классам — безымянного остатка нет (свод проверен grep'ом по аудиту).
**P2 (135) + P3 (46) = 181** — подтягиваются по классам через ссылку на сегмент аудита (см. «Sweep P2/P3»
в каждом классе); финальный проход **C9** обязан пройти весь список P2/P3 из аудита и по каждой
вынести `VERIFIED`/`DEFER+причина` (см. DoD C9). Сумма = 280, источник — аудит `776c8be`.

---

## C1 — Подпись / ПЭП-верификация / immutability осмотров  `WIP`

**Инвариант:** ПЭП-подпись не сохраняется без `verifyPassword`; запечатанный подписанный осмотр
неизменяем; публичная подпись верифицируется по содержимому; решение осмотра — только уполномоченной ролью.

- [x] **P0** `inspections/service.ts` — ПЭП без `verifyPassword`. ✅ FIX+VERIFIED (`5e09a5c`+):
  helper `verifyPepSignature` (сверка пароля подписанта → 403, хранит необратимый `pep:v1:<fp>`, не plaintext).
  **Sweep нашёл 4 места, не 2:** аудит назвал 294/588 (pre-trip), пропустил **1088/1201 (post-trip)** — починены все 4.
  Инвариант-тест (матрица tech/med × wrong→403+нет записи / correct→201+pep:v1:*) + grep-acceptance (анти-паттерн=0). bcrypt-примитивы вынесены в `auth/password.ts` (убран JWT-сайд-эффект).
- [x] **P1** `apps/web/.../medic/page.tsx:350-398` — алкотест+approved. ✅ FIX (серверный guard `InspectionRuleError`→422 в createMed/createPostTripMed + тест). Клиентский дубль-guard — опционально.
- [ ] **P1** `inspections/service.ts:938-983` — `updateTechInspectionDecision` ретро-правка запечатанного осмотра без immutability-guard
- [ ] **P1** `inspections/service.ts:985-1047` — `updateMedInspectionDecision` тот же gap + approved→rejected flip ретро-разблокирует водителя
- [ ] **P1** `inspections/routes.ts:608-635` — `POST /inspections/tech/:id/decision` доступен любому с role mechanic без проверки роли-механика
- [ ] **P1** `signatures/gosklyuch-callback.ts:92-134, 254-356` — публичный callback принимает произвольный signedXml без верификации содержимого/mTLS/IP-allowlist
- [ ] **P1** `apps/mobile/.../DeliveryConfirmationScreen.tsx:147` — подпись получателя отправляется пустой строкой без валидации
- [ ] **P1** `apps/web/.../trips/page.tsx:1639-1644` — хардкод signerRole='dispatcher'/signerName='Оператор ТрансПульт' для любого юзера

**Sweep P2/P3:** signerRole free-text (trips-docs:981), signedAt client-supplied (store:1025/1033),
signatureState scalar/мульти-титул (gosklyuch-callback:286,321), classifiers never called (api-repairs-insp).
**DoD:** см. метод выше + юр-оценка подписи → /jurist. **Остаток C1:** immutability осмотров (938/985), role-gate (608), gosklyuch (92), mobile-подпись, signerRole.

---

## C2 — Деньги: billing-replay + НДС-корректность + нумерация  `TODO`

**Инвариант:** повторный webhook не катит подписку/чек дважды; НДС считается по реальной ставке во всех
путях (расчёт, PDF, 1С, корректировки); номер счёта per-org.

- [ ] **P1** `billing/routes.ts:260` *(CBO)* — replay-dedupe мёртв (`event_id` из несуществующего поля) → дубль подписки + дубль чека ОФД
- [ ] **P1** `billing/service.ts:424,450,384` — лимит copilot_messages суточный, а счётчик помесячный
- [ ] **P1** `finance/finance.service.ts:116-136` *(CBO)* — легаси-нумерация не per-org + payeeOrganizationId=NULL
- [ ] **P1** `finance/invoice-workflow.service.ts:286-303` — НДС «сверху» (includesVat=false) не начисляется (обе ветки идентичны)
- [ ] **P1** `finance/routes.ts:558-575, 738-755, 856-881` — vatRate не передаётся в generate{Invoice,Act,Upd}Pdf → НДС всегда 20%
- [ ] **P1** `finance/schemas.ts:12` — Zod enum рассинхрон с DB invoice_type (default 'invoice' не существует)
- [ ] **P1** `finance/xml-export.service.ts:94, 174, 139-149` — 1С-экспорт хардкодит СтавкаНДС=20%, не различает СФ/УПД/КСФ
- [ ] **P1** `apps/web/.../InvoiceWorkflowActions.tsx:193` — корректировка КСФ/ИСФ всегда 20% (hardcoded)
- [ ] **P1** `apps/web/.../print/act/[id]/page.tsx:129, 134` — АКТ: хардкод «НДС 20%» (P1-A частично открыт)
- [ ] **P1** `apps/web/.../client/page.tsx:67-73, 152-166` *(CBO)* — метрика «Неоплаченных» всегда 0, enum клиент-портала ≠ Invoice FSM

**Sweep P2/P3:** createAdjustment игнорирует статус (finance-core:472), префикс INV vs СЧ (finance-core:880),
mapInvoiceStatus stale enum (xml-export:151), deferred-триггер не сверяет allocated_vat (0036 SQL:250).

---

## C3 — Org-scope sweep (cross-tenant IDOR/leak)  `TODO`

> **⚠️ C3 — это ТРИ разных корневых механизма, не один. «Добавь org-фильтр + хелпер» НЕ закроет
> класс** (сам станет рецидивом). Каждый инстанс отнести к механизму, якорный матрица-тест ОБЯЗАН
> покрыть все три, иначе «починим общий случай, пропустим NULL-FK» — ровно тот класс, против которого весь трекер.

**Три механизма (помечать каждый инстанс ниже):**
- **(а) фильтра нет вообще** — запрос без `.where(org)` (adr, settings/recent, telegram-subscriptions, execution idempotency).
- **(б) org-less обход** — `organizationId=null` коротит гейт (`else if (user.organizationId)` без else; ensureInvoiceAccess, claims:156, GET /tariffs). **Фикс:** org-less привилегированный аккаунт → DENY, НЕ bypass (super-admin-роли нет — см. шапку).
- **(в) NULL-FK выпадает из subquery-скоупа** — скоуп через `inArray(fk, subquery)`, строка с `fk=null` не отсеивается и видна всем (incidents с vehicleId=null, orphaned claims без contractorId, sprint9 trailers).

**Инвариант:** каждый роут/сервис tenant-данных скоупится по `organizationId` НАПРЯМУЮ (не через FK-subquery,
где это оставляет NULL-дыру); org-less аккаунт без явной платформенной роли (которой нет) → доступ запрещён.

**Якорный матрица-тест (3 обязательных кейса на каждый защищаемый роут):**
1. **cross-tenant:** актор орг-A по ресурсу орг-B → 403/404/пусто.
2. **org-less аккаунт:** привилегированная роль с `organizationId=null` → НЕ видит чужое (403/пусто), не all-tenants.
3. **NULL-FK строка:** ресурс с `fk=null` (vehicleId/contractorId) создан орг-A → НЕ виден орг-B.

- [ ] **P0** `compliance/adr/service.ts:70-82` — listAdrOrders игнорирует organizationId
- [ ] **P0** `edi/routes.ts:154-186` — mock-progress форсит ЭТрН-статус чужого документа (нет assertTripAccess)
- [ ] **P0** `finance/tarification.service.ts:94` *(CBO)* — calculateTripCost без org-фильтра
- [ ] **P0** `sprint9/routes.ts:146-152` — GET /incidents: NULL-vehicleId инциденты утекают всем
- [ ] **P0** `sprint9/routes.ts:272-273` — POST /waybills/:id/drivers: чужой driverId без org-проверки
- [ ] **P1** `auth/auth.ts:974-976` — GET /tariffs утечка при super-admin без org
- [ ] **P1** `auth/guards.ts:54, 185-213` — PUT /incidents/:id IDOR при null FK
- [ ] **P1** `integrations/mocks/wialon-mock-runner.ts:127` — eta_updated без org
- [ ] **P1** `integrations/workers/wialon.worker.ts:162-163` — eta_updated broadcast всем тенантам по WS
- [ ] **P1** `claims/routes.ts:59-69` — orphaned claims (contractorId null) обходят org-scope
- [ ] **P1** `claims/routes.ts:156-165` — привилегированная роль без org обходит фильтр
- [ ] **P1** `claims/routes.ts:53-79` — Claims без contractorId обходят org-scope (тот же класс)
- [ ] **P1** `cold-chain/routes.ts:44-188` — нет RBAC-гейта вообще
- [ ] **P1** `compliance/adr/routes.ts:79-98` — validate-hard без access-guard на orderId/vehicleId/driverId
- [ ] **P1** `compliance/marking/routes.ts:80-115` — scan-batch lotId без org-проверки
- [ ] **P1** `finance/routes.ts:52-65` — ensureInvoiceAccess привилегированная роль без org → IDOR
- [ ] **P1** `import/routes.ts:297-300` — contractor INN lookup без org → cross-tenant linking
- [ ] **P1** `import/routes.ts:140-145` — cross-tenant user hijack через global email lookup
- [ ] **P1** `operational-core/execution-service.ts:146-153` — idempotency по externalId без org
- [ ] **P1** `orders/routes.ts:119-131` — driver видит все заявки орг через GET /orders/list
- [ ] **P1** `orders/routes.ts:527-555` — POST /orders/from-template IDOR через templateOrderId
- [ ] **P1** `settings/routes.ts:51-53` — GET /settings/recent без org-фильтра
- [ ] **P1** `settings/service.ts:135-140` — listRecentSettings отдаёт all-tenant app_settings
- [ ] **P1** `notifications/routes.ts:163-168` *(CBO)* — GET /telegram/subscriptions: все орг (PII leak)
- [ ] **P1** `notifications/routes.ts:177-188` *(CBO)* — POST /telegram/test: broadcast всем орг
- [ ] **P1** `sprint9/routes.ts:223-227` — PUT /incidents/:id UPDATE без org-фильтра
- [ ] **P1** `trips/routes.ts:1371-1388` — dossier item exception по itemId без trip/org-проверки
- [ ] **P1** `apps/web/.../repair/page.tsx:86-99` — список механиков через /auth/users + клиент-фильтр (утечка всех юзеров орг)

**Sweep P2/P3:** tariff-rules getTripTariff (finance-invoice:55), trips volume-preview (trips-core:127),
fleet getDriver fines (fleet:380), analytics profitability vehicle-subquery (misc1:249), sprint9 trailers
unscoped (misc2:66), sync events без org (misc2:99/185), cold-chain resolveTripSla (repairs-insp:44),
fines.worker без org (integrations), mchd_number oracle (signatures:294), copilot list_pending_invoices (misc1:365).
**Реко:** хелпер row-level org-scope ПРИМЕНЯЕТ все три механизма (прямой org-фильтр вместо FK-subquery;
явный DENY для org-less; покрытие NULL-FK). Один хелпер допустим, только если он закрывает все три —
иначе не закрывает класс. Каждый из 28 инстансов прогнать через 3-кейсовый матрица-тест.

---

## C4 — Глобально-unique индексы → per-org  `TODO`

**Инвариант:** uniqueness бизнес-ключей (inn/plate/VIN/mchd) — composite `(organizationId, key)`, не глобально.

- [ ] **P1** `db/schema.ts:268` + `drizzle/0000_full_schema.sql:647` — contractors.inn глобально-unique
- [ ] **P1** `fleet/service.ts:195-204` — vehicles plate/VIN dup-check + DB-индекс глобальные (cross-org DoS)
- [ ] **P1** `fleet/service.ts:656-662` — createContractor INN dup-check cross-org
- [ ] **P1** `fleet/service.ts:657-662` — дубль того же (web-fleet-1 сегмент)

**Sweep P2/P3:** mchd_number global unique → existence oracle (signatures:294), per-org unique по nullable
org_id теряет уникальность для NULL-строк (api-db 0039 SQL:20).
**Реко:** 1 миграция (composite unique + бэкфилл), затем правка in-code dup-чеков. `drizzle-kit check`.

---

## C5 — TOCTOU / read-modify-write без транзакции  `TODO`

**Инвариант:** проверка-состояния-и-запись атомарны (tx + FOR UPDATE / advisory-lock); счётчики не теряются при гонке.

- [ ] **P1** `auth/auth.ts:405-419` — me/organization INN-check вне транзакции (дубль орг)
- [ ] **P1** `carriers/routes.ts:217-221` — assign-carrier финальный UPDATE теряет org-фильтр (TOCTOU write)
- [ ] **P1** `finance/finance.service.ts:557-601` — recordPartialPayment read→event→re-read→update вне tx
- [ ] **P1** `finance/invoice-workflow.service.ts:620-652` — registerPayment read-modify-write paidAmount без lock
- [ ] **P1** `fleet/service.ts:251-264` — updateVehicle plate dup-check вне tx
- [ ] **P1** `orders/service.ts:460-475` — changeOrderStatus проверка состояния вне tx
- [ ] **P1** `sync/service.ts:61-68` — processSingleEvent idempotency-check не атомарен
- [ ] **P1** `trips/transport-documents-store.ts:1015-1051, 1079-1116` — параллельная подпись ЭТрН: read-modify-write metadata.signatures → потеря подписи
- [ ] **P1** `apps/mobile/.../temperature.ts:86-145` + `cold-chain/service.ts:122` — нет idempotency-ключа → дубли cold-chain тиков
- [ ] **P1** `apps/mobile/.../offlineQueue.ts:149-206` — replayQueue без блокировки → двойная отправка/потеря очереди
- [ ] **P1** `apps/web/.../repair/RepairKanban.tsx:1252-1279` — handlePlan/ReceiveParts: updateRepair+changeStatus два запроса без tx
- [ ] **P1** `apps/web/.../logist/CreateTripModal.tsx:152-186` — two-step create без rollback → orphan unassigned trips
- [ ] **P1** `apps/web/.../dispatcher/page.tsx:486-493` — force-close two-step без rollback → trip с delivery-confirmation остаётся in_transit при сбое шага статуса

**Sweep P2/P3:** sign-endpoint read-modify-write (signatures:302), settings updateCostModel upsert вне tx
(onboarding:107), trips assignTrip двойное назначение (trips-core:626), orders generateOrderNumber без lock
(orders:19), repairs hydrate без guard (repairs-insp:244), offlineQueue.enqueueAction (mobile-screens:39).

---

## C6 — Субподряд-ЭТрН-гейт (centralize assertEtrnAllowed)  `TODO`

**Инвариант:** `assertEtrnAllowed` вызывается во ВСЕХ путях оформления/подписи/отправки/выдачи ЭТрН.
Grep-acceptance: ни один путь генерации/отправки ЭТрН не минует гейт.

- [ ] **P0** `trips/routes.ts:1104, 1226` (→ `transport-documents-store.ts:600`) *(CBO)* — send/exchange отправляют ЭТрН наёмного рейса в ЭДО без гейта
- [ ] **P1** `waybills/routes.ts:472-549, 555-632` *(CBO)* — GET /etrn и /etrn-title4 отдают XML ЭТрН без гейта

**Реко:** централизовать вызов внутри sendTransportDocumentToProvider/generateETrN, чтобы паттерн нельзя было обойти. Юр-оценка ролей перевозчик/экспедитор → /jurist.

---

## C7 — Auth / JWT-revocation корректность  `TODO`

**Инвариант:** любое изменение прав/деактивация бампит token_version; перевыпуск JWT сохраняет tv;
непроверенный аккаунт нельзя перезаписать без аутентификации.

- [ ] **P1** `auth/auth.ts:889-893` *(CBO)* — смена ролей в PUT /users/:id не бампит token_version (E6 неполон для понижения прав)
- [ ] **P1** `auth/auth.ts:451-454, 636-639` — перевыпуск JWT в me/organization теряет tv → ломает сессию юзерам с tv≠0
- [ ] **P1** `auth/auth.ts:1364-1381` — POST /signup перезаписывает пароль непроверенного аккаунта без аутентификации

**Sweep P2/P3:** WS-канал не сверяет tv/isActive (api-auth websocket:154), resend-code timing side-channel
(auth:1536), mobile легаси api/*.ts не триггерят auto-logout на 401 (mobile-data).

---

## C8 — Утечка raw-PG-ошибок клиенту  `TODO`

**Инвариант:** клиенту уходит доменное сообщение, не raw error.message от PG/Drizzle. Grep: `error: .*\.message` в send → 0.

- [ ] **P1** `documents/routes.ts:138` — raw PG constraint в POST /document-returns
- [ ] **P1** `import/routes.ts:182` — raw DB error в per-row catch (drivers)
- [ ] **P1** `import/routes.ts:181-183` — POST /import/drivers leaks raw DB error (тот же)
- [ ] **P1** `sync/routes.ts:176, 204` — pull/push 500 отдают raw error.message

**Sweep P2/P3 (большой):** finance-роуты ×14 (finance-core:116..1136), fleet catch-блоки (fleet:111..431),
inspections PDF (documents:467/489), orders ttn (orders:367), trips blanket catch (trips-core:168),
opcore (opcore:70), copilot SSE (misc1:337). **Реко:** единый error-mapper в Fastify error-handler.

---

## C9 — Correctness / unfinished / perf / misc (catch-all)  `TODO`

Разнородный хвост P1. Разбирать после C1–C8; часть подтянется попутно. Дом для любой не-разнесённой находки.

- [ ] **P1** `providers/index.ts:216-224` — OfdRuProvider не зарегистрирован → 54-ФЗ чеки mock даже в prod ⚠️ важное
- [ ] **P1** `fleet/routes.ts:517-536` — PUT fuel-records без Zod-валидации (raw cast)
- [ ] **P1** `inspections/routes.ts:304, 303` — parsePage() для параметра `days` (клампит 0→1)
- [ ] **P1** `integrations/credentials/routes.ts:223-237` — тест-эндпоинт не видит реальные адаптеры → false status='error'
- [ ] **P1** `scoring/service.ts:237-250` — computeScoreboard N×5 sequential queries
- [ ] **P1** `signatures/sign-endpoint.ts:277-295` — Госключ deeplink несёт adapter-externalId, документ под локальным UUID → callback не найдёт
- [ ] **P1** `trips/margin.ts:60-81` — numeric как строки, revenue конкатенируется → NaN
- [ ] **P1** `trips/transport-documents-store.ts:1043-1047` — signatureState.status захардкожен 'partially_signed' (нет «полностью подписан»)
- [ ] **P1** `waybills/service.ts:622-672` — closeWaybill принимает невалидный odometerIn → пишет в vehicles.currentOdometerKm
- [ ] **P1** `import/routes.ts:111-113` — отсутствует 200-item batch limit → DoS
- [ ] **P1** `apps/mobile/.../database/index.ts:14` — onSetUpError проглочен (БД в broken state молча)
- [ ] **P1** `apps/mobile/.../TripDetailsScreen.tsx:639-648` — кнопка «Завершить (легаси)» в любом нетривиальном статусе
- [ ] **P1** `apps/mobile/.../TripDetailsScreen.tsx:249-291` — два независимых пути completeTrip с разными payload
- [ ] **P1** `apps/web/.../dispatcher/page.tsx:598-618` — cockpit assignment без driverId → рейсы без водителя
- [ ] **P1** `apps/web/.../fleet/ContractorsTable.tsx:189` — addresses-роут закомментирован → модалка всегда пустая
- [ ] **P1** `apps/web/.../fleet/VehiclesTable.tsx:263-270` — toggleBlock no-op (backend игнорит isBlocked)
- [ ] **P1** `apps/web/.../login/page.tsx:26` — driver-роут drift ('/' vs routing.ts '/trips')
- [ ] **P1** `apps/web/.../logist/page.tsx:133-145` — dateFrom/dateTo фильтры собираются, но не применяются (мёртвые)
- [ ] **P1** `apps/web/.../trips/SignTitleButton.tsx:352-384` — истёкшие МЧД не фильтруются/не блокируются клиентом
- [ ] **P1** `apps/web/.../trips/page.tsx:2293-2330` — N+1: GET /trips/:id на каждый рейс
- [ ] **P1** `apps/web/.../trips/page.tsx:2406-2408` — поисковый запрос не URL-кодируется (инъекция query)
- [ ] **P1** `apps/web/.../components/TemperaturePanel.tsx:80` — client-side RBAC расходится с сервером
- [ ] **P1** `apps/web/.../dispatcher/page.tsx:598` cockpit (см. выше) / `apps/mobile/.../AppNavigator` мульти-роль (sweep)
- [ ] **P1** `packages/shared/src/schemas.ts:116` — VehicleSchema.plateNumber regex отвергает все валидные госномера РФ (`\\d` вместо `\d`)
- [ ] **P1** `apps/web/.../admin/integrations/page.tsx:227-232` — DPA acceptance-check 404/error молча проваливается в CredentialModal → обход DPA-гейта в проде (security)
- [ ] **P1** `apps/web/.../admin/layout.tsx:51-65` — admin-RBAC только клиентский: SSR отдаёт контент до редиректа (security)
- [ ] **P1** `apps/web/.../dispatcher/page.tsx:573` — handleSelectTrip ищет ТС в устаревшем `vehicles` вместо `enrichedVehicles` → фокус карты молча не срабатывает при активных WS-позициях

**DoD C9 (обязательно для закрытия класса):** помимо перечисленных P1 — **пройти ВЕСЬ список P2 (135) и
P3 (46) из аудита** (`code-audit-2026-05-28.md` §P2/§P3) и по каждой находке выставить `VERIFIED` (fixed)
либо `DEFER` с письменной причиной. Без этого 181 находка тихо сольётся. Вести подсчёт: закрыто/отложено = 181.

**Sweep P3 (46):** косметика по сегментам — пройти финальным заходом, см. аудит §«P3».

---

## Журнал прогресса

| Дата | Класс | Что сделано | Коммит |
|---|---|---|---|
| 2026-06-02 | — | Аудит закоммичен (insurance), трекер создан | `776c8be` |
| 2026-06-02 | C1 | ПЭП P0 закрыт (4 места, sweep нашёл +2 пропущенных аудитом) + алкотест-guard. `auth/password.ts` рефактор. Инвариант-тест + grep-acceptance. tsc/unit-714/integration-137 зелёные | `d215da2` |
| 2026-06-02 | — | Правки по ревью QA: 32→11 CBO (был артефакт грепа); C3 разбит на 3 механизма (нет-фильтра / org-less-обход / NULL-FK) + 3-кейсовый матрица-тест; убран опасный «super-admin org=null → bypass» (super-admin-роли в системе НЕТ → org-less = DENY); названы 4 пропущенных P1 (dispatcher:486→C5, integrations:227/admin-layout:51/dispatcher:573→C9); DoD C9 = пройти все 181 P2/P3; CBO → именные regression-тесты | _(этот коммит)_ |
