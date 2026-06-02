# Сплошной код-аудит TMS — 2026-05-28

> Роль: **QA**. Метод: фан-аут 38 субагентов по слоям (критичные пути построчно) + обязательный второй проход adversarial-верификации каждой находки по коду. Сгенерировано 2026-06-02.
> **Это диагноз, не фикс.** Чинит — отдельная сессия /transpult. Юр-оценка ЭТрН/ЭП/МЧД и 152-ФЗ — /jurist.

## Метод и охват

- **Покрытие:** ~120k LOC (apps/api ~52k, apps/web ~50k, apps/mobile ~7k, packages/shared ~12k). 38 сегментов, **все 38 завершены**, in-zone файлы прочитаны на 100% (см. таблицу покрытия).
- **Конвейер:** на каждый сегмент — агент-аудитор (категории: корректность, безопасность, целостность данных, производительность, недоделки, рассинхрон слоёв, error-handling), затем независимый скептик-верификатор открывает каждый `file:line` и выносит вердикт REAL / FALSE_POSITIVE / BY_DESIGN / KNOWN / CLOSED_BUT_OPEN.
- **Дедупликация:** 292 подтверждённых сырых -> 280 уникальных (схлопнуты кросс-сегментные дубли по `file:line`).
- **Не переоткрывалось** известное из bug-tracker / Audit_ALL / full-audit-2026-05-28 — кроме случаев, где заявленный фикс реально отсутствует/неполон (раздел «ЗАКРЫТО-НО-ОТКРЫТО»).

## Сводка по severity

| Severity | Кол-во |
|---|---|
| P0 (сломан core / безопасность / закон) | 7 |
| P1 (видимый баг / деньги / безопасность-эксплуатация) | 92 |
| P2 (UX / качество / латентное) | 135 |
| P3 (косметика) | 46 |
| **Всего подтверждённых** | **280** |
| из них «ЗАКРЫТО-НО-ОТКРЫТО» (доки/трекер врут) | 11 |
| Отсеяно верификатором (FP / by-design) | 12 |

**Главный вывод.** Auth-примитивы, RBAC-матрица, триггеры immutability и базовые org-гейты крепкие. Но в коде системный паттерн: **точечные фиксы известных дыр (S1/S2/S3, E2, E6, C2) накладывались на конкретные роуты, а тот же класс уязвимости остался в десятках соседних** — cross-tenant IDOR/leak в ADR, EDI mock-progress, sprint9/incidents, settings, telegram-routes, claims, finance-tariff, и read-modify-write без транзакций (TOCTOU) в финансах, инспекциях и подписи ЭТрН. Это не легаси — часть в свежем W4-коде. До любого пилота с >1 тенантом или на реальных данных P0 (7 шт) и cross-tenant P1 надо закрыть.

## TOP-10 на немедленную починку

Все — HIGH confidence, подтверждены чтением кода.

1. **(P0, cross-tenant leak)** `compliance/adr/service.ts:70` — listAdrOrders игнорирует organizationId, отдаёт ADR-заявки (класс, UN-номер, статус) **всех тенантов** любому с feature adr. -> /transpult
2. **(P0, IDOR + юр-действие)** `edi/routes.ts:154` — POST /transport-documents/:id/edi/mock-progress проверяет только isAdmin, без assertTripAccess: admin орг A форсит статус подписания ЭТрН чужого документа. -> /transpult
3. **(P0 / ЗАКРЫТО-НО-ОТКРЫТО, IDOR)** `finance/tarification.service.ts:94` — calculateTripCost без org-фильтра; GET /finance/trips/:id/cost отдаёт ставки/себестоимость/маржу чужого тенанта. S3 это называл — фикс ушёл только в copilot. -> /transpult
4. **(P0, cross-tenant leak)** `sprint9/routes.ts:146` — GET /incidents: таблица incidents без organization_id, скоуп только через subquery по vehicleId; инциденты с vehicleId=null утекают всем. -> /transpult
5. **(P0, cross-tenant write)** `sprint9/routes.ts:272` — POST /waybills/:id/drivers не проверяет принадлежность driverId орг: назначение чужого водителя на свой ПЛ. -> /transpult
6. **(P0 / ЗАКРЫТО-НО-ОТКРЫТО, закон)** `trips/routes.ts:1104,1226` + `waybills/routes.ts:472,555` — субподряд-гейт assertEtrnAllowed (C2, fix 32da51d объявлен герметичным) **не вызывается** в путях отправки ЭТрН в ЭДО (/send, /exchange/attempts) и в GET-выдаче XML ЭТрН. -> /transpult, юр-оценка -> /jurist
7. **(P0, безопасность/закон)** `inspections/service.ts:285,588` — ПЭП (input.signature) сохраняется в БД **без вызова verifyPassword**: либо открытый пароль в таблице, либо подпись тех/медосмотра не верифицируется вовсе. -> /transpult, юр-сила -> /jurist
8. **(P1, подделка подписи на go-live)** `signatures/gosklyuch-callback.ts:92` — публичный callback ставит документ signed:gosklyuch по одному HMAC от externalId (утекает клиенту), **не проверяя сам конверт подписи** (verify() = not implemented, не вызывается), без mTLS/IP-allowlist. **P0 на go-live**. -> /transpult, /jurist
9. **(P1 / ЗАКРЫТО-НО-ОТКРЫТО, PII-leak)** `notifications/routes.ts:163,177` — S2 закрыл worker, но GET /telegram/subscriptions отдаёт chatId/userId **всех тенантов**, а POST /telegram/test без chatId шлёт всем. -> /transpult
10. **(P1, multitenancy сломан)** `db/schema.ts:268` (contractors.inn) и `fleet/service.ts:195` (vehicles plate/VIN) — **глобально-уникальные** индексы: тенант B не может завести контрагента/ТС с ИНН/госномером тенанта A (cross-org DoS + раскрытие существования). -> /transpult

Дальше по значимости (P1): мёртвый replay-dedupe вебхука ЮKassa (`billing/routes.ts:260` — двойное продление подписки + дубль чека ОФД); легаси-нумерация счетов не per-org (`finance.service.ts:116`); неавторизованная перезапись пароля непроверенного аккаунта на signup (`auth.ts:1364`); ретроактивная правка подписанного запечатанного осмотра (`inspections/service.ts:938`); cold-chain роуты без RBAC (`cold-chain/routes.ts:44`).

## ЗАКРЫТО-НО-ОТКРЫТО — где доки/трекер врут (11)

Эти пункты числятся закрытыми в full-audit-2026-05-28 / bug-tracker, но фикс отсутствует, неполон или регрессировал. Каждый подтверждён цитатой строки.
#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/auth/auth.ts:889-893`
**Смена ролей в PUT /users/:id НЕ бампит token_version — revocation-гейт E6 неполон для понижения прав**  -> /transpult  _(сегмент: api-auth, security)_

- **Что не так:** Схема (db/schema.ts:232-235) явно декларирует, что token_version бампится «при деактивации/смене пароля/ролей». Но обработчик бампит ТОЛЬКО при `body.password || body.isActive === false`. При смене ролей (`body.roles`) бамп НЕ происходит. Значит понижение прав (например, снятие роли 'admin' у скомпрометированного/уволенного сотрудника) НЕ инвалидирует его текущий JWT: старый токен с прежними ролями остаётся валидным до истечения 24ч (JWT_EXPIRES_IN). При этом роли в RBAC берутся ИЗ JWT-пейлоада (rbac.ts:258 `request.user.roles`, defineAbilitiesFor(user.roles)), а не из БД — то есть демоушен не действует немедленно. Это и есть классический сценарий, ради которого делалась E6.
- **Воспроизведение:** 1) Пользователь U имеет роль admin, логинится → JWT{roles:[admin], tv:0}. 2) Другой admin делает PUT /api/auth/users/U {roles:['driver']} (без password, без isActive). 3) В БД roles=driver, но token_version остаётся 0. 4) U продолжает слать запросы со старым cookie/Bearer → authenticate проходит (tv 0===0, isActive true), RBAC видит roles=[admin] из пейлоада → admin-доступ сохраняется до 24ч.
- **Направление фикса:** В блоке формирования updateData бампить tokenVersion также при `body.roles !== undefined` (любая смена ролей), а не только при password/деактивации. Опционально — всегда брать roles в RBAC из свежего чтения БД в authenticate, раз уже делается SELECT users.
- **Верификация:** Подтверждено: auth.ts:891 `if (body.password || body.isActive === false)` — нет ветки body.roles. Схема schema.ts:234 явно требует бамп «при смене ролей». RBAC использует roles из JWT-пейлоада, не из БД → демоушен не мгновенный.

#### [P2][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/db/schema.ts:1112 (uniqueIndex('idx_events_external_id').on(table.externalId))`
**Drizzle-schema events.externalId всё ещё single-column global unique — рассинхрон с миграцией 0039 (composite per-org)**  -> /transpult  _(сегмент: api-opcore,api-db, layer-drift)_

- **Что не так:** Миграция 0039 (apps/api/drizzle/0039_*.sql:26-28) делает DROP INDEX idx_events_external_id и CREATE UNIQUE idx_events_org_external_id ON events(organization_id, external_id). Но schema.ts по-прежнему объявляет uniqueIndex('idx_events_external_id').on(table.externalId) — глобально. Раннер миграций применяет .sql напрямую, поэтому live-DB корректна, но schema.ts — источник истины для drizzle-kit generate/push. Любой drizzle-kit push/generate воссоздаст глобальный unique → регрессия idempotency-фикса E2. Для invoices аналогичный фикс в schema.ts отражён корректно (line 935), для events — нет.
- **Воспроизведение:** git diff: 0039 даёт events(organization_id, external_id) unique; schema.ts line 1112 — events(external_id) unique. Запуск drizzle-kit generate сгенерирует миграцию, возвращающую глобальный unique.
- **Направление фикса:** В schema.ts заменить uniqueIndex('idx_events_external_id').on(table.externalId) на uniqueIndex('idx_events_org_external_id').on(table.organizationId, table.externalId), синхронно с 0039.
- **Верификация:** Подтверждено: schema.ts:1112 всё ещё uniqueIndex('idx_events_external_id').on(table.externalId); 0039:26-28 DROP idx_events_external_id + CREATE UNIQUE idx_events_org_external_id(organization_id, external_id). Schema-source-of-truth рассинхронизирован с фактической миграцией.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/billing/routes.ts:260`
**Replay-dedupe вебхука ЮKassa мёртв: eventId читается из несуществующего поля body.event_id**  -> /transpult  _(сегмент: api-billing, data-integrity)_

- **Что не так:** ЮKassa-уведомление имеет конверт { type, event, object:{ id, status, ... } } — поля event_id на верхнем уровне НЕ существует (его нет и в YookassaWebhookSchema, строки 102-114). Поэтому `const eventId = (request.body as { event_id?: string }).event_id` (стр.260) в проде ВСЕГДА undefined. В handlePaymentCallback dedupe-ветка (service.ts:262) выполняется только `if (payload.eventId && paymentRow.providerMetadata)`, т.е. при undefined она пропускается, и lastWebhookEventId никогда не сравнивается. FOR UPDATE (service.ts:248-254) лишь сериализует ретраи, но не дедуплицирует их: на каждый повторный `payment.succeeded` блок succeeded (service.ts:290-341) выполняется заново — заново катит подписку на +30 дней от текущего now (стр.306) и заново фискализирует через ОФД (стр.319-334), порождая дубль чека.
- **Воспроизведение:** 1) Создать платёж, дождаться `payment.succeeded` от ЮKassa (валидный HMAC). 2) ЮKassa повторно доставляет тот же webhook. 3) Каждый повтор: подписка currentPeriodEnd сдвигается ещё на +30 дней и создаётся новый ОФД-чек. lastWebhookEventId не спасает, т.к. eventId=undefined.
- **Направление фикса:** Ключ дедупа брать из реальных полей: object.id + object.status (или заголовок Idempotence-Key), а не из body.event_id. Дополнительно — guard в service.ts: при status==='succeeded' если paymentRow.status уже 'succeeded' → no-op.
- **Верификация:** Подтверждено: YookassaWebhookSchema (routes.ts:102-114) не содержит event_id; routes.ts:260 читает body.event_id (всегда undefined), service.ts:262 dedupe требует truthy payload.eventId. Нет guard на paymentRow.status==='succeeded' перед повторным rolling+фискализацией.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/finance/finance.service.ts:116-136`
**Легаси-путь нумерации НЕ per-org: глобальная серия + payeeOrganizationId не проставляется (регрессия заявленного E2-фикса)**  -> /transpult  _(сегмент: api-finance-core, data-integrity)_

- **Что не так:** E2 (f2c84ce) реализован ТОЛЬКО в invoice-workflow.service.ts (generateInvoiceNumber: advisory-lock по prefix|orgId + payeeOrganizationId фильтр + insert payeeOrganizationId). Легаси getNextInvoiceNumber делает глобальный LIKE без org-фильтра, а generateInvoices/bulkGenerateInvoices/tryAutoCreateInvoice вставляют invoices БЕЗ payeeOrganizationId (NULL). Две орг делят общий INV/ACT/UPD-ряд; легаси-счета (payeeOrganizationId=NULL) не попадают в org-отчёты overdue.
- **Воспроизведение:** POST /finance/invoices от орг-A и орг-B в одном году → оба получают INV-2026-NNNNN из единого глобального desc(number). insert не задаёт payeeOrganizationId → NULL.
- **Направление фикса:** Проксировать генерацию через workflow generateInvoiceNumber(type,tx,orgId) и проставлять payeeOrganizationId во всех трёх легаси-insert.
- **Верификация:** Подтверждено: getNextInvoiceNumber (116-128) LIKE без orgId; inserts 188-198, 882-896, 1034-1048 НЕ содержат payeeOrganizationId. Workflow (invoice-workflow.ts:97-108) делает per-org — легаси отстал.

#### [P0][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/finance/tarification.service.ts:94-97, 116-119, 150`
**Cross-tenant IDOR: calculateTripCost не фильтрует по organizationId**  -> /transpult  _(сегмент: api-finance-invoice, security)_

- **Что не так:** calculateTripCost(tripId) грузит рейс через `db.select().from(trips).where(eq(trips.id, tripId))` — БЕЗ фильтра organizationId. Роут GET /finance/trips/:id/cost под preHandler requireAbility('read','Trip') — это CASL-ability, НЕ построчная tenant-проверка — и передаёт в сервис только request.params.id, без org. Любой аутентифицированный пользователь любого тенанта по UUID чужого рейса получает полный финансовый разрез: ставки тарифа, себестоимость, маржу чужой организации. Это новый IDOR, не покрытый известными S1/S3.
- **Воспроизведение:** 1) Тенант B создаёт рейс, узнаёт его UUID. 2) Пользователь тенанта A (любая роль с read Trip) шлёт GET /finance/trips/<tripId-тенанта-B>/cost. 3) Возвращается TripCostBreakdown с тарифными ставками, себестоимостью и маржой тенанта B (HTTP 200).
- **Направление фикса:** Прокинуть organizationId из request.user в calculateTripCost и добавить eq(trips.organizationId, orgId) (super-admin org=null → без фильтра). При несовпадении — 404/403. Аналогично проверить tariff/contract.
- **Верификация:** Подтверждено: tarification.service.ts:96 `where(eq(trips.id, tripId))` без org; routes.ts:113 передаёт только request.params.id под requireAbility('read','Trip') (CASL, не row-level). costSettings берётся по tripRecord.organizationId уже постфактум (line 150).
- **QA-корректировка: S3 (fix 5d37598) в full-audit-2026-05-28 явно называл calculateTripCost и роут GET /finance/trips/:id/cost; фикс применён только к copilot-tools, сам роут остался открыт. Переклассифицировано REAL -> ЗАКРЫТО-НО-ОТКРЫТО. Severity P0 сохранён.**

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/notifications/routes.ts:163-168`
**GET /telegram/subscriptions: returns ALL subscriptions from ALL orgs — cross-tenant PII leak**  _(сегмент: api-misc2, security)_

- **Что не так:** Confirmed: line 167 is `db.select().from(notificationSubscriptions)` with no .where() clause. The notificationSubscriptions table does have an organizationId column (schema.ts:1139) but it is not used here.
- **Воспроизведение:** Auth as admin of Org-A. GET /telegram/subscriptions — response includes telegramChatId/userId from all other orgs.
- **Направление фикса:** Add .where(eq(notificationSubscriptions.organizationId, user.organizationId)) and expose `request` in the handler.
- **Верификация:** routes.ts:167 confirmed as unscoped. schema.ts:1139 shows organizationId exists in the table but is ignored in the query.
- **QA-корректировка: S2 (fix 1d2651f + миграция org_id) закрыл notification.worker, но GET /telegram/subscriptions фильтр по org так и не получил (organizationId в таблице есть — schema.ts:1139 — но в запросе игнорируется). REAL -> ЗАКРЫТО-НО-ОТКРЫТО.**

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/notifications/routes.ts:177-188`
**POST /telegram/test (no chatId): broadcasts test message to ALL active subscribers across all orgs**  _(сегмент: api-misc2, security)_

- **Что не так:** Confirmed: line 179-181 fetches with `eq(notificationSubscriptions.isActive, true)` only — no org filter. Any admin can trigger a broadcast to every subscriber across all organizations.
- **Воспроизведение:** Auth as admin of Org-A. POST /telegram/test with body {}. All active subscribers in all orgs receive the message.
- **Направление фикса:** Filter by user.organizationId in both the broadcast path and the chatId-specific path.
- **Верификация:** routes.ts:179-181 confirmed: `.where(eq(notificationSubscriptions.isActive, true))` — organizationId filter is absent.
- **QA-корректировка: продолжение неполного S2 — POST /telegram/test без chatId рассылает всем подписчикам всех тенантов. REAL -> ЗАКРЫТО-НО-ОТКРЫТО.**

#### [P0][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/trips/routes.ts:1104, 1226 (calling sendTransportDocumentToProvider in transport-documents-store.ts:600)`
**Субподряд-ЭТрН-гейт (P0-C2) обходится через /exchange/attempts и /send — реальная отправка ЭТрН наёмного рейса в ЭДО проходит без assertEtrnAllowed**  -> /transpult  _(сегмент: api-trips-docs, security)_

- **Что не так:** Гейт etrn-guard.assertEtrnAllowed по своему же docstring должен вызываться во ВСЕХ путях оформления/подписи/ОТПРАВКИ ЭТрН. Подписной роут (routes.ts:996) его вызывает, но два роута фактической исходящей отправки в провайдер ЭДО — POST /trips/:id/transport-documents/:documentId/exchange/attempts (вызывает sendTransportDocumentToProvider, routes.ts:1104) и POST .../send (routes.ts:1226) — НЕ вызывают assertEtrnAllowed. Сама sendTransportDocumentToProvider (transport-documents-store.ts:600-734) тоже не содержит проверки executionMode. Значит ЭТрН по рейсу с executionMode='subcontract' (наёмный) можно отправить в провайдера и сгенерировать exchange/receipt/providerStatus, минуя юр-блок, который C2 (fix 32da51d) объявил герметичным. Заявленный фикс неполон/регрессировал.
- **Воспроизведение:** 1) Рейс с executionMode='subcontract'. 2) POST /trips/{id}/transport-documents/{docId}/send (или /exchange/attempts) с валидным JWT и ability update Trip. 3) assertEtrnAllowed не вызывается → sendTransportDocumentToProvider создаёт outbound exchange, receipt, ставит providerStatus 'sent_to_provider', статус документа SENT. ЭТрН наёмного рейса ушёл в ЭДО без ролевой настройки перевозчик/экспедитор.
- **Направление фикса:** Добавить await assertEtrnAllowed(id) (с тем же EtrnNotAllowedError→422 маппингом, как в routes.ts:994-1002) в обработчики обоих роутов отправки (exchange/attempts и send); лучше — централизовать вызов внутри sendTransportDocumentToProvider, чтобы ни один путь отправки его не миновал.
- **Верификация:** Подтверждено: /signatures-роут вызывает assertEtrnAllowed (routes.ts:994-1002), но /exchange/attempts (1072-1109) и /send (1206-1231) вызывают sendTransportDocumentToProvider без гейта; store (600-734) проверки executionMode не содержит.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/waybills/routes.ts:472-549 (GET /waybills/:id/etrn), 555-632 (GET /waybills/:id/etrn-title4)`
**Субподряд-гейт ЭТрН (assertEtrnAllowed) НЕ вызывается в маршрутах выдачи XML ЭТрН — обход C2-фикса**  _(сегмент: api-waybills, security)_

- **Что не так:** P0-C2 (fix 32da51d) объявил единый гейт assertEtrnAllowed герметичным для ВСЕХ путей оформления/подписи/отправки ЭТрН. Гейт реально вызывается только в edi/service.ts:142 и trips/routes.ts:996. Маршруты GET /waybills/:id/etrn и /etrn-title4 генерируют ЭТрН-XML и отдают клиенту без гейта.
- **Воспроизведение:** 1) Рейс executionMode='subcontract', org с ИНН. 2) GET /api/waybills/{id}/etrn с JWT staff. 3) 200 + XML ЭТрН с carrierInn нашей организации, тогда как sign/send дал бы 422 SUBCONTRACT_ETRN_BLOCKED.
- **Направление фикса:** Импортировать assertEtrnAllowed и вызвать await assertEtrnAllowed(trip?.id ?? waybill.tripId) в обоих GET-роутах после загрузки trip, до generateETrN/Title4; маппить statusCode 422 в reply.
- **Верификация:** Grep подтвердил: assertEtrnAllowed только в edi/service.ts:142 и trips/routes.ts:996. GET-роуты (routes.ts:512 generateETrN, 596 generateETrNTitle4) гейт не вызывают. Docstring etrn-guard.ts:6 сам требует вызова во ВСЕХ путях.

#### [P2][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/providers/payment/tinkoff.ts:57-64`
**healthCheck возвращает ok:true при заглушечных методах (go-live капкан) — фикс PROV-P0-2 применён частично**  -> /transpult  _(сегмент: api-providers, unfinished)_

- **Что не так:** Фикс ok:false применили к yookassa и др., но tinkoff.healthCheck возвращает ok:Boolean(terminalKey&&password) detail 'tinkoff credentials present', тогда как createPayment/getPayment/refund кидают 'not yet implemented'. То же в ofd/ofd-ru.ts. Severity P2: эти классы не зарегистрированы в realAdapterFactories и недостижимы через test-эндпоинт сегодня — капкан латентный.
- **Воспроизведение:** Зарегистрировать любой из перечисленных классов (или вызвать healthCheck напрямую) при наличии creds → ok:true, затем createPayment()/fiscalize() кидает 'not yet implemented'.
- **Направление фикса:** Привести healthCheck всех скелетов к единому контракту: ok:false + detail 'not implemented (skeleton)', как уже сделано для yookassa/crpt.
- **Верификация:** Подтверждено: tinkoff.ts:57-64 ok:Boolean(terminalKey&&password), createPayment throws (70+). ofd-ru.ts:20-27 ok:Boolean(login&&password), fiscalize throws (36). Контраст: yookassa.ts:55-60 уже ok:false. Фикс неполон.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/web/src/app/client/page.tsx:67-73, 152-166`
**Метрика «Неоплаченных счетов» всегда 0 — enum клиент-портала не совпадает с Invoice FSM**  _(сегмент: web-client-orders, correctness)_

- **Что не так:** INVOICE_STATUS_LABELS (строки 67-73) содержит только draft/sent/paid/overdue/cancelled — 'issued' и 'paid_partial' отсутствуют. unpaidSparkline (строка 157) фильтрует по ['sent', 'overdue'], которые больше не приходят с сервера после E4/E5 fix. Сам счётчик unpaidInvoices (строка 137) корректен, но badge рендерит сырое 'issued'.
- **Воспроизведение:** Клиент с выставленными счетами (status='issued'): статус-бейдж показывает сырое 'issued', sparkline пуст, badge fallback neutral.
- **Направление фикса:** Добавить issued/paid_partial/paid_full/corrected в INVOICE_STATUS_LABELS; в unpaidSparkline заменить фильтр на ['issued', 'paid_partial'].
- **Верификация:** E4/E5 fix обновил unpaidInvoices-фильтр (строка 137), но INVOICE_STATUS_LABELS и unpaidSparkline-фильтр (строка 157) остались со старыми статусами — фикс неполон.


## Разбор по severity

_P0/P1 — полный формат (что не так / воспроизведение / направление фикса / верификация). P2/P3 — сжато, сгруппированы по сегменту._

## P0 — критично: сломан core / дыра безопасности / юр-недействительность (7)

#### [P0][HIGH] `apps/api/src/modules/compliance/adr/service.ts:70-82`
**Cross-tenant leak: listAdrOrders игнорирует organizationId — отдаёт ADR-заявки всех тенантов**  -> transpult  _(сегмент: api-edi, security)_

- **Что не так:** listAdrOrders(_organizationId) принимает org как _organizationId (помечен неиспользуемым) и строит запрос .where(isNotNull(orders.adrClass)).limit(200) БЕЗ фильтра eq(orders.organizationId, ...). Роут GET /compliance/adr/orders (adr/routes.ts:66-77) передаёт user.organizationId, но функция его выбрасывает. В результате любой пользователь с feature 'adr' видит заявки с ADR-классом (номер, класс, UN-номер, статус) по ВСЕМ организациям системы.
- **Воспроизведение:** 1) Залогиниться любым пользователем org A с подключённым feature 'adr'. 2) GET /api/compliance/adr/orders. 3) В ответе присутствуют заявки организаций B/C (содержат orders.number, adrClass, adrUnNumber).
- **Направление фикса:** Добавить .where(and(eq(orders.organizationId, organizationId), isNotNull(orders.adrClass))) и переименовать параметр в organizationId (использовать его).
- **Верификация:** Подтверждено дословно: service.ts:70 параметр _organizationId, тело — .from(orders).where(isNotNull(orders.adrClass)).limit(200), org-фильтра нет. routes.ts:75 передаёт user.organizationId, но он отбрасывается.

#### [P0][HIGH] `apps/api/src/modules/edi/routes.ts:154-186`
**Cross-tenant IDOR: EDI mock-progress форсит ЭТрН-статус по чужому документу (нет assertTripAccess)**  -> transpult  _(сегмент: api-edi, security)_

- **Что не так:** Роут POST /transport-documents/:id/edi/mock-progress проверяет ТОЛЬКО isAdmin(user) (строка 163), но НЕ вызывает assertTripAccess/любой org-гейт. progressEdiManually() в service.ts (строки 251-259) выбирает документ исключительно по eq(transportDocuments.id, documentId) без фильтра по trip/organization. Admin организации A, передав UUID документа организации B, переводит чужой ЭТрН в signed_by_client или rejected. Это юридически значимое действие (форсирование статуса подписания товаросопроводительного документа) и cross-tenant запись. Send/history-роуты в этом же файле корректно вызывают assertTripAccess — здесь гейт забыли.
- **Воспроизведение:** 1) Залогиниться admin'ом org A. 2) Узнать/перебрать UUID transport_document, принадлежащего trip организации B (документ в статусе sent/signed_by_carrier). 3) POST /transport-documents/<docB>/edi/mock-progress {to:'signed_by_client'} → 200 success, статус чужого ЭТрН изменён.
- **Направление фикса:** Перед progressEdiManually загрузить tripId документа (loadDocumentTripId уже есть в файле) и вызвать assertTripAccess(tripId, user), как в send/history-роутах; 404 если документ не найден, 403 при чужой орг.
- **Верификация:** Подтверждено: preHandler routes.ts:160 = [authenticate, requireFeature('edi')]; внутри только isAdmin (163), нет assertTripAccess. progressEdiManually service.ts:258 — where(eq(transportDocuments.id, documentId)) без org. Контраст с send (79) и history (122), где assertTripAccess есть.

#### [P0][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/finance/tarification.service.ts:94-97, 116-119, 150`
**Cross-tenant IDOR: calculateTripCost не фильтрует по organizationId**  -> /transpult  _(сегмент: api-finance-invoice, security)_

- **Что не так:** calculateTripCost(tripId) грузит рейс через `db.select().from(trips).where(eq(trips.id, tripId))` — БЕЗ фильтра organizationId. Роут GET /finance/trips/:id/cost под preHandler requireAbility('read','Trip') — это CASL-ability, НЕ построчная tenant-проверка — и передаёт в сервис только request.params.id, без org. Любой аутентифицированный пользователь любого тенанта по UUID чужого рейса получает полный финансовый разрез: ставки тарифа, себестоимость, маржу чужой организации. Это новый IDOR, не покрытый известными S1/S3.
- **Воспроизведение:** 1) Тенант B создаёт рейс, узнаёт его UUID. 2) Пользователь тенанта A (любая роль с read Trip) шлёт GET /finance/trips/<tripId-тенанта-B>/cost. 3) Возвращается TripCostBreakdown с тарифными ставками, себестоимостью и маржой тенанта B (HTTP 200).
- **Направление фикса:** Прокинуть organizationId из request.user в calculateTripCost и добавить eq(trips.organizationId, orgId) (super-admin org=null → без фильтра). При несовпадении — 404/403. Аналогично проверить tariff/contract.
- **Верификация:** Подтверждено: tarification.service.ts:96 `where(eq(trips.id, tripId))` без org; routes.ts:113 передаёт только request.params.id под requireAbility('read','Trip') (CASL, не row-level). costSettings берётся по tripRecord.organizationId уже постфактум (line 150).
- **QA-корректировка: S3 (fix 5d37598) в full-audit-2026-05-28 явно называл calculateTripCost и роут GET /finance/trips/:id/cost; фикс применён только к copilot-tools, сам роут остался открыт. Переклассифицировано REAL -> ЗАКРЫТО-НО-ОТКРЫТО. Severity P0 сохранён.**

#### [P0][HIGH] `apps/api/src/modules/inspections/service.ts:285-295, 588`
**ПЭП (signature) сохраняется в БД без проверки — открытый текстовый пароль в таблице**  _(сегмент: web-repair-med, security)_

