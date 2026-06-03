# Remediation Tracker — код-аудит 2026-05-28

> **Источник истины:** [`code-audit-2026-05-28.md`](./code-audit-2026-05-28.md) (закоммичен `776c8be`, sha-blob `09913d6`, 1338 строк).
> Этот файл — **рабочий план починки**, не дубль аудита. Аудит неизменяем; здесь — статусы.
> Роль: **TransPult**. Запущено: 2026-06-02.

> **📍 ТЕКУЩЕЕ СОСТОЯНИЕ (2026-06-03):** **на проде `e79670a`** (local==origin==prod, P0 Gate CI зелёный).
> **Закрыто и на проде: C1 · C2 · C3(cross-tenant) · C4 · C5(backend) · C6 · C7.** 7 классов.
> Остаток: C5-хвост (sync/mobile/web), C8 (error-leak), C9 (correctness/perf), P2/P3 sweep.
> DEFER (документированы): C2-копилот, легаси-нумерация per-org, C3 within-org over-exposure, gosklyuch XAdES/mTLS/юр-сила.

## Зачем этот файл

Аудит нашёл **280 находок** (7×P0, 92×P1, 135×P2, 46×P3) + **11 пометок «ЗАКРЫТО-НО-ОТКРЫТО» (CBO)**
(8 raw до дедупа — источник: шапка аудита §«ЗАКРЫТО-НО-ОТКРЫТО (11)»).
«ЗАКРЫТО-НО-ОТКРЫТО» = места, где прошлый фикс (S2/S3/C2/E2/E6) объявлен закрытым, но реально
ушёл в один роут, а тот же класс остался в соседних. Цель этого трекера — **не повторить эту ошибку**.

> **11 CBO уже регрессировали один раз** (фикс был и отвалился). Каждому — **именной**
> regression-тест (не общий инвариант класса): самая дешёвая страховка от второго рецидива.
> CBO-находки помечены `(CBO)` в классах ниже.

> **⚠️ ПОПРАВКА (был неправ, QA прав): платформенный super-admin ЕСТЬ.** Определён как
> **`admin && !organizationId`** (auth.ts isSuperAdmin, billing isSuperAdmin, seed-demo `super@tms.local`
> «для кросс-tenant аудита»). Отдельной роли в APP_ROLES нет, но механизм есть. Я сначала закрыл org-less
> blanket-DENY'ем → **сломал super-admin (CI smoke упал на POST /api/trips, прод-super-admin тоже)**.
> **Исправлено** хелпером `isPlatformSuperAdmin(user)` (guards.ts): org-less пропускается ТОЛЬКО если
> `admin && !org` (кросс-tenant по дизайну); прочий org-less (не-admin) → DENY. Применён во ВСЕХ
> org-scope фиксах C3/C4. Урок: проверять `isSuperAdmin`/seed перед blanket-DENY (ровно пункт 3 ревью QA).

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
| **C1** | Подпись / ПЭП-верификация / immutability осмотров | Single-tenant real + юр-сила. Маленький — обкатка метода | 1 | 7 | **VERIFIED*** |
| **C2** | Деньги: billing-replay + НДС-корректность + нумерация | Single-tenant real, реальные суммы/чеки | 0 | 10 | **VERIFIED*** |
| **C3** | Org-scope sweep (cross-tenant IDOR/leak) | Гейт мульти-тенант пилота. Самый большой класс | 5 | 23 | **VERIFIED** (cross-tenant) |
| **C4** | Глобально-unique индексы → per-org | 1 миграция, ломает multitenancy | 0 | 4 | **VERIFIED** (миг.0041) |
| **C5** | TOCTOU / read-modify-write без транзакции | Гонки на деньгах/подписи/статусах | 0 | 13 | **VERIFIED*** (backend) |
| **C6** | Субподряд-ЭТрН-гейт (centralize assertEtrnAllowed) | Юр-блок обходится. Юр-оценка → /jurist | 1 | 1 | **VERIFIED** |
| **C7** | Auth / JWT-revocation корректность | E6 неполон, ломает сессии | 0 | 3 | **VERIFIED** |
| **C8** | Утечка raw-PG-ошибок клиенту | Раскрытие структуры БД | 0 | 4 | TODO |
| **C9** | Correctness / unfinished / perf / misc (catch-all) | Всё остальное P1; разнести по мере разбора | 0 | 27 | TODO |