- **Что не так:** Строка 294: `signature: input.signature` вставляется напрямую в techInspections без вызова verifyPassword. Строка 588: то же для medInspections. Поиск по всему inspections-модулю не даёт ни одного вызова verifyPassword — функция существует в auth.ts (строка 98), но инспекционный сервис её не импортирует.
- **Воспроизведение:** POST /api/inspections/tech с signature='ЛЮБАЯ_СТРОКА' — запись создаётся; в БД signature='ЛЮБАЯ_СТРОКА'.
- **Направление фикса:** Импортировать verifyPassword из auth/auth.ts, перед INSERT вызвать verifyPassword(input.signature, user.passwordHash) → 403 при несовпадении. Хранить только хэш или fingerprint, не plaintext.
- **Верификация:** service.ts:294 `signature: input.signature` без предшествующей проверки подтверждён. Grep по inspections/* не нашёл ни импорта, ни вызова verifyPassword.

#### [P0][HIGH] `apps/api/src/modules/sprint9/routes.ts:146-152`
**GET /incidents: org-scope via vehicleId subquery misses NULL-vehicleId incidents — cross-tenant leak**  _(сегмент: api-misc2,web-misc, security)_

- **Что не так:** The incidents table (schema.ts:1183-1210) has NO organizationId column. GET /incidents scope is enforced only via `inArray(incidents.vehicleId, vehicles-subquery)`. An incident created with vehicleId=null (all FK fields are optional) passes no condition, so with `user.organizationId` set `conditions` only contains the inArray predicate — which filters OUT rows with non-matching vehicleId but does NOT include rows with vehicleId IS NULL (SQL inArray semantics). Such rows are visible to every tenant.
- **Воспроизведение:** POST /incidents with no vehicleId/driverId/tripId as Org-A. GET /incidents as Org-B — the FK-less incident appears in the result.
- **Направление фикса:** Add organizationId column to incidents table (populated at creation from user.organizationId). Replace the vehicleId inArray filter with a direct eq(incidents.organizationId, user.organizationId) condition.
- **Верификация:** schema.ts:1183-1210 shows incidents table has no organizationId column. routes.ts:146-152 confirms scope is via vehicleId inArray only — NULLs escape the filter.

#### [P0][HIGH] `apps/api/src/modules/sprint9/routes.ts:272-273`
**POST /waybills/:id/drivers: cross-tenant driver assignment — no org-scope check on driverId**  _(сегмент: api-misc2, security)_

- **Что не так:** Confirmed: line 272 checks driver existence with `eq(drivers.id, parsed.data.driverId)` only, no org filter. assertWaybillAccess at line 263 validates the waybill but there is no assertDriverAccess call before the insert at line 285.
- **Воспроизведение:** Auth as dispatcher of Org-A. POST /waybills/{own-waybillId}/drivers with driverId from Org-B. Driver is linked cross-tenant.
- **Направление фикса:** Call assertDriverAccess(parsed.data.driverId, user) before the insert, analogous to assertVehicleAccess elsewhere.
- **Верификация:** routes.ts:272 `db.select({id}).from(drivers).where(eq(drivers.id, parsed.data.driverId))` — no org filter present and no assertDriverAccess call exists in the handler.

#### [P0][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/trips/routes.ts:1104, 1226 (calling sendTransportDocumentToProvider in transport-documents-store.ts:600)`
**Субподряд-ЭТрН-гейт (P0-C2) обходится через /exchange/attempts и /send — реальная отправка ЭТрН наёмного рейса в ЭДО проходит без assertEtrnAllowed**  -> /transpult  _(сегмент: api-trips-docs, security)_

- **Что не так:** Гейт etrn-guard.assertEtrnAllowed по своему же docstring должен вызываться во ВСЕХ путях оформления/подписи/ОТПРАВКИ ЭТрН. Подписной роут (routes.ts:996) его вызывает, но два роута фактической исходящей отправки в провайдер ЭДО — POST /trips/:id/transport-documents/:documentId/exchange/attempts (вызывает sendTransportDocumentToProvider, routes.ts:1104) и POST .../send (routes.ts:1226) — НЕ вызывают assertEtrnAllowed. Сама sendTransportDocumentToProvider (transport-documents-store.ts:600-734) тоже не содержит проверки executionMode. Значит ЭТрН по рейсу с executionMode='subcontract' (наёмный) можно отправить в провайдера и сгенерировать exchange/receipt/providerStatus, минуя юр-блок, который C2 (fix 32da51d) объявил герметичным. Заявленный фикс неполон/регрессировал.
- **Воспроизведение:** 1) Рейс с executionMode='subcontract'. 2) POST /trips/{id}/transport-documents/{docId}/send (или /exchange/attempts) с валидным JWT и ability update Trip. 3) assertEtrnAllowed не вызывается → sendTransportDocumentToProvider создаёт outbound exchange, receipt, ставит providerStatus 'sent_to_provider', статус документа SENT. ЭТрН наёмного рейса ушёл в ЭДО без ролевой настройки перевозчик/экспедитор.
- **Направление фикса:** Добавить await assertEtrnAllowed(id) (с тем же EtrnNotAllowedError→422 маппингом, как в routes.ts:994-1002) в обработчики обоих роутов отправки (exchange/attempts и send); лучше — централизовать вызов внутри sendTransportDocumentToProvider, чтобы ни один путь отправки его не миновал.
- **Верификация:** Подтверждено: /signatures-роут вызывает assertEtrnAllowed (routes.ts:994-1002), но /exchange/attempts (1072-1109) и /send (1206-1231) вызывают sendTransportDocumentToProvider без гейта; store (600-734) проверки executionMode не содержит.


## P1 — высокий: видимый баг / корректность денег / безопасность-эксплуатация (92)

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/auth/auth.ts:889-893`
**Смена ролей в PUT /users/:id НЕ бампит token_version — revocation-гейт E6 неполон для понижения прав**  -> /transpult  _(сегмент: api-auth, security)_

- **Что не так:** Схема (db/schema.ts:232-235) явно декларирует, что token_version бампится «при деактивации/смене пароля/ролей». Но обработчик бампит ТОЛЬКО при `body.password || body.isActive === false`. При смене ролей (`body.roles`) бамп НЕ происходит. Значит понижение прав (например, снятие роли 'admin' у скомпрометированного/уволенного сотрудника) НЕ инвалидирует его текущий JWT: старый токен с прежними ролями остаётся валидным до истечения 24ч (JWT_EXPIRES_IN). При этом роли в RBAC берутся ИЗ JWT-пейлоада (rbac.ts:258 `request.user.roles`, defineAbilitiesFor(user.roles)), а не из БД — то есть демоушен не действует немедленно. Это и есть классический сценарий, ради которого делалась E6.
- **Воспроизведение:** 1) Пользователь U имеет роль admin, логинится → JWT{roles:[admin], tv:0}. 2) Другой admin делает PUT /api/auth/users/U {roles:['driver']} (без password, без isActive). 3) В БД roles=driver, но token_version остаётся 0. 4) U продолжает слать запросы со старым cookie/Bearer → authenticate проходит (tv 0===0, isActive true), RBAC видит roles=[admin] из пейлоада → admin-доступ сохраняется до 24ч.
- **Направление фикса:** В блоке формирования updateData бампить tokenVersion также при `body.roles !== undefined` (любая смена ролей), а не только при password/деактивации. Опционально — всегда брать roles в RBAC из свежего чтения БД в authenticate, раз уже делается SELECT users.
- **Верификация:** Подтверждено: auth.ts:891 `if (body.password || body.isActive === false)` — нет ветки body.roles. Схема schema.ts:234 явно требует бамп «при смене ролей». RBAC использует roles из JWT-пейлоада, не из БД → демоушен не мгновенный.

#### [P1][HIGH] `apps/api/src/auth/auth.ts:451-454, 636-639`
**Перевыпуск JWT в POST/DELETE /me/organization теряет поле tv → ломает сессию любому юзеру с token_version != 0**  -> /transpult  _(сегмент: api-auth, correctness)_

- **Что не так:** authenticate сверяет `(payload.tv ?? 0) !== u.tokenVersion`. Login/verify-email кладут `tv: user.tokenVersion ?? 0`. Но при POST /me/organization (стр.451) и DELETE /me/organization (стр.636) новый токен подписывается БЕЗ поля tv (`{userId, roles, organizationId}`). Если у пользователя token_version уже > 0 (он хоть раз менял пароль/был деактивирован-реактивирован → бамп), то после создания/отвязки организации новый токен получает tv=undefined → при следующем запросе `(undefined ?? 0)=0 !== N` → 401 «Сессия недействительна». Пользователь мгновенно выкидывается и не может перелогиниться без повторного login (который снова положит правильный tv). Для tv=0 (большинство) баг невидим, поэтому легко проскользнул.
- **Воспроизведение:** 1) admin U с token_version=1 (после прошлого reset-password). 2) Логин → JWT{tv:1}, всё работает. 3) POST /api/auth/me/organization {name:...} → 200, новый cookie с токеном БЕЗ tv. 4) Любой следующий запрос → authenticate: 0 !== 1 → 401, выкинут из системы.
- **Направление фикса:** Во всех app.jwt.sign(), перевыпускающих сессионный токен (POST /me/organization, DELETE /me/organization), добавить `tv: <актуальный tokenVersion из БД>`. Для DELETE — прочитать tokenVersion из me; для POST — взять из БД (UPDATE возвращает только id, нужно дочитать).
- **Верификация:** Подтверждено: auth.ts:451-454 и 636-639 sign() без поля tv; authenticate:137 сверяет `(payload.tv ?? 0) !== u.tokenVersion`. Для юзера с tokenVersion>0 перевыпущенный токен мгновенно даёт 401.

#### [P1][HIGH] `apps/api/src/auth/auth.ts:405-419`
**POST /api/auth/me/organization — INN uniqueness check outside transaction (TOCTOU → duplicate org creation)**  _(сегмент: api-onboarding, data-integrity)_

- **Что не так:** Confirmed: the INN SELECT (lines 405-414) is outside the transaction that opens at line 417. The organizations table has no unique constraint on inn (schema.ts lines 196-219 show only a primary key, no uniqueIndex for inn). The in-transaction race-guard (`UPDATE users WHERE organizationId IS NULL`, rowCount=0 → 409) only prevents the same user double-submitting; two different admin users can both pass the INN check and INSERT separate orgs with the same INN.
- **Воспроизведение:** Two different admin users concurrently POST /api/auth/me/organization {inn:'7712345678'}; both pass the SELECT check, both INSERT succeed — SELECT COUNT(*) FROM organizations WHERE inn='7712345678' returns 2.
- **Направление фикса:** Add a UNIQUE constraint on organizations.inn at the DB level and catch the unique-constraint error in the transaction catch block, returning 409.
- **Верификация:** schema.ts lines 196-219: organizations table has no uniqueIndex on inn. The code comment at line 403 describes only same-user race protection, not cross-user INN collision.

#### [P1][HIGH] `apps/api/src/auth/auth.ts:1364-1381`
**POST /api/auth/signup — unauthenticated password overwrite of any unverified account (acknowledged TODO, still open)**  _(сегмент: api-onboarding, security)_

- **Что не так:** Confirmed open: lines 1364-1367 contain the TODO(security P0-3) comment explicitly acknowledging the issue. Lines 1375-1381 still execute the overwrite: `orgId = existing.organizationId!; passwordHash = await hashPassword(password); tx.update(users).set({ passwordHash, ... })`. No fix has been applied.
- **Воспроизведение:** Victim POST /signup; attacker immediately POST /signup with victim email and attacker password before verification — victim's passwordHash is overwritten.
- **Направление фикса:** Refuse re-signup on any existing (unverified) user and rely on /resend-code; remove the passwordHash overwrite from the existing-user branch.
- **Верификация:** Line 1364-1367 contains the TODO comment and lines 1378-1380 still overwrite passwordHash unconditionally for the unverified existing-user branch — no fix present.

#### [P1][HIGH] `apps/api/src/auth/auth.ts:974-976`
**GET /api/auth/tariffs — cross-tenant leak when super-admin has no organizationId**  -> /transpult  _(сегмент: web-admin-1, security)_

- **Что не так:** Confirmed at line 974: `if (actor.organizationId) { tariffsQuery = tariffsQuery.where(...) }`. If organizationId is null/undefined (super-admin token), the WHERE clause is skipped and all tariffs from all tenants are returned.
- **Воспроизведение:** 1. Obtain a super-admin JWT without organizationId. 2. GET /api/auth/tariffs. 3. Response contains tariffs from all organizations.
- **Направление фикса:** Add early return 400/empty-array for !actor.organizationId, OR make the WHERE unconditional (always filter, return 400 if null).
- **Верификация:** Lines 974-976 confirmed: conditional `if (actor.organizationId)` wraps the only WHERE clause, so super-admin without org gets unfiltered full table scan.

#### [P1][HIGH] `apps/api/src/auth/guards.ts:54, 185-213`
**PUT /incidents/:id IDOR bypass when incident has no FK references**  _(сегмент: web-misc, security)_

- **Что не так:** getIncidentAccessSnapshot (guards.ts:172-214) collects organizationIds only from vehicleId/driverId/tripId FKs. When all are null, organizationIds=[]. assertOrganizationScope (line 54) has `if (knownOrganizationIds.length === 0) return` — silently allows any authenticated user. assertIncidentAccess (line 400-418) calls assertOrganizationScope first; the early return skips hasStaffAccess and driver checks, granting access unconditionally.
- **Воспроизведение:** Org-A creates incident with no FKs. Org-B manager calls PUT /incidents/:id — assertIncidentAccess passes due to empty organizationIds short-circuit at line 54.
- **Направление фикса:** Treat empty knownOrganizationIds as 'unscoped/unclaimed' and deny when user.organizationId is set. Store organizationId on incidents at creation to remove ambiguity.
- **Верификация:** guards.ts:54 confirmed `if (knownOrganizationIds.length === 0) return` — no throw. guards.ts:400-405 shows assertIncidentAccess calls assertOrganizationScope before any role check.

#### [P1][HIGH] `apps/api/src/db/schema.ts:268 (uniqueIndex idx_contractors_inn); base migration apps/api/drizzle/0000_full_schema.sql:647`
**contractors.inn — ГЛОБАЛЬНО уникальный индекс ломает multitenancy (два тенанта не могут иметь одного контрагента)**  -> /transpult  _(сегмент: api-db, data-integrity)_

- **Что не так:** idx_contractors_inn — UNIQUE по одному столбцу inn, без organization_id, и ни одна миграция (0000–0040) его не переопределяет на per-org. В реальной ТЭД один и тот же контрагент/грузоотправитель (ИНН) обслуживает множество перевозчиков. Когда тенант B попытается завести контрагента с ИНН, который уже есть у тенанта A, INSERT упадёт с unique violation. Это (а) блокирует легитимную операцию, (б) косвенно раскрывает существование чужого контрагента в другом тенанте (cross-tenant existence disclosure), (в) если raw PG-ошибка долетает до клиента — утечка имени constraint. Доказательство, что баг реален: seed-demo.ts намеренно даёт Org-B другие ИНН (7800000003 line 855), чтобы обойти коллизию.
- **Воспроизведение:** Org-A заводит контрагента ИНН=7701234567. Org-B (другой тенант, валидный JWT) POST /contractors с тем же ИНН → INSERT нарушает idx_contractors_inn → 500/duplicate key, контрагент не создаётся. Тенант B заблокирован из-за данных тенанта A.
- **Направление фикса:** Сменить idx_contractors_inn на composite uniqueIndex(organizationId, inn) отдельной миграцией (как сделали для invoices в 0039). Учесть NULL-org legacy строки. Обновить schema.ts. Убедиться, что сервис-слой отдаёт user-friendly ошибку, а не raw PG-constraint.
- **Верификация:** Подтверждено: schema.ts:268 uniqueIndex('idx_contractors_inn').on(table.inn) без org; grep по drizzle/*.sql находит только 0000:647 CREATE UNIQUE INDEX idx_contractors_inn ON contractors(inn) — ни одна миграция не переводит его на per-org.

#### [P1][HIGH] `apps/api/src/integrations/mocks/wialon-mock-runner.ts:127`
**Cross-tenant leak: тот же trip.eta_updated без organizationId в mock-runner**  -> /transpult  _(сегмент: api-integrations, security)_

- **Что не так:** Идентично wialon.worker.ts: broadcastEvent('trip.eta_updated', { tripId: resolvedTripId, eta }) без organizationId → shouldDeliverEvent пропускает событие всем подключённым клиентам всех тенантов. Mock-runner стартует из /integrations/wialon-mock/start (за env-гейтом в проде), но при INTEGRATION_MOCKS_ENABLED=true в проде утечка живая; в dev/демо — всегда.
- **Воспроизведение:** POST /integrations/wialon-mock/start для ТС org A с tripId; WS-клиент org B получает trip.eta_updated с tripId/eta рейса org A на каждом тике симулятора.
- **Направление фикса:** Прокинуть organizationId ТС в startSimulation и включить его в payload broadcastEvent. resolvedTripId уже резолвится — заодно подтянуть org ТС/рейса.
- **Верификация:** Подтверждено строкой 127: broadcastEvent('trip.eta_updated',{tripId: resolvedTripId, eta}) без org. Тот же дефект что #1; runner знает только vehicleId/resolvedTripId, org нужно дорезолвить.

#### [P1][HIGH] `apps/api/src/integrations/workers/wialon.worker.ts:162-163`
**Cross-tenant leak: trip.eta_updated broadcast без organizationId уходит ВСЕМ тенантам по WS**  -> /transpult  _(сегмент: api-integrations, security)_

- **Что не так:** broadcastEvent('trip.eta_updated', { tripId, eta }) вызывается без поля organizationId. В websocket.ts shouldDeliverEvent(payloadOrgId, subscriberOrgId) при payloadOrgId == null/undefined возвращает true ДЛЯ ВСЕХ подписчиков (строка 68: `if (!payloadOrgId) return true;`). ETA-событие НЕ системное — оно привязано к конкретному рейсу конкретного тенанта, но тег организации не проставлен. В результате диспетчер/логист org B (scoped-подписка с organizationId=B) получает tripId и ETA рейсов org A. Это нарушение multitenancy-границы (тот же класс, что закрытый S2 в notification.worker, но в WS-канале — не закрыт). organizationId доступен в этой точке: v.organizationId выбирается в строке 53.
- **Воспроизведение:** 1) Подключить WS-клиент org A (token с organizationId=A, роль dispatcher) и WS-клиент org B. 2) Запустить активный рейс (status=in_transit) с маршрутными точками в org A. 3) Дождаться тика wialon-sync. 4) Клиент org B получает type=trip.eta_updated с tripId рейса org A и его ETA.
- **Направление фикса:** Передавать organizationId в payload: broadcastEvent('trip.eta_updated', { tripId: activeTrip.id, eta, organizationId: v.organizationId }). Тот же фикс — в wialon-mock-runner.ts:127. Дополнительно ужесточить shouldDeliverEvent: не считать отсутствие payloadOrgId «системным = всем».
- **Верификация:** Подтверждено: wialon.worker.ts:163 broadcastEvent('trip.eta_updated',{tripId,eta}) без org; websocket-filters.ts:68 `if (!payloadOrgId) return true`. v.organizationId доступен (worker:53). Scoped-подписчики (websocket.ts:166) получат чужой trip.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/billing/routes.ts:260`
**Replay-dedupe вебхука ЮKassa мёртв: eventId читается из несуществующего поля body.event_id**  -> /transpult  _(сегмент: api-billing, data-integrity)_

- **Что не так:** ЮKassa-уведомление имеет конверт { type, event, object:{ id, status, ... } } — поля event_id на верхнем уровне НЕ существует (его нет и в YookassaWebhookSchema, строки 102-114). Поэтому `const eventId = (request.body as { event_id?: string }).event_id` (стр.260) в проде ВСЕГДА undefined. В handlePaymentCallback dedupe-ветка (service.ts:262) выполняется только `if (payload.eventId && paymentRow.providerMetadata)`, т.е. при undefined она пропускается, и lastWebhookEventId никогда не сравнивается. FOR UPDATE (service.ts:248-254) лишь сериализует ретраи, но не дедуплицирует их: на каждый повторный `payment.succeeded` блок succeeded (service.ts:290-341) выполняется заново — заново катит подписку на +30 дней от текущего now (стр.306) и заново фискализирует через ОФД (стр.319-334), порождая дубль чека.
- **Воспроизведение:** 1) Создать платёж, дождаться `payment.succeeded` от ЮKassa (валидный HMAC). 2) ЮKassa повторно доставляет тот же webhook. 3) Каждый повтор: подписка currentPeriodEnd сдвигается ещё на +30 дней и создаётся новый ОФД-чек. lastWebhookEventId не спасает, т.к. eventId=undefined.
- **Направление фикса:** Ключ дедупа брать из реальных полей: object.id + object.status (или заголовок Idempotence-Key), а не из body.event_id. Дополнительно — guard в service.ts: при status==='succeeded' если paymentRow.status уже 'succeeded' → no-op.
- **Верификация:** Подтверждено: YookassaWebhookSchema (routes.ts:102-114) не содержит event_id; routes.ts:260 читает body.event_id (всегда undefined), service.ts:262 dedupe требует truthy payload.eventId. Нет guard на paymentRow.status==='succeeded' перед повторным rolling+фискализацией.

#### [P1][HIGH] `apps/api/src/modules/billing/service.ts:424,450,384`
**Лимит copilot_messages — суточный, но счётчик аккумулируется помесячно (квота применяется как месячная)**  -> /transpult  _(сегмент: api-billing, correctness)_

- **Что не так:** План определяет copilotMessagesDaily — СУТОЧНЫЙ лимит (packages/shared/src/billing.ts:46-47 '/** Daily co-pilot message cap. */'). Но recordUsage (service.ts:384) и readUsageCount (service.ts:429) ключуются по currentBillingPeriodStart, который = первый день МЕСЯЦА (packages/shared/src/billing.ts:151-154, Date.UTC(year, month, 1)). copilotMessagesCount растёт весь месяц без суточного сброса, а checkLimit (service.ts:398-404) и getUsageReport (service.ts:424) сравнивают этот месячный накопитель с суточным числом copilotMessagesDaily. Итог: пользователь упирается в дневной кап после N сообщений ЗА МЕСЯЦ.
- **Воспроизведение:** План с copilotMessagesDaily=50. Отправить 50 сообщений копилоту за месяц (по 5/день). На 51-м сообщении requireWithinLimit('copilot_messages') вернёт 402, хотя за сутки лимит не исчерпан; на след. день счётчик не сбрасывается.
- **Направление фикса:** Для copilot_messages использовать суточный ключ периода (UTC/МСК-полночь дня) вместо месячного, либо ввести отдельный daily-счётчик.
- **Верификация:** Подтверждено: billing.ts:46-47 daily cap; currentBillingPeriodStart (billing.ts:152) = первый день месяца; service.ts:384/408/429 все используют его для copilot_messages — семантика daily не реализована.

#### [P1][HIGH] `apps/api/src/modules/carriers/routes.ts:217-221`
**POST /trips/:id/assign-carrier — final UPDATE drops org filter (TOCTOU write)**  _(сегмент: api-onboarding,web-admin-2, data-integrity)_

- **Что не так:** Confirmed: line 220 is `.where(eq(trips.id, id))` only. The `tripConditions` array (which conditionally includes the org filter at lines 181-183) is used only for the SELECT (line 188) but never applied to the UPDATE at lines 217-221. Super-admin (organizationId=null) skips the org filter on SELECT too, so the UPDATE is unconstrained.
- **Воспроизведение:** POST /trips/<any-trip-id>/assign-carrier as super-admin (organizationId=null) — SELECT returns any trip, UPDATE modifies it without org-scoped guard.
- **Направление фикса:** Apply tripConditions (or use `and(eq(trips.id, trip.id), eq(trips.organizationId, user.organizationId))`) in the UPDATE WHERE clause.
- **Верификация:** Line 220 confirmed: `.where(eq(trips.id, id))` — raw `id` from params, no org condition. The `tripConditions` built at lines 180-183 is used only for the SELECT.
- **QA-корректировка: эксплойт реален только для super-admin (organizationId=null) — обычный тенант отсекается на SELECT (org-filtered) и не доходит до UPDATE. Понижено P0 -> P1 (defense-in-depth; всё равно чинить — UPDATE должен быть org-scoped).**

#### [P1][HIGH] `apps/api/src/modules/claims/routes.ts:59-69`
**ensureClaimAccess: org-scope check bypassed when claim.contractorId is null (orphaned claims IDOR)**  _(сегмент: api-misc1, security)_

- **Что не так:** Code at line 59 reads `if (user.organizationId && claim.contractorId)` — both conditions must be truthy. When contractorId is NULL (ON DELETE SET NULL cascade), the entire org ownership check is skipped. Any authenticated org user can mutate orphaned claims.
- **Воспроизведение:** Delete a contractor that has open claims; their contractorId becomes NULL. Then PATCH /claims/{orphanedClaimId}/status as any org admin — no 403 returned.
- **Направление фикса:** Change condition to `if (user.organizationId)` and add a separate organizationId column on claims for tenant scoping, or deny access when contractorId is null for non-super-admin roles.
- **Верификация:** Line 59 confirmed: `if (user.organizationId && claim.contractorId)` — null contractorId silently bypasses the org filter. No fallback guard present.

#### [P1][HIGH] `apps/api/src/modules/claims/routes.ts:156-165`
**GET /claims/:id: привилегированная роль без organizationId обходит tenant-фильтр**  _(сегмент: web-print-waybills, security)_

- **Что не так:** Строка 156: `if (user.organizationId && claim.contractorId)` — при organizationId=null весь org-check пропускается. Client-check ниже (строка 168) тоже не применим к admin. Seed-admin с null organizationId получает чужие претензии.
- **Воспроизведение:** JWT с roles=['admin'] без organizationId. GET /api/claims/{id_другого_тенанта} → 200.
- **Направление фикса:** Использовать assertOrganizationScope (guards.ts) по аналогии с orders/trips/waybills, либо добавить `if (!user.organizationId) return 403` для непривилегированных операций над tenant-данными.
- **Верификация:** Строки 156-165 подтверждены: condition `user.organizationId && claim.contractorId` — при null org обе проверки пропускаются без fallback-запрета.

#### [P1][HIGH] `apps/api/src/modules/claims/routes.ts:53-79`
**ensureClaimAccess — Claims без contractorId обходят org-scope проверку**  _(сегмент: web-client-orders, security)_

- **Что не так:** строка 59: `if (user.organizationId && claim.contractorId)` — при claim.contractorId=null условие ложное, org-проверка пропускается полностью. Staff любой org с известным UUID претензии получает доступ.
- **Воспроизведение:** Org A создаёт претензию без contractorId. Staff org B: PATCH /claims/:id/status — ensureClaimAccess возвращает claim без отказа.
- **Направление фикса:** Проверять org по claim.organizationId напрямую (добавить поле или джойн через tripId/orderId), убрать зависимость от contractorId.
- **Верификация:** Код строки 59 подтверждён: guard завёрнут в `claim.contractorId`, которое null — вся ветка пропускается для staff-пользователей.

#### [P1][HIGH] `apps/api/src/modules/cold-chain/routes.ts:44-188`
**Cold-chain routes have no RBAC (requireAbility) gate — any authenticated user can record or read temperature readings for any trip**  -> /transpult  _(сегмент: api-repairs-insp, security)_

- **Что не так:** All four endpoints use only `preHandler: [app.authenticate]` with no `requireAbility`. `assertTripAccess` at line 56 returns early for all STAFF_ROLES (admin, logist, dispatcher, manager, accountant, repair_service, medic, mechanic) — none of these are gated by role for write access. The mock-tick endpoint at line 154 uses a manual `isAdmin(user)` check rather than `requireAbility`, so it bypasses the RBAC framework.
- **Воспроизведение:** Authenticate as accountant assigned to an org that owns tripId X. POST /trips/X/temperature-readings with {tempC: -20, source: 'manual'} — accepted and stored.
- **Направление фикса:** Add a RBAC subject 'TemperatureReading' to rbac.ts and add requireAbility('create', 'TemperatureReading') to POST route. Replace isAdmin check on mock-tick with requireAbility.
- **Верификация:** Confirmed: routes.ts lines 45-93, 96-122, 125-140, 143-185 all only have `preHandler: [app.authenticate]`. guards.ts line 349 shows hasStaffAccess returns early for all staff roles including accountant.

#### [P1][HIGH] `apps/api/src/modules/compliance/adr/routes.ts:79-98`
**validate-hard: нет access-guard на orderId/vehicleId/driverId — cross-tenant probing**  -> transpult  _(сегмент: api-edi, security)_

- **Что не так:** POST /compliance/adr/validate-hard вызывает validateAdrHard(...) с переданными клиентом orderId/vehicleId/driverId, но НЕ вызывает assertOrderAccess (в отличие от Wave-5 adrRoutes в modules/adr/routes.ts, где гейт есть). validateAdrCompatibility (modules/adr/service.ts) выбирает order/vehicle/driver без org-фильтра. Пользователь org A может подставлять чужие UUID и по ответу различать существование/несуществование сущности и ADR-совместимость чужих ТС/водителей (например 'ТС не оборудовано' vs 'ТС не найдено').
- **Воспроизведение:** 1) Залогиниться org A (feature 'adr'). 2) POST /compliance/adr/validate-hard {orderId:<order org B>, vehicleId:<veh org B>, driverId:<drv org B>}. 3) Ответ раскрывает существование и ADR-атрибуты чужих сущностей.
- **Направление фикса:** Перед validateAdrHard вызвать assertOrderAccess(orderId,user) и assertVehicleAccess/assertDriverAccess для vehicleId/driverId (guards.ts уже экспортирует их); либо добавить org-фильтр внутрь validateAdrCompatibility.
- **Верификация:** Подтверждено: routes.ts:84-96 preHandler без guard, validateAdrHard вызван без assertOrderAccess; validateAdrCompatibility (modules/adr/service.ts:35-65) выбирает order/vehicle/driver по чистому eq(id). Контраст: modules/adr/routes.ts:52 вызывает assertOrderAccess. Примечание: даже эталонный роут гейтит только orderId, не vehicle/driver.

#### [P1][HIGH] `apps/api/src/modules/compliance/marking/routes.ts:80-115`
**scan-batch: lotId не проверяется на принадлежность орг — cross-tenant запись/привязка кодов**  -> transpult  _(сегмент: api-edi, data-integrity)_

- **Что не так:** POST /compliance/marking/scan-batch принимает lotId (shipment_lot) и через verifyCodes(...) пишет строки marking_verifications с этим lotId (service.ts:42-55), но никогда не валидирует, что shipment_lot принадлежит организации пользователя. Read-роут by-shipment/:lotId фильтрует по org, а write — нет. Пользователь org A может привязывать/засорять проверки к чужой отгрузке org B и подтверждать существование её lotId.
- **Воспроизведение:** 1) Залогиниться org A с write-ролью маркировки. 2) POST /compliance/marking/scan-batch {lotId:<lot org B>, codes:['...']} → 200; в marking_verifications появляются строки с чужим lotId (organizationId=A, что искажает обе организации).
- **Направление фикса:** Перед verifyCodes проверить, что shipment_lots.id=lotId AND shipment_lots.organization_id = user.organizationId (404/403 иначе).
- **Верификация:** Подтверждено: routes.ts:100-104 verifyCodes(lotId) без проверки lot↔org; service.ts:42-54 вставляет с organizationId=A и lotId=B, shipment_lots не читается. Запись cross-tenant — REAL. Оговорка: 'подтверждение существования lotId' слабее заявленного — verifyCodes не читает lot, поэтому existence по ответу не различается; вставка происходит безусловно.

#### [P1][HIGH] `apps/api/src/modules/documents/routes.ts:138`
**Raw PG constraint error утекает в ответ клиенту в POST /trips/:id/document-returns**  -> /transpult  _(сегмент: api-documents, error-handling)_

- **Что не так:** Line 138: `reply.status(409).send({ success: false, error: err.message ?? 'Не удалось создать запись' })` — err.message отправляется напрямую без проверки типа ошибки.
- **Воспроизведение:** Двойной POST /api/trips/:id/document-returns с одинаковым documentType — 409 с полным PG unique-constraint сообщением раскрывает имя индекса/таблицы.
- **Направление фикса:** Проверять err.code === '23505' и возвращать фиксированное сообщение вместо err.message.
- **Верификация:** routes.ts:136-139 подтверждает: catch(err: any) без фильтрации кода, err.message уходит клиенту напрямую. Никакой PG-код-проверки нет.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/finance/finance.service.ts:116-136`
**Легаси-путь нумерации НЕ per-org: глобальная серия + payeeOrganizationId не проставляется (регрессия заявленного E2-фикса)**  -> /transpult  _(сегмент: api-finance-core, data-integrity)_

- **Что не так:** E2 (f2c84ce) реализован ТОЛЬКО в invoice-workflow.service.ts (generateInvoiceNumber: advisory-lock по prefix|orgId + payeeOrganizationId фильтр + insert payeeOrganizationId). Легаси getNextInvoiceNumber делает глобальный LIKE без org-фильтра, а generateInvoices/bulkGenerateInvoices/tryAutoCreateInvoice вставляют invoices БЕЗ payeeOrganizationId (NULL). Две орг делят общий INV/ACT/UPD-ряд; легаси-счета (payeeOrganizationId=NULL) не попадают в org-отчёты overdue.
- **Воспроизведение:** POST /finance/invoices от орг-A и орг-B в одном году → оба получают INV-2026-NNNNN из единого глобального desc(number). insert не задаёт payeeOrganizationId → NULL.
- **Направление фикса:** Проксировать генерацию через workflow generateInvoiceNumber(type,tx,orgId) и проставлять payeeOrganizationId во всех трёх легаси-insert.
- **Верификация:** Подтверждено: getNextInvoiceNumber (116-128) LIKE без orgId; inserts 188-198, 882-896, 1034-1048 НЕ содержат payeeOrganizationId. Workflow (invoice-workflow.ts:97-108) делает per-org — легаси отстал.

#### [P1][HIGH] `apps/api/src/modules/finance/finance.service.ts:557-601`
**recordPartialPayment: read→event→re-read→update вне транзакции — TOCTOU при параллельных платежах**  -> /transpult  _(сегмент: api-finance-core, data-integrity)_

- **Что не так:** Метод: read invoice (557, без FOR UPDATE), recordEvent вне tx (561), повторный select всех событий и сумма (576-583), затем db.update status/paidAmount (588/590) — всё вне единой транзакции. Два параллельных POST: оба пишут event, оба суммируют (тайминг), оба пишут paidAmount снимком → последний writer перетирает, статус paid_partial/paid_full рассинхронизирован.
- **Воспроизведение:** Два одновременных POST /finance/invoices/:id/payments amount=половина. Гонка: paid_partial при полной оплате либо paidAmount != Σ событий.
- **Направление фикса:** db.transaction + SELECT FOR UPDATE на invoice; recordEvent внутри tx; пересчёт статуса атомарно.
- **Верификация:** Подтверждено: 557 db.select без .for('update'), 561 recordEvent без tx-аргумента, 588/590 db.update вне транзакции. Нет единой tx/блокировки строки.

#### [P1][HIGH] `apps/api/src/modules/finance/invoice-workflow.service.ts:620-652 (registerPayment: read 633-634, write 648-652)`
**registerPayment: read-modify-write paidAmount без транзакции/блокировки — гонка при двойном POST**  -> /transpult  _(сегмент: api-finance-core,web-onboarding-fin, data-integrity)_

- **Что не так:** newPaid = num(invoice.paidAmount) + input.amount считается после чтения вне транзакции, затем db.update без SELECT ... FOR UPDATE и без идемпотентности по paymentReference. Два параллельных POST читают одинаковый paidAmount=X, оба пишут X+amount — последний write побеждает, один платёж теряется. UI submitPayment защищает только от повторного клика через busy.
- **Воспроизведение:** Дважды быстро отправить register-payment с amount=50 по счёту total=100, paidAmount=0 из двух вкладок. Оба читают 0 -> пишут 50 -> итог paidAmount=50 вместо 100.
- **Направление фикса:** Обернуть в db.transaction с SELECT ... FOR UPDATE по invoices.id или атомарным UPDATE SET paid_amount = paid_amount + :amount, добавить идемпотентность по paymentReference.
- **Верификация:** Подтверждено кодом: чтение invoice.paidAmount (634) и db.update (НЕ tx, 648) без транзакции/FOR UPDATE/idempotency. H4-фикс в дайджесте касался синхронизации paidAmount/переплаты, не concurrency — лок/tx на этом пути отсутствуют, isClosedButOpen=true оправдан.

#### [P1][HIGH] `apps/api/src/modules/finance/invoice-workflow.service.ts:286-303`
**НДС «сверху» (includesVat=false) не начисляется на total — обе ветки идентичны**  -> /transpult  _(сегмент: api-finance-invoice, correctness)_

- **Что не так:** При includesVat=false комментарий обещает начисление НДС «сверху», но формула (299-301) идентична ветке includesVat=true (выделение из gross), а total не растёт. Флаг includesVat не работает: для ОСНО vatRate=20 «сверху» клиент должен платить base*1.20, а система выставит total=base и НДС=base/6 → недосбор НДС. allocatedVat спасает только при explicitVat>0, но он optional.
- **Воспроизведение:** Issue draft СФ ОСНО invoiceOrders=[{allocatedAmount:1000}] (без allocatedVat), vatRate:20, includesVat:false. Ожидание total=1200/vat=200; факт total=1000/vat=166.67/subtotal=833.33.
- **Направление фикса:** Развести ветки: includesVat=false → vatAmount=round(total*rate/100), total=base+vat; includesVat=true → текущая формула выделения.
- **Верификация:** Подтверждено: строки 298 и 301 содержат идентичную формулу `total - total/(1+rate/100)`; total (286) = Σ allocatedAmount, нигде не увеличивается. Ветка else (299-301) — мёртвый дубликат.

#### [P1][HIGH] `apps/api/src/modules/finance/routes.ts:558-575, 738-755, 856-881`
**vatRate не передаётся в generateInvoicePdf / generateActPdf / generateUpdPdf — НДС-лейбл и построчный НДС в УПД всегда 20%**  -> /transpult  _(сегмент: api-documents, correctness)_

- **Что не так:** Подтверждено: generateInvoicePdf (line 558-575) не передаёт vatRate — invoice-pdf.ts:34 использует `data.vatRate ?? 20`. generateActPdf (line 578-593) аналогично без vatRate — act-pdf.ts:35 `data.vatRate ?? 20`. generateUpdPdf (line 856-881) не передаёт vatRate — upd-pdf.ts:56 `data.vatRate ?? 20`, а построчно `amt * vatRate / (100 + vatRate)` где vatRate=20 по умолчанию.
- **Воспроизведение:** Invoice с vatRate=10: GET /finance/invoices/:id/upd — в колонке «Ст. НДС» будет 20%, построчный vatAmt = amt*20/120 вместо amt*10/110.
- **Направление фикса:** Передать `vatRate: invoice.vatRate ?? 20` во все три вызова generateInvoicePdf/generateActPdf/generateUpdPdf в finance/routes.ts.
- **Верификация:** Все три вызова в routes.ts не содержат поле vatRate, а генераторы явно используют `?? 20` как дефолт (invoice-pdf.ts:34, act-pdf.ts:35, upd-pdf.ts:56). Поле vatRate присутствует в интерфейсах UpdPdfInput/ActPdfInput/InvoicePdfInput — просто не передаётся.

#### [P1][HIGH] `apps/api/src/modules/finance/routes.ts:52-65`
**ensureInvoiceAccess: привилегированная роль без organizationId обходит tenant-фильтр — IDOR**  _(сегмент: web-print-waybills, security)_

- **Что не так:** Логика: `if (!hasPrivilege && isClient)` — пропускается для admin. `else if (user.organizationId)` — пропускается при null/undefined. Seed-admin с roles=['admin'] и organizationId=null (auth.ts line 341 подтверждает этот кейс) проходит оба условия без проверки — получает любой invoice любого тенанта.
- **Воспроизведение:** JWT с roles=['admin'] и organizationId=null (seed-admin до привязки org). GET /api/finance/invoices/{чужой id} → 200 с полными данными.
- **Направление фикса:** Заменить `else if (user.organizationId)` на `else` с принудительной org-проверкой; либо явно запрещать (403) при organizationId=null для всех не-client ролей.
- **Верификация:** Код строк 52-65 и enums.ts 403-410 подтверждены: 'admin' входит в PRIVILEGED_ROLES, ветка `else if (organizationId)` пропускается при null; auth.ts line 341 явно описывает seed-admin с organizationId=null.

#### [P1][HIGH] `apps/api/src/modules/finance/schemas.ts:12`
**Zod InvoiceCreateSchema.type enum рассинхронён с DB invoice_type — default 'invoice' не существует в enum БД**  -> /transpult  _(сегмент: api-finance-core, layer-drift)_

- **Что не так:** Zod-схема POST /finance/invoices: type: z.enum(['invoice','act','upd']).default('invoice'). DB enum invoice_type (schema.ts:143-151) = ['payment','advance','sf','upd','corrective_sf','corrective_upd','act']. Значение 'invoice' в БД-enum ОТСУТСТВУЕТ, type.notNull(). generateInvoices() вставляет type: params.type напрямую → INSERT падает на нарушении enum, raw error.message уходит клиенту (routes.ts:208).
- **Воспроизведение:** POST /finance/invoices без type (или type:'invoice'). При наличии unbilled completed-рейсов tx доходит до insert с type='invoice' → PG invalid input value for enum invoice_type: "invoice" → 400 с PG-текстом.
- **Направление фикса:** Привести Zod-enum к invoice_type БД ИЛИ маппить 'invoice'→'payment' перед insert.
- **Верификация:** Подтверждено: schemas.ts:12 default('invoice'); schema.ts:143-151 enum без 'invoice'; finance.service.ts:188-198 insert type: params.type, col notNull (schema.ts:906). 'act'/'upd' в enum есть, дефолт 'invoice' — нет.

#### [P1][HIGH] `apps/api/src/modules/finance/xml-export.service.ts:94, 174, 139-149`
**1С-экспорт жёстко зашивает СтавкаНДС=20% и не различает типы СФ/УПД/КСФ**  -> /transpult  _(сегмент: api-finance-invoice, correctness)_

- **Что не так:** СтавкаНДС захардкожена строкой '20%' в РеквизитыДокумента (94) и строке услуги (174) независимо от фактической ставки (0/10/20 ОСНО, 5/7/20 УСН). mapInvoiceType (139-149) знает только act/upd, всё прочее (sf, payment, corrective_sf/upd, advance) валится в default 'СчётНаОплату' → СФ/КСФ теряют юр-тип. Расхождение книги продаж в 1С.
- **Воспроизведение:** GET /finance/export/1c со счётом СФ vatRate=10: в XML СтавкаНДС='20%' при СуммаНДС=10%-ной; ТипДокумента='СчётНаОплату' вместо счёта-фактуры.
- **Направление фикса:** Прокинуть фактический vatRate в InvoiceExportRow, подставлять `${vatRate}%`, при 0 — 'Без НДС'. Расширить mapInvoiceType для sf/corrective_sf/corrective_upd/payment/advance.
- **Верификация:** Подтверждено дословно: xml-export.service.ts:94 и :174 `СтавкаНДС: '20%'`; mapInvoiceType (139-149) — только case 'act'/'upd', остальное default 'СчётНаОплату'.

#### [P1][HIGH] `apps/api/src/modules/fleet/routes.ts:517-536`
**PUT /fleet/fuel-records/:id — no Zod validation, raw body cast**  -> /transpult  _(сегмент: api-fleet, correctness)_

- **Что не так:** Route at line 524 uses `request.body as Partial<{...}>` with no Zod parse. fuelType goes straight to service/DB as-is (service line 1041: `updateData.fuelType = data.fuelType`). Body fields vehicleId/driverId/tripId are assertScopedRefs-checked but updateFuelRecord signature (lines 1033-1036) does not accept them — silently ignored on update. Raw PG enum error hits client via catch at line 534.
- **Воспроизведение:** PUT /fleet/fuel-records/<id> with {"fuelType":"BAD"} → PG enum error in 400 body. PUT with {"vehicleId":"<other>"} → 200, field unchanged.
- **Направление фикса:** Add FuelRecordUpdateSchema (FuelRecordCreateSchema.partial()) in shared/schemas.ts, use safeParse in route. Remove vehicleId/driverId/tripId from body type or document they are ignored.
- **Верификация:** Confirmed: line 524 is a raw TS cast with no runtime check; service lines 1033-1048 accept only liters/costPerLiter/totalCost/fuelType/station/odometerAtFill. The assertScopedRefs on body.vehicleId/driverId/tripId is dead work.

#### [P1][HIGH] `apps/api/src/modules/fleet/service.ts:656-662`
**createContractor: INN duplicate check is cross-org, blocking legitimate multi-tenant registrations**  -> /transpult  _(сегмент: api-fleet, data-integrity)_

- **Что не так:** Line 657-659: `db.select().from(contractors).where(eq(contractors.inn, data.inn))` — no organizationId filter. Schema.ts line 268 has `uniqueIndex('idx_contractors_inn').on(table.inn)` — global unique, not per-org. Error message at line 661 echoes the existing contractor's name from another org.
- **Воспроизведение:** Org A creates contractor INN 7743013902. Org B POST /fleet/contractors same INN → 400 with Org A contractor name in message.
- **Направление фикса:** Add organizationId to duplicate check and change DB index to composite (inn, organization_id). Sanitize error message to not expose cross-tenant name.
- **Верификация:** schema.ts:268 confirms global unique index; service.ts:657-661 confirms no org filter and name leak in error. Both issues coexist.

#### [P1][HIGH] `apps/api/src/modules/fleet/service.ts:195-204`
**createVehicle: plate/VIN duplicate check and DB unique index are global — cross-org denial of service**  -> /transpult  _(сегмент: api-fleet, data-integrity)_

- **Что не так:** createVehicle lines 195-204 (inside db.transaction): both plate and VIN selects have no organizationId filter. Schema.ts lines 357-358: `uniqueIndex('idx_vehicles_plate')` and `uniqueIndex('idx_vehicles_vin')` are global. Contrast with updateVehicle line 261 which correctly adds org filter.
- **Воспроизведение:** Org A: POST /fleet/vehicles plate А123ВС77. Org B: POST same plate → 400 'ТС с госномером А123ВС77 уже существует'.
- **Направление фикса:** Add organizationId filter in createVehicle plate/VIN checks. Change DB indexes to composite (plate_number, organization_id) and (vin, organization_id).
- **Верификация:** createVehicle (lines 195-204) has no org filter; updateVehicle (line 261) does — confirms inconsistency. schema.ts:357-358 global unique indexes confirmed.

#### [P1][HIGH] `apps/api/src/modules/fleet/service.ts:251-264`
**updateVehicle: plate duplicate check is outside transaction — TOCTOU race condition**  -> /transpult  _(сегмент: api-fleet, data-integrity)_

- **Что не так:** updateVehicle lines 256-263: plate check is a bare `db.select()` outside any transaction. The `db.update()` follows at line 284 also outside a transaction. Two concurrent requests with the same new plate can both pass the app check, then the second hits the DB unique constraint, and the raw PG error propagates to the client via route catch at line 129.
- **Воспроизведение:** Two simultaneous PUT /fleet/vehicles/:id with same plateNumber. One succeeds; the other gets raw PG 23505 constraint error message in 400 response.
- **Направление фикса:** Wrap plate check + update in db.transaction(). Add centralized PG 23505 error handler to sanitize constraint names from client responses.
- **Верификация:** Confirmed: no db.transaction() wraps lines 256-287. The PG unique constraint name 'idx_vehicles_plate' would be exposed in the 400 error via route line 129.

#### [P1][HIGH] `apps/api/src/modules/fleet/service.ts:657-662`
**Duplicate INN check in createContractor is not scoped by organizationId — cross-tenant false collision blocks legitimate creation**  _(сегмент: web-fleet-1, data-integrity)_

- **Что не так:** service.ts lines 657-659 query `contractors` with only `eq(contractors.inn, data.inn)` — no organizationId filter. Two tenants with the same real-world supplier INN will collide. createVehicle (lines 195-204) has the same pattern for plate and VIN.
- **Воспроизведение:** Tenant A creates contractor INN 7707083893; Tenant B attempts same INN and gets 400 error referencing Tenant A's name.
- **Направление фикса:** Add organizationId condition to the duplicate INN/plate/VIN checks as done in updateVehicle (line 261).
- **Верификация:** Lines 657-659 show no organizationId predicate on the duplicate-check query; contrast with updateVehicle line 261 which correctly scopes by org.

#### [P1][HIGH] `apps/api/src/modules/import/routes.ts:297-300`
**import/orders: contractor INN lookup without org-filter — cross-tenant contractor linking**  _(сегмент: api-misc1,web-misc, security)_

- **Что не так:** routes.ts:297-300: `db.select({id:contractors.id}).from(contractors).where(eq(contractors.inn, String(item.contractorInn)))` has no organizationId filter. If a matching INN exists in another org, that foreign contractor's id is used as contractorId in the new order.
- **Воспроизведение:** Org-B has contractor INN 7777777777. Org-A admin POST /import/orders with contractorInn=7777777777. The order is created with contractorId pointing to Org-B's contractor.
- **Направление фикса:** Add `and(eq(contractors.inn, ...), eq(contractors.organizationId, orgId))` to the lookup. Return 'not found' if INN belongs to another org.
- **Верификация:** routes.ts:297-300 confirmed: `where(eq(contractors.inn, String(item.contractorInn)))` — no organizationId filter present.

#### [P1][HIGH] `apps/api/src/modules/import/routes.ts:182`
**import/drivers: raw DB error message leaked to client in per-row catch block**  _(сегмент: api-misc1, error-handling)_

- **Что не так:** Line 182: `results.errors.push({ index: i, error: \`${item.fullName || '?'}: ${err?.message}\`` })` uses raw `err?.message`. The vehicles (line 98), orders (line 334), and contractors (line 393) endpoints all use `mapPgErrorToFriendlyRu`, but drivers does not.
- **Воспроизведение:** POST /import/drivers with a duplicate licenseNumber → response includes raw PG constraint error message exposing schema internals.
- **Направление фикса:** Call `mapPgErrorToFriendlyRu(err?.code, 'drivers')` and use the friendly message, extending the function with driver-specific codes.
- **Верификация:** Grep confirms `mapPgErrorToFriendlyRu` is imported but only called for vehicles, orders, contractors — NOT drivers (line 182 uses raw `err?.message`).

#### [P1][HIGH] `apps/api/src/modules/import/routes.ts:111-113`
**import/drivers: missing 200-item batch limit — DoS via unbounded per-row transactions**  _(сегмент: api-misc1, security)_

- **Что не так:** Lines 120-123 check only that items is a non-empty array. No upper-bound check exists. Vehicles (line 46), orders (line 280), contractors (line 356) all enforce `items.length > 200`. Each driver row runs bcrypt (~100ms) inside its own transaction.
- **Воспроизведение:** POST /import/drivers with 5000 entries → server executes 5000 bcrypt ops + 10000 DB round trips, exhausting connection pool.
- **Направление фикса:** Add `if (items.length > 200) return reply.status(400).send(...)` immediately after the empty check at line 123.
- **Верификация:** Lines 120-123 confirmed: only `items.length === 0` guard present. Lines 46-47 (vehicles) and 280-282 (orders) show the intended pattern that is absent here.

#### [P1][HIGH] `apps/api/src/modules/import/routes.ts:140-145`
**import/drivers cross-tenant user hijack via global email lookup**  _(сегмент: web-misc, security)_

- **Что не так:** routes.ts:141-142 queries users globally: `tx.select({id:users.id}).from(users).where(eq(users.email, item.email))` with no organizationId filter. A user from another org matched by email is linked as driver in the importing org, creating a cross-tenant association.
- **Воспроизведение:** Org-B has user bob@example.com. Org-A admin POST /import/drivers with email=bob@example.com. A drivers row is created in Org-A with userId pointing to Org-B's user.
- **Направление фикса:** Add `and(eq(users.email, item.email), eq(users.organizationId, orgId))` to the lookup. Only reuse accounts from the same org.
- **Верификация:** routes.ts:141-142 confirmed: `where(eq(users.email, item.email))` with no org filter. No additional check after line 144 either.

#### [P1][HIGH] `apps/api/src/modules/import/routes.ts:181-183`
**POST /import/drivers leaks raw DB error message to client**  _(сегмент: web-misc, error-handling)_

- **Что не так:** routes.ts:182 pushes `err?.message` directly: `results.errors.push({index: i, error: \`${item.fullName || '?'}: ${err?.message}\`})`. mapPgErrorToFriendlyRu is imported (line 8) and used for vehicles (line 98), orders (line 334), contractors (line 393), but NOT for the per-driver catch block at line 181.
- **Воспроизведение:** POST /import/drivers with a driver whose licenseNumber already exists. Response errors[0].error contains raw PG constraint text like 'duplicate key value violates unique constraint "drivers_license_number_key"'.
- **Направление фикса:** Replace `err?.message` with `mapPgErrorToFriendlyRu(err?.code, 'drivers')` consistent with other import handlers.
- **Верификация:** routes.ts:8 imports mapPgErrorToFriendlyRu; lines 98/334/393 use it for other entity types; line 182 for drivers uses raw err?.message — confirmed inconsistency.

#### [P1][HIGH] `apps/api/src/modules/inspections/routes.ts:304`
**GET /inspections/med/expiring-certificates passes days-ahead value through parsePage(), silently clamping 0 to 1 and using wrong semantic function**  -> /transpult  _(сегмент: api-repairs-insp, correctness)_

- **Что не так:** Line 304: `getExpiringMedCertificates(parsePage(days), ...)`. parsePage (lines 28-31) returns 1 for any value <=0 or NaN. Days=0 (today) becomes 1; days=abc becomes 1 instead of the 30-day default. No upper-bound clamp either.
- **Воспроизведение:** GET /api/inspections/med/expiring-certificates?days=0 returns 1-day window instead of 0; ?days=abc returns 1-day window instead of 30-day default.
- **Направление фикса:** Replace parsePage(days) with a dedicated integer parser clamped to [1, 365] with a default of 30.
- **Верификация:** Confirmed at route line 304. parsePage definition at lines 28-31 returns 1 for invalid/zero input; there is a separate parseLimit function with a max cap that is not used here.

#### [P1][HIGH] `apps/api/src/modules/inspections/routes.ts:608-635`
**POST /inspections/tech/:id/decision доступен любому пользователю с role mechanic без проверки роли-механика**  _(сегмент: web-repair-med, security)_

- **Что не так:** routes.ts:610 — только `requireAbility('manage', 'TechInspection')`, нет явной проверки `user.roles.includes('mechanic')`, в отличие от med-decision (строка 643). getTechInspectionById (service.ts:411): `if (organizationId)` — при organizationId=null орг-фильтр пропускается, что позволяет super-пользователю обращаться к записям любого тенанта.
- **Воспроизведение:** 1. super-user (organizationId=null). 2. POST /api/inspections/tech/{id}/decision {decision:'approved'} — 200, без проверки принадлежности к тенанту.
- **Направление фикса:** Добавить `if (!user.roles.includes('mechanic') && !user.roles.includes('admin'))` по аналогии med-decision:643. В getTechInspectionById требовать ненулевой organizationId или отдельный super-scope.
- **Верификация:** routes.ts:643 med-endpoint имеет роль-чек, tech-endpoint:610 — нет. getTechInspectionById:411 `if (organizationId)` подтверждает null-bypass.

#### [P1][HIGH] `apps/api/src/modules/inspections/routes.ts:303`
**parsePage() вызван для параметра `days` в /inspections/med/expiring-certificates**  _(сегмент: web-repair-med, correctness)_

- **Что не так:** routes.ts:304: `parsePage(days)` — функция предназначена для номера страницы (минимум 1, нет максимума). Семантически `days` — количество дней, а не страница. Дополнительно строка 301: `'?????? ?????? ??? ??????'` — mojibake, не читаемое сообщение об ошибке.
- **Воспроизведение:** GET /api/inspections/med/expiring-certificates?days=0 → вернёт данные за 1 день (parsePage clamp min=1). Ошибочный 403 покажет нечитаемый текст.
- **Направление фикса:** Заменить `parsePage(days)` на `Math.min(365, Math.max(1, parseInt(days, 10) || 30))`. Исправить mojibake строки 301.
- **Верификация:** routes.ts:304 `parsePage(days)` подтверждён, строка 301 содержит `'?????? ?????? ??? ??????'` (неправильная кодировка).

#### [P1][HIGH] `apps/api/src/modules/inspections/service.ts:938-983`
**updateTechInspectionDecision allows retroactive mutation of a sealed, signed inspection without immutability guard or mandatory rejection note**  -> /transpult  _(сегмент: api-repairs-insp, security)_

- **Что не так:** Service function does a plain UPDATE with no state/signature check. Route handler (routes.ts line 608-635) does not call validateDecisionUpdate, so rejection without a note is accepted. UPDATE WHERE (line 953) is org-less inside the transaction — org check only via pre-fetch.
- **Воспроизведение:** POST /inspections/tech/{id}/decision {decision: 'approved'} on a previously rejected+signed inspection as mechanic. No note required on rejection.
- **Направление фикса:** Call validateDecisionUpdate() in the route handler; add an immutability guard in the service checking for existing signature before allowing flip.
- **Верификация:** Confirmed: route at lines 608-635 has no validateDecisionUpdate call; service at lines 950-953 does unconditional UPDATE with no state guard.

#### [P1][HIGH] `apps/api/src/modules/inspections/service.ts:985-1047`
**updateMedInspectionDecision same immutability/note-required gap as tech — additionally allows approved→rejected flip unlocking a driver retroactively**  -> /transpult  _(сегмент: api-repairs-insp, security)_

- **Что не так:** Same pattern: service at lines 1009-1013 does unconditional UPDATE. Route (lines 637-667) has no validateDecisionUpdate call. Alcohol-positive rejection can be flipped to approved with no note; medAccessLog records action but not the previous decision value.
- **Воспроизведение:** POST /inspections/med/{id}/decision {decision: 'approved'} on a previously rejected alcohol-positive inspection as medic. No note required.
- **Направление фикса:** Same as tech: call validateDecisionUpdate() in route; add alcohol-positive immutability guard in service.
- **Верификация:** Confirmed: route lines 637-667 has no validateDecisionUpdate call; service lines 1009-1013 do unconditional UPDATE without state guard or signature check.

#### [P1][HIGH] `apps/api/src/modules/integrations/credentials/routes.ts:223-237`
**Тест-эндпоинт креденшелов не видит реальные адаптеры (yookassa/crpt/wialon/diadoc) → флипает status='error' на валидных ключах**  -> /transpult  _(сегмент: api-providers, correctness)_

- **Что не так:** POST /integrations/credentials/:id/test резолвит адаптер через getAdaptersForType(type).find(a => a.name === row.providerName). Но getAdaptersForType возвращает только статический реестр (mock'и + env-based smtp/unisender). Реальные адаптеры живут только в realAdapterFactories и в статический список не попадают.
- **Воспроизведение:** 1) Admin сохраняет ключи yookassa. 2) 'Проверить' → POST /:id/test → find() вернёт undefined → ветка !adapter → status='error', 400 'Adapter not registered: yookassa'.
- **Направление фикса:** В test-роуте резолвить адаптер как selectAdapter: сперва через realAdapterFactories (декрипт row.encryptedCredentials + фабрика), затем fallback на статический список.
- **Верификация:** Подтверждено: index.ts:171-181 getAdaptersForType отдаёт getDefaultRegistry() (signature/payment/... = [mock*]); реальные yookassa/diadoc/wialon/crpt только в realAdapterFactories (index.ts:61-78). routes.ts:224 find() по этому списку → undefined → status='error' (routes.ts:226-236).

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/notifications/routes.ts:163-168`
**GET /telegram/subscriptions: returns ALL subscriptions from ALL orgs — cross-tenant PII leak**  _(сегмент: api-misc2, security)_

- **Что не так:** Confirmed: line 167 is `db.select().from(notificationSubscriptions)` with no .where() clause. The notificationSubscriptions table does have an organizationId column (schema.ts:1139) but it is not used here.
- **Воспроизведение:** Auth as admin of Org-A. GET /telegram/subscriptions — response includes telegramChatId/userId from all other orgs.
- **Направление фикса:** Add .where(eq(notificationSubscriptions.organizationId, user.organizationId)) and expose `request` in the handler.
- **Верификация:** routes.ts:167 confirmed as unscoped. schema.ts:1139 shows organizationId exists in the table but is ignored in the query.
- **QA-корректировка: S2 (fix 1d2651f + миграция org_id) закрыл notification.worker, но GET /telegram/subscriptions фильтр по org так и не получил (organizationId в таблице есть — schema.ts:1139 — но в запросе игнорируется). REAL -> ЗАКРЫТО-НО-ОТКРЫТО.**

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/notifications/routes.ts:177-188`
**POST /telegram/test (no chatId): broadcasts test message to ALL active subscribers across all orgs**  _(сегмент: api-misc2, security)_

- **Что не так:** Confirmed: line 179-181 fetches with `eq(notificationSubscriptions.isActive, true)` only — no org filter. Any admin can trigger a broadcast to every subscriber across all organizations.
- **Воспроизведение:** Auth as admin of Org-A. POST /telegram/test with body {}. All active subscribers in all orgs receive the message.
- **Направление фикса:** Filter by user.organizationId in both the broadcast path and the chatId-specific path.
- **Верификация:** routes.ts:179-181 confirmed: `.where(eq(notificationSubscriptions.isActive, true))` — organizationId filter is absent.
- **QA-корректировка: продолжение неполного S2 — POST /telegram/test без chatId рассылает всем подписчикам всех тенантов. REAL -> ЗАКРЫТО-НО-ОТКРЫТО.**

#### [P1][HIGH] `apps/api/src/modules/operational-core/execution-service.ts:146-153`
**Execution-event idempotency lookup по externalId БЕЗ фильтра organizationId — cross-tenant утечка строки события**  -> /transpult  _(сегмент: api-opcore, security)_

- **Что не так:** Когда recordEvent() возвращает null (конфликт по unique-индексу), сервис делает добор `tx.select().from(events).where(eq(events.externalId, externalId)).limit(1)` без условия по organization_id и без orderBy. Миграция 0039 поменяла unique(events.external_id) на composite unique(organization_id, external_id), то есть один external_id теперь МОЖЕТ существовать у нескольких тенантов. externalId контролируется клиентом. При конфликте у org B этот SELECT с limit(1) без сортировки может вернуть строку события org A целиком (включая data-payload), уходящую клиенту в reply data: { event: existing, duplicate: true }.
- **Воспроизведение:** 1) org A: POST execution-events clientEventId='evt-1' → событие org A. 2) org B: POST с тем же clientEventId='evt-1' (вставка ок per-org). 3) org B ретрай clientEventId='evt-1' → конфликт → добор по externalId без org-фильтра, limit(1) выбирает произвольную из {orgA,orgB} → возможно вернётся событие org A.
- **Направление фикса:** В SELECT по externalId добавить eq(events.organizationId, trip.organizationId) (org из провалидированного trip, не actor). Согласует добор с composite-unique из 0039.
- **Верификация:** Подтверждено: execution-service.ts:150 `.where(eq(events.externalId, externalId)).limit(1)` без org-фильтра/orderBy; 0039 sql:27-28 создаёт composite unique (organization_id, external_id); recordEvent (journal.ts:69) использует onConflictDoNothing, опираясь на этот индекс. org доступен через trip.organizationId, но не используется.