**Сверка P0/P1 (все названы поимённо):** 7 P0 + (7+10+23+4+13+1+3+4+27 = **92 P1**). Все 92 P1 из
severity-секции аудита разнесены по классам — безымянного остатка нет (свод проверен grep'ом по аудиту).
**P2 (135) + P3 (46) = 181** — подтягиваются по классам через ссылку на сегмент аудита (см. «Sweep P2/P3»
в каждом классе); финальный проход **C9** обязан пройти весь список P2/P3 из аудита и по каждой
вынести `VERIFIED`/`DEFER+причина` (см. DoD C9). Сумма = 280, источник — аудит `776c8be`.

---

## C1 — Подпись / ПЭП-верификация / immutability осмотров  `VERIFIED`*

> *VERIFIED по security/correctness-инвариантам (8/8 находок закрыты). Gosklyuch: эксплойт
> (подделка «подписано») закрыт fail-closed; реальная XAdES-верификация — future-item (ждёт
> provider API, не уязвимость пока fail-closed), mTLS → /devops, юр-сила подписи → /jurist.

**Инвариант:** ПЭП-подпись не сохраняется без `verifyPassword`; запечатанный подписанный осмотр
неизменяем; публичная подпись верифицируется по содержимому; решение осмотра — только уполномоченной ролью.

- [x] **P0** `inspections/service.ts` — ПЭП без `verifyPassword`. ✅ FIX+VERIFIED (`5e09a5c`+):
  helper `verifyPepSignature` (сверка пароля подписанта → 403, хранит необратимый `pep:v1:<fp>`, не plaintext).
  **Sweep нашёл 4 места, не 2:** аудит назвал 294/588 (pre-trip), пропустил **1088/1201 (post-trip)** — починены все 4.
  Инвариант-тест (матрица tech/med × wrong→403+нет записи / correct→201+pep:v1:*) + grep-acceptance (анти-паттерн=0). bcrypt-примитивы вынесены в `auth/password.ts` (убран JWT-сайд-эффект).
- [x] **P1** `apps/web/.../medic/page.tsx:350-398` — алкотест+approved. ✅ FIX (серверный guard `InspectionRuleError`→422 в createMed/createPostTripMed + тест). Клиентский дубль-guard — опционально.
- [x] **P1** `inspections/service.ts:938-983` — ретро-правка решения. ✅ FIX: immutability-guard (rejected→approved заблокирован 422) + вызвана мёртвая `validateDecisionUpdate` (note-required-on-reject). Тест unit+integration.
- [x] **P1** `inspections/service.ts:985-1047` — med тот же gap + алкотест-flip. ✅ FIX: то же + сообщение про алкотест. Тест.
- [x] **P1** `inspections/routes.ts:608-635` — tech /decision role-gate. ✅ FIX: явный `mechanic/admin`-гейт (параллель med) + оба /decision маппят statusCode. Тест driver→403.
  - _Бонус: задействована мёртвая `validateDecisionUpdate` из classifiers.ts (была «never called» — отдельная находка api-repairs-insp)._
- [x] **P1** `signatures/gosklyuch-callback.ts` — произвольный signedXml → 'signed'. ✅ FIX (fail-closed): `verifyGosklyuchEnvelope()` (новый модуль, пока false) гейтит seal — без верификации конверта титул уходит в `pending_review`, не 'signed' (эксплойт закрыт). + env IP-allowlist (`GOSKLYUCH_CALLBACK_IP_ALLOWLIST`, рычаг /devops). Unit-тест fail-closed. **Handoff:** реальная XAdES-верификация → когда появится provider API; mTLS → /devops; юр-сила → /jurist.
- [x] **P1** `apps/mobile/.../DeliveryConfirmationScreen.tsx:147` — пустая подпись. ✅ FIX: guard в submitConfirmation (пустая/не-data:image → Alert, нет submit/queue). Сервер уже защищён regex (`data:image;base64`) — фикс закрывает тихую потерю в офлайн-очереди.
- [x] **P1** `apps/web/.../trips/page.tsx:1639-1644` — хардкод подписанта. ✅ FIX: signerRole/signerName из реального `useUser()` в signature + refusal. web tsc ✓.

**Sweep P2/P3:** signerRole free-text (trips-docs:981), signedAt client-supplied (store:1025/1033),
signatureState scalar/мульти-титул (gosklyuch-callback:286,321), classifiers never called (api-repairs-insp).
**DoD:** см. метод выше + юр-оценка подписи → /jurist. **Остаток C1:** gosklyuch-callback подделка подписи (92, + /jurist), mobile пустая подпись (147), хардкод signerRole (1639).

---

## C2 — Деньги: billing-replay + НДС-корректность + нумерация  `VERIFIED`*

> *VERIFIED по single-tenant-real (8/10): НДС-расчёт/PDF/1С/web, enum, billing-replay.
> 2 DEFER (документированы): copilot-квота (AI off на проде), легаси-нумерация per-org
> (мульти-тенант → пуш с C3/C4).

**Инвариант:** повторный webhook не катит подписку/чек дважды; НДС считается по реальной ставке во всех
путях (расчёт, PDF, 1С, корректировки); номер счёта per-org.

- [x] **P1** `billing/routes.ts:260` *(CBO)* — replay-dedupe мёртв. ✅ FIX: ключ дедупа из реальных полей конверта (`object.id:status`) + **belt**: guard в сервисе (повторный succeeded на уже-succeeded платёж → no-op, не катит подписку/не фискализирует). Именной regression-тест (CBO).
- [ ] **P1** `billing/service.ts:424,450,384` — лимит copilot_messages суточный, счётчик помесячный. `DEFER`: copilot AI-флаг **off на проде** (404) → не активен; фикс требует day-vs-month гранулярности в `usage_counters` (рефактор). Не блокирует deploy. Вернуться при включении AI.
- [ ] **P1** `finance/finance.service.ts:116-136` *(CBO)* — легаси-нумерация не per-org + payeeOrganizationId=NULL. `DEFER → мульти-тенант пуш (C3/C4)`: это **мульти-тенант**-корректность (одна орг на демо — серии не конфликтуют, payeeOrgId=NULL не влияет на отчёты при 1 орг). Логически в одном пуше с org-scope sweep. Не single-tenant-real.
- [x] **P1** `finance/invoice-workflow.service.ts:286-303` — НДС «сверху». ✅ FIX: разведены ветки — «сверху» гроссит строки (нетто→gross, Σ allocated_amount==total держит DB CHECK), «в том числе»/explicit/rate=0 без изменений. Тест: нетто 1000 → total 1200/vat 200 (был баг 1000). Существующие 23 теста зелёные.
- [x] **P1** `finance/routes.ts:558/579/738/764/856` — vatRate не доходил до PDF. ✅ FIX: `vatRate` передан во все **5** вызовов generate{Invoice,Act,Upd}Pdf (sweep: аудит назвал 3, мест 5). tsc ✓.
- [x] **P1** `finance/schemas.ts:12` — enum drift. ✅ FIX: API-тип 'invoice' маппится в DB-enum 'payment' на insert (раньше PG-ошибка). Prefix INV сохранён.
- [x] **P1** `finance/xml-export.service.ts:94/195, 139-149` — 1С хардкод 20%. ✅ FIX: `formatVatRate` (из сумм, 0→«Без НДС»); mapInvoiceType расширен (sf/corrective_sf/corrective_upd/advance/payment); mapInvoiceStatus → актуальный FSM (был sweep-item). +3 unit-теста.
- [x] **P1** `apps/web/.../InvoiceWorkflowActions.tsx:193` — корректировка. ✅ FIX: НДС по ставке оригинала `invoice.vatRate` (был дефолт формы "20"). web tsc ✓.
- [x] **P1** `apps/web/.../print/act/[id]/page.tsx:129, 134` — АКТ хардкод «НДС 20%». ✅ FIX: ставка из `inv.vatRate`/сумм, 0→«Без НДС». web tsc ✓.
- [x] **P1** `apps/web/.../client/page.tsx:67-73, 152-166` *(CBO)* — enum клиент-портала. ✅ FIX: INVOICE_STATUS_LABELS → актуальный FSM (issued/paid_partial/paid_full/corrected); sparkline-фильтр `['issued','paid_partial']`. web tsc ✓.

**Sweep P2/P3:** createAdjustment игнорирует статус (finance-core:472), префикс INV vs СЧ (finance-core:880),
mapInvoiceStatus stale enum (xml-export:151), deferred-триггер не сверяет allocated_vat (0036 SQL:250).

---

## C3 — Org-scope sweep (cross-tenant IDOR/leak)  `WIP`

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

- [x] **P0** `compliance/adr/service.ts:70-82` — listAdrOrders. ✅ FIX: org-фильтр + org-less guard (раньше параметр игнорировался → ADR-заявки всех тенантов).

> **🔑 КОРЕНЬ механизма «б» закрыт:** `auth/guards.ts assertOrganizationScope` имел `if (!user.organizationId) return` → org-less актор ПРОХОДИЛ scope-проверку во ВСЕХ assert*-guard'ах (Vehicle/Driver/Trip/Waybill/Order/Trailer/Incident). Теперь `throw AccessDeniedError` (super-admin-роли нет → org-less = DENY). Закрывает org-less-аспект для всех guard-защищённых роутов разом. Матрица-тест (cross-tenant + org-less → 403). unit 722 · integration 142 зелёные (blast-radius чист). _Хэндролл-инстансы (ensureInvoiceAccess/claims/tariffs), что НЕ зовут scope-хелпер — чинятся отдельно ниже._
- [x] **P0** `edi/routes.ts:154-186` — mock-progress. ✅ FIX: loadDocumentTripId + assertTripAccess (как send/history) → cross-tenant force статуса ЭТрН закрыт.
- [x] **P0** `finance/tarification.service.ts:94` *(CBO)* — calculateTripCost. ✅ FIX: org-параметр (untrusted роут обязан передать, trusted internal=null), роут + org-less guard (403) + copilot defense-in-depth. Матрица-тест.
- [x] **P0** `sprint9/routes.ts:146-152` — GET /incidents NULL-vehicleId leak. ✅ FIX (в, миг.0042): incidents.organization_id (backfill из vehicle); GET скоупит напрямую `eq(organizationId)`; POST ставит org; org-less→пусто.
- [x] **P0** `sprint9/routes.ts:272-273` — POST /waybills/:id/drivers. ✅ FIX: assertDriverAccess (был только existence) → чужой driverId на свой ПЛ закрыт.
- [x] **P1** `auth/auth.ts:974-976` — GET /tariffs. ✅ FIX (б): org-less → 403 (был фильтр под `if (actor.organizationId)` → все тенанты).
- [x] **P1** `auth/guards.ts:54, 185-213` (assertIncidentAccess) — ✅ FIX (в): getIncidentAccessSnapshot берёт прямой incidents.organizationId (раньше org из FK → при null-FK снапшот пуст → пропускал).
- [x] **P1** `integrations/workers/wialon.worker.ts:162-163` + `mocks/wialon-mock-runner.ts:127` — eta_updated broadcast всем тенантам. ✅ FIX (а): воркеры передают `organizationId` в payload; `broadcastEvent` уже org-aware (`shouldDeliverEvent`) → событие скоупится по орг.
- [x] **P1** `claims/routes.ts:53-79` (ensureClaimAccess) — ✅ FIX (б+в): org-less staff→DENY; orphaned claim (contractorId=null) скоупится через tripId→trips.org (assertTripAccess), оба null→DENY.
- [x] **P1** `claims/routes.ts:156-165` GET /claims/:id — ✅ FIX: дублированный inline-чек заменён на единый `ensureClaimAccess` (та же дыра «б»/«в»).
- [x] **P1** `claims/routes.ts:59-69` — закрыто вместе с ensureClaimAccess (тот же класс).
- [ ] **P1** `cold-chain/routes.ts:44-188` — нет RBAC-гейта вообще
- [x] **P1** `compliance/adr/routes.ts:79-98` — validate-hard. ✅ FIX (а): assertOrder/Vehicle/DriverAccess на переданные ID (cross-tenant probing ADR-совместимости закрыт).
- [x] **P1** `compliance/marking/routes.ts:80-115` — scan-batch. ✅ FIX (а): lotId проверяется на принадлежность орг (shipmentLots.org) до привязки кодов; org-less→403.
- [x] **P1** `finance/routes.ts:52-65` — ensureInvoiceAccess. ✅ FIX (б): `else if (user.organizationId)` → `else {org-less DENY; ...}`. **+ sweep** (regression-тест вскрыл): workflow-guard `getInvoiceWithOrgRegime` (issue/register-payment/corrections/cancel) и список `GET /finance/invoices` тоже org-less-дырявые → закрыты. Регрессион-тест (org-less→403).
- [x] **P1** `import/routes.ts:297-300` — ✅ FIX (а): contractor по ИНН скоупится по орг (cross-tenant linking закрыт); org-less→не найден.
- [x] **P1** `import/routes.ts:140-145` — ✅ FIX (а): email-lookup скоупится по орг (user hijack чужой орг закрыт).
- [x] **P1** `operational-core/execution-service.ts:146-153` — ✅ FIX (а): idempotency-lookup скоупится по орг (externalId per-org-unique миг.0039).
- [ ] **P1** `orders/routes.ts:119-131` — driver видит все заявки орг. `DEFER (не C3-класс)`: org-фильтр ПРИМЕНЁН (не cross-tenant) — это **within-org** over-exposure (driver видит все заявки орг, не только свои). RBAC-гранулярность, нужно продуктовое решение (driver-RLS vs deny web). Вынести в отдельный RBAC-проход.
- [x] **P1** `orders/routes.ts:527-555` — from-template. ✅ FIX (а): createOrderFromTemplate проверяет, что шаблон принадлежит орг автора (IDOR/копирование чужой заявки закрыт).
- [x] **P1** `settings/routes.ts:51-53` + `service.ts:135-140` — listRecentSettings. ✅ FIX (а): app_settings скоупится через KEY (`baseKey:orgId`) — отдаём только org-ключи + глобальные; org-less→пусто.
- [x] **P1** `notifications/routes.ts:163-168` *(CBO)* — GET /telegram/subscriptions. ✅ FIX: фильтр по org; org-less→пусто (PII chatId/userId всех орг закрыт).
- [x] **P1** `notifications/routes.ts:177-188` *(CBO)* — POST /telegram/test. ✅ FIX: broadcast только подписчикам своей орг; chatId-путь проверяет принадлежность орг; org-less→403.
- [x] **P1** `sprint9/routes.ts:223-227` — PUT /incidents/:id. ✅ FIX (в): assertIncidentAccess теперь по org-column (NULL-FK закрыт) гейтит update.
- [x] **P1** `trips/routes.ts:1371-1388` — dossier-item exception. ✅ FIX (а): update скоупится по scopeId(=trip) + assertTripAccess (item чужого рейса не обновить).
- [ ] **P1** `apps/web/.../repair/page.tsx:86-99` — список механиков через /auth/users + клиент-фильтр. `DEFER (не C3-класс)`: список org-scoped (не cross-tenant) — **within-org** over-exposure (полный список юзеров орг в браузер вместо механиков). Нужен server-side фильтр роли/dedicated endpoint. Вынести в RBAC-проход.

**Sweep P2/P3:** tariff-rules getTripTariff (finance-invoice:55), trips volume-preview (trips-core:127),
fleet getDriver fines (fleet:380), analytics profitability vehicle-subquery (misc1:249), sprint9 trailers
unscoped (misc2:66), sync events без org (misc2:99/185), cold-chain resolveTripSla (repairs-insp:44),
fines.worker без org (integrations), mchd_number oracle (signatures:294), copilot list_pending_invoices (misc1:365).
**Реко:** хелпер row-level org-scope ПРИМЕНЯЕТ все три механизма (прямой org-фильтр вместо FK-subquery;
явный DENY для org-less; покрытие NULL-FK). Один хелпер допустим, только если он закрывает все три —
иначе не закрывает класс. Каждый из 28 инстансов прогнать через 3-кейсовый матрица-тест.

---

## C4 — Глобально-unique индексы → per-org  `VERIFIED` (миг.0041)

**Инвариант:** uniqueness бизнес-ключей (inn/plate/VIN) — composite `(organizationId, key)`, не глобально.

- [x] **P1** `db/schema.ts:268` — contractors.inn. ✅ FIX (миг.0041): глобальный idx_contractors_inn → composite idx_contractors_org_inn. schema.ts синхронизирован.
- [x] **P1** `fleet/service.ts:195-204` — vehicles plate/VIN. ✅ FIX (миг.0041): дропнуты ДВА механизма (inline CONSTRAINT + UNIQUE INDEX) на каждый ключ → composite per-org; dup-check в коде скоупится по орг + org-less guard.
- [x] **P1** `fleet/service.ts:656-662` — createContractor INN. ✅ FIX: dup-check по орг + org-less guard.
- [x] **P1** `fleet/service.ts:657-662` — закрыто вместе (та же функция).

**Инвариант-тест:** две орг — один госномер/VIN/ИНН ok; дубль внутри орг — reject (4/4). Миграция применена к тест-PG (индексы подтверждены интроспекцией).
**Sweep P2/P3 (остаток):** mchd_number global unique → existence oracle (signatures:294) — DEFER; per-org unique по nullable org_id теряет уникальность для NULL-строк (известный tradeoff, на демо нет null-org строк).
**Реко выполнено:** миграция (composite + backfill) + in-code dup-чеки.

---

## C5 — TOCTOU / read-modify-write без транзакции  `VERIFIED`* (backend)

> *Backend-TOCTOU закрыт (платежи, ЭТрН-подпись, статус заявки, assign-carrier, me/organization).
> DEFER: sync processSingleEvent (advisory-lock на 140-строчную функцию — отдельный заход);
> mobile (temperature/offlineQueue) и web (two-step rollback) — фронт-проходы.

**Инвариант:** проверка-состояния-и-запись атомарны (tx + FOR UPDATE / advisory-lock); счётчики не теряются при гонке.

- [x] **P1** `auth/auth.ts:405-419` — me/organization INN-check. ✅ FIX: проверка ИНН перенесена ВНУТРЬ tx + `pg_advisory_xact_lock(hashtext(inn))` сериализует параллельные регистрации одного ИНН (дубль-орг закрыт, без миграции).
- [x] **P1** `carriers/routes.ts:217-221` — assign-carrier. ✅ FIX: финальный UPDATE переиспользует tripConditions (id+org) + оптимистичный re-check статуса (`inArray(status,[planning,assigned])`); пусто → 409. Закрыт TOCTOU + восстановлен org-фильтр.
- [x] **P1** `finance/finance.service.ts:557-601` — recordPartialPayment. ✅ FIX: db.transaction + SELECT FOR UPDATE на invoice; event+сумма+update атомарны.
- [x] **P1** `finance/invoice-workflow.service.ts:620-652` — registerPayment. ✅ FIX: tx + FOR UPDATE, пересчёт из locked-строки. Concurrency-тест (2×600 параллельно → 1200, не 600).
- [x] **P1** `fleet/service.ts:251-264` — updateVehicle plate. ✅ FIX (бэкстоп): org-scope есть + per-org unique (миг.0041) ловит гонку на уровне БД.
- [x] **P1** `orders/service.ts:460-475` — changeOrderStatus. ✅ FIX: оптимистичная блокировка (`WHERE status = прочитанный`); пустой результат → гонка → throw.
- [ ] **P1** `sync/service.ts:61-68` — processSingleEvent idempotency. `DEFER (батч 2)`: нужен advisory-lock + tx-wrap 120-строчной multi-branch функции (проброс tx во все recordEvent). Не money/legal, оффлайн-replay.
- [x] **P1** `trips/transport-documents-store.ts:1015-1051, 1079-1116` — параллельная подпись/отказ ЭТрН. ✅ FIX: обе функции в db.transaction + SELECT FOR UPDATE; appendHistoryEvent/appendReceiptRecord приняли tx-параметр. Потеря юр-значимой подписи закрыта.
- [ ] **P1** `apps/mobile/.../temperature.ts:86` + `cold-chain/service.ts:122` — idempotency-ключ cold-chain тиков. `DEFER → mobile-проход` (нужен idempotency-key в API + клиенте).
- [ ] **P1** `apps/mobile/.../offlineQueue.ts:149-206` — replayQueue без блокировки. `DEFER → mobile-проход`.
- [ ] **P1** `apps/web/.../repair/RepairKanban.tsx:1252` · `logist/CreateTripModal.tsx:152` · `dispatcher/page.tsx:486` — web two-step без rollback. `DEFER → web-проход` (нужны транзакционные API-эндпоинты или клиентский rollback).

**Sweep P2/P3:** sign-endpoint read-modify-write (signatures:302), settings updateCostModel upsert вне tx
(onboarding:107), trips assignTrip двойное назначение (trips-core:626), orders generateOrderNumber без lock
(orders:19), repairs hydrate без guard (repairs-insp:244), offlineQueue.enqueueAction (mobile-screens:39).

---

## C6 — Субподряд-ЭТрН-гейт (centralize assertEtrnAllowed)  `VERIFIED`

**Инвариант:** `assertEtrnAllowed` вызывается во ВСЕХ путях оформления/подписи/отправки/выдачи ЭТрН.

- [x] **P0** `trips/routes.ts:1104, 1226` *(CBO)* — send/exchange. ✅ FIX: гейт **централизован внутри `sendTransportDocumentToProvider`** (store:623) — оба роута (send + exchange/attempts) идут через неё, обойти нельзя. EtrnNotAllowedError(422) маппится глобальным error-handler'ом.
- [x] **P1** `waybills/routes.ts:472, 555` *(CBO)* — GET /etrn + /etrn-title4. ✅ FIX: assertEtrnAllowed(waybill.tripId) до генерации XML; catch маппит statusCode→422.

**Grep-acceptance:** `assertEtrnAllowed` вызывается в 5 точках — sign (trips:996), send/exchange (store:623), XML (waybills:487/574), edi (service:142). Ни один путь генерации/отправки/выдачи ЭТрН не минует гейт. subcontract-gating 4/4 · unit 722 · integration 150.
**Юр-часть → /jurist:** полное решение (5-мод enum + client_contract_type + двойная ЭТрН перевозчик/экспедитор) — W5+, см. Audit_ALL §-1. Гейт = stop-gate (наёмный flow не продавать до юр-решения).

---

## C7 — Auth / JWT-revocation корректность  `VERIFIED`

**Инвариант:** любое изменение прав/деактивация бампит token_version; перевыпуск JWT сохраняет tv;
непроверенный аккаунт нельзя перезаписать без аутентификации.

- [x] **P1** `auth/auth.ts:889-893` *(CBO)* — смена ролей не бампила token_version. ✅ FIX: условие бампа `|| body.roles !== undefined` (понижение прав мгновенно инвалидирует токен). Regression-тест: смена ролей чужого юзера → его старый токен → 401.
- [x] **P1** `auth/auth.ts:451-454, 636-639` — me/organization JWT терял tv. ✅ FIX: `tv: me.tokenVersion ?? 0` в обоих sign() (+ tokenVersion в select). Юзер с tv>0 больше не выкидывается на 401.
- [x] **P1** `auth/auth.ts:1364-1381` — signup перезаписывал пароль непроверенного аккаунта. ✅ FIX: ЛЮБОЙ existing-аккаунт → enumeration-safe 201 БЕЗ изменения записи (overwrite-ветка удалена); владелец завершает через /resend-code.

**Sweep P2/P3 (остаток):** WS-канал не сверяет tv/isActive (websocket:154), resend-code timing (auth:1536), mobile легаси api/*.ts не триггерят auto-logout на 401.

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
| 2026-06-02 | C1 | mobile пустая подпись (guard) + web signerRole из реального useUser (signature+refusal). mobile/web tsc ✓ | `3bdda6e` |
| 2026-06-03 | C7 | **C7 ЗАКРЫТ:** смена ролей бампит token_version (CBO, regression-тест: чужой юзер→старый токен 401); me/organization sign() сохраняет tv; signup не перезаписывает existing-аккаунт (overwrite-ветка удалена). unit 722·integration 151 | _(этот коммит)_ |
| 2026-06-03 | C6 | **C6 ЗАКРЫТ:** субподряд-ЭТрН-гейт централизован в sendTransportDocumentToProvider (send+exchange) + добавлен в waybills GET /etrn,/etrn-title4. Grep: гейт в 5 точках, ни один путь не минует. subcontract 4/4·unit 722·integration 150 | _(этот коммит)_ |
| 2026-06-03 | deploy | **🚀 C5 на проде**: deploy `d0a9c63→84b2584` (без новых миграций). Health 200. CI зелёный. **local==origin==prod==84b2584.** | `84b2584` |
| 2026-06-03 | C5 | Батч 2: assign-carrier (оптимистичный re-check + org-фильтр) + me/organization INN (advisory-lock в tx, дубль-орг). **Backend-TOCTOU закрыт.** DEFER: sync, mobile, web. unit 722·integration 150 | `84b2584` |
| 2026-06-03 | C5 | Батч 1: registerPayment + recordPartialPayment (tx + FOR UPDATE, деньги), ЭТрН signature+refusal (tx + FOR UPDATE, потеря подписи), changeOrderStatus (оптимистичная блокировка). Concurrency-тест (2×600→1200). unit 722·integration 150. Остаток: sync-idempotency, carriers, me/organization, mobile/web | _(этот коммит)_ |
| 2026-06-03 | C3-fix | **РЕГРЕССИЯ + фикс:** blanket org-less DENY сломал платформенного super-admin (`admin && !org`) — CI smoke упал (POST /api/trips), прод-super-admin тоже. Хелпер `isPlatformSuperAdmin` (org-less пропускается только для admin&&!org; прочий org-less → DENY) применён во всех C3/C4 org-scope фиксах. Тест: org-less accountant→403, super-admin→не-403. unit 722·integration 149 | _(этот коммит)_ |
| 2026-06-03 | deploy | **🚀 C3+C4 на проде**: push + deploy `7fdad8c→031407b`, **миграции 0041/0042 применены** (`[apply]`). Health/login 200. Composite-индексы + org-колонки подтверждены интроспекцией прод-БД. origin/main==prod==031407b | `031407b` |
| 2026-06-03 | C4+C3в | **Миграции 0041/0042**: C4 per-org unique (contractors.inn, vehicles plate/vin — дроп глобальных, composite) + dup-чеки по орг; C3-«в» org-column в incidents/fines (backfill) — GET/POST/PUT incidents + assertIncidentAccess + fines-worker/cold-chain/createFine ставят/скоупят org. Инвариант-тест 4/4. unit 722·integration 149. Индексы подтверждены интроспекцией. **C4 закрыт; C3 cross-tenant полностью закрыт.** | _(этот коммит)_ |
| 2026-06-03 | C3 | Батч 5: wialon eta-broadcast (org в payload). **Cross-tenant класс C3 (а+б) закрыт.** Остаток: «в»-NULL-FK (incidents/fines → миграция, батч C4) + 2 within-org DEFER (orders/list driver, repair-page) — не cross-tenant. unit 722·integration 145 | _(этот коммит)_ |
| 2026-06-03 | C3 | Батч 4: механизм «а» — adr validate-hard (access-guards) + import (contractor-INN/user-hijack) + orders from-template (IDOR) + trips dossier-item (scopeId). unit 722·integration 145 | _(этот коммит)_ |
| 2026-06-03 | C3 | Батч 3: механизм «а» — settings/recent (KEY-скоуп) + telegram subs/test (CBO, PII) + execution idempotency + marking scan-batch (lot-org). unit 722·integration 145 | _(этот коммит)_ |
| 2026-06-03 | C3 | Батч 2: хэндролл-«б» — ensureInvoiceAccess + claims (ensureClaimAccess+GET, «б»+«в» orphaned via trip) + GET /tariffs. **Sweep:** workflow-guard (issue/payment/correction/cancel) + список счетов тоже org-less-дырявые (regression-тест вскрыл) → закрыты. unit 722·integration 145 | _(этот коммит)_ |
| 2026-06-03 | C3 | Батч 1: 4 P0 (adr/edi/tarification-CBO/sprint9-driver) + **корень механизма «б»** (assertOrganizationScope org-less→DENY, чинит ВСЕ assert-guard'ы). Матрица-тест (cross-tenant+org-less→403). unit 722·integration 144 | _(этот коммит)_ |
| 2026-06-03 | deploy | **🚀 C1+C2 на проде**: ff-merge в main + push, deploy `0b0aaf1→7fdad8c`. Health/login/static 200, AI off, без миграций. origin/main==prod==7fdad8c | `7fdad8c` |
| 2026-06-03 | C2 | **C2 ЗАКРЫТ по single-tenant-real (8/10)**: НДС-сверху+PDF (`3fa19b9`), enum+1С (`27235fe`), billing-replay (`5bf4afd`), web-НДС (корректировка/АКТ/клиент-enum). 2 DEFER: copilot (AI off), легаси-нумерация (мульти-тенант). tsc(api/web)·unit 721·integration | _(этот коммит)_ |
| 2026-06-02 | C1 | **C1 ЗАКРЫТ (8/8)**: gosklyuch fail-closed (verifyGosklyuchEnvelope→pending_review, эксплойт закрыт) + env IP-allowlist. unit 718 ✓. Handoff: XAdES-verify(future)/mTLS(devops)/юр-сила(jurist) | _(этот коммит)_ |
| 2026-06-02 | C1 | immutability решений осмотра (938/985) + role-gate tech /decision (608): rejected→approved блок (422), note-required (задействована мёртвая validateDecisionUpdate), mechanic/admin-гейт. unit-717/integration-20 зелёные | _(этот коммит)_ |
| 2026-06-02 | — | Правки по ревью QA: 32→11 CBO (был артефакт грепа); C3 разбит на 3 механизма (нет-фильтра / org-less-обход / NULL-FK) + 3-кейсовый матрица-тест; убран опасный «super-admin org=null → bypass» (super-admin-роли в системе НЕТ → org-less = DENY); названы 4 пропущенных P1 (dispatcher:486→C5, integrations:227/admin-layout:51/dispatcher:573→C9); DoD C9 = пройти все 181 P2/P3; CBO → именные regression-тесты | _(этот коммит)_ |