#### [P1][HIGH] `apps/api/src/modules/orders/routes.ts:119–131`
**Driver-роль видит все заявки организации через GET /orders/list**  _(сегмент: api-orders, security)_

- **Что не так:** rbac.ts строка 153: `can('read', 'Order')` для driver. Роут /orders/list (строка 100) использует `requireAbility('read', 'Order')`. Строка 114–118: RLS применяется только для 'client', driver-RLS явно не добавлен (комментарий строка 119). `getOrdersList` фильтрует только по organizationId — водитель получает все заявки тенанта.
- **Воспроизведение:** Аутентифицироваться как driver, GET /api/orders/list — возвращает все заявки организации включая customerPrice, адреса, контрагентов.
- **Направление фикса:** Убрать 'read Order' у driver в CASL либо добавить driver-RLS (rlsDriverId через assignedTrip) аналогично GET /orders.
- **Верификация:** rbac.ts:153 подтверждает `can('read', 'Order')` для driver. Строки 114–120 роута: RLS только для 'client', для driver — явный комментарий об отсутствии RLS без блокировки доступа.

#### [P1][HIGH] `apps/api/src/modules/orders/routes.ts:527–555`
**POST /orders/from-template — IDOR/cross-tenant утечка через templateOrderId**  _(сегмент: api-orders,web-client-orders, security)_

- **Что не так:** service.ts строка 512: `getOrderById(templateOrderId)` без org-проверки. Строки 516–538: поля template (contractorId, cargoDescription, loadingAddress и др.) копируются в новую заявку. Строка 540: `organizationId: author.organizationId ?? template.organizationId` — org автора подставляется, но данные чужого шаблона оседают в новой заявке.
- **Воспроизведение:** POST /orders/from-template { templateOrderId: '<UUID заявки чужой org>' } — данные чужой заявки (маршрут, груз, контрагент) копируются в новую заявку и возвращаются в 201.
- **Направление фикса:** В createOrderFromTemplate добавить `if (template.organizationId !== author.organizationId) throw new Error(...)` после строки 513.
- **Верификация:** service.ts:512 подтверждает вызов без org-фильтра; нет assertOrderAccess ни в роуте (строки 527–554), ни в функции. Сравнение organizationId отсутствует.

#### [P1][HIGH] `apps/api/src/modules/orders/service.ts:460–475`
**TOCTOU в changeOrderStatus: проверка состояния вне транзакции**  _(сегмент: api-orders, data-integrity)_

- **Что не так:** Line 460: `getOrderById(id)` вызывается до `db.transaction` (строка 470). Внутри транзакции UPDATE без повторной проверки статуса. При параллельных запросах оба потока читают одинаковый статус, проходят canTransition, записывают переход.
- **Воспроизведение:** Два одновременных POST /orders/:id/confirm — оба читают status='draft', оба пишут 'confirmed'; возможна запись в недопустимое состояние.
- **Направление фикса:** SELECT FOR UPDATE внутри транзакции (Drizzle .for('update')) или оптимистичный WHERE status = currentStatus с проверкой затронутых строк.
- **Верификация:** Код подтверждает: строка 460 `getOrderById` до `db.transaction` на строке 470, внутри транзакции нет повторной SELECT. SELECT FOR UPDATE отсутствует.

#### [P1][HIGH] `apps/api/src/modules/scoring/service.ts:237-250`
**computeScoreboard: unbounded N×5 sequential DB queries — O(n_drivers) round trips**  _(сегмент: api-misc1, performance)_

- **Что не так:** Lines 229-234 fetch all active drivers with no LIMIT. Lines 237-238 call `await computeDriverScore(d.id, ...)` in a sequential for-loop, each making 4-5 DB queries. No timeout or concurrency limit.
- **Воспроизведение:** GET /drivers/scoreboard with 50+ active drivers → 200-250+ sequential DB queries, latency potentially seconds.
- **Направление фикса:** Parallelise with Promise.all (bounded by p-limit), add LIMIT on the driver fetch, consider async pre-aggregation.
- **Верификация:** Lines 229-238 confirmed: unbounded `.select` on drivers followed by sequential `await computeDriverScore` in a for-loop with no Promise.all or concurrency cap.

#### [P1][HIGH] `apps/api/src/modules/settings/routes.ts:51-53`
**GET /settings/recent — cross-tenant data leak: no org filter**  _(сегмент: api-onboarding, security)_

- **Что не так:** Confirmed: route.ts line 51-53 calls `listRecentSettings()` with no arguments. service.ts lines 135-140 executes `SELECT * FROM app_settings ORDER BY updated_at LIMIT 20` with no WHERE clause. Per-org cost keys are stored as `cost.fuel_price_per_liter:<org-uuid>`, so any tenant-admin receives other tenants' UUIDs and values.
- **Воспроизведение:** As org-A admin, GET /settings/recent — response contains org-B's `cost.fuel_price_per_liter:<org-B-uuid>` rows updated more recently than org-A's.
- **Направление фикса:** Pass orgId to listRecentSettings; add WHERE key LIKE '%:<orgId>' OR key NOT LIKE '%:%' in service.ts.
- **Верификация:** service.ts:135-140 confirmed: `db.select().from(appSettings).orderBy(desc(appSettings.updatedAt)).limit(20)` — no tenant filter whatsoever. Route handler `async () => { const data = await listRecentSettings(); }` ignores request.user entirely.

#### [P1][HIGH] `apps/api/src/modules/settings/service.ts:135-140`
**Cross-tenant data leak: listRecentSettings() returns all-tenant app_settings rows**  _(сегмент: web-admin-2, security)_

- **Что не так:** listRecentSettings() at L135-139 is a plain SELECT with no WHERE clause on organizationId. The route handler at routes.ts:51-53 calls it without passing any orgId. Any tenant admin with manage-Settings ability gets all orgs' per-org cost model settings.
- **Воспроизведение:** GET /api/settings/recent as tenant-A admin returns rows with keys like cost.fuel_price_per_liter:org-UUID-of-tenant-B.
- **Направление фикса:** Add WHERE clause scoping to caller's orgId, or restrict this endpoint to super-admin only.
- **Верификация:** Confirmed: service.ts L136 is `db.select().from(appSettings).orderBy(...).limit(20)` — zero org-scoping. routes.ts L52 calls it as `await listRecentSettings()` with no arguments.

#### [P1][HIGH] `apps/api/src/modules/signatures/gosklyuch-callback.ts:92-134, 254-356`
**Публичный callback принимает произвольный signedXml как юридически действительную подпись без верификации содержимого и без mTLS/IP-allowlist**  -> /transpult  _(сегмент: api-signatures, security)_

- **Что не так:** Единственные гейты на публичном endpoint: HMAC по externalId (доказывает лишь, что externalId выпущен нами — а он утекает клиенту в ответе /sign и в deeplink, отправляемом в приложение Госуслуг) + существование документа + rate-limit. НИКАКОЙ проверки, что signedXml — настоящая подпись от Госключа: gosklyuch.verify() кидает 'not implemented' и в callback вообще не вызывается. Тело принимает любой signedXml 1B..4MB и сохраняет его, выставляя providerStatus='signed:gosklyuch', signatureEntry.state='signed', signatureState.status='signed' (строки 274, 289, 325). Кто угнал/подсмотрел валидный externalId (например через UI клиента или MITM deeplink), может POST-ить мусор и пометить ЭТрН-титул юридически подписанным. Нет проверки src-IP/mTLS Госуслуг. mchdProblems влияет только на pending_review при наличии mchdId, но БЕЗ mchdId (в non-prod) и при валидной МЧД — сразу 'signed'.
- **Воспроизведение:** 1) Получить externalId документа (из ответа /sign или из deeplink). 2) В prod externalId уже содержит валидный HMAC. 3) POST /api/signatures/gosklyuch/callback {externalId:'<валидный>', signedXml:'<любые байты>'} → 200, документ помечается signed:gosklyuch с подложным конвертом.
- **Направление фикса:** До go-live: (а) проверять подпись конверта (вызывать реальный verify() провайдера / валидировать XAdES-цепочку и сертификат) прежде чем ставить state='signed'; (б) ограничить callback по mTLS или IP-allowlist реальных серверов Госуслуг; (в) пока verify не реализован — все входящие подписи держать в pending_review, а не signed. Юр-сила подписи сейчас не гарантирована.
- **Верификация:** Подтверждено: verify() кидает 'not implemented' (gosklyuch.ts:91-96) и в callback не вызывается; state='signed' и providerStatus='signed:gosklyuch' ставятся лишь по HMAC+существованию doc (строки 274,289,325). HMAC проверяет только наш выпуск externalId (buildExternalId, sign-endpoint.ts:83-87), не содержимое конверта. Латентно до реального Госключа, но критично на go-live.

#### [P1][HIGH] `apps/api/src/modules/signatures/sign-endpoint.ts:277-295`
**Госключ deeplink несёт adapter-externalId (gk-...), а документ сохраняется под локальным UUID — callback не найдёт документ**  -> /transpult  _(сегмент: api-signatures, correctness)_

- **Что не так:** Когда у организации сконфигурирован РЕАЛЬНЫЙ gosklyuch-адаптер (provider_credentials active/sandbox → selectAdapter возвращает GosklyuchSignatureProvider, name==='gosklyuch'), код берёт deeplink из адаптера (out.deeplink), который встраивает СВОЙ externalId 'gk-<docid8>-<ts>' (gosklyuch.ts:60-63). Но в transport_documents.externalId и в pendingSignatures записывается локально сгенерированный buildExternalId() UUID(+HMAC) (строки 272, 315, 341). Пользователь подписывает в Госключе по 'gk-...', Госключ зовёт callback с externalId='gk-...', а callback ищет doc по eq(transportDocuments.externalId, externalId) (gosklyuch-callback.ts:130-134) → документ под UUID не находится → '400 Документ по externalId не найден'. Подпись теряется. Комментарий 282-286 признаёт расхождение, но deeplink всё равно отдаётся с gk-. В дефолтной конфигурации (registry.signature=[mock], index.ts:159) ветка не достигается, поэтому баг латентен до подключения реального Госключа — то есть ровно на go-live.
- **Воспроизведение:** 1) Настроить org с provider_credentials signature=gosklyuch status=active. 2) POST /api/transport-documents/:id/sign {provider:'gosklyuch', titleType:'T01', mchdId}. 3) Ответ содержит deeplink с extId=gk-..., но в БД externalId=UUID. 4) Эмулировать callback Госключа с externalId=gk-... → 400 not found. Подпись не записывается.
- **Направление фикса:** Либо использовать out.externalId адаптера как канонический (записывать его в transport_documents.externalId и pendingSignatures, передавать callbackUrl с НАШИМ HMAC-externalId в adapter.sign), либо передавать локальный externalId в adapter.sign(documentId, payload, userId, callbackUrl) и заставить адаптер строить deeplink на его основе, а не на gk-. Главное — deeplink-externalId и сохранённый externalId должны совпадать.
- **Верификация:** Подтверждено: gosklyuch.ts:60-63 deeplink несёт extId=`gk-...`, а sign-endpoint.ts:288 берёт out.deeplink как есть, при этом строка 340 пишет externalId=buildExternalId() UUID; callback ищет по eq(externalId) (gosklyuch-callback.ts:133). Комментарий 283-286 сам признаёт расхождение.

#### [P1][HIGH] `apps/api/src/modules/sprint9/routes.ts:223-227`
**PUT /incidents/:id: update WHERE clause has no org filter — any incident can be updated by any tenant's staff after passing assertIncidentAccess with null org IDs**  _(сегмент: api-misc2, security)_

- **Что не так:** Confirmed: guards.ts:185-213 shows getIncidentAccessSnapshot builds organizationIds from vehicleId/driverId/tripId FKs only. When all three are null, organizationIds is empty and assertOrganizationScope at line 54 returns silently. hasStaffAccess(user) then returns true for any staff role. The update at routes.ts:223 has no org filter.
- **Воспроизведение:** Create incident in Org-A with all FKs null. Auth as logist of Org-B. PUT /incidents/{orgA-id} — update succeeds.
- **Направление фикса:** Add organizationId to incidents table and enforce in queries, or require at least one FK on creation.
- **Верификация:** guards.ts:54 `if (knownOrganizationIds.length === 0) return;` — silent pass confirmed. routes.ts:223 update has no org filter.

#### [P1][HIGH] `apps/api/src/modules/sync/routes.ts:176, 204`
**Sync pull/push 500 handlers expose raw error.message — internal PG/Drizzle errors leak to client**  _(сегмент: api-misc2, error-handling)_

- **Что не так:** Confirmed: line 176 `error: error.message || 'Sync pull failed'` and line 204 `error: error.message`. parseSyncCursor at line 56 falls through to `new Date(rawCursor)` for non-numeric strings, producing Invalid Date which Drizzle passes to gt() — the resulting runtime error message is returned verbatim.
- **Воспроизведение:** GET /sync/pull?lastSyncAt=GARBAGE — parseSyncCursor returns Invalid Date, Drizzle throws with internal details, line 176 returns it verbatim.
- **Направление фикса:** Validate cursor after parseSyncCursor (check isNaN). Replace error.message in 500 handlers with a generic message, log server-side only.
- **Верификация:** routes.ts:56 `return new Date(rawCursor)` for non-numeric strings produces Invalid Date. routes.ts:176 and 204 return error.message directly.

#### [P1][HIGH] `apps/api/src/modules/sync/service.ts:61-68`
**processSingleEvent: idempotency check (select → action) is not atomic — TOCTOU allows duplicate state mutations**  _(сегмент: api-misc2, data-integrity)_

- **Что не так:** Confirmed: lines 61-68 read existingEvent then gate on it outside any transaction. Two concurrent calls with the same event.id both pass before either writes. recordEvent uses onConflictDoNothing on externalId but the side-effect mutations (changeTripStatus, updateRoutePoint) execute twice.
- **Воспроизведение:** Send two concurrent POST /sync/events with identical event.id and type=trip_status_changed. Both pass the existence check and call changeTripStatus twice.
- **Направление фикса:** Wrap idempotency check + mutation in a transaction with SELECT FOR UPDATE, or use DB advisory lock.
- **Верификация:** service.ts:61-68 select+guard outside any transaction confirmed. No advisory lock or FOR UPDATE present in processSingleEvent.

#### [P1][HIGH] `apps/api/src/modules/trips/margin.ts:60-81`
**Margin broken: numeric columns arrive as strings, revenue concatenated as string -> NaN**  _(сегмент: api-trips-core, correctness)_

- **Что не так:** connection.ts (postgres-js+drizzle) sets no numeric type parser (OID 1700); orders.customer_price is numeric(12,2).$type<number>() which is compile-time only. At runtime customerPrice is a string and revenue += row.customerPrice concatenates.
- **Воспроизведение:** Trip with >=2 orders having customerPrice. GET /trips/:id as accountant -> margin NaN/null from string-concat ('01000.00'+'500.00'='01000.00500.00' * 100 = NaN).
- **Направление фикса:** Number(row.customerPrice) on read, or global numeric parser in postgres({types}); coerce cost to number before subtraction.
- **Верификация:** connection.ts:21-32 no types parser; schema.ts:457 customer_price numeric().$type<number>(); margin.ts:66 revenue+=string. NB single price coerces OK; bug needs >=2 priced orders.

#### [P1][HIGH] `apps/api/src/modules/trips/routes.ts:1371-1388`
**Cross-tenant IDOR: dossier item exception updates by itemId without trip/org check**  _(сегмент: api-trips-core, security)_

- **Что не так:** assertTripAccess(id) checks trip id, but UPDATE document_dossier_items WHERE id=itemId has no scopeId===id, no scopeType, no organizationId. Staff org A can exception a dossier item of org B trip, lifting close-gate.
- **Воспроизведение:** org A: POST /trips/<tripId_A>/dossier/items/<itemId_tripB_orgB>/exception {reason:x}. assertTripAccess(tripId_A) passes, UPDATE flips foreign item, returns 200 with foreign item.
- **Направление фикса:** Add eq(scopeId,id)+eq(scopeType,'trip')+organizationId check in WHERE, or preload item and verify; 404 if not within trip.
- **Верификация:** routes.ts:1385 .where(eq(documentDossierItems.id,itemId)) sole condition; scopeId/scopeType/org unused; assertTripAccess on trip id only (1377).

#### [P1][HIGH] `apps/api/src/modules/trips/transport-documents-store.ts:1015-1051 (recordTransportDocumentSignature); тот же паттерн 1079-1116 в refusal`
**Parallel ETRN signing: read-modify-write metadata.signatures without tx/locks -> lost signature**  _(сегмент: api-trips-core,api-trips-docs, data-integrity)_

- **Что не так:** recordTransportDocumentSignature читает row (db.select), берёт metadata.signatures, делает signatures.push(signature), затем db.update со всем массивом. Нет db.transaction и нет SELECT ... FOR UPDATE. Два одновременных POST .../signatures на один документ оба прочитают одинаковый исходный массив, каждый запишет свой массив с одной добавленной подписью — last write wins, одна подпись теряется. Для ЭТрН/ЭПД, где каждая роль (грузоотправитель/перевозчик/грузополучатель) подписывает отдельно, это прямая потеря юр-значимого факта подписи. Refusal-функция имеет идентичный паттерн для signatureRefusals.
- **Воспроизведение:** Параллельно отправить два POST /trips/{id}/transport-documents/{docId}/signatures с разными signerRole. Оба читают metadata.signatures=[], пушат свою, перезаписывают. Итог: в metadata.signatures одна подпись вместо двух.
- **Направление фикса:** Обернуть чтение+мутацию+запись в db.transaction с SELECT ... FOR UPDATE по строке transportDocuments, либо использовать атомарный JSONB-append на стороне БД (jsonb || ) вместо read-modify-write в JS. Аналогично для signatureRefusals.
- **Верификация:** Подтверждено построчно: db.select (1015) → spread metadata.signatures (1022) → push (1037) → db.update полным массивом (1039), без транзакции/FOR UPDATE. Refusal 1079-1116 идентичен.

#### [P1][HIGH] `apps/api/src/modules/trips/transport-documents-store.ts:1043-1047`
**signatureState.status захардкожен в 'partially_signed' навсегда — нет понятия полностью подписанного ЭТрН**  -> /transpult  _(сегмент: api-trips-docs, correctness)_

- **Что не так:** При каждой записи подписи signatureState.status выставляется в строковый литерал 'partially_signed' независимо от того, сколько и каких ролей подписали. Никогда не становится 'signed'/'fully_signed'/'complete'. Нет логики сверки набора подписей с обязательными подписантами титула ЭТрН. Следствие: downstream (UI, finance, юр-проверка готовности ЭТрН к выпуску счёта) не может отличить однократно подписанный документ от комплектно подписанного — статус подписи семантически бесполезен.
- **Воспроизведение:** Подписать документ всеми требуемыми ролями по очереди. После каждой и после последней metadata.signatureState.status == 'partially_signed'. Полная подпись не детектируется.
- **Направление фикса:** Ввести модель обязательных подписантов на тип документа/титул и вычислять статус (unsigned/partially_signed/fully_signed) по сопоставлению накопленных signerRole с требуемым набором; выставлять fully_signed при покрытии.
- **Верификация:** Подтверждено: строка 1044 status: 'partially_signed' — литерал, не вычисляется; нет сопоставления signerRole с обязательным набором подписантов титула.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/api/src/modules/waybills/routes.ts:472-549 (GET /waybills/:id/etrn), 555-632 (GET /waybills/:id/etrn-title4)`
**Субподряд-гейт ЭТрН (assertEtrnAllowed) НЕ вызывается в маршрутах выдачи XML ЭТрН — обход C2-фикса**  _(сегмент: api-waybills, security)_

- **Что не так:** P0-C2 (fix 32da51d) объявил единый гейт assertEtrnAllowed герметичным для ВСЕХ путей оформления/подписи/отправки ЭТрН. Гейт реально вызывается только в edi/service.ts:142 и trips/routes.ts:996. Маршруты GET /waybills/:id/etrn и /etrn-title4 генерируют ЭТрН-XML и отдают клиенту без гейта.
- **Воспроизведение:** 1) Рейс executionMode='subcontract', org с ИНН. 2) GET /api/waybills/{id}/etrn с JWT staff. 3) 200 + XML ЭТрН с carrierInn нашей организации, тогда как sign/send дал бы 422 SUBCONTRACT_ETRN_BLOCKED.
- **Направление фикса:** Импортировать assertEtrnAllowed и вызвать await assertEtrnAllowed(trip?.id ?? waybill.tripId) в обоих GET-роутах после загрузки trip, до generateETrN/Title4; маппить statusCode 422 в reply.
- **Верификация:** Grep подтвердил: assertEtrnAllowed только в edi/service.ts:142 и trips/routes.ts:996. GET-роуты (routes.ts:512 generateETrN, 596 generateETrNTitle4) гейт не вызывают. Docstring etrn-guard.ts:6 сам требует вызова во ВСЕХ путях.

#### [P1][HIGH] `apps/api/src/modules/waybills/service.ts:622-627, 649-654, 667-672`
**closeWaybill принимает заведомо невалидный odometerIn (кроме отката) и пишет его в vehicles.currentOdometerKm**  _(сегмент: api-waybills, data-integrity)_

- **Что не так:** validateOdometerReadings ловит rollback, unrealistic_delta (>5000км) и invalid_value, но closeWaybill проверяет ТОЛЬКО reason==='rollback'. odometerIn=99999999 при odometerOut=10000 (reason='unrealistic_delta') проходит и пишется в vehicles.currentOdometerKm и trips.odometerEnd.
- **Воспроизведение:** POST /api/waybills/{id}/close { odometerIn: 99999999 } для issued-ПЛ с odometerOut=10000 → 200, vehicles.currentOdometerKm=99999999.
- **Направление фикса:** Отвергать при !validation.ok (любой reason), не только rollback; в route-валидации проверять Number.isFinite(odometerIn) и >=0.
- **Верификация:** service.ts:624 и :651 оба: `if (!validation.ok && validation.reason === 'rollback')`. unrealistic_delta (lifecycle.ts:85-91) и invalid_value (:70-74) игнорируются. routes.ts:164 проверяет лишь присутствие odometerIn, не NaN.

#### [P1][HIGH] `apps/api/src/providers/index.ts:216-224`
**OfdRuProvider не зарегистрирован — все фискальные чеки 54-ФЗ генерируются mock'ом даже в production**  -> /transpult  _(сегмент: api-providers, unfinished)_

- **Что не так:** ofdAdapters = [mockOfdProvider]; OfdRuProvider (ofd-ru.ts) в реестр не добавлен. getOfdAdapter(name) при промахе всегда возвращает mockOfdProvider; billing/service.ts:320 вызывает getOfdAdapter() без имени → mock.fiscalize() выдаёт фейковые fnNumber/fiscalSign (Math.random) и URL ofd.example.com, при этом receiptUrl сохраняется в payments как настоящий.
- **Воспроизведение:** 1) Прод, оплата подписки через billing succeeded-путь. 2) service.ts:320 getOfdAdapter() → mock. 3) payments.receiptUrl = https://ofd.example.com/receipt/mock-fd-XXXX, реального чека в ФНС нет.
- **Направление фикса:** Добавить OfdRuProvider (или фабрику по creds) и выбирать реальный адаптер при настроенных ОФД-креденшелах; mock — только dev/B2B-only. Пока не готово — не выставлять receiptUrl как валидный.
- **Верификация:** index.ts:216 ofdAdapters=[mockOfdProvider]; getOfdAdapter() без имени → mockOfdProvider (218-224). OfdRuProvider только определён (ofd-ru.ts:14), нигде не импортируется. mock.ts:25-32 генерит Math.random ФН/ФП + ofd.example.com; service.ts:330-334 пишет receiptUrl в payments.

#### [P1][HIGH] `apps/mobile/src/api/temperature.ts:86-145 (submitTemperature); duplicate-insert confirmed at apps/api/src/modules/cold-chain/service.ts:122-126`
**Температурный offline-путь без idempotency-ключа → дубли cold-chain тиков при потере ответа/повторе**  -> /transpult  _(сегмент: mobile-data, data-integrity)_

- **Что не так:** submitTemperature шлёт reading прямым REST POST /trips/:id/temperature-readings, а НЕ через /sync/events (где есть per-org idempotency E2). Сервер (recordReading) делает чистый .insert(temperatureReadings) без unique/onConflict на (tripId, recordedAt) и без клиентского idempotency-ключа. Сценарий: устройство online → POST доходит до сервера, сервер коммитит reading, но ответ теряется (таймаут/обрыв 3G). catch (строки 135-144) кладёт ТОТ ЖЕ reading в offline-очередь → replayQueue повторно вставляет дубль. Также replayQueue пишет remaining одним setItem в конце (offlineQueue.ts:203): если приложение убито после успешного POST temperature, но до setItem — при следующем запуске вся очередь переигрывается, снова дубль. Дубли искажают breachCount/avgC/minC/maxC в getTemperatureSummary → ложная картина соблюдения холодовой цепи (юридически значимый журнал).
- **Воспроизведение:** 1) Включить cold-chain рейс. 2) Отправить замер при нестабильной связи так, чтобы сервер записал, но ответ не дошёл (или убить app после fetch до setItem). 3) Реплей очереди. 4) GET temperature-summary: count и breachCount больше реального числа физических замеров.
- **Направление фикса:** Генерировать стабильный clientReadingId на месте захвата (как event.id в /sync/events), слать его в body; на сервере добавить unique-ключ/онконфликт по (organization_id, trip_id, client_reading_id) либо по (trip_id, recorded_at, sensor_id) и делать insert ... on conflict do nothing. Либо завести temperature через /sync/events с тем же per-org idempotency, что E2.
- **Верификация:** Подтверждено: temperature.ts:90 endpoint=/trips/:id/temperature-readings (прямой REST, не /sync/events); catch:137-142 повторно enqueue того же body. service.ts:122 plain .insert(temperatureReadings).returning() без onConflict. schema.ts:1601-1606 — только index'ы, НЕТ unique на (trip_id,recorded_at). Дубль воспроизводим.

#### [P1][HIGH] `apps/mobile/src/database/index.ts:14`
**onSetUpError полностью проглочен — БД может стартовать в broken state без уведомления**  -> /transpult  _(сегмент: mobile-screens, error-handling)_

- **Что не так:** `onSetUpError: () => {}` подтверждён строкой 14. Пустой callback означает, что любой сбой инициализации SQLite (нет места, corrupt файл, ошибка миграции) проходит молча.
- **Воспроизведение:** Устройство с заполненным хранилищем → SQLiteAdapter не открывает БД → onSetUpError вызывается → пустой callback → приложение рендерит AppNavigator → первый же database.collections.get().query().fetch() бросает ошибку.
- **Направление фикса:** Добавить логирование через Sentry/crash reporter и/или error state в корневом компоненте для отображения понятного экрана ошибки.
- **Верификация:** Строка 14 подтверждена: `onSetUpError: () => {}` — пустой callback, никакого логирования или state-обновления нет.

#### [P1][HIGH] `apps/mobile/src/screens/DeliveryConfirmationScreen.tsx:147`
**Подпись получателя отправляется как пустая строка без валидации**  -> /transpult  _(сегмент: mobile-screens, security)_

- **Что не так:** signature инициализирован null (строка 67). submitConfirmation (строка 108-115) проверяет только recipientName и cargoCondition — проверки `signature` нет. Строка 147: `signatureDataUrl: signature || ''`. Если пользователь попал на шаг 'details' без прохождения 'signature', пустая подпись уйдёт на сервер.
- **Воспроизведение:** Перейти к шагу 'details' через обратную навигацию без установки подписи → нажать «Подтвердить доставку» → запрос уходит с signatureDataUrl=''.
- **Направление фикса:** Добавить в начало submitConfirmation: `if (!signature) { Alert.alert('Подпись', 'Необходима подпись получателя.'); return; }`
- **Верификация:** Строка 67: `useState<string | null>(null)`. Строки 108-115: валидации signature нет. Строка 147: `signature || ''` — пустая строка уйдёт на сервер при null.

#### [P1][HIGH] `apps/mobile/src/screens/TripDetailsScreen.tsx:639-648`
**Кнопка «Завершить рейс (легаси)» показывается водителю в ЛЮБОМ нетривиальном статусе**  -> /transpult  _(сегмент: mobile-screens, correctness)_

- **Что не так:** canStart=true только при 'waybill_issued'; canComplete=true только при 'in_transit'&&allPointsClosed. Для статусов assigned/inspection/completed/billed оба false → `!canStart && !canComplete` = true → кнопка видна. markCompleted() не проверяет tripStatus — навигирует на TripCompletionScreen из любого состояния.
- **Воспроизведение:** Рейс в статусе 'assigned', войти как водитель → sticky-bar показывает «Завершить рейс (легаси)» → нажать → TripCompletionScreen → отправить event trip_status_changed с status='completed', минуя весь FSM.
- **Направление фикса:** Добавить guard: показывать кнопку только при tripStatus === 'in_transit'. Или полностью удалить legacy-ветку.
- **Верификация:** Строки 237-239: canStart = tripStatus==='waybill_issued'; canComplete = tripStatus==='in_transit'&&allPointsClosed. Строки 302-318: markCompleted() не проверяет tripStatus перед navigate('TripCompletion').

#### [P1][HIGH] `apps/mobile/src/screens/TripDetailsScreen.tsx:249-291`
**completeTrip через TripDetails и TripCompletionScreen — два независимых пути завершения с разными payload**  -> /transpult  _(сегмент: mobile-screens, correctness)_

- **Что не так:** submitOdometer (строка 270): `completeTrip(tripId, {odometerEnd, notes})` — REST POST /trips/:id/complete. markCompleted/TripCompletionScreen: sync-event с `{odometer, fuel}`. Оба пути одновременно доступны при разных условиях. Поля несовместимы: fuel отсутствует в REST-пути, odometerEnd vs odometer разные имена.
- **Воспроизведение:** tripStatus='in_transit'&&allPointsClosed → canComplete=true → кнопка «Завершить рейс» (REST). tripStatus='in_transit'&&!allPointsClosed → canComplete=false, legacy-кнопка → TripCompletionScreen (sync-event). Два разных payload на сервер.
- **Направление фикса:** Унифицировать пути завершения, включить fuel в REST API, убрать legacy-путь или явно задокументировать разделение.
- **Верификация:** Строка 270: `odometerEnd, notes` без fuel. TripCompletionScreen строка 47: `odometer: odometerEnd, fuel: fuelEnd` — поля и endpoint разные.

#### [P1][HIGH] `apps/web/src/app/admin/integrations/page.tsx:227-232`
**DPA acceptance-check 404/error silently falls through to CredentialModal — bypasses DPA gate in production**  -> /transpult  _(сегмент: web-admin-1, security)_

- **Что не так:** Confirmed: catch block at line 227 is completely empty, execution always falls through to setModal() at line 232. The comment explicitly states this is intentional for the pilot phase ('не все провайдеры имеют DPA-файл'), conflating 404 with 5xx/network errors.
- **Воспроизведение:** 1. Add a DPA-requiring provider (e.g., diadoc). 2. Cause the /dpa/:providerId/acceptance endpoint to return 500. 3. Click 'Подключить' on the Diadoc card. 4. Observe: CredentialModal opens without DPA consent.
- **Направление фикса:** In the catch block, distinguish 404 (DPA_NOT_FOUND) from other errors: re-throw or block on non-404 errors.
- **Верификация:** Line 227: `} catch {` — empty, no error inspection. Comment on line 228-230 explicitly documents this as a design decision but does not differentiate error types.

#### [P1][HIGH] `apps/web/src/app/admin/layout.tsx:51-65`
**Client-side-only admin RBAC guard — server rendering exposes content before redirect**  _(сегмент: web-admin-2, security)_

- **Что не так:** The RBAC check is a useEffect (fires after mount) and a conditional return null (L65). With 'use client' in Next.js App Router the RSC shell renders without user checks. Child page components (billing/page.tsx loadRows at L82) begin mounting before the effect fires.
- **Воспроизведение:** Navigate to /admin/billing as non-super-admin — loadRows() fires at L82 via useEffect with empty dep array before the layout's redirect useEffect runs.
- **Направление фикса:** Add server-side middleware.ts to enforce admin role before serving /admin routes, or block child rendering until loading=false and user check completes.
- **Верификация:** layout.tsx L57-63 shows a spinner only while loading=true, but billing/page.tsx L81-84 has its own useEffect that fires immediately — the API call races with the layout's redirect.

#### [P1][HIGH] `ЗАКРЫТО-НО-ОТКРЫТО` `apps/web/src/app/client/page.tsx:67-73, 152-166`
**Метрика «Неоплаченных счетов» всегда 0 — enum клиент-портала не совпадает с Invoice FSM**  _(сегмент: web-client-orders, correctness)_

- **Что не так:** INVOICE_STATUS_LABELS (строки 67-73) содержит только draft/sent/paid/overdue/cancelled — 'issued' и 'paid_partial' отсутствуют. unpaidSparkline (строка 157) фильтрует по ['sent', 'overdue'], которые больше не приходят с сервера после E4/E5 fix. Сам счётчик unpaidInvoices (строка 137) корректен, но badge рендерит сырое 'issued'.
- **Воспроизведение:** Клиент с выставленными счетами (status='issued'): статус-бейдж показывает сырое 'issued', sparkline пуст, badge fallback neutral.
- **Направление фикса:** Добавить issued/paid_partial/paid_full/corrected в INVOICE_STATUS_LABELS; в unpaidSparkline заменить фильтр на ['issued', 'paid_partial'].
- **Верификация:** E4/E5 fix обновил unpaidInvoices-фильтр (строка 137), но INVOICE_STATUS_LABELS и unpaidSparkline-фильтр (строка 157) остались со старыми статусами — фикс неполон.

#### [P1][HIGH] `apps/web/src/app/dispatcher/page.tsx:573`
**handleSelectTrip looks up vehicle in stale `vehicles` instead of `enrichedVehicles` — map focus silently fails when WS positions are active**  _(сегмент: web-dispatcher, correctness)_

- **Что не так:** Line 573: `const v = vehicles.find(x => x.plateNumber === trip.vehiclePlate)` — raw `vehicles` array. `enrichedVehicles` merges WS positions at lines 293-302 but is not used here. Guard `if (v && v.lat && v.lon)` at line 574 fails for WS-only vehicles.
- **Воспроизведение:** Open dispatcher with active WS; click a live trip row whose vehicle has no REST lat/lon — map does not fly, vehicle not selected.
- **Направление фикса:** Replace `vehicles.find` with `enrichedVehicles.find` at line 573; add `enrichedVehicles` to useCallback deps.
- **Верификация:** Code confirmed: line 573 uses `vehicles`, while `enrichedVehicles` (lines 293-302) is the merged array with WS coords. `handleSelectVehicle` at line 584 also uses raw `vehicles`, compounding the issue.

#### [P1][HIGH] `apps/web/src/app/dispatcher/page.tsx:486-493`
**Force-close two-step sequence has no rollback — trip can get delivery-confirmation record but remain in_transit on status step failure**  _(сегмент: web-dispatcher, data-integrity)_

- **Что не так:** `handleForceClose` (lines 482-505): delivery-confirmation POST at line 486 then status POST at line 493. Catch at line 500 only shows toast — no compensation DELETE of the delivery-confirmation record if status step fails.
- **Воспроизведение:** Drop network after first POST succeeds; trip has delivery-confirmation but status stays in_transit with no UI path to complete it.
- **Направление фикса:** Combine into a single server-side atomic endpoint POST /trips/{id}/force-complete, or attempt DELETE /trips/{id}/delivery-confirmation as compensation on status failure.
- **Верификация:** Confirmed: lines 486-505 — sequential awaits with a single catch block that only shows toast; no rollback of step 1 on step 2 failure.

#### [P1][HIGH] `apps/web/src/app/dispatcher/page.tsx:598-618`
**Dispatcher cockpit trip assignment omits driverId — creates trips without a driver**  _(сегмент: web-dispatcher, layer-drift)_

- **Что не так:** `handleAssign` payload at lines 599-618 contains `vehicleId`, `orderIds`, `routePoints` only — no `driverId`. The backend schema (`service.ts:68`) accepts `driverId` in create input but it is never supplied through this path.
- **Воспроизведение:** Dispatcher cockpit → select order → select vehicle → Назначить → inspect created trip: driverId is null.
- **Направление фикса:** Add driver selection to AssignmentPanel UI and include `driverId` in the POST /trips payload.
- **Верификация:** Confirmed: lines 599-618 POST payload has vehicleId, orderIds, routePoints — no driverId field. Backend service.ts:68 shows driverId is an optional input field.

#### [P1][HIGH] `apps/web/src/app/finance/InvoiceWorkflowActions.tsx:193 (submitCorrection); vatRate state 105; correction modal 316-329`
**Корректировка КСФ/ИСФ всегда считает НДС по ставке 20% (hardcoded), игнорируя реальную ставку оригинала**  -> /transpult  _(сегмент: web-onboarding-fin, correctness)_

- **Что не так:** В submitCorrection НДС считается как vat = total - total/(1+Number(vatRate)/100). vatRate — это state со значением по умолчанию "20", и в модалке корректировки (Dialog modal==="correction", строки 316-329) НЕТ поля ввода ставки НДС — там только corrKind, corrReason и allocator. Значит для любой корректировки СФ/УПД НДС извлекается из суммы по 20%, даже если исходный документ был выпущен по 10% или 0%. Сервер createCorrection пишет присланные subtotal/vatAmount/total дословно без пересчёта и без сверки с allowedVatRates(regime).
- **Воспроизведение:** 1. Выпустить СФ по ставке 10%. 2. Открыть счёт -> Корректировка -> выбрать КСФ, обоснование, строка с суммой. 3. Submit: vatAmount считается как 1/6 от total (20%), а не 1/11 (10%).
- **Направление фикса:** Не доверять клиентскому vatAmount: передавать invoice.vatRate/includesVat из выбранного счёта в submitCorrection и считать по ним, либо (лучше) считать НДС на сервере createCorrection из vatRate оригинала + валидировать против allowedVatRates(taxRegime). Добавить отображение ставки в модалке.
- **Верификация:** Подтверждено: строка 193 использует vatRate (default "20", модалка correction 316-329 не имеет поля ставки и openModal не сбрасывает vatRate). Сервер invoice-workflow.service.ts:553-554 пишет input.subtotal/input.vatAmount дословно, без пересчёта из orig_inv.vatRate.

#### [P1][HIGH] `apps/web/src/app/fleet/components/ContractorsTable.tsx:189`
**GET /fleet/contractors/:id/addresses route is commented out — ContractorAddressesModal always gets 404/empty**  _(сегмент: web-fleet-1, correctness)_

- **Что не так:** routes.ts lines 329-341 confirm the GET route is wrapped in a `/* ... */` block comment. The service function listContractorAddresses is intact. Client at line 189 calls the endpoint and gets 404; the UI silently shows empty state.
- **Воспроизведение:** Open /fleet -> Contractors tab -> click Адреса on any contractor; network returns 404.
- **Направление фикса:** Uncomment lines 331-341 in routes.ts to register the GET handler.
- **Верификация:** routes.ts lines 329-341 show the route is inside a `/* ... */` comment block labeled 'DaData lookup placeholder'; service impl exists but endpoint is dead.

#### [P1][HIGH] `apps/web/src/app/fleet/components/VehiclesTable.tsx:263-270`
**toggleBlock sends isBlocked to PUT /fleet/vehicles/:id but backend silently ignores it — block/unblock is a no-op**  _(сегмент: web-fleet-1, correctness)_

- **Что не так:** Confirmed: service.ts line 104 shows `isBlocked: hasExpiredDocuments(v)` — it is purely computed. directFields (lines 267-271) does not include isBlocked. VehicleCreateSchema (schemas.ts line 144) also omits isBlocked. Zod strips the field, service never writes it. Toast claims success but DB state is unchanged.
- **Воспроизведение:** PUT /fleet/vehicles/:id with {isBlocked:true} returns 200; re-fetch shows isBlocked still false unless documents are expired.
- **Направление фикса:** Add persistent `isBlocked` boolean DB column, include in directFields; or provide dedicated PATCH /fleet/vehicles/:id/block endpoint.
- **Верификация:** service.ts:104 confirms isBlocked is computed-only via hasExpiredDocuments; no DB write path exists for explicit block. All three layers (UI, schema, service) confirmed misaligned.

#### [P1][HIGH] `apps/web/src/app/login/page.tsx:26 (ROLE_ROUTES.driver = '/'); cf. apps/web/src/lib/routing.ts:18 (driver = '/trips')`
**Drift driver-роута: login-страница ведёт водителя на '/', канон routing.ts — на '/trips'**  -> /transpult  _(сегмент: web-auth-pages, layer-drift)_

- **Что не так:** В login/page.tsx локальная копия ROLE_ROUTES задаёт driver: '/', тогда как канонический apps/web/src/lib/routing.ts:18 (комментарий которого прямо заявляет 'Mirrors the inline maps in app/login/page.tsx') задаёт driver: '/trips'. Карты разошлись. Водитель, входящий через форму /login, попадает на корень '/' вместо рабочего экрана рейсов '/trips'. Логика pickRouteForRoles в login дублирует уже существующую центральную функцию вместо импорта — отсюда расхождение и риск дальнейшего рассинхрона (priority-массив тоже скопирован).
- **Воспроизведение:** Войти пользователем с единственной ролью driver через страницу /login → router.push(pickRouteForRoles(['driver'])) вернёт '/', а не '/trips'. Тот же пользователь, маршрутизированный через app/page.tsx/routing.ts, попал бы на '/trips'. Несогласованная посадочная страница для водителя.
- **Направление фикса:** Удалить локальные ROLE_ROUTES/ROLE_PRIORITY/pickRouteForRoles в login/page.tsx и импортировать единственный источник из @/lib/routing. Заодно решить, какой роут для driver канонический ('/trips'), и зафиксировать его в одном месте.
- **Верификация:** Подтверждено: login/page.tsx:26 'driver: "/"' с локальной pickRouteForRoles (стр.43-48); routing.ts:18 'driver: "/trips"', комментарий стр.3 заявляет mirror. Карты разошлись.

#### [P1][HIGH] `apps/web/src/app/logist/components/CreateTripModal.tsx:152-186`
**Two-step trip creation (POST /trips → POST /trips/{id}/assign) has no rollback — orphaned unassigned trips left in DB on assign failure**  _(сегмент: web-dispatcher, data-integrity)_

- **Что не так:** Step 1 (line 152) creates the trip. Step 2 (line 162) assigns vehicle+driver. The catch block at line 182 only calls `setError` and `setSubmitting(false)` — no DELETE of the created trip on step-2 failure.
- **Воспроизведение:** Intercept /trips/{id}/assign to return 409; observe trip record exists in DB unassigned after modal error.
- **Направление фикса:** On assign failure call DELETE /trips/{tripId} as compensation before surfacing the error, or use a single atomic endpoint.
- **Верификация:** Confirmed: catch at line 182-186 has no cleanup call. Trip ID is available as `tripId` (line 157) but is not used in the error path.

#### [P1][HIGH] `apps/web/src/app/logist/page.tsx:133-145`
**dateFrom/dateTo filters in OrderFilters are collected but never applied — date range filter is completely dead**  _(сегмент: web-dispatcher, correctness)_

- **Что не так:** State at lines 99-103 stores `dateFrom`/`dateTo`. `filteredOrders` at lines 133-145 only branches on `contractorId` and `search` — no date comparison exists.
- **Воспроизведение:** Logist Заявки → Фильтры → set date range excluding all orders → all orders still displayed.
- **Направление фикса:** Add date-range comparison in `filteredOrders` against `order.createdAt` or `loadingDate`.
- **Верификация:** Confirmed: lines 133-145 show only contractorId and search branches; `activeFilters.dateFrom`/`dateTo` are stored but never read in the filter computation.

#### [P1][HIGH] `apps/web/src/app/medic/page.tsx:350-398`
**Медосмотр можно отправить с положительным алкотестом и decision='approved' — нет серверной guard-проверки**  _(сегмент: web-repair-med, correctness)_

- **Что не так:** createMedInspection (service.ts:542-625) не вызывает classifyMedInspection и не проверяет `alcoholTest === 'positive' && decision === 'approved'`. Запись создаётся с такими данными. classifiers.ts:104 устанавливает shouldBlockDriver=true, но эта функция нигде не вызывается в create-flow.
- **Воспроизведение:** POST /api/inspections/med {alcoholTest:'positive', decision:'approved'} → 201, запись сохраняется.
- **Направление фикса:** В createMedInspection добавить: `if (input.alcoholTest === 'positive' && input.decision === 'approved') throw new Error(...)`. Клиент — дополнительный UI-guard.
- **Верификация:** service.ts:542-625 не содержит вызова classifyMedInspection и нет проверки alcohol+approved комбинации. classifiers.ts существует только для downstream-логики.

#### [P1][HIGH] `apps/web/src/app/print/act/[id]/page.tsx:129, 134`
**АКТ ВЫПОЛНЕННЫХ РАБОТ: хардкод «НДС 20%» не исправлен — P1-A частично открыт**  _(сегмент: web-print-waybills, correctness)_

- **Что не так:** Строка 129: `<span>НДС 20%:</span>`, строка 134: `'НДС 20% включён'` — статически захардкожены. invoice/[id]/page.tsx (строки 80-83) уже применяет динамический vatRateNum/vatLabel/hasVat из inv.vatRate, но act/[id]/page.tsx этого исправления не получил. P1-A закрыт только для invoice, не для act.
- **Воспроизведение:** Создать счёт типа 'act' с vatRate=0, открыть /print/act/{id} — блок «Итого» покажет «НДС 20%» и «НДС 20% включён» вместо «Без НДС».
- **Направление фикса:** По аналогии с invoice/[id]/page.tsx: вычислить vatRateNum = Number(inv.vatRate ?? 0), hasVat = vatRateNum > 0 && vatAmountNum > 0, vatLabel = hasVat ? `НДС ${vatRateNum}%` : 'Без НДС', использовать в обоих местах.
- **Верификация:** Код подтверждён: line 129 `<span>НДС 20%:</span>`, line 134 `'НДС 20% включён'`. invoice/[id]/page.tsx line 83 уже содержит vatLabel-паттерн — act его не получил.

#### [P1][HIGH] `apps/web/src/app/repair/components/RepairKanban.tsx:1252-1264, 1266-1279`
**handlePlanParts и handleReceiveParts выполняют updateRepair + changeStatus двумя последовательными запросами без транзакции**  _(сегмент: web-repair-med, data-integrity)_

- **Что не так:** RepairKanban.tsx:1255-1256: `await updateRepair(...)` затем `await changeStatus(...)` — два независимых HTTP-запроса. При сбое второго partsUsed сохранятся, статус не изменится. Аналогично в строках 1270-1271.
- **Воспроизведение:** В DevTools заблокировать второй запрос (changeStatus) → partsUsed записаны, статус не изменён.
- **Направление фикса:** Объединить в один эндпоинт PUT /repairs/:id/transition с транзакционным обновлением partsUsed + статуса.
- **Верификация:** RepairKanban.tsx:1255-1256 и 1270-1271 — два последовательных await без shared transaction подтверждены.

#### [P1][HIGH] `apps/web/src/app/repair/page.tsx:86-99`
**Список механиков грузится через /auth/users и фильтруется клиент-сайд — утечка полного списка пользователей организации в браузер**  _(сегмент: web-repair-med, security)_

- **Что не так:** page.tsx:92: `api.get('/auth/users')` — без параметров, возвращает всех пользователей org. page.tsx:88-91: TODO-комментарий это явно фиксирует. Браузер получает fullName/email/roles всех участников организации.
- **Воспроизведение:** Войти с ролью repair_service, открыть /repair → Новая заявка, DevTools → /auth/users показывает всех пользователей org.
- **Направление фикса:** Серверный фильтр `?roles=mechanic,repair_service` или отдельный эндпоинт /fleet/mechanics.
- **Верификация:** Строка 92 подтверждена: `api.get('/auth/users')` без фильтра. Комментарий строки 88-91 признаёт проблему как TODO.

#### [P1][HIGH] `apps/web/src/app/trips/[id]/components/SignTitleButton.tsx:352-384`
**МЧД: истёкшие доверенности не фильтруются и не блокируются на стороне клиента**  _(сегмент: web-trips, unfinished)_

- **Что не так:** В блоке рендера кандидатов (строки 349-385) нет ни одной проверки c.expiresAt против текущей даты и c.status !== 'active'. Поле expiresAt отображается (строка 380) как информация, но не используется для disabled/фильтрации.
- **Воспроизведение:** Создать МЧД с expiresAt в прошлом, открыть SignTitleButton — просроченная МЧД доступна для выбора наравне с действующей.
- **Направление фикса:** Фильтровать candidates: `const isExpired = new Date(c.expiresAt) < new Date()` — disabled радиокнопка или скрытие записи.
- **Верификация:** Строки 349-386 не содержат фильтрации по expiresAt/status. Отображается только дата (строка 380), без блокировки.

#### [P1][HIGH] `apps/web/src/app/trips/page.tsx:2293-2330`
**N+1: один GET /trips/:id на каждый рейс при загрузке списка**  _(сегмент: web-trips, performance)_

- **Что не так:** useEffect (строка 2284) запускает Promise.allSettled(trips.map(trip => api.get('/trips/' + trip.id))) — подтверждено: при limit=100 это 100 параллельных запросов. Далее для cold-chain рейсов ещё столько же GET /trips/:id/temperature-summary (строка 2325). Всё воспроизводится при каждом вызове loadTrips.
- **Воспроизведение:** Открыть /trips с 50+ рейсами, DevTools Network показывает ~50 одновременных GET /api/trips/{uuid}.
- **Направление фикса:** Добавить поля orderNumbers[] и coldChainSummary в ответ GET /trips (JOIN на backend), убрать N+1-useEffect.
- **Верификация:** Строки 2293-2294 и 2325-2327 явно подтверждают паттерн. Никакого батч-endpoint или включения данных в список не обнаружено.

#### [P1][HIGH] `apps/web/src/app/trips/page.tsx:1639-1644`
**Жёсткое указание signerRole='dispatcher' и signerName='Оператор ТрансПульт' для любого пользователя**  _(сегмент: web-trips, security)_

- **Что не так:** Строки 1640-1641: `signerRole: 'dispatcher', signerName: 'Оператор ТрансПульт'` — хардкод без обращения к useUser(). Аналогично для recordDocumentRefusal (строки 1661-1662). Любой пользователь из ALLOWED_ROLES (manager, logist, admin) запишет подпись с ложной ролью dispatcher в аудит-журнал.
- **Воспроизведение:** Залогиниться как manager, подписать транспортный документ — в журнале подписей будет signerRole=dispatcher вместо manager.
- **Направление фикса:** Использовать user.fullName и user.roles[0] из useUser(); на бэкенде дополнительно валидировать signerRole против JWT-роли.
- **Верификация:** Код строк 1639-1644 и 1661-1662 явно содержит хардкод. Вызова useUser() в функции recordDocumentSignature нет.

#### [P1][HIGH] `apps/web/src/app/trips/page.tsx:2406-2408`
**Поисковый запрос не URL-кодируется — инъекция query-параметров**  _(сегмент: web-trips, correctness)_

- **Что не так:** Строка 2408: `url += '&search=' + debouncedSearch` без encodeURIComponent. При вводе '&status=cancelled' результирующий URL получает второй параметр status, обходящий UI-фильтр статуса.
- **Воспроизведение:** В поле поиска ввести '&status=cancelled' — список покажет отменённые рейсы независимо от выбранного фильтра.
- **Направление фикса:** Заменить на encodeURIComponent(debouncedSearch).
- **Верификация:** Строка 2408 подтверждает конкатенацию без кодирования. Атака на инъекцию параметров воспроизводима.

#### [P1][HIGH] `apps/web/src/components/TemperaturePanel.tsx:80`
**Mock-tick кнопка показывается dispatcher, но API пускает только admin — client-side RBAC расходится с сервером**  _(сегмент: web-components-2, security)_

- **Что не так:** TemperaturePanel.tsx:80 `isAdmin = user?.roles?.some((r) => r === 'admin' || r === 'dispatcher')` включает dispatcher. Кнопка Mock tick рендерится при `isAdmin` (line 223). API route cold-chain/routes.ts:154 `if (!isAdmin(user))` где `isAdmin = user.roles.includes('admin')` — dispatcher отклоняется. Расхождение подтверждено кодом.
- **Воспроизведение:** Войти как dispatcher, открыть рейс с TemperaturePanel, увидеть кнопку Mock tick, нажать — 403.
- **Направление фикса:** Убрать 'dispatcher' из условия isAdmin в TemperaturePanel.tsx:80, оставить только 'admin'. Либо расширить API-гейт на dispatcher — по бизнес-решению.
- **Верификация:** Строка 80 подтверждена: `r === 'admin' || r === 'dispatcher'`. API routes.ts:39-40 подтверждён: `return user.roles.includes('admin')` — только admin.

#### [P1][HIGH] `packages/shared/src/schemas.ts:116`
**VehicleSchema.plateNumber regex отвергает ВСЕ валидные госномера РФ (двойной бэкслеш вместо \d)**  -> /transpult  _(сегмент: shared, correctness)_

- **Что не так:** regex-литерал на строке 116 использует `\\d` (два бэкслеша): паттерн требует литеральный '\d', а не три цифры. Любой реальный госномер (A123BC77 / М123АА77) не пройдёт. VehicleCreateSchema наследует plateNumber и используется на POST/PUT vehicle — HTTP 400 на любой постановке ТС.
- **Воспроизведение:** POST /api/fleet/vehicles с plateNumber:'А123ВС77' -> 400 invalid plateNumber. node: /^[A-ZА-Я]\\d{3}[A-ZА-Я]{2}\\d{2,3}$/i.test('A123BC77') === false.
- **Направление фикса:** Заменить `\\d` на `\d` в обоих местах. Корректно: /^[A-ZА-Я]\d{3}[A-ZА-Я]{2}\d{2,3}$/i + unit-тест.
- **Верификация:** Строка 116 буквально: regex(/^[A-ZА-Я]\\d{3}[A-ZА-Я]{2}\\d{2,3}$/i ... 'Неверный формат госномера'). Двойной бэкслеш подтверждён, баг воспроизводится.

#### [P1][MEDIUM] `apps/mobile/src/api/offlineQueue.ts:149-206 (replayQueue), 208-221 (setupAutoReplay)`
**replayQueue без блокировки конкуренции → двойная отправка и перезапись/потеря очереди**  -> /transpult  _(сегмент: mobile-data, data-integrity)_

- **Что не так:** Нет ни in-flight флага, ни мьютекса. setupAutoReplay подписан на NetInfo и вызывает replayQueue при КАЖДОМ событии connected (NetInfo легко эмитит несколько подряд при переключении wifi/cellular). Экраны/AuthContext тоже могут инициировать реплей. Два параллельных replayQueue: оба делают getQueue() (один снимок), оба POST'ят те же действия (двойная отправка; для temperature — двойной insert, см. соседнюю находку), и оба в конце пишут setItem(QUEUE_KEY, remaining). Последний writer затирает результат первого — действия, успешно отправленные в одном проходе, могут вернуться (повторная отправка) или, наоборот, потеряться из remaining (потеря неотправленного). Read-modify-write по AsyncStorage не атомарен.
- **Воспроизведение:** 1) Накопить очередь offline. 2) Эмулировать быстрый flap сети (несколько connected подряд) либо одновременно дернуть реплей из автозамены и из экрана. 3) Наблюдать дубли запросов на сервере и/или несогласованную итоговую очередь.
- **Направление фикса:** Ввести модульный флаг isReplaying (или promise-singleton): если реплей уже идёт — второй вызов возвращает текущий promise / no-op. Идеально — сериализовать весь read-modify-write очереди через единую async-очередь.
- **Верификация:** Подтверждено: replayQueue (149-206) не имеет in-flight guard; getQueue snapshot:155, финальный setItem(remaining):203 — последний writer затирает. setupAutoReplay:209 вызывает replayQueue на каждом connected-событии NetInfo. Race реален; MEDIUM т.к. зависит от частоты NetInfo-событий.


## P2 — средний: UX / качество / латентное (135)


### api-auth
- **[HIGH]** `apps/api/src/auth/auth.ts:1377, 1567` -> /transpult — **Non-null assertion на organizationId в signup/resend для legacy-юзеров без org** — В signup (стр.1377 `orgId = existing.organizationId!`) и resend-code (стр.1567 `user.organizationId!`) используется `!` на поле, которое схемой допускает null (users.organizationId nullable, schema.ts:239). Для legacy/мигрированного пользов… _(error-handling; api-auth,api-onboarding)_
- **[MEDIUM]** `apps/api/src/auth/auth.ts:1536-1560` -> /transpult — **resend-code: ранний return для несуществующего/верифицированного email до cooldown+email — таймингový side-channel enumeration** — Ответ-строка унифицирована (eligibleResponse), это закрывает контентную утечку. Но путь выполнения для НЕ-eligible (нет юзера / уже верифицирован) выходит сразу после одного SELECT (стр.1545), тогда как eligible-путь делает ещё один SELECT … _(security; api-auth)_
- **[MEDIUM]** `apps/api/src/integrations/websocket.ts:154` -> /transpult — **WebSocket-канал проверяет JWT через jwt.verify без сверки token_version/isActive — E6 revocation не действует на WS** — WS-handler делает `app.jwt.verify(token)` и читает roles/organizationId, но НЕ сверяет token_version с БД и не проверяет isActive (в отличие от HTTP-пути authenticate в auth.ts:135-139). ws-token живёт 5 минут и подписывается без tv (auth.t… _(security; api-auth)_

### api-billing
- **[MEDIUM]** `apps/api/src/modules/billing/service.ts:249,252` -> /transpult — **Поиск платежа по providerPaymentId с limit(1) при неуникальном индексе** — Вебхук находит платёж через eq(payments.providerPaymentId, payload.externalId).limit(1).for('update'). В схеме (db/schema.ts:1845) на provider_payment_id стоит ОБЫЧНЫЙ index('idx_payments_provider_id'), не uniqueIndex. Если появятся две pay… _(data-integrity; api-billing)_

### api-db
- **[HIGH]** `apps/api/drizzle/0036_invoice_schema_rebuild.sql:250-281 (check_invoice_orders_sum / invoice_orders_sum_check)` -> /transpult — **Deferred-триггер суммы invoice_orders проверяет только allocated_amount=total, но НЕ allocated_vat против vat_amount** — check_invoice_orders_sum валидирует abs(SUM(allocated_amount) - invoice.total) <= 0.01, но SUM(allocated_vat) нигде не сверяется с invoices.vat_amount. Учитывая историю F1 (нулевой НДС на выпущенных СФ), отсутствие DB-инварианта на НДС по п… _(data-integrity; api-db)_
- **[MEDIUM]** `apps/api/drizzle/0039_per_org_unique_invoice_number_event_external_id.sql:20-21 (idx_invoices_org_number); 27-28 (idx_events_org_external_id)` -> /transpult — **Per-org unique индексы по nullable organization_id: NULL-строки теряют любую уникальность (номер счёта / idempotency)** — В Postgres NULL в unique-индексе считается distinct, поэтому UNIQUE(payee_organization_id, number) НЕ ограничивает строки с payee_organization_id IS NULL. invoices.payee_organization_id nullable (schema.ts:920), старый глобальный invoices_n… _(data-integrity; api-db)_

### api-documents
- **[HIGH]** `apps/api/src/modules/documents/pdf-base.ts:167-175` -> /transpult — **Вертикальные линии таблицы рисуются неверно при переносе на следующую страницу (drawTable page-break)** — После page-break (line 156-159) `y` сброшен в MARGIN, но вертикальные линии (lines 168, 173) вычисляют startY как `doc.y - (rows.length * rowH + headerH + 2)`. doc.y в этот момент равен последней позиции курсора после .text() в цикле (не об… _(correctness; api-documents)_
- **[HIGH]** `apps/api/src/modules/documents/routes.ts:179` -> /transpult — **buildNotes в PUT /document-returns/:id аккумулирует semantic-теги при повторных обновлениях** — buildNotes (line 48-51) просто join'ит непустые части через ' | '. На line 179: `buildNotes([semanticTag, parsed.data.notes ?? existing.notes])` — если notes не передан, берётся `existing.notes`, которое уже содержит предыдущий semantic-тег… _(correctness; api-documents)_
- **[HIGH]** `apps/api/src/modules/documents/routes.ts:97-100` -> /transpult — **Лишний SELECT trips в POST /trips/:id/document-returns после assertTripAccess (TOCTOU + избыточный запрос)** — Line 90: assertTripAccess(id, user) уже верифицирует существование рейса. Line 97-100: второй `db.select({ id: trips.id }).from(trips).where(eq(trips.id, id)).limit(1)` — избыточный запрос, создаёт TOCTOU-окно. _(data-integrity; api-documents)_
- **[HIGH]** `apps/api/src/modules/inspections/routes.ts:467, 489` -> /transpult — **error.message из DB/PDFKit утекает в ответ клиенту в PDF-эндпоинтах техосмотра и медосмотра** — routes.ts:467 `reply.status(error.statusCode || 500).send({ success: false, error: error.message || 'Ошибка генерации PDF' })` — error.message без санитизации. Аналогично строка 489. _(error-handling; api-documents)_

### api-edi
- **[MEDIUM]** `apps/api/src/modules/compliance/osago/routes.ts:24-58` -> transpult — **OSAGO single-check без role-гейта — любой член орг дёргает внешнего провайдера и пишет osago_checks** — GET /compliance/osago/check/:vehicleId ограничен только org-scope ТС и feature 'osago_monitoring', но не имеет role-гейта. В отличие от marking (MARKING_WRITE_ROLES) и tachograph (admin/manager/mechanic), здесь driver/medic могут инициирова… _(security; api-edi)_
- **[MEDIUM]** `apps/api/src/modules/compliance/tachograph/service.ts:63-76` -> transpult — **Повторная загрузка того же .DDD дублирует tachograph_records (нет идемпотентности/upsert)** — ingestDddBuffer в цикле делает db.insert(tachographRecords) по дням без уникального ключа (driverId+date+source) и без проверки существующих записей. Повторная загрузка того же файла (или перекрывающего периода) удвоит посуточные drivingMin… _(data-integrity; api-edi)_
- **[MEDIUM]** `apps/api/src/modules/edi/routes.ts:142-151` -> transpult — **EDI webhook без auth/HMAC логирует произвольный неаутентифицированный body на уровне info** — POST /edi/webhook/:provider не имеет preHandler (нет authenticate, нет проверки HMAC/TLS-cert) и логирует весь request.body через request.log.info. Сейчас это no-op-заглушка (не мутирует БД), но открытый неаутентифицированный эндпоинт позво… _(security; api-edi)_
- **[MEDIUM]** `apps/api/src/providers/edi/diadoc.ts:94-98` -> transpult — **Diadoc.handleCallback маппит любое событие 'Sign' в signed_by_client, пропуская стадию перевозчика** — eventType==='Sign' → status='signed_by_client' безусловно. В Диадоке событие подписи приходит и при подписании перевозчиком, и клиентом; маппинг всегда выставляет финальный 'signed_by_client', что для ЭТрН перепрыгивает обязательную стадию … _(correctness; api-edi)_

### api-finance-core
- **[HIGH]** `apps/api/src/modules/finance/finance.service.ts:880` -> /transpult — **Несогласованный префикс номера: tryAutoCreateInvoice печатает INV- для type='payment', а workflow — СЧ-** — tryAutoCreateInvoice insert type='payment' (888), но номер getNextInvoiceNumber('invoice') → префикс INV- (118). Тот же type='payment' через workflow createDraftInvoice → СЧ- (invoice-workflow.ts:87). Для одного invoice_type две параллельны… _(data-integrity; api-finance-core)_
- **[HIGH]** `apps/api/src/modules/finance/routes.ts:116,208,247,507,602,817,887,924,956,1011,1050,1085,1107,1136` -> /transpult — **Raw error.message клиенту во множестве finance-роутов (утечка PG-constraint/внутренних деталей)** — Систематический паттерн reply.code(400/500).send({success:false, error: error.message}) проксирует исходный текст исключения. При ошибке БД (enum violation invoice_type, FK, unique idx_invoices_org_number) клиент получает PG-текст с именами… _(error-handling; api-finance-core)_
- **[MEDIUM]** `apps/api/src/modules/finance/finance.service.ts:139-161` -> /transpult — **generateInvoices не проверяет принадлежность params.contractorId организации actor'а** — Org-фильтр применён только к рейсам через vehicles.organizationId (152-156), params.contractorId не валидируется на user.organizationId. Cross-tenant утечки нет (org-фильтрованный join вернёт 0 строк для чужого контрагента), но счёт может б… _(security; api-finance-core)_
- **[MEDIUM]** `apps/api/src/modules/finance/finance.service.ts:472-506` -> /transpult — **createAdjustment пересчитывает total игнорируя статус счёта (можно менять выпущенный/оплаченный) + НДС допуслуги не разносится** — createAdjustment (472) безусловно UPDATE invoices.total (500-502) на любом статусе. Маршрут POST /adjustments (routes.ts:930) гейтится только requireAbility('update','Invoice')+ensureInvoiceAccess, без проверки invoice.status. Для issued/pa… _(correctness; api-finance-core)_

### api-finance-invoice
- **[HIGH]** `apps/api/src/modules/finance/tariff-rules.service.ts:55-65, 84` -> /transpult — **getTripTariff раскрывает тарифные ставки чужого тенанта по tripId** — getTripTariff(tripId) джойнит trips→tripOrders→orders→tariffs по eq(trips.id, tripId) без фильтра organizationId. Роут POST /finance/tariff-rules/evaluate под read Invoice передаёт в evaluateTariffRule только tripId из тела. По UUID чужого … _(security; api-finance-invoice)_
- **[HIGH]** `apps/api/src/modules/finance/xml-export.service.ts:151-160` -> /transpult — **mapInvoiceStatus оперирует устаревшим enum статусов (sent/paid/overdue)** — Функция мапит 'sent'/'paid'/'overdue', которых нет в актуальном invoice-FSM (реальные draft/issued/paid_partial/paid_full/cancelled/corrected). Актуальные issued/paid_full/paid_partial/corrected проваливаются в default: return status → уход… _(layer-drift; api-finance-invoice)_

### api-fleet
- **[HIGH]** `apps/api/src/modules/fleet/routes.ts:329-341` -> /transpult — **GET /fleet/contractors/:id/addresses route is commented out — feature dead-end** — Lines 329-341 are wrapped in `/* ... */`. Service function listContractorAddresses is implemented and org-scoped. POST/PUT/DELETE address routes are active. The GET is unreachable: addresses are write-only from client perspective. _(unfinished; api-fleet)_
- **[HIGH]** `apps/api/src/modules/fleet/routes.ts:111-113, 127-130, 215-217, 429-431` -> /transpult — **Raw err.message from DB / Drizzle sent to client in all fleet catch blocks** — All fleet route catch blocks use `reply.status(400).send({ error: err.message })`. PG errors (enum mismatch, FK violation, unique constraint) contain internal schema info: constraint names, table names, enum type names. Most acute on PUT /f… _(error-handling; api-fleet)_
- **[HIGH]** `apps/api/src/modules/fleet/service.ts:984-1031` -> /transpult — **createFuelRecord: no server-side validation that totalCost = liters × costPerLiter** — FuelRecordCreateSchema (packages/shared/src/schemas.ts lines 1069-1080) validates each field individually (all positive()) but has no .refine() cross-field check. Service lines 990-1003 insert all three values as supplied. Analytics queries… _(correctness; api-fleet)_
- **[HIGH]** `apps/api/src/modules/fleet/validators.ts:46-53` -> /transpult — **validatePlateNumber regex allows mixed Cyrillic+Latin in same position — VIN/plate inconsistency possible** — Line 48 regex character class combines Cyrillic (АВЕКМНОРСТУХ) and Latin (ABEKMHOPCTYX) at each position. A plate 'A000АА77' (Latin A) and 'А000АА77' (Cyrillic А) are different strings — both pass regex and both pass DB unique check since P… _(correctness; api-fleet)_
- **[MEDIUM]** `apps/api/src/modules/fleet/service.ts:380-386` -> /transpult — **getDriver: driver-level fines sub-query has no organization scope** — Lines 381-384: fines query uses only `eq(fines.driverId, id)`. Schema.ts lines 874-891: fines table has no organizationId column (only vehicleId FK and driverId FK). There is no org-scoped join. If a driverId is shared across orgs (data cor… _(security; api-fleet)_

### api-integrations
- **[MEDIUM]** `apps/api/src/integrations/telegram.service.ts:95-164,177` -> /transpult — **HTML-инъекция в Telegram-уведомления: данные события вставляются в parse_mode=HTML без экранирования** — formatEventMessage подставляет произвольные пользовательские поля (d.reason, d.description, d.number, d.driverName, d.vehiclePlate, d.fromCity/toCity, d.priority) прямо в HTML-шаблон, а sendMessage по умолчанию шлёт parse_mode='HTML' (строк… _(security; api-integrations)_
- **[MEDIUM]** `apps/api/src/integrations/workers/fines.worker.ts:71-78` -> /transpult — **Импортированные штрафы не имеют organizationId (нет колонки) — изоляция только через vehicleId** — Таблица fines (schema.ts:874) НЕ содержит organizationId — только vehicleId/driverId. fines.worker сканит ВСЕ ТС всех орг и вставляет штрафы без org-тега. Изоляция штрафов целиком зависит от join fines->vehicles->organizationId на каждом re… _(data-integrity; api-integrations)_

### api-misc1
- **[HIGH]** `apps/api/src/modules/analytics/routes.ts:67-130` — **GET /analytics/maintenance-alerts: duplicate 'maintenance' alerts per vehicle when maintenanceNextDate is set** — Line 68 adds a 'maintenance' alert via dateChecks for `v.maintenanceNextDate`. Lines 110/113-129 compute `plannedMaintenanceDate = nextMaintenancePlan?.plannedDate ?? v.maintenanceNextDate` and emit another 'maintenance' alert. When no plan… _(correctness; api-misc1)_
- **[HIGH]** `apps/api/src/modules/analytics/routes.ts:249-256` — **GET /analytics/profitability: tenant filter uses vehicles.organizationId subquery instead of trips.organizationId** — Line 251 uses `inArray(trips.vehicleId, db.select({id:vehicles.id}).from(vehicles).where(eq(vehicles.organizationId, orgId)))`. Trips with vehicleId=null (subcontractor mode) are silently excluded. trips.organizationId exists and is the cor… _(correctness; api-misc1)_
- **[HIGH]** `apps/api/src/modules/claims/routes.ts:128` — **Mojibake in /claims/exposure 403 error message for client role** — Line 128 contains `'Ð ÑœÐ ÂµÐ¡â€š Ð Ñ—...'` — CP1251 bytes incorrectly interpreted as UTF-8. The same message at line 96 is correct UTF-8: 'Нет привязки к контрагенту'. _(correctness; api-misc1,web-client-orders)_
- **[HIGH]** `apps/api/src/modules/copilot/service.ts:337-340` — **copilot chat(): raw Error.message emitted to client SSE stream on internal errors** — Lines 337-339: `const message = err instanceof Error ? err.message : 'Internal error'; emit({ type: 'error', error: message })`. DB connection errors, PG errors, and Anthropic SDK errors expose internal details via SSE. _(error-handling; api-misc1)_
- **[HIGH]** `apps/api/src/modules/copilot/tools/index.ts:365-370` — **list_pending_invoices copilot tool: org filter on contractors.organizationId instead of invoices.payeeOrganizationId** — Line 369 filters by `eq(contractors.organizationId, ctx.organizationId)` joined to invoices. The correct tenant scope for invoices is `payeeOrganizationId`. Contractors with null organizationId (legacy) or cross-org assignments cause missed… _(correctness; api-misc1)_
- **[HIGH]** `apps/api/src/modules/import/routes.ts:128-184` — **import/drivers: non-atomic partial commit — successful driver rows are persisted even when later rows fail** — Each driver row runs in its own `db.transaction` (line 136) inside a for-loop. Failure at row N leaves rows 1..N-1 committed. Vehicles/contractors/orders all use a single outer transaction for atomicity. _(data-integrity; api-misc1)_

### api-misc2
- **[HIGH]** `apps/api/src/modules/notifications/routes.ts:183-186` — **POST /telegram/test broadcast: sequential for-loop over all subscriptions — blocks request handler for large subscriber counts** — Confirmed: lines 183-186 `for (const sub of subs) { await sendMessage(...) }` is a sequential async loop. Each sendMessage is an outbound HTTP call. With many subscribers this blocks the handler for N * timeout seconds, and if Fastify's req… _(performance; api-misc2)_
- **[HIGH]** `apps/api/src/modules/sprint9/routes.ts:66-67 (GET /fleet/trailers)` — **GET /fleet/trailers: users without organizationId get an unscoped trailer list — all-tenants data leak for unattached users** — Confirmed: line 68 `if (user.organizationId) conditions.push(...)` — if organizationId is null, the org filter is skipped entirely. With no other conditions, where is undefined and the query returns all trailers. Same pattern exists for GET… _(correctness; api-misc2)_
- **[HIGH]** `apps/api/src/modules/sync/service.ts:10-16 (SyncEvent type), route: 99, 185` — **sync/service processSyncEvents never passes organizationId to recordEvent — events land without org scope** — Confirmed: journal.ts:38-50 shows the orgId lookup fallback — it fires a SELECT users WHERE id=authorId for every call where organizationId is undefined. In a batch of 100 events this adds 100+ sequential DB round-trips. The subcontract org… _(correctness; api-misc2)_
- **[MEDIUM]** `apps/api/src/utils/timezone.ts:29-36` — **getBusinessDayBounds: uses toLocaleString round-trip to construct timezone-aware Date — platform-dependent behavior** — Confirmed: timezone.ts:29-35 constructs dates via `new Date(dateInTz + 'T00:00:00').toLocaleString('en-US', {timeZone})` then passes that string to `new Date(locStr)`. This relies on Node.js parsing 'M/D/YYYY, H:MM:SS AM' locale strings, wh… _(correctness; api-misc2)_

### api-onboarding
- **[HIGH]** `apps/api/src/modules/demo/service.ts:264, 286, 310, 332` — **generateDemoData — same-millisecond Date.now() produces duplicate order/trip numbers (unique constraint violation)** — Confirmed: lines 264, 310 use `DEMO-${Date.now().toString().slice(-6)}-1/2` for orders, lines 286, 332 use `DEMO-T-${Date.now().toString().slice(-6)}-1/2` for trips. All inserts execute in the same event-loop tick. Cross-org concurrent call… _(data-integrity; api-onboarding)_
- **[HIGH]** `apps/api/src/modules/onboarding/routes.ts:141` — **POST /onboarding/profile — onboardingStep always set to 2, regresses users on later steps** — Confirmed: line 141 is `onboardingStep: Math.max(2, 0)` — a constant expression always equal to 2. No read of the current org's step occurs before the UPDATE, so an admin who has advanced to step 5 and re-submits profile will have their ste… _(correctness; api-onboarding)_
- **[HIGH]** `apps/api/src/modules/settings/service.ts:107-130` — **updateCostModelSettings — SELECT-then-INSERT upsert outside transaction; race yields duplicate key error** — Confirmed: lines 107-130 iterate patches with a SELECT (line 108-111) then conditional UPDATE or INSERT (lines 113-129). No transaction wraps the loop. Two concurrent PUT /settings/cost-model for a fresh org will both see existing=null and … _(data-integrity; api-onboarding)_

### api-opcore
- **[HIGH]** `apps/api/src/db/schema.ts:1112 (uniqueIndex('idx_events_external_id').on(table.externalId))` -> /transpult — **Drizzle-schema events.externalId всё ещё single-column global unique — рассинхрон с миграцией 0039 (composite per-org)** — Миграция 0039 (apps/api/drizzle/0039_*.sql:26-28) делает DROP INDEX idx_events_external_id и CREATE UNIQUE idx_events_org_external_id ON events(organization_id, external_id). Но schema.ts по-прежнему объявляет uniqueIndex('idx_events_extern… _(layer-drift; api-opcore,api-db)_
- **[MEDIUM]** `apps/api/src/modules/operational-core/execution-routes.ts:70` -> /transpult — **Raw err.message из сервиса/драйвера БД отдаётся клиенту в ответе** — catch отдаёт error: err.message напрямую. Доменные ошибки безопасны, но в транзакции recordExecutionEvent возможны PG-ошибки (constraint, FK, тип), чьё .message содержит имена таблиц/столбцов/значения. Раскрывает структуру БД и может включа… _(error-handling; api-opcore)_
- **[MEDIUM]** `apps/api/src/modules/operational-core/write-service.ts:118-122` -> /transpult — **Повторное назначение того же лота на тот же рейс: capacity-проверка лота двойным счётом существующего assignment** — assignLotToTrip использует onConflictDoUpdate по target (tripId, shipmentLotId) → повторный POST для существующей пары ОБНОВЛЯЕТ запись. Но проверка на 118-120 суммирует sum(assignedWeightKg) where status != cancelled по лоту, включая СУЩЕС… _(correctness; api-opcore)_

### api-orders
- **[HIGH]** `apps/api/src/modules/operations/exceptions-service.ts:148–242` — **N+1 в listOperationExceptions: 4+ последовательных await на каждый рейс** — Строки 148–241: for-цикл по до 100 рейсам, внутри последовательно: getTripCompatibility (149), syncTransportDocumentsForTrip (167), syncDossierItemsForTrip (168), getDossierItemsForTrip (173), claimsService.exposure (215) — все await послед… _(performance; api-orders)_
- **[HIGH]** `apps/api/src/modules/operations/routes.ts:42–44` — **ReplaceTripResourcesSchema.refine всегда проходит при trailerId: null** — Строка 42: `value.vehicleId || value.driverId || value.trailerId !== undefined`. При `{ trailerId: null }`: `null !== undefined` = true → refine проходит. trip-change-service.ts:221: `!input.vehicleId && !input.driverId && input.trailerId =… _(correctness; api-orders)_
- **[HIGH]** `apps/api/src/modules/operations/trip-change-service.ts:381–384` — **cancelTripAfterArrival отменяет рейс по умолчанию при отсутствии поля cancelTrip** — Строка 382: `input.cancelTrip === false ? trip.status : 'cancelled'`. При `cancelTrip === undefined` условие ложно → статус 'cancelled'. Opt-out вместо opt-in для деструктивного действия. _(correctness; api-orders)_
- **[HIGH]** `apps/api/src/modules/orders/routes.ts:367-369` — **GET /orders/:id/ttn возвращает сырое error.message клиенту при 500** — строка 369: reply.status(500).send({ error: error.message }) — необработанное сообщение об ошибке передаётся клиенту напрямую. Может содержать пути файловой системы, SQL-детали. Остальные catch в файле бросают ошибку дальше (глобальный hand… _(error-handling; api-orders,web-client-orders)_
- **[MEDIUM]** `apps/api/src/modules/orders/service.ts:19–37` — **generateOrderNumber без row-level lock: race condition при высоком параллелизме** — Строки 24–29: SELECT max(number) без advisory lock. Retry (строки 169–176) обрабатывает коллизии через UNIQUE constraint, но при 3 одновременных запросах третья попытка (attempt=2) бросает неинформативный Error без доп. контекста для пользо… _(data-integrity; api-orders)_

### api-providers
- **[HIGH]** `apps/api/src/providers/payment/tinkoff.ts:57-64` -> /transpult — **healthCheck возвращает ok:true при заглушечных методах (go-live капкан) — фикс PROV-P0-2 применён частично** — Фикс ok:false применили к yookassa и др., но tinkoff.healthCheck возвращает ok:Boolean(terminalKey&&password) detail 'tinkoff credentials present', тогда как createPayment/getPayment/refund кидают 'not yet implemented'. То же в ofd/ofd-ru.t… _(unfinished; api-providers)_

### api-repairs-insp
- **[HIGH]** `apps/api/src/modules/cold-chain/service.ts:44-60` -> /transpult — **resolveTripSla accepts orderId without verifying the order belongs to the trip — allows SLA spoofing** — Lines 46-53: query is `WHERE orders.id = orderId` with no `orders.tripId = tripId` or trip_orders join check. A caller can supply an orderId from a different trip to skew breach detection. _(security; api-repairs-insp)_
- **[HIGH]** `apps/api/src/modules/inspections/classifiers.ts:117-157` -> /transpult — **validateDecisionUpdate and classifyTechInspection/classifyMedInspection are implemented but never called by routes or service** — Grep confirms zero imports of these functions in service.ts and routes.ts (only in classifiers.test.ts). Decision rejections proceed without note validation. Mechanic can mark approved with critical faults and vehicle is not blocked, no rep… _(unfinished; api-repairs-insp)_
- **[HIGH]** `apps/api/src/modules/inspections/routes.ts:301` -> /transpult — **Garbled mojibake error string in GET /inspections/med/expiring-certificates** — Line 301 contains the literal string '?????? ?????? ??? ??????' — Cyrillic characters stored as replacement question marks. The 403 response returns this unreadable string to the client. _(error-handling; api-repairs-insp)_
- **[HIGH]** `apps/api/src/modules/inspections/service.ts:829-846, 851-868` -> /transpult — **hasValidTechInspectionToday and hasValidMedInspectionToday lack inspectionType='pre_trip' filter — post-trip inspection falsely satisfies pre-trip gate** — Both functions query for any approved inspection today without filtering inspectionType. A post-trip inspection would return true. However, grep confirms these functions are never imported or called anywhere outside the test file — the bug … _(correctness; api-repairs-insp)_
- **[HIGH]** `apps/api/src/modules/repairs/service.ts:874-931` -> /transpult — **checkScheduledMaintenance is exported but never called — scheduled ТО auto-creation is dead code with a TOCTOU race** — Grep of entire apps/api/src confirms function is only defined at service.ts:874, never imported or called. Existence check at lines 903-915 and createRepair at line 918 are not in a transaction — TOCTOU race possible on concurrent calls. cr… _(unfinished; api-repairs-insp)_
- **[HIGH]** `apps/api/src/modules/repairs/service.ts:244-298` -> /transpult — **ensureRepairPartCatalogHydrated is called on every read — no concurrency guard means parallel requests can trigger multiple full-table hydration inserts** — LIMIT 1 check at line 245 is not atomic with the subsequent INSERT. Two concurrent first-time requests both see empty table and both attempt to insert. `createCatalogCode` fallback at line 241 uses `Date.now()` — two runs on nameless parts … _(data-integrity; api-repairs-insp)_

### api-signatures
- **[HIGH]** `apps/api/src/modules/signatures/sign-endpoint.ts:302-343` -> /transpult — **POST /sign: read-modify-write metadata без транзакции + перезапись externalId — race и orphan in-flight подписи** — Хендлер читает doc.metadata (строка 302), мерджит pendingSignatures/signatureState и делает db.update вне транзакции (335-343). Два параллельных POST /sign по одному документу: оба читают одну metadata, оба пишут — last-write-wins теряет pe… _(data-integrity; api-signatures)_
- **[MEDIUM]** `apps/api/src/modules/mchd/routes.ts:294-304` -> /transpult — **POST /mchd: глобально-уникальный mchd_number → cross-tenant existence oracle через 409** — schema.ts:1874 mchd_number .notNull().unique() — уникальность ГЛОБАЛЬНАЯ, не per-org. При вставке дубля catch (296-301) возвращает 409 'МЧД с таким номером уже зарегистрирована'. Любой admin org B, перебирая номера МЧД (формат ФНС предсказу… _(security; api-signatures)_
- **[MEDIUM]** `apps/api/src/modules/signatures/gosklyuch-callback.ts:286-356` -> /transpult — **signatureState.status — единый скаляр на многотитульный документ: подпись одного титула помечает весь документ 'signed'** — ЭТрН содержит несколько титулов (T01/T02/T05/T06), каждый подписывается отдельным игроком (грузоотправитель/перевозчик/грузополучатель). Callback на КАЖДУЮ подпись перезаписывает глобальные signatureState.status='signed', .titleType, .provi… _(correctness; api-signatures)_
- **[MEDIUM]** `apps/api/src/modules/signatures/gosklyuch-callback.ts:321-356` -> /transpult — **Callback записывает подпись на документ в терминальном статусе (rejected/completed/corrected) — нет FSM-гейта** — В транзакции UPDATE+INSERT (321-356) нет проверки текущего row.status: fromStatus=row.status, toStatus=row.status — переход не валидируется. Если документ уже 'rejected'/'completed'/'corrected', задержавшийся или повторный callback всё равн… _(correctness; api-signatures)_

### api-trips-core
- **[HIGH]** `apps/api/src/modules/trips/routes.ts:127-136` — **GET /trips/volume-preview lacks assertVehicleAccess: cross-tenant capacity/existence leak** — preHandler only requireAbility('update','Trip'); vehicleId/trailerId/orderIds from query go straight to computeVolumeCheckFromIds which reads vehicles/trailers/orders by id with no organizationId. _(security; api-trips-core)_
- **[MEDIUM]** `apps/api/src/modules/trips/routes.ts:168-170` — **Blanket catch returns err.message to client - raw PG/constraint text leak risk** — catch(err){reply.status(400).send({error:err.message})} across many handlers (168,184,311,...). Domain Errors ok, but a DB error (CHECK XOR own/subcontract, FK) leaks raw PG text; no 4xx/5xx distinction. _(error-handling; api-trips-core)_
- **[MEDIUM]** `apps/api/src/modules/trips/service.ts:626-919` — **assignTrip: double-assignment TOCTOU - status read outside tx, no re-check/FOR UPDATE inside** — getTripById outside tx (633), checks status===PLANNING (635), then db.transaction (908) does UPDATE trips SET status=ASSIGNED WHERE id=tripId with no status re-check and no lockRowForUpdate. Two parallel assigns both pass 635 and both write… _(data-integrity; api-trips-core)_

### api-trips-docs
- **[HIGH]** `apps/api/src/modules/trips/routes.ts:981 (signerRole: z.string().min(2).max(100)); store transport-documents-store.ts:1027` -> /transpult — **signerRole — свободный текст без контролируемого словаря и без привязки к подписываемому титулу ЭТрН** — signerRole принимается как произвольная строка 2..100 символов и пишется в metadata.signatures, providerStatus ('signed:{signerRole}'), history. Нет enum допустимых ролей подписанта ЭТрН (грузоотправитель/перевозчик/грузополучатель/водитель… _(data-integrity; api-trips-docs)_
- **[MEDIUM]** `apps/api/src/modules/trips/transport-documents-store.ts:1025, 1033 (signedAt = params.signedAt ? new Date(params.signedAt) : new Date())` -> /transpult — **signedAt подписи задаётся клиентом и принимается дословно — возможна анти-/постдатировка юр-значимого факта ЭП** — Время подписания берётся из тела запроса (z.string().datetime() в routes.ts:987) без серверной проверки разумного диапазона. Подписант/оператор может указать произвольную дату (в прошлом/будущем), и она станет официальным signedAt в metadat… _(data-integrity; api-trips-docs)_
- **[LOW]** `apps/api/src/modules/trips/etrn-xsd-manifest.ts:8 (ETRN_XSD_SOURCE_DIR = D:\Ai\TMS\docs\etrn)` -> /devops — **Стейл-абсолютный путь к XSD указывает на D:\Ai\TMS (не TMS-prod) — fixture-проверка ЭТрН XSD по умолчанию смотрит в чужой/несуществующий каталог** — ETRN_XSD_SOURCE_DIR жёстко прописан на путь рабочей машины D:\Ai\TMS\docs\etrn (текущий проект — TMS-prod). check-etrn-xsd-fixtures.ts использует ETRN_XSD_DIR||ETRN_XSD_SOURCE_DIR; без env XSD-чек идёт по неверному каталогу и тихо не находи… _(correctness; api-trips-docs)_

### api-waybills
- **[MEDIUM]** `apps/api/src/modules/waybills/etrn-generator.ts:82-88 (formatDate), 137-138, 195` — **ДатаДок ЭТрН формируется в локальной TZ сервера (getDate/getMonth), не в МСК — off-by-one у даты документа** — formatDate использует d.getDate()/getMonth()/getFullYear() — локальная TZ процесса. В Docker по умолчанию UTC, поэтому issuedAt около полуночи МСК даст ДатаДок на сутки раньше московской. Дата ЭТрН юридически значима. _(correctness; api-waybills)_
- **[MEDIUM]** `apps/api/src/modules/waybills/routes.ts:529, 530, 612, 613, 523-524, 606-607` — **Фиктивные ИНН '0000000000' и адрес-fallback consignee подставляются в выпускаемый ЭТрН** — Для перевозчика есть жёсткий 422-гейт по carrierOrg.inn, но для shipperInn/consigneeInn при отсутствии contractor молча подставляется '0000000000', а consigneeName — order.unloadingAddress. Структурно-целый, но юридически недействительный Э… _(correctness; api-waybills)_

### mobile-data
- **[MEDIUM]** `apps/mobile/src/api/offlineQueue.ts:19-27 (decodeQueue), 50-57 (getQueue), 203 (setItem remaining)` -> /transpult — **Повреждённый/частично-валидный queue молча превращается в пустой → тихая потеря offline-действий** — getQueue ловит любую ошибку JSON.parse и возвращает []. decodeQueue при провале base64 возвращает сырую строку, которую затем JSON.parse не разберёт → []. Если хранилище повредилось ИЛИ запись была прервана на полуслове, replayQueue получае… _(data-integrity; mobile-data)_
- **[MEDIUM]** `apps/mobile/src/api/trips.ts:10-29 (authFetch); аналогично inspections.ts:8-27, temperature.ts:13-32, rto.ts:10-29, waybills.ts:10-29, upload.ts:fetch, sync.ts:fetch, offlineQueue.ts:169` -> /transpult — **Легаси api/*.ts не триггерят centralized auto-logout на 401/403 → залипшая сессия после JWT-ревокации (E6)** — client.ts (B6.2) задуман как единый wrapper, эмитящий AUTH_LOGOUT_EVENT при 401, чтобы AuthContext очистил сессию. Но MIGRATION TODO (client.ts:19-21) не выполнен: trips/inspections/temperature/rto/waybills/upload/sync/offlineQueue имеют со… _(security; mobile-data)_

### mobile-screens
- **[HIGH]** `apps/mobile/src/api/offlineQueue.ts:39-48` -> /transpult — **offlineQueue.enqueueAction не защищён от конкурентных записей — возможна потеря элементов очереди** — enqueueAction: getQueue() → push → setItem без блокировки. AsyncStorage не транзакционен. При параллельных вызовах второй читает устаревшую копию очереди и перезаписывает с одним элементом. _(data-integrity; mobile-screens)_
- **[HIGH]** `apps/mobile/src/api/offlineQueue.ts:11-27` -> /transpult — **Base64-«кодирование» очереди в AsyncStorage обеспечивает ложную иллюзию защиты** — encodeQueue использует btoa/unescape — это reversible Base64, не шифрование. Комментарий строка 10 'prevent casual inspection' создаёт false sense of security. В очереди — tripId, pointId, GPS, photoUrls. _(security; mobile-screens)_
- **[HIGH]** `apps/mobile/src/api/rto.ts:31-38` -> /transpult — **resolveDriverId делает лишний /auth/me запрос при каждом вызове getMyHosStatus/getMyHoursSummary** — resolveDriverId (строка 31-38) всегда вызывает getMe(token) — сетевой запрос. Нет кэширования driverId. При открытии MyHoursScreen вызываются оба метода → 2 лишних /auth/me запроса. _(correctness; mobile-screens)_
- **[HIGH]** `apps/mobile/src/navigation/AppNavigator.tsx:44-45` -> /transpult — **Механик с несколькими ролями (mechanic + driver) не может перейти к экранам водителя** — `pickPrimaryRole` → 'mechanic' → isMechanic=true → MechanicInspection как home. Экраны TripList/TripDetails добавлены в Stack (строки 67-101), но нет UI-навигации к ним из MechanicInspectionScreen. _(correctness; mobile-screens)_
- **[HIGH]** `apps/mobile/src/screens/CheckpointScreen.tsx:265-270` -> /transpult — **Кнопка «Я прибыл и подписать» ведёт на камеру вместо прямого шага подписи** — Строка 270: `onPress={() => setStep('camera')}`. Кнопка с семантикой «подписать» открывает камеру. Это нарушение UX — водитель должен пройти съёмку, прежде чем попасть к подписи. _(unfinished; mobile-screens)_
- **[HIGH]** `apps/mobile/src/screens/TripListScreen.tsx:145` -> /transpult — **WatermelonDB-подписка наблюдает за ВСЕМИ рейсами без фильтра по driverId** — Строка 145: `.query().observe()` без Q.where('driver_id', ...). При смене аккаунта без успешного unsafeResetDatabase рейсы предыдущего водителя остаются в локальной БД; подписка срабатывает на их изменения, инициируя лишние fetchTrips. _(correctness; mobile-screens)_
- **[MEDIUM]** `apps/mobile/src/screens/TemperatureLogScreen.tsx:188-201` -> /transpult — **tickAuto вызывает submitReading даже когда SLA не загружен — отправляет некорректные breach-проверки** — slaMid (строка 76) = fallback 2 если summary=null. startAutoMode (строка 205): `mockValueRef.current = slaMid` — устанавливает centre=2°C. tickAuto читает этот reference и отправляет readings вокруг 2°C если SLA ещё не загружен. _(correctness; mobile-screens)_

### shared
- **[MEDIUM]** `packages/shared/src/invoice-fsm.ts:63` -> /transpult — **corrective_upd выпадает из 5-дневного срока СФ/УПД (асимметрия с corrective_sf)** — FIVE_DAY_DEADLINE_TYPES (стр.63) = ['sf','upd','corrective_sf','advance'] — содержит corrective_sf, но НЕ corrective_upd. VAT_DOCUMENT_TYPES (стр.142) включает оба. corrective_upd реально выпускается (invoice-workflow.service.ts:541 newType… _(layer-drift; shared)_

### web-admin-1
- **[HIGH]** `apps/web/src/app/admin/compliance/page.tsx:229-232` -> /transpult — **Tachograph .DDD upload has no progress indication and no file-type guard at UI level — accept attribute bypassed** — Confirmed at lines 200-223: `onFile` handler sends any file directly to API without extension/size check. The `accept=` attribute is a hint only. On API error, `setError((err as Error).message)` exposes raw error message to user (line 218). _(unfinished; web-admin-1)_
- **[HIGH]** `apps/web/src/app/admin/mchd/page.tsx:848-858` -> /jurist — **Delete confirmation dialog misleads: says 'помечена как отозванная' but does not distinguish from Revoke action** — Confirmed: server routes.ts line 386 sets `revocationReason: 'Удалено пользователем'` (hardcoded). The RevokeSchema requires `revocationReason: z.string().min(1).max(2000)` from user input, but the Delete path uses a hardcoded string with n… _(correctness; web-admin-1)_
- **[HIGH]** `apps/web/src/app/admin/mchd/page.tsx:136-137` -> /transpult — **certificateXml client-side validation only checks `<?xml` prefix — no check for minimum meaningful XML content** — Confirmed at client line 136 and server routes.ts lines 252-257: both only check `trimStart().startsWith('<?xml')`. Server also has `z.string().min(20)` but no well-formedness or root-element check. A string like `<?xml version="1.0"?><a/>`… _(correctness; web-admin-1)_
- **[HIGH]** `apps/web/src/app/admin/tariffs/page.tsx:145` -> /transpult — **vatRate defaults to 20 hardcoded in TariffModal — does not reflect allowed rates for org's tax regime** — Confirmed at line 121: `vatRate: tariff?.vatRate?.toString() || '20'` and line 145: `vatRate: parseFloat(form.vatRate) || 20`. No regime fetch, no Select constrained to allowedVatRates. Free-form numeric input allows invalid VAT rates for U… _(correctness; web-admin-1)_
- **[HIGH]** `apps/web/src/app/admin/tariffs/page.tsx:335-337` -> /transpult — **Load error in tariffs page is silently swallowed — console.error only, no user feedback** — Confirmed at lines 334-336: catch block only calls `console.error(err)`, no setError/toast. setLoading(false) runs in finally, leaving an empty table. User sees 'Пока нет тарифов' with no error indication. _(error-handling; web-admin-1)_

### web-admin-2
- **[HIGH]** `apps/api/src/modules/carriers/routes.ts:107-160` — **No uniqueness enforcement on carrier contract number per organization** — The carrierContracts schema in schema.ts defines only regular indexes (idx_carrier_contracts_contractor, idx_carrier_contracts_status, idx_carrier_contracts_org) — no unique constraint on (organization_id, number). The INSERT at L145-157 pe… _(data-integrity; web-admin-2)_
- **[HIGH]** `apps/web/src/app/admin/billing/page.tsx:186-200` — **Stub 'Отток за 6 месяцев' chart hardcoded as EmptyState — no data wired** — Lines 186-200 render a hardcoded EmptyState unconditionally with no data source or implementation path. The `period` state is never used to fetch churn data. _(unfinished; web-admin-2)_
- **[HIGH]** `apps/web/src/app/admin/checklists/page.tsx:255-256` — **Silently swallowed load error in checklists — user sees empty table with no feedback** — The catch block at L255 only calls `console.error(err)` with no user-visible feedback. On API failure the component renders with empty templates array, showing EmptyState 'Шаблонов пока нет' — indistinguishable from the legitimate empty cas… _(error-handling; web-admin-2)_
- **[HIGH]** `apps/web/src/app/admin/users/page.tsx:399-401` — **Bulk deactivate button shows wrong count — displays total selected, acts on active subset** — L387 correctly filters `const active = rows.filter(u => u.isActive)` and the confirmation description at L394 correctly shows `active.length`. However the button label at L400 shows `rows.length` (total selected), causing a mismatch between… _(correctness; web-admin-2)_

### web-auth-pages
- **[MEDIUM]** `apps/web/src/app/signup/page.tsx:240-251` -> /transpult — **Signup раскрывает существование email (enumeration), в отличие от enumeration-safe forgot-password** — При ответе сервера signup UI парсит res.error регуляркой /email|exist/i и явно показывает поле 'Этот e-mail уже зарегистрирован' (строки 242-243), а также прокидывает серверный message в тост (245-249). Сегментный фокус прямо требует одинак… _(security; web-auth-pages)_

### web-client-orders
- **[HIGH]** `apps/api/src/modules/orders/service.ts:454-503` — **changeOrderStatus — UPDATE без org-фильтра в WHERE (defense-in-depth gap)** — строка 474: WHERE eq(orders.id, id) без organizationId. Функция принимает только id без org-контекста. Публичный API защищён assertOrderAccess на роуте, поэтому прямой эксплойт маловероятен, но internal-вызовы без гарантированного guard соз… _(correctness; web-client-orders)_
- **[HIGH]** `apps/web/src/app/client/page.tsx:97-108` — **Клиент-портал: hardcoded limit=50 без пагинации — данные молча обрезаются** — строки 98-99: api.get('/orders?limit=50') и api.get('/finance/invoices?limit=50') без проверки total/hasMore. При 51+ записях агрегаты (activeOrders, unpaidTotal) считаются по неполным данным, пользователь не предупреждён. _(correctness; web-client-orders)_
- **[HIGH]** `apps/web/src/app/contractors/page.tsx:189-199` — **loadContractors — ошибка загрузки проглочена (нет user-facing toast/error)** — catch-блок строк 194-195 содержит только console.error без toast или error-state. Пользователь видит пустую таблицу без объяснения причины сбоя. _(error-handling; web-client-orders)_
- **[HIGH]** `apps/web/src/app/drivers/page.tsx:346-372` — **N parallel HOS-запросов при загрузке страницы водителей** — строки 354-371: Promise.all по всем активным водителям, каждый делает отдельный GET /drivers/:id/hos-status. Комментарий строки 345 ('Pre-load HOS for all active drivers in one batch') вводит в заблуждение — это не batch, а N параллельных з… _(performance; web-client-orders)_

### web-components-1
- **[HIGH]** `apps/web/src/components/ui/Combobox.tsx:106-108` — **onSearch errors silently swallowed — no user feedback on API failure** — The catch block at lines 106-108 only calls setOptions([]); there is no error state, no toast, no visual distinction from a genuine empty result. In TMS, Combobox is used for driver/vehicle assignment — a network failure or 401 silently sho… _(error-handling; web-components-1)_
- **[HIGH]** `apps/web/src/components/ui/data-table.tsx:388` — **Selected-set never cleared on data change — bulk bar shows stale count** — No useEffect on `data` identity resets `selected`. The only resets are: initial useState (line 294), Escape key (line 328), and manual clear button (lines 453/457). `selected.size` at line 450 stays stale after data refresh, while `selected… _(correctness; web-components-1)_
- **[HIGH]** `apps/web/src/components/ui/kanban.tsx:140-142` — **canMove() called on every render during drag — expensive predicate re-evaluated continuously** — isValidTarget at lines 140-142 is computed inline in the KanbanColumn render body with no useMemo. setIsOver(true) on every dragOver (line 152) triggers re-renders, each calling canMove. For TMS FSM/RBAC logic in canMove, this fires dozens … _(performance; web-components-1)_
- **[HIGH]** `apps/web/src/components/ui/period-selector.tsx:89-95` — **Custom date range fires onChange immediately with from > to when user changes start date past end date** — applyCustom (lines 89-95) checks for empty strings and NaN but has no guard for f > t. Lines 141-143 and 152-154 call applyCustom on every onChange of either input, so an inverted range is emitted immediately as user edits the from-date bef… _(correctness; web-components-1)_
- **[HIGH]** `apps/web/src/components/ui/sparkline.tsx:44` — **Non-unique SVG gradient ID causes incorrect gradient on multiply-rendered sparklines** — Line 44 hardcodes `id={\`spark-grad-${tone}\`}` and line 54 references it with `fill={\`url(#spark-grad-${tone})\`}`. No per-instance uniqueness. In SVG's global ID namespace, multiple same-tone sparklines on one page all point to the same … _(correctness; web-components-1)_
- **[MEDIUM]** `apps/web/src/components/ui/data-table.tsx:299-305` — **Column visibility initializer reads localStorage only once — stale keys not pruned** — Lines 302-303: `Object.assign(initial, stored)` merges all stored keys over defaults without pruning keys absent from current columns. Stale keys persist and get written back to localStorage (line 307 effect). No version/hash mechanism to i… _(correctness; web-components-1)_

### web-components-2
- **[HIGH]** `apps/web/src/components/CopilotChat.tsx:123-193` — **SSE-стрим не отменяется при закрытии/unmount компонента — утечка читателя** — `send()` (line 123) стартует `api.streamSSE(...)` без AbortController и без передачи signal. `api.streamSSE` принимает опциональный `signal?: AbortSignal` (api.ts:121), но в CopilotChat.tsx нет ни AbortController, ни useEffect cleanup. `for… _(correctness; web-components-2)_
- **[HIGH]** `apps/web/src/components/layout-shell.tsx:11` — **/reset-password отсутствует в PUBLIC_PATH_PREFIXES — сайдбар рендерится на странице сброса пароля** — layout-shell.tsx:11 `PUBLIC_PATH_PREFIXES` не содержит '/reset-password'. Sidebar.tsx:71-73 возвращает null только для driver-only, иначе рендерится для user=null (line 77 `if (!user) return !item.roles`). Sidebar будет отрисован на /reset-… _(correctness; web-components-2)_
- **[HIGH]** `apps/web/src/components/TemperaturePanel.tsx:107` — **График температуры молча обрезает историю на 200 записях без предупреждения** — Line 107: `temperature-readings?limit=200` — жёстко 200 записей. Line 188: `slice(0, 50)` для таблицы. Summary (breachCount, count) берётся из `/temperature-summary` (все записи). При >200 замерах график и таблица показывают усечённые данны… _(correctness; web-components-2)_
- **[HIGH]** `apps/web/src/middleware.ts:75-84` — **Edge middleware не проверяет token_version (E6): отозванный токен проходит авторизацию на уровне Next.js** — verifySessionToken (lines 75-84) делает только `jwtVerify` по HMAC, поля `tv` нет. API auth.ts:134-137 проверяет `payload.tv` против `users.tokenVersion` в БД. Токен после смены пароля/деактивации с tv=old проходит middleware, SSR-рендер ст… _(security; web-components-2)_
- **[MEDIUM]** `apps/web/src/components/CopilotChat.tsx:208-211` — **confirmAction отправляет подтверждение как произвольный текст, а не структурированный API-вызов** — Line 208-210: `const followUp = \`Подтверждаю предложенное действие: ${proposed.title}. ID: ${proposed.actionId}.\`; void send(followUp)` — текстовое сообщение уходит в LLM. Подтверждение недетерминировано: LLM может переинтерпретировать. П… _(correctness; web-components-2)_

### web-dispatcher
- **[HIGH]** `apps/web/src/app/dispatcher/components/AssignmentPanel.tsx:207-244` — **Volume overflow warning shows 'Назначение будет заблокировано' but does NOT actually block the assign button — false promise to user** — Warning text at line 234 says 'Назначение будет заблокировано' but the assign button disabled condition at line 476 is `!selectedOrder || !selectedVehicle || isAssigning` — no `volumeCheck?.overflow` check. _(correctness; web-dispatcher)_
- **[HIGH]** `apps/web/src/app/dispatcher/components/VehicleTimeline.tsx:1-136` — **VehicleTimeline component is exported but never imported or used anywhere — dead code in production bundle** — Grep across all .ts/.tsx files in apps/web/src returns exactly 1 match (the definition file itself) — no import of VehicleTimeline anywhere in the codebase. _(unfinished; web-dispatcher)_
- **[HIGH]** `apps/web/src/app/dispatcher/page.tsx:367-389` — **Cold-chain breach poller fires up to 30 parallel individual requests per poll cycle — N+1 HTTP fan-out every 60s** — Lines 367-389: `Promise.allSettled(activeTrips.slice(0, 30).map(trip => api.get('/trips/${trip.id}/temperature-summary')))` — up to 30 concurrent HTTP requests per 60s poll cycle. _(performance; web-dispatcher)_

### web-fleet-1
- **[HIGH]** `apps/web/src/app/fleet/components/AddVehicleModal.tsx:209` — **Year field max=2030 is a hardcoded near-future cap — will silently reject valid vehicles after 2030** — AddVehicleModal line 210: `max={2030}` hardcoded. VehicleSchema in schemas.ts line 120 also has `.max(2030)`. Both client and server will reject year 2031+ starting in 2031, which is only 5 years away from current date 2026. _(correctness; web-fleet-1)_
- **[HIGH]** `apps/web/src/app/fleet/components/VehicleCard.tsx:113-123` — **VehicleCard fetches ALL trailers (?limit=200) to find the assigned one — N+1 style over-fetch** — VehicleCard line 116 calls `/fleet/trailers?limit=200` and client-side `.find()`s the assigned one. paginationDefaults clamps server limit to min(100,...) so UI requests 200 but receives at most 100, potentially missing the assigned trailer… _(correctness; web-fleet-1)_
- **[HIGH]** `apps/web/src/app/fleet/components/VehiclesTable.tsx:191` — **Fleet tables request ?limit=200 without server pagination — silently truncates large fleets** — loadVehicles (line 191) requests limit=200 but paginationDefaults (service.ts:30) clamps to 100. With 101+ vehicles only 100 are returned with no indication of truncation. Same for trailers fetch at line 207. _(correctness; web-fleet-1)_
- **[HIGH]** `apps/web/src/app/fleet/components/VehiclesTable.tsx:192-197` — **loadVehicles error is silently swallowed — user sees empty table with no error message** — catch block (lines 193-195) only calls console.error and sets loading=false. The component then renders EmptyState 'Транспортные средства не найдены' which is visually identical to a genuine empty fleet. VehicleCard.loadVehicle (line 130-13… _(error-handling; web-fleet-1)_

### web-fleet-2
- **[HIGH]** `apps/web/src/app/fleet/components/AddFuelRecordModal.tsx:25-35, 57-85` -> /transpult — **No client-side validation for liters/costPerLiter > 0; form defaults are '0' which always fail backend Zod validation** — Lines 30-31 set liters:'0', costPerLiter:'0'. handleSubmit (line 59) only checks vehicleId before posting; sends liters=0 and costPerLiter=0 which fail FuelRecordCreateSchema z.number().positive() (lines 1072-1073). Error shown is generic '… _(correctness; web-fleet-2)_
- **[HIGH]** `apps/web/src/app/fleet/components/AddFuelRecordModal.tsx:37-53` -> /transpult — **Form state not reset on modal open — stale data shown on reopen** — The useEffect at lines 37-53 fires when `open` is truthy but only fetches option lists (vehicles/drivers/trips); it never calls setForm to reset field values. Partial entries persist across close/reopen. _(correctness; web-fleet-2)_
- **[HIGH]** `apps/web/src/app/fleet/components/DowntimeRecordsTable.tsx:118-133` -> /transpult — **Close-downtime dialog does not validate that endAt > startAt** — submitClose (lines 118-133) passes endAt directly to the API without comparing it to closingRow.record.startAt. DowntimeRecordUpdateSchema (lines 1100-1104) only validates format; no refine constraint enforces endAt > startAt. _(correctness; web-fleet-2)_
- **[HIGH]** `apps/web/src/app/fleet/components/FinesTable.tsx:68, 102-108` -> /transpult — **Summary stats (totalAmount, unpaidCount) computed from truncated page of 50 records** — Line 68: `limit: '50'` is hardcoded in the query. Lines 102-108: totalAmount and unpaidCount are derived via useMemo over the `fines` array (only the fetched page). A dedicated /fleet/fines/analytics endpoint exists (api routes.ts:452) but … _(data-integrity; web-fleet-2)_
- **[HIGH]** `apps/web/src/app/fleet/components/MaintenanceScheduleTable.tsx:114-116` -> /transpult — **submitComplete silently swallows API errors — user sees nothing on failure** — catch block at line 114 only calls console.error; no toast, no setError. Compare: DowntimeRecordsTable.submitClose at line 130 uses toast({variant:'error',...}). The submitComplete pattern is clearly missing it. _(error-handling; web-fleet-2)_
- **[HIGH]** `apps/web/src/app/fleet/components/OdometerHistoryTable.tsx:268` -> /transpult — **Delta column always prepends '+' sign — shows '+-500 км' for negative deltas** — Line 268: `+${r.delta.toLocaleString('ru-RU')} км` hardcodes the '+' prefix unconditionally. For a negative delta, toLocaleString produces '-500', resulting in '+-500 км'. _(correctness; web-fleet-2)_
- **[MEDIUM]** `apps/web/src/app/fleet/components/FuelRecordsTable.tsx:63-66` -> /transpult — **fuelType filter applied client-side over a paginated API response — silently incomplete** — Lines 64-66: after fetching /fleet/fuel-records without a limit param (API default applies), fuelType is filtered in-browser. If the API returns a page smaller than total records, gas/other records beyond the page are invisible to the filte… _(performance; web-fleet-2)_

### web-lib
- **[MEDIUM]** `apps/web/src/hooks/useVehiclePositions.ts:111-130, 116-118` -> /transpult — **Бесконечный reconnect WS без backoff и без fallback при стабильно битом сокете** — При успешном получении ws-token, но падающем WebSocket (onerror -> ws.close() -> onclose) хук переподключается фиксированными setTimeout(connect, 3000) бесконечно, без экспоненциального backoff и без лимита попыток. Fallback на REST-polling… _(performance; web-lib)_

### web-misc
- **[HIGH]** `apps/web/src/app/analytics/page.tsx:29-38, 487, 488` — **TripProfit interface expects vehiclePlate/driverName but API returns neither** — Frontend TripProfit (analytics/page.tsx:29-38) declares vehiclePlate and driverName. analytics/routes.ts:289-300 and 314-325 return objects with fields tripId/tripNumber/contractor/revenue/cost/margin/marginPercent/distance/isProfitable/sou… _(layer-drift; web-misc)_
- **[HIGH]** `apps/web/src/app/incidents/page.tsx:170-171` — **Incidents page hard-codes limit=100 with no server pagination — incidents beyond 100 are silently invisible** — page.tsx:171 sets limit=100. sprint9/routes.ts:21 caps at 100 via `.transform((limit) => Math.min(limit, 100))`. The API returns total count (routes.ts:175) but the frontend never uses it for pagination — rows beyond 100 are permanently inv… _(performance; web-misc)_
- **[HIGH]** `apps/web/src/app/kpi/page.tsx:114-115, 129, 153` — **DriverScoreboardSection sends date-only strings to datetime-expecting endpoints — always 400** — kpi/page.tsx:114-115 initializes from/to with `format(..., 'yyyy-MM-dd')` producing date-only strings. scoring/routes.ts:13-14 and 18-19 use `z.string().datetime()` which rejects date-only ISO-8601 strings (zod datetime requires a time comp… _(correctness; web-misc)_
- **[MEDIUM]** `apps/api/src/modules/analytics/routes.ts:305-310` — **Profitability fallback cost calculation uses process.env cost constants — wrong defaults produce misleading margins** — analytics/routes.ts:305-310 confirmed: fallback path uses `Number(process.env.FUEL_PRICE_PER_LITER) || 60` etc. These env vars are not in the known .env.example. The 'source':'simplified' flag is returned but the analytics page.tsx frontend… _(correctness; web-misc)_

### web-onboarding-fin
- **[HIGH]** `apps/web/src/app/finance/InvoiceWorkflowActions.tsx:33-38 (loadDeliveredOrders), 122-131 (openModal)` -> /transpult — **Аллокатор заявок грузит /orders?limit=200 без пагинации и без фильтра статуса — заявки сверх 200 невыпускаемы** — loadDeliveredOrders жёстко запрашивает /orders?limit=200 без status-фильтра (имя обещает delivered, но передаётся только limit). Организация с >200 заявок не увидит более поздние заявки в селекте. Нет поиска/догрузки. Эндпоинт /orders подде… _(correctness; web-onboarding-fin)_
- **[MEDIUM]** `apps/web/src/app/finance/InvoiceWorkflowActions.tsx:129 (openModal payment), 171-180 (submitPayment)` -> /transpult — **Поле оплаты предзаполняется остатком, но переплата (amount > остаток) не блокируется ни на UI, ни на сервере** — При открытии модалки payAmount = max(total - paidAmount, 0). Пользователь может ввести больше; submitPayment проверяет только amount > 0 (173). Сервер registerPayment не отвергает переплату: newPaid >= total -> paid_full (635), лишнее теряе… _(correctness; web-onboarding-fin)_

### web-print-waybills
- **[HIGH]** `apps/web/src/app/print/cancellation-act/[tripId]/page.tsx:63-66, 120, 131` — **Параметры URL (reason, amount, vehicleArrivedAt) вставляются в печатный документ без валидации** — Строка 63: `reason = search.get('reason') || '...'`, строка 120: `{reason}` рендерится напрямую в DOM официального акта. Строка 131: `{money(amount)}` — money() возвращает '-' при нечисловом значении, но не блокирует произвольный reason. Лю… _(correctness; web-print-waybills)_
- **[HIGH]** `apps/web/src/app/print/etrn/[id]/page.tsx:57-59` — **ЭТрН preview: fallback на фиктивные реквизиты «ООО ТМС Логистик» / ИНН 0000000000** — Строки 57-59: `carrierName ?? 'ООО «ТМС Логистик»'`, `carrierInn ?? '0000000000'`, `carrierAddress ?? 'г. Москва'`. Несуществующая организация в официальном документе ЭТрН при незаданных env-переменных. Другие страницы зоны (act, ttn, cance… _(correctness; web-print-waybills)_
- **[HIGH]** `apps/web/src/app/print/waybill/[id]/page.tsx:49` — **Путевой лист: fallback на фиктивный перевозчик «ООО ТМС Логистик»** — Строка 49: `carrier = process.env.NEXT_PUBLIC_CARRIER_NAME ?? 'ООО «ТМС Логистик»'`. При незаданном env официальный путевой лист печатается с несуществующей организацией. _(correctness; web-print-waybills)_

### web-repair-med
- **[HIGH]** `apps/web/src/app/mechanic/page.tsx:228-276` — **N+1 запросов при загрузке рейсов для журнала и очереди** — page.tsx:242: `Promise.allSettled(tripIds.map(async (tripId) => { const tripRes = await api.get(trips/${tripId}); ... if (waybillId) await api.get(waybills/${waybillId}) }))` — параллельно по tripId, но внутри каждого промиса trip+waybill с… _(performance; web-repair-med)_
- **[HIGH]** `apps/web/src/app/repair/components/RepairKanban.tsx:658` — **Опечатка в символе валюты для шаблонов ремонта: ₴ (гривня) вместо ₽ (рубль)** — RepairKanban.tsx:658: `{formatMoney(template.totalSuggestedCost)} ₴` — символ украинской гривны. Соседние строки 692 используют ₽. Все остальные денежные отображения в файле используют ₽. _(correctness; web-repair-med)_
- **[HIGH]** `apps/web/src/app/repair/page.tsx:320-327` — **Таблица ремонтов запрашивается с жёстким limit=200 без серверной пагинации** — page.tsx:320: `api.get('/repairs?limit=200')` — один запрос при переключении в Table-view, без курсора или onPageChange. _(performance; web-repair-med)_
- **[HIGH]** `apps/web/src/app/repair/page.tsx:257` — **Клиентский RBAC repair-страницы не включает роль 'manager'** — page.tsx:257: `const ALLOWED_ROLES = ['repair_service', 'mechanic', 'admin']` — 'manager' отсутствует. Менеджеры редиректируются на '/' при попытке открыть /repair. _(correctness; web-repair-med)_
- **[MEDIUM]** `apps/web/src/app/repair/components/RepairKanban.tsx:329-333` — **buildPartsSummary: plannedRate не является процентом, а хранит абсолютное значение plannedQuantity** — RepairKanban.tsx:330: `summary.plannedRate = summary.plannedQuantity > 0 ? summary.plannedQuantity : 0` — абсолютное кол-во. Строки 331-332: receivedRate и usedRate — ratios (0..1). Рассинхрон типов в одном объекте подтверждён. _(data-integrity; web-repair-med)_

### web-trips
- **[HIGH]** `apps/web/src/app/trips/page.tsx:831-1003` — **OperationalStructureBlock целиком на английском языке в RU-интерфейсе** — Строки 831-853 содержат 'Load structure', 'Multi-order, lot assignments, and route stops', '{n} orders/lots/stops', 'One trip to many orders', 'Consolidated trip', 'Single-order trip', 'Grouped by linked orders from the dossier.' — все стро… _(unfinished; web-trips)_
- **[HIGH]** `apps/web/src/app/trips/page.tsx:1809` — **TransportDocumentsBlock молча обрезает список: показывает только первые 3 документа из N** — Строка 1809: `docs.slice(0, 3).map(...)` — нет счётчика или кнопки «ещё». Строка 2061: `etrnTitles.slice(0, 6)`. Строка 1788: `docProblems.slice(0, 4)` — все обрезки без индикации. _(unfinished; web-trips)_
- **[HIGH]** `apps/web/src/app/trips/page.tsx:1656` — **window.prompt для ввода причины отказа от подписи — блокирующий синхронный диалог** — Строка 1656: `const reason = window.prompt('Причина отказа от подписи', ...)` — нативный блокирующий диалог браузера. Подавляется в iframe/embedded-режиме и возвращает null без объяснения. _(error-handling; web-trips)_
- **[HIGH]** `apps/web/src/app/trips/page.tsx:2374-2401` — **Жёсткий лимит limit=200 для справочников ТС, прицепов и водителей без пагинации** — Строки 2374 и 2387: `/fleet/vehicles?limit=200`, `/fleet/trailers?limit=200`. Строка 1066: `/fleet/drivers?limit=200` при каждом переключении на 'replace'/'crew' (useEffect на activeAction, строка 1060). В крупной организации 201-й ресурс н… _(performance; web-trips)_

## P3 — косметика / мелочи (46)


### api-billing
- **[HIGH]** `apps/api/src/modules/dpa/routes.ts:162` -> /transpult — **DPA accept возвращает acceptedAt=now() даже при идемпотентном повторе (ON CONFLICT DO NOTHING)** — POST /dpa/:providerId/accept делает insert(...).onConflictDoNothing() (стр.147-155): при повторном accept той же версии запись не дублируется, но ответ всегда формирует acceptedAt: new Date().toISOString() (стр.162). Клиент получает «свежий… _(correctness; api-billing)_

### api-db
- **[HIGH]** `apps/api/src/db/schema.ts:404 (orders.number .unique()), 475 (trips.number .unique()), 751 (waybills.number .unique())` -> /transpult — **orders/trips/waybills.number — глобально уникальны, та же per-tenant проблема нумерации, что 0039 устранил только для invoices** — 0039 признал, что глобальная уникальность номера документа неверна для multitenancy и перевёл invoices.number на per-org. Но orders.number, trips.number, waybills.number остались глобально уникальными (.unique() в schema.ts, constraints ord… _(data-integrity; api-db)_
- **[MEDIUM]** `apps/api/drizzle/0036_invoice_schema_rebuild.sql:148-202 (invoice_check_immutable_fields)` -> /transpult — **Иммутабельность выпущенного счёта не покрывает contractor_id/period_start/period_end/tripIds/related_invoice_id** — Триггер запрещает менять number/type/issued_at/total/subtotal/vat_amount/vat_rate/payer_id/payee_id/payee_organization_id/currency/includes_vat/basis_text после выхода из draft. Но period_start, period_end, legacy contractor_id, tripIds (js… _(correctness; api-db)_

### api-documents
- **[HIGH]** `apps/api/src/modules/documents/med-inspection-pdf.ts:23-57` -> /transpult — **N+1 sequential awaits в generateMedInspectionPdf: 4 последовательных запроса к БД** — med-inspection-pdf.ts:23-57: запросы к medInspections (line 24), drivers (line 33-39), users/medic (line 41-47), trips (line 51-56) выполняются строго последовательно. Drivers и medic независимы. _(performance; api-documents)_
- **[HIGH]** `apps/api/src/modules/documents/tech-inspection-pdf.ts:31-78` -> /transpult — **N+1 sequential awaits в generateTechInspectionPdf: 4 последовательных запроса к БД** — tech-inspection-pdf.ts:31-78: запросы к techInspections (line 31), vehicles (line 40-51), users/mechanic (line 53-59), trips+drivers (line 63-77) выполняются строго последовательно. Запросы 2 и 3 независимы и могут быть параллелизованы. _(performance; api-documents)_

### api-finance-core
- **[HIGH]** `apps/api/src/modules/finance/finance.service.ts:123-135` -> /transpult — **Легаси getNextInvoiceNumber сортирует номера лексически (desc(invoices.number)), не численно** — orderBy(desc(invoices.number)).limit(1) (126-127) берёт лексикографический максимум. При переходе через 99999 или разной ширине суффикса '100000' < '99999' лексически → seq вычислится неверно, возможен дубль. padStart(5) маскирует до 99999;… _(correctness; api-finance-core)_

### api-finance-invoice
- **[MEDIUM]** `apps/api/src/modules/finance/tarification.service.ts:43-45, 65, 345` -> /transpult — **Ночной/выходной модификаторы считаются по локальному времени сервера, не МСК** — isNightHour использует cursor.getHours() (line 65), isWeekend — date.getDay() (line 49) — локальная TZ процесса Node. При деплое в UTC ночной диапазон 22:00–06:00 и определение субботы/воскресенья сместятся на 3 часа относительно МСК → неве… _(correctness; api-finance-invoice)_

### api-integrations
- **[MEDIUM]** `apps/api/src/integrations/telegram.service.ts:174` -> /transpult — **Fallback для неизвестного eventType отправляет entityType/entityId в незнакомый Telegram-чат** — Для события без шаблона formatEventMessage возвращает `📋 <b>${eventType}</b>\n${entityType}: ${entityId}`. Но isNotifiableEvent (строка 183) возвращает true только для событий из EVENT_TEMPLATES, и notification.worker пропускает не-notifia… _(security; api-integrations)_
- **[MEDIUM]** `apps/api/src/integrations/workers/wialon.worker.ts:85-135` -> /transpult — **N+1 запросы внутри цикла синка: per-vehicle SELECT активного рейса и точек маршрута** — В цикле по всем ТС (строка 85) для каждого ТС делается отдельный SELECT активного рейса (строка 125-129) и затем SELECT routePoints (строка 131-135), плюс per-vehicle healthCheck адаптера. На больших автопарках это O(N) последовательных rou… _(performance; api-integrations)_

### api-misc1
- **[HIGH]** `apps/api/src/modules/copilot/tools/index.ts:198-219` — **list_trips_at_risk: N+2 sequential DB queries per candidate trip (up to 100 round trips for 50 candidates)** — Lines 198-219: for-loop sequentially awaits `computeTripEta(trip.id)` then `db.select(...routePoints...)` per candidate trip. No Promise.all parallelism. The propose_reassignment tool explicitly uses Promise.all (line 320). _(performance; api-misc1)_

### api-misc2
- **[HIGH]** `apps/api/src/modules/geo/geocoding.service.ts:136-148` — **geocodeAddress: unrecognized city falls back silently to Moscow — production quality but undocumented/misrepresented confidence** — Confirmed: geocoding.service.ts:136-148 returns Moscow coordinates with confidence 0.2 and source='mock' for any unrecognized address. The response is structurally identical to a real match. Callers storing coordinates without checking sour… _(correctness; api-misc2)_

### api-onboarding
- **[MEDIUM]** `apps/api/src/modules/demo/service.ts:113` — **rndPlate() uses Math.random() — non-CSPRNG; acceptable for demo but inconsistent with security posture** — Confirmed: line 113 uses `Math.floor(Math.random() * letters.length)` and line 114 uses `Math.floor(100 + Math.random() * 900)`. The known A-P0-3 fix applied CSPRNG to auth.ts (generateCode, generateTempPassword) but demo/service.ts was not… _(correctness; api-onboarding)_

### api-opcore
- **[MEDIUM]** `apps/api/src/modules/operational-core/write-service.ts:89-91` -> /transpult — **splitOrderIntoLots: при нулевом cargo все лоты фильтруются → insert([]) бросает ошибку после delete старых лотов** — Строка 89 filter оставляет лоты с weight>0||volume>0||places>0. Если cargoWeightKg/Volume/Places все 0/null, массив lots пуст, и tx.insert(shipmentLots).values([]) (91) у drizzle бросает на пустом массиве. Строка 42 уже удалила существующие… _(correctness; api-opcore)_

### api-providers
- **[MEDIUM]** `apps/api/src/providers/_errors.ts:59-65` -> /transpult — **extractHttpStatus ловит любое 3-значное число в тексте ошибки → возможна неверная классификация** — Вторая ветка регэкспа \b(\d{3})\b матчит произвольное 3-значное число (адрес/порт/id), не только HTTP-статус, и extractHttpStatus проверяется ДО looksLikeNetworkError (строки 85-94). Сетевая ошибка с числом в тексте получит status!==null → … _(correctness; api-providers)_

### api-repairs-insp
- **[HIGH]** `apps/api/src/modules/cold-chain/mock-sensor.ts:36-37` -> /transpult — **generateMockReading inRange band is inverted when SLA window is narrow (slaMax - slaMin < 1)** — Lines 36-37: when slaMax - slaMin < 1 (e.g. min=2, max=2.5), lo = min(2.5, 2.5)=2.5 and hi = max(2.0, 2.0)=2.0, so lo > hi. `rand(2.5, 2.0)` = `2.5 + Math.random() * (2.0-2.5)` produces values in [2.0, 2.5] numerically (negative range), so … _(correctness; api-repairs-insp)_

### api-signatures
- **[HIGH]** `apps/api/src/modules/signatures/gosklyuch-callback.ts:203-242, 57-71 (sign-endpoint validateMchd)` -> /jurist — **МЧД-валидация не проверяет granterInn (доверитель) против организации/документа** — И validateMchd в sign-endpoint.ts (57-72), и проверка в callback (224-229) сверяют статус, срок, granteeInn↔signerInn, organizationId, но НЕ проверяют, что granterInn МЧД соответствует ИНН организации-доверителя документа. В пределах одного… _(correctness; api-signatures)_
- **[HIGH]** `apps/api/src/providers/signature/kontur-sign.ts:18, 93 (sign-endpoint PROVIDER_IDS)` -> /transpult — **Рассинхрон id провайдера: enum 'kontur-sign'/'sbis-sign' (дефис) vs class.name 'kontur_sign'/'sbis_sign' (подчёркивание)** — sign-endpoint PROVIDER_IDS=['gosklyuch','kontur-sign','sbis-sign',...] (дефис), но KonturSignSignatureProvider.name='kontur_sign', SbisSignSignatureProvider.name='sbis_sign' (подчёркивание). В sign-endpoint это не ломает (спец-ветка только … _(layer-drift; api-signatures)_

### api-trips-core
- **[MEDIUM]** `apps/api/src/modules/trips/transport-documents-store.ts:1027-1047` — **signerRole free-text, signatureState always 'partially_signed' (never fully_signed)** — Route signerRole=z.string().min(2).max(100) (routes.ts:981) not a role enum. store signatureState.status hardcoded 'partially_signed' (1044) regardless of collected signatures; providerStatus=signed:<string> (1049). Chain completion not det… _(correctness; api-trips-core)_

### api-waybills
- **[HIGH]** `apps/api/src/modules/waybills/etrn-generator.ts:120-128` — **Идентификатор документа ЭТрН (GUID) генерируется через Math.random, не CSPRNG** — generateDocId строит v4-GUID для ИдФайл/ON_ETRN_* через Math.random()*16. V8-PRNG даёт риск коллизий/предсказуемости; проект уже мигрировал на CSPRNG в auth/onboarding. Уникальность важна для связки титулов (СсылкаНаТитул). _(correctness; api-waybills)_
- **[HIGH]** `apps/api/src/modules/waybills/etrn-titles-generator.ts:94-127 (T02), 161-200 (T05), 231-261 (T06)` — **Генераторы Титулов 2/5/6 не подключены ни к одному рантайм-пути (только тесты), при этом НомДок=waybillId (UUID), а не номер ПЛ** — generateETrNTitle2/5/6 используются только в xsd-validator.test.ts; ни один маршрут/EDI-путь их не вызывает. При этом пишут НомДок=input.waybillId (UUID), тогда как T01/T4 пишут waybill.number — рассинхрон формата НомДок в одной цепочке. _(unfinished; api-waybills)_

### mobile-data
- **[LOW]** `apps/mobile/src/api/trips.ts:115-209 (updateTripStatus, startTrip, completeTrip, submitDeliveryConfirmationV2, confirmRoutePoint)` -> /transpult — **Дублирующие orphan-хелперы в trips.ts: не используются экранами и обходят offline-очередь** — Grep по screens не находит вызовов confirmRoutePoint / submitDeliveryConfirmationV2 / updateTripStatus / startTrip / completeTrip — экраны (CheckpointScreen, DeliveryConfirmationScreen, TripCompletionScreen) реализуют те же мутации inline ч… _(unfinished; mobile-data)_

### mobile-screens
- **[HIGH]** `apps/mobile/src/api/client.ts:85-86` -> /transpult — **Centralized auth-logout event испускается только при 401, но не при 403 — токены с отозванными правами не разлогинивают** — Строка 85: `if (res.status === 401 && !suppressLogoutOn401)`. 403 не обрабатывается. Если роль изменена администратором, водитель продолжает использовать приложение и видит AuthError вместо экрана логина. _(error-handling; mobile-screens)_
- **[HIGH]** `apps/mobile/src/screens/MechanicInspectionScreen.tsx:175-181` -> /transpult — **inspectionType жёстко задан 'pre_trip' — нет поддержки 'periodic' типов проверки** — Строка 175: `inspectionType: 'pre_trip'` захардкожен. TechInspectionPayload типизирует `'pre_trip' | 'periodic'`. UI не предоставляет выбора типа. _(unfinished; mobile-screens)_
- **[HIGH]** `apps/mobile/src/screens/TripCompletionScreen.tsx:47` -> /transpult — **sync-event payload использует поле 'odometer' вместо 'odometerEnd', ожидаемого сервером** — Строка 47: `odometer: odometerEnd` в sync-event payload. trips.ts completeTrip использует `odometerEnd`. Если sync-event handler ожидает `odometerEnd`, показатель пробега не сохранится. _(layer-drift; mobile-screens)_

### shared
- **[MEDIUM]** `packages/shared/src/invoice-fsm.ts:144` -> /transpult — **canTransitionInvoice не описывает переходы в/из 'corrected' — статус выставляется в обход FSM** — InvoiceStatusEnum (стр.23-30) включает 'corrected', но canTransitionInvoice обрабатывает только issued->corrected (стр.213). Нет правил paid_partial/paid_full->corrected и ни одного перехода ИЗ 'corrected' (всё падает в финальный 'not in FS… _(correctness; shared)_
- **[MEDIUM]** `packages/shared/src/schemas.ts:217` -> /transpult — **Дублирующиеся температурные поля заказа (temperatureMin/Max vs temperatureMinC/MaxC) — мёртвый legacy-набор** — OrderSchema несёт ДВА набора: Sprint-9 temperatureMin/Max (стр.218-219) и Wave-2 coldChainRequired/temperatureMinC/MaxC (стр.221-223). OrderUpdateSchema (стр.279-283) тоже принимает оба. Активная cold-chain логика читает только *C-набор. Le… _(layer-drift; shared)_

### web-admin-1
- **[HIGH]** `apps/web/src/app/admin/compliance/page.tsx:383` -> /transpult — **Marking 'recent' table hardcoded slice to 50 rows client-side without server pagination** — Confirmed at line 383: `{rows.slice(0, 50).map(r => (` — no pagination indicator, no 'showing N of M' label. The UI silently truncates at 50 with no user indication. _(correctness; web-admin-1)_
- **[HIGH]** `apps/web/src/app/admin/integrations/page.tsx:204-206` -> /transpult — **test() handler sets component-level error state on failure — error persists even after successful subsequent operations** — Confirmed at lines 202-205: `setError(msg)` is called on test failure, AND `toast({ variant: 'error', ... })` is also called. So the error appears both as a page-level persistent banner AND a toast — double reporting. The page-level error p… _(error-handling; web-admin-1)_

### web-admin-2
- **[LOW]** `apps/web/src/app/admin/settings/page.tsx:273-275` — **canSave condition allows saving unchanged usnVatRate when only regime is unchanged** — The PATCH body construction at L281-285 is correct for the intended purpose. The audit-log noise issue (sending usnVatRate:null when switching away from usn_with_vat) is real but idempotent — it creates an extra audit log entry but causes n… _(correctness; web-admin-2)_

### web-auth-pages
- **[MEDIUM]** `apps/web/src/app/signup/verify/page.tsx:120-135` -> /transpult — **Multi-char ввод в OTP формирует fullCode из устаревшего digits (stale closure)** — В ветке вставки нескольких цифр через onChange (не через paste) fullCode собирается из digits.slice(...) (строки 131-132) — это значение из замыкания текущего рендера, а не из обновлённого через setDigits next. При быстром мультисимвольном … _(correctness; web-auth-pages)_

### web-client-orders
- **[HIGH]** `apps/web/src/app/orders/page.tsx:65-83` — **orders/page.tsx STATUS_LABEL отсутствует статус 'completed'** — STATUS_LABEL строки 65-72 содержит draft/confirmed/assigned/in_transit/delivered/cancelled — 'completed' отсутствует. STATUS_TONE строки 76-83 аналогично. При order.status='completed' badge получает сырое значение и tone='neutral' через fal… _(layer-drift; web-client-orders)_

### web-components-1
- **[HIGH]** `apps/web/src/components/ui/error-boundary.tsx:52` — **Raw error.message exposed in production UI — may surface internal path/schema details** — Line 52 renders `{error.message || 'Произошла непредвиденная ошибка...'}` unconditionally in all environments. If a fetch wrapper throws `new Error(json.error)` with a DB constraint or internal detail, it surfaces to all users in production… _(error-handling; web-components-1)_
- **[HIGH]** `apps/web/src/components/ui/period-selector.tsx:33-61` — **computeRange 'all' preset sets to=now — analytics queries exclude rest of today** — Line 35 initializes `to = now`. The 'all' case (lines 55-58) only sets `from` and never overrides `to`, so computeRange('all') returns to=exact current datetime. Rows created after this moment are excluded from 'all' queries until next refr… _(correctness; web-components-1)_

### web-components-2
- **[HIGH]** `apps/web/src/components/MarkdownView.tsx:81-84` — **Вложенные inline-элементы не поддерживаются: ссылка внутри bold не рендерится** — Line 83: `<strong key={key++}>{bold[1]}</strong>` — `bold[1]` вставляется как строка без рекурсивного вызова renderInline. `**[text](url)**` отобразится как жирный текст `[text](url)`, ссылка неактивна. Аналогично для link text на line 100. _(correctness; web-components-2)_
- **[HIGH]** `apps/web/src/components/OnboardingTour.tsx:134-137` — **POST /auth/me/preferences — эндпоинт тура вероятно не существует на API** — OnboardingTour.tsx:135 вызывает `api.post('/auth/me/preferences', ...)`. Grep по всему `apps/api/src` на 'me/preferences' — 0 совпадений. Эндпоинт не реализован. `.catch(() => {})` молча глотает 404. Персистенция тура работает только через … _(unfinished; web-components-2)_

### web-fleet-1
- **[HIGH]** `apps/web/src/app/fleet/components/VehiclesTable.tsx:496-498` — **'История одометра' row action duplicates 'Открыть карточку' — both navigate to VehicleCard with no odometer section** — Lines 494-499 show 'История одометра' calls `setSelectedId(row.id)` — identical to 'Открыть карточку' at line 485. VehicleCard has no odometer tab, so both actions open the same info view. _(correctness; web-fleet-1)_
- **[HIGH]** `apps/web/src/app/fleet/components/VehiclesTable.tsx:271` — **updateVehicle accepts isBlocked in VehicleCreateSchema.partial() but schema and DB column do not have this field** — routes.ts line 124 uses VehicleCreateSchema.partial().safeParse(request.body). schemas.ts line 144 confirms VehicleCreateSchema omits isBlocked (not in VehicleSchema at all). Zod strips unknown keys silently, service never writes it. Three … _(layer-drift; web-fleet-1)_

### web-fleet-2
- **[HIGH]** `apps/web/src/app/fleet/components/AddFineModal.tsx:54` -> /transpult — **violationDate sent as UTC midnight — same off-by-one-day issue as AddPermitModal** — Line 54: `violationDate: new Date(form.violationDate).toISOString()` — bare YYYY-MM-DD parsed as UTC midnight, stored one day earlier for UTC+3 users. _(layer-drift; web-fleet-2)_
- **[HIGH]** `apps/web/src/app/fleet/components/AddPermitModal.tsx:57-58` -> /transpult — **validFrom/validUntil date strings parsed as UTC midnight — off-by-one-day for UTC+3 users** — Lines 57-58: `new Date(form.validFrom).toISOString()` where form.validFrom is a date-only string. ECMA-262 parses bare YYYY-MM-DD as UTC midnight; for Moscow (UTC+3) this stores the previous calendar day. _(correctness; web-fleet-2)_
- **[HIGH]** `apps/web/src/app/fleet/components/FuelRecordsTable.tsx:68-71` -> /transpult — **loadData error silently swallowed — table shows empty state with no user feedback** — Lines 69-70: catch block only calls console.error. Same pattern in OdometerHistoryTable, DowntimeRecordsTable, MaintenanceScheduleTable, FinesTable, PermitsTable. On network failure the table renders as if empty. _(error-handling; web-fleet-2)_

### web-lib
- **[HIGH]** `apps/web/src/lib/api.ts:171-183` -> /transpult — **Тип возврата api.me() не содержит organizationId/isSuperAdmin/organization — каст as CurrentUser скрывает рассинхрон** — Сервер GET /api/auth/me возвращает data c полями organizationId, isSuperAdmin, organization (apps/api/src/auth/auth.ts:334). Клиентский тип me() (api.ts:171-183) описывает только { id,email,fullName,roles,phone?,driverId? }. В user-context.… _(layer-drift; web-lib)_
- **[MEDIUM]** `apps/web/src/lib/api.ts:118-133` -> /transpult — **streamSSE не обрабатывает 401 (нет logout-редиректа/broadcast как в request())** — Метод request() при 401 на не-auth роуте делает BroadcastChannel('tms-auth')+postMessage('logout') и редирект на /login (строки 81-98). streamSSE (copilot/SSE) при истёкшей сессии получит 401 и просто бросит translateApiError (стр.130-132),… _(error-handling; web-lib)_

### web-onboarding-fin
- **[HIGH]** `apps/web/src/app/billing/page.tsx:51-56 (daysUntil) vs 187-190 (differenceInCalendarDays)` -> /transpult — **Несогласованный подсчёт осталось дней: триал по миллисекундам (ceil), период подписки — по календарным дням** — trialDays = daysUntil() округляет вверх разницу в мс (Math.ceil(ms/86.4e6)). daysToPeriodEnd = differenceInCalendarDays(). Для одной оставшейся длительности два баннера могут показать разные числа. Косметика/UX, на деньги не влияет. _(correctness; web-onboarding-fin)_

### web-repair-med
- **[HIGH]** `apps/web/src/app/repair/page.tsx:126-138` — **assignedTo и category отправляются на сервер, но TODO указывает что API их не персистирует** — page.tsx:129-130: явный TODO-комментарий 'persist assignedTo (uuid -> users.id) and category (enum) on the repairs table'. RepairRequestSchema в shared/schemas.ts:830 содержит `assignedTo` как optional, но `category` отсутствует в схеме сов… _(unfinished; web-repair-med)_

### web-trips
- **[HIGH]** `apps/web/src/app/trips/page.tsx:947` — **Метки 'plan' и 'fact' в таблице маршрута остались на английском** — Строка 947: `{point.status || 'planned'} | plan {formatTimelineDate(point.plannedArrivalAt)} | fact {formatTimelineDate(point.actualArrivalAt)}` — слова 'plan' и 'fact' явно на EN в видимой строке досье рейса. _(unfinished; web-trips)_
- **[LOW]** `apps/web/src/app/trips/page.tsx:2154-2157` — **RBAC-редирект срабатывает до завершения загрузки пользователя — мигание для разрешённых ролей** — useEffect (строки 2154-2158): условие `!userLoading && (!user || ...)`. Согласно user-context.tsx (строка 56), начальное состояние `loading=true`, `user=null`. Паттерн корректен: редирект выполняется только когда `userLoading===false`. Реал… _(correctness; web-trips)_

## Таблица покрытия (все 38 сегментов завершены)

_«Не дочитано» = файлы ВНЕ зоны сегмента, прочитанные частично для контекста; in-zone файлы покрыты на 100%._

| Сегмент | Подтв. | Не дочитано (вне зоны) | Заметка о покрытии |
|---|---|---|---|
| api-auth | 5 | 4 | Все 6 файлов зоны прочитаны на 100% построчно (auth.ts 1776 строк — в 4 фрагментах). Тест-файлы (code-gen.test.ts, rbac.test.ts, rbac-strict |
| api-onboarding | 8 | 0 | All 9 target files read in full. Additionally read auth/auth.ts (1776 lines) and auth/rbac.ts to verify RBAC gate correctness and the POST / |
| api-orders | 8 | 0 | Все 7 .ts-файлов зоны (orders/** + operations/**) прочитаны полностью. Для контекста прочитаны auth/guards.ts, auth/rbac.ts, packages/shared |
| api-opcore | 5 | 0 | Зона operational-core прочитана на 100% (9 файлов, *.test.* отсутствуют). Дополнительно для верификации находок прочитаны: apps/api/src/even |
| api-trips-core | 7 | 5 | Зона аудита (service.ts, routes.ts, state.ts, volume.ts, margin.ts, eta.service.ts, etrn-provider.ts) прочитана на 100%. Дополнительно прочи |
| api-trips-docs | 5 | 5 | Все 3 файла зоны прочитаны на 100% строк (transport-documents.ts — двумя страницами 1-1313 и 1314-1611). Контекст по мультитенантности/RBAC/ |
| api-finance-core | 9 | 5 | Зона аудита (routes.ts, finance.service.ts, schemas.ts) прочитана на 100%; дополнительно полностью прочитан invoice-workflow.service.ts для  |
| api-finance-invoice | 6 | 3 | Все 4 целевых файла зоны прочитаны построчно на 100%. Известные из дайджеста закрытые дефекты (P0-S1 cross-tenant в invoice-workflow getInvo |
| api-billing | 4 | 1 | Зона billing/dpa прочитана на 100% (4 продуктовых файла + webhook.test.ts целиком для подтверждения семантики dedupe). billing.test.ts не чи |
| api-signatures | 8 | 0 | Прочитаны 100% строк всех 9 source-файлов зоны (signatures/**, mchd/**, providers/signature/**), тесты исключены по заданию. Для подтвержден |
| api-edi | 8 | 4 | Прочитаны ВСЕ продакшн-.ts файлы зоны (edi/**, compliance/**, adr/**, providers/edi/**) построчно, плюс зависимости вне зоны для верификации |
| api-waybills | 6 | 2 | Зона waybills/** прочитана на 100% (6 файлов). Дополнительно прочитаны зависимости для верификации находок: auth/guards.ts (org-scope/IDOR), |
| api-documents | 8 | 4 | Все 9 файлов зоны apps/api/src/modules/documents/** прочитаны полностью. Дополнительно читались вызывающие файлы (finance/routes.ts, inspect |
| api-fleet | 9 | 3 | fleet.test.ts excluded as test file per scope rules. Analytics routes (apps/api/src/modules/analytics/routes.ts) are out of segment scope bu |
| api-repairs-insp | 11 | 2 | Все 9 целевых файлов зоны покрыты полностью. Вспомогательные файлы (guards.ts, rbac.ts) читались выборочно для проверки конкретных гипотез — |
| api-providers | 4 | 2 | Прочитаны ВСЕ файлы зоны (providers/** кроме signature/ и edi/ и *.test.*). Доп. файлы billing/service.ts и wialon.worker.ts читались частич |
| api-integrations | 6 | 6 | Прочитаны целиком все non-test .ts ядра зоны (workers, queues, redis, routes, websocket, telegram). Mock-файлы (mocks/*) прочитаны частично: |
| api-db | 5 | 2 | Зона schema.ts/triggers.ts/connection.ts/seed.ts/seed-demo.ts прочитана на 100%. _journal.json подтверждён замороженным на idx=27 (0028), НО |
| api-misc1 | 12 | 2 | All .ts files in copilot/**, import/**, claims/**, analytics/**, scoring/**, rto/** were fully read (test files excluded per instructions).  |
| api-misc2 | 12 | 1 | All 10 files in the primary zone (geo/sync/sprint9/audit/notifications/uploads/lib/events/services/utils) were read in full. Supporting file |
| web-admin-1 | 9 | 5 | All 5 UI files in the zone were read fully line-by-line. Key backend counterparts were read to validate RBAC, multitenancy, and data-flow fi |
| web-admin-2 | 7 | 1 | Auth routes for /auth/users, /auth/checklist-templates, /auth/me/organization (POST/PATCH/DELETE) were read fully as they are the backend fo |
| web-fleet-1 | 9 | 0 | All 7 zone files read fully. Backend fleet routes.ts and service.ts read fully to validate security, org-scoping, and correctness. validator |
| web-fleet-2 | 10 | 2 | All 13 component files in the zone were read fully. Backend service and schema files read selectively for cross-reference of field names, va |
| web-trips | 10 | 0 | Все 3 файла зоны web-trips прочитаны полностью (page.tsx — 3319 строк в 3 частях, SignTitleButton.tsx — 543 строки, documents/page.tsx — 429 |
| web-dispatcher | 8 | 0 | All 15 files in the dispatcher/** and logist/** zones were read in full. No test files exist in these directories. Hooks referenced (useVehi |
| web-repair-med | 12 | 3 | All 7 frontend files in scope were read fully. Backend routes for both inspections and repairs were read fully. The inspections service was  |
| web-print-waybills | 6 | 3 | Аудит охватывает 100% файлов зоны apps/web/src/app/print/** и apps/web/src/app/waybills/page.tsx. API-маршруты, вызываемые print-страницами  |
| web-onboarding-fin | 4 | 0 | Прочитаны 100% строк всех 13 файлов зоны (onboarding/**, finance/**, billing/**, tariffs/** — *.tsx/*.ts, без *.test.*). Зоны billing/tariff |
| web-client-orders | 7 | 6 | Все 7 файлов зоны apps/web прочитаны полностью. Ключевые backend-файлы (orders/routes, orders/service, claims/routes, guards.ts, fleet/route |
| web-auth-pages | 3 | 2 | Все 5 файлов зоны (login, signup, signup/verify, forgot-password, reset-password) прочитаны построчно на 100%. Дополнительно прочитаны api.t |
| web-misc | 7 | 2 | All web-zone .tsx/.ts files in landing/about/status/legal/import/incidents/analytics/kpi were read in full. Backend API route files for the  |
| web-components-1 | 8 | 0 | All 25 files in apps/web/src/components/ui/ were read in full (100% line coverage). No test files or node_modules were present in the zone.  |
| web-components-2 | 8 | 2 | Все 10 целевых .ts/.tsx файлов сегмента прочитаны целиком. Для верификации находок дочитывались API-файлы (guards.ts, cold-chain/routes.ts,  |
| web-lib | 3 | 4 | Прочитаны 100% строк всех 8 не-тестовых файлов зоны (lib: 6, hooks: 2). Подзадач/дополнительных файлов в lib/** и hooks/** нет (Glob подтвер |
| mobile-screens | 14 | 10 | Все тест-файлы (*.test.*) исключены согласно условиям задания. UI-компоненты (Card/Pill/ProgressSteps/etc.) пропущены — они не содержат бизн |
| mobile-data | 5 | 6 | Прочитаны 100% строк всех non-test файлов зоны (api/**, database/**, database/models/**, utils/**). Test-файлы (*.test.*) исключены по задан |
| shared | 4 | 0 | Прочитаны на 100% все .ts файлы зоны packages/shared/src (исключая dist). Помимо чтения проведена эмпирическая проверка: (1) regex госномера |

## Отсеяно верификатором (12) — доказательство, что проверка дискриминировала

| Severity->Verdict | file:line | Заголовок | Почему отсеяно |
|---|---|---|---|
| P2->FALSE_POSITIVE | `apps/api/src/modules/documents/upd-pdf.ts:137-139` | Построчный НДС в УПД вычисляется из amount (с НДС), а не из price — ра | routes.ts:866-877 подтверждает: `qty: 1, price: costPerTrip, amount: costPerTrip` — при qty=1 price==amount, vatAmt корректен. Расхождение невозможно при текущих вызовах; это хрупк |
| P3->FALSE_POSITIVE | `apps/api/src/modules/fleet/routes.ts:212-214` | PUT /fleet/drivers/:id — indentation bug (unreachable-looking return s | Line 213 confirmed: `user.roles.includes('driver') ? await resolveDriverId(user.userId) : null` — the 'unnecessary DB query for non-driver roles' claim in the finding is incorrect. |
| P2->FALSE_POSITIVE | `apps/web/src/app/admin/tariffs/page.tsx:109-122` | TariffModal form does not reinitialize when tariff prop changes while  | Line 565 `key={modal.tariff?.id ?? 'new'}` guarantees remount on any tariff ID change. The repro scenario (same ID, different props simultaneously) cannot occur in the current UI f |
| P2->FALSE_POSITIVE | `apps/web/src/app/admin/audit-log/page.tsx:121-127` | onResetFilters uses stale buildQuery closure — reset doesn't clear fil | React 18 flushes batched state updates synchronously within event handlers, so setTimeout(0) fires after state is committed. L106 shows load's dep is [buildQuery] which will have u |
| P2->FALSE_POSITIVE | `apps/web/src/app/logist/components/CreateTripModal.tsx:144-151` | carrierCostIncludesVat field name mismatch — sent as `carrierCostInclu | Backend service.ts:68 has a single `carrierCostIncludesVat?: boolean` field for all modes; no `ownCostIncludesVat` exists in schema.ts or service.ts. Both modes correctly map to th |
| P3->FALSE_POSITIVE | `apps/web/src/app/dispatcher/page.tsx:541-546` | isMojibake returns true for null/empty input — semantically conflates  | Confirmed that line 122 of CockpitLeftRail uses `item.message && !isMojibake(item.message)` — the outer `&&` guard means isMojibake is never called with falsy input at any real cal |
| P1->FALSE_POSITIVE | `apps/api/src/modules/repairs/routes.ts:155-178` | PUT /repairs/:id не проверяет, принадлежит ли запись текущей организац | service.ts:857 `scopedRepairCondition(id, user.organizationId)` и service.ts:736 подтверждают org-scope в обоих методах обновления. |
| P3->BY_DESIGN | `apps/web/src/app/print/invoice/[id]/page.tsx:21-30` | invoice/[id]/page.tsx: CARRIER-реквизиты зашиты реальными данными ИП Б | Строки 17-20 содержат явный комментарий о намеренности решения ('these defaults exist so a missed env doesn't render fictional placeholder data'); рассинхрон с etrn/waybill — отдел |
| P3->FALSE_POSITIVE | `apps/web/src/app/landing/components/Pricing.tsx:153` | Free plan yearly price display: '0 ₽ / мес' instead of 'бесплатно' | Pricing.tsx:153 confirmed: `monthly === 0 ? 'навсегда' : '/ мес'` — free plan correctly shows 'навсегда'. Auditor self-refuted this finding in the original text. |
| P3->FALSE_POSITIVE | `apps/web/src/components/ui/form-field.tsx:185-193` | customError prop bypasses format validator entirely — stale invalid st | Line 192 includes customError in useCallback deps, so clearing customError creates a new validate reference; line 206 has validate in useEffect deps, so the effect re-runs and call |
| P3->FALSE_POSITIVE | `apps/web/src/components/sidebar.tsx:71-73` | super_admin (admin без organizationId) не отображает сайдбар — попадае | sidebar.tsx:57 явно содержит `repair_service: 'Ремонтная служба'`. Аудитор ошибся — маппинг существует. Находка не подтверждается кодом. |
| P1->FALSE_POSITIVE | `apps/mobile/src/screens/TripCompletionScreen.tsx:44-50` | Двойное завершение рейса: event_id генерируется из Date.now()+Math.ran | Строка 44: id генерируется один раз в `body` до try. Строка 72: в enqueueAction передаётся тот же `body` объект — event_id не пересоздаётся. Аргумент аудитора о двух разных id опро |

## Честные оговорки QA (границы достоверности)

- **Верификация — один скептик на находку, не majority-vote.** Confidence = «проверено чтением кода», не «прогнано в рантайме». ~12 находок опровергнуто — проверка не штамповала, но среди 280 нулевой false-positive не гарантирую. Перед фиксом TransPult должен перечитать цитату.
- **MEDIUM/LOW часто зависят от рантайма/конфига** (TZ контейнера, гонки при конкуренции, env). Их статус подтверждается прогоном — не ставил их в P0.
- **Наложено 4 ручных QA-корректировки** (severity/verdict) — каждая помечена «QA-корректировка» в теле. Авто-верификатор местами не сверялся с дайджестом (пропустил, что S3 называл calculateTripCost) и переоценивал severity super-admin-only сценариев.
- **Не QA-зона помечена -> /transpult / /jurist** в полях находок — продуктовые/юр-решения не принимал.
- **Известное-отложенное** (JWT refresh, split trips.tsx, as-any, реальные XSD не в репо, margin FX) — намеренно НЕ переоткрывал.

_Сырьё: workflow tms-full-code-audit (76 агентов, ~7.9M токенов, 2 прохода). Полный JSON всех 292 находок + вердиктов — в transcript workflow._
