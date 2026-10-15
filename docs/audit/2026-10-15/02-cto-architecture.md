# CTO / Архитектура — аудит TMS 2026-10-15

**Персона/взгляд:** Werner Vogels — «everything fails all the time». Смотрю на систему как на распределённую: что произойдёт, когда упадёт Redis, когда два диспетчера нажмут одновременно, когда клиент импортирует «кривые» данные, когда mock-код случайно окажется в проде. Интересуют границы, инварианты, blast radius и честность архитектурной документации.

**Охват (прочитано):** `apps/api/src/server.ts`, `db/{connection,schema,triggers}.ts`, все 60 SQL-миграций (выборочно содержимое: 0000, 0036, 0048, 0049, 0059), `scripts/migrate.ts`, `scripts/deploy.sh`, `integrations/{queues,redis,websocket}.ts`, все воркеры `integrations/workers/*`, моки `integrations/mocks/{wialon,gibdd}.mock.ts`, `providers/{base,_http,index}.ts` + адаптеры EDI/payment/signature, `events/journal.ts`, `auth/{auth,guards,org-middleware}.ts` (только архитектурная часть: tenant-модель, rate-limit), модули `trips` (state/service), `orders`, `waybills`, `edi`, `sync`, `operations/exceptions-service`, `operational-core/dossier-service`, `trips/transport-documents-store`, `trips/etrn-provider`, `finance/tarification.service`, `import`, `utils/{db-helpers,safe-error}.ts`; `packages/shared`; `apps/web` (dispatcher polling, крупнейшие страницы), `apps/mobile/package.json`; `package.json`/`pnpm-lock.yaml` всех пакетов; `.github/workflows/p0-gate.yml`; `nginx/*.conf`; `docker-compose.prod.yml`; `docs/architecture/*` + ADR 0001/0003; прошлые аудиты (`docs/qa/code-audit-2026-06-14.md`, `docs/qa/remediation-tracker.md`, `docs/operations/audit-2026-05-12-deep.md`).

**Метод:** статическое чтение кода и схемы, трассировка потоков данных (воркер → таблица → юр. документ), сравнение схемы Drizzle с SQL-миграциями скриптом (совпадение по таблицам — 70/70), подсчёт паттернов (условный tenant-scope, recordEvent вне tx, catch→400), проверка версий в lockfile. По каждой находке — повторное чтение кода и попытка опровергнуть (adversarial self-check). Код не запускался, БД не поднималась.

---

## Вердикт

Каркас платформы разумный: монолит Fastify + Postgres + BullMQ, общий пакет `@tms/shared` с канонами статусов и FSM, append-only журнал на триггерах, шифрование кредов, пул и `statement_timeout`, advisory-lock для нумерации, серьёзная санитизация ошибок и логов. Однако в продовой конфигурации **mock-слой не изолирован от production-данных**: фоновые воркеры каждые 15 минут пишут вымышленные пробеги, штрафы и GPS в таблицы реальных арендаторов, а одометр затем попадает в путевой лист. ЭДО/ЭТрН (ядро compliance-first продукта) реализовано тремя параллельными абстракциями, и все три в итоге mock, причём одна сама переводит статус в «подписан клиентом». Мультитенантность держится на соглашении (`organization_id` nullable, «нет org = super-admin», ~117 условных фильтров, нет RLS), а несколько общих ресурсов (нумерация, Redis внутри транзакций) создают отказ всех арендаторов из-за одного. Документация архитектуры (ADR-0001/0003, diagram) описывает систему, которой нет в коде.

**Оценка зрелости архитектуры: 4/10** (хорошая база и гигиена после прошлых аудитов, но изоляция mock/prod, tenant-изоляция и отказоустойчивость при сбоях зависимостей — ниже уровня, нужного для пилота с реальными перевозчиками).

## Сильные стороны

- Схема Drizzle и SQL-миграции синхронны по набору таблиц (70/70). Новые миграции (0059) идут по правилам `docs/architecture/migrations.md`: BEGIN/COMMIT и IF NOT EXISTS.
- Переходы статусов рейса проходят через `TRIP_STATE_TRANSITIONS` из `@tms/shared`: `canTransition` и `SELECT … FOR UPDATE` в `changeTripStatus`. Нумерация ORD/TRP/WB сериализована через `pg_advisory_xact_lock`.
- Пул Postgres с `statement_timeout=30s` и `idle_in_transaction_session_timeout=60s`. Readiness отдаёт 503, BullMQ-задачи ретраятся с exponential backoff.
- Провайдерный фреймворк: AES-256-GCM с fail-fast по `CREDENTIALS_KEY`, `httpFetch` с таймаутом и ретраями, у ЮKassa стабильный `Idempotence-Key`, webhook в проде проверяется повторным запросом к провайдеру.
- Глобальный error-handler скрывает детали 5xx. `safeClientError` не даёт утекать структуре БД, pino-redact закрывает PII.
- В CI есть сборка всех пакетов, проверка OpenAPI-sync, интеграционные тесты против Postgres и Playwright happy-path.

---

## Находки

### [P0] CTO-01 — Production-воркеры пишут синтетические данные (одометр, штрафы, GPS) в таблицы реальных арендаторов
- **Где:** `apps/api/src/integrations/workers/wialon.worker.ts:47-56,104-121,138-160,190-200`; `apps/api/src/integrations/mocks/wialon.mock.ts:32-45`; `apps/api/src/integrations/workers/fines.worker.ts:61-86` + `integrations/mocks/gibdd.mock.ts:58-85`; `apps/api/src/integrations/websocket.ts:62-104`; запуск без условий: `apps/api/src/server.ts:460-470`, `integrations/queues.ts:108-146`; потребитель: `apps/api/src/modules/waybills/service.ts:410,420,534`.
- **Что:** при доступном Redis воркеры стартуют в проде без какого-либо флага:
  1. `wialon-sync` (каждые 15 минут) для **всех** неархивных ТС **всех** арендаторов берёт одометр из `WialonMock.getVehicleTelemetry`: `current + 5..50 км`. Затем `decideOdometerUpdate` записывает это в `vehicles.current_odometer_km`. Реальный адаптер вызывается только как `healthCheck()` (строки 96-103), его данные не используются. Для ТС в рейсе в `vehicle_positions` пишутся симулированные точки (`source:'mock'`), и по ним пересчитывается ETA.
  2. `fines-sync` (ежедневно) вставляет до трёх вымышленных штрафов ГИБДД на каждое ТС (`fines.status='new'`, детерминированный `resolutionNumber`).
  3. WebSocket-рассылка позиций каждые 10 секунд отдаёт карте диспетчера координаты из `WialonMock` (окрестности Москвы по хэшу госномера).
- **Сценарий:** у пилотного перевозчика 20 ТС. Каждые 15 минут одометр каждого ТС растёт в среднем на ~27 км, это около 2600 км в сутки фиктивного пробега. Утром механик выпускает путевой лист, и `odometerOut` подставляется из `vehicles.currentOdometerKm` (`waybills/service.ts:410,534`). Юридически значимый документ по Приказу Минтранса №390 получает выдуманные показания. Когда водитель вводит реальный одометр при возврате, он оказывается «меньше текущего», и срабатывает защита от отката одометра (422 / soft-warn). Предиктивное ТО, амортизация и тарификация по км искажены. В реестре появляются несуществующие штрафы, которые могут уйти в скоринг водителей или в удержания. Диспетчер видит на карте фальшивое положение машин.
- **Исправление:** немедленно. (а) Флаг `MOCK_INTEGRATIONS_ENABLED`: по умолчанию false в production; без него mock-воркеры и mock-broadcast не регистрируются. (б) Воркеры обрабатывают только организации с активным реальным адаптером, иначе no-op. (в) Данные из mock-источника никогда не пишутся в `vehicles.current_odometer_km` и `fines`. (г) Data-fix: пометить или откатить затронутые одометры по `odometer_readings`/`events`, удалить штрафы с `resolution_number` из mock-генератора, перепроверить выпущенные ПЛ.
- **Статус:** CONFIRMED. Повтор: A-P1-9 (`docs/operations/audit-2026-05-12-deep.md`), не закрыто. Тогда находку сформулировали как «реальные ключи не используются», последствие в виде порчи данных не было отражено.

### [P1] CTO-02 — Нумерация заказов/рейсов/ПЛ глобальная по всем арендаторам: один импортированный номер ломает создание заказов у всех
- **Где:** `apps/api/src/modules/orders/service.ts:35-56`; `modules/trips/service.ts:37-53`; `modules/waybills/service.ts:202-217`; вход: `modules/import/routes.ts:315-372` + `modules/import/validators.ts:34`.
- **Что:** генераторы берут `MAX(split_part(number,'-',3)::int)` по **всей** таблице без фильтра `organization_id` и под **глобальным** advisory-lock на префикс. Импорт заказов (`POST /import/orders`, роль admin/manager любого арендатора, включая self-signup) принимает произвольный `number` без проверки формата. Год берётся по UTC (`new Date().getFullYear()`).
- **Сценарий:** админ нового арендатора импортирует заказ с номером `ORD-2026-0001/1` или `ORD-2026-A12`. Номер подходит под `LIKE 'ORD-2026-%'`, и `'0001/1'::int` падает с `invalid input syntax for type integer`. После этого `createOrder` у **всех** арендаторов получает 500 до ручной правки БД. Похожий эффект даёт номер вне диапазона int. Кроме того: (1) последовательность общая, поэтому у каждого перевозчика дыры в нумерации ПЛ, а по номерам видна активность конкурентов; (2) все создания заказов платформы сериализуются одной блокировкой, и под ней каждый раз идёт полный скан; (3) в первые три часа 1 января по МСК номер получает прошлый год.
- **Исправление:** таблица-счётчик `(organization_id, series, year)` с `UPDATE … RETURNING` (или sequence per org). Advisory-lock по ключу `org|series`. Импорт нормализует номер или кладёт исходный в `external_number`, а внутренний номер генерирует сам. Год считать в `Europe/Moscow`.
- **Статус:** CONFIRMED.

### [P1] CTO-03 — ЭДО/ЭТрН: три параллельные абстракции провайдера, все в проде mock; `/edi/send` сам переводит документ в «подписан»
- **Где:** `apps/api/src/modules/edi/service.ts:1-13,180-220` (mock-прогрессия через BullMQ `sent → signed_by_carrier → signed_by_client`), вызывается из `apps/web/src/app/trips/page.tsx:1608`; `apps/api/src/modules/trips/etrn-provider.ts:108-113` (`resolveEtrnProviderAdapter` **всегда** возвращает `MOCK_PROVIDER`), используется в `trips/transport-documents-store.ts:661-671`; `apps/api/src/providers/index.ts:58-70,167-176` + `providers/base.ts:304-340` (`selectAdapter` при отсутствии или ошибке кредов молча откатывается на mock); `providers/edi/diadoc.ts` (на деле Контур.Логистика, реализованы только GET), `providers/edi/kontur.ts:49` (`TODO(real-impl)`).
- **Что:** для отправки документа в ЭДО три пути, и ни один не связан с провайдерным фреймворком, где лежат реальные креды. Mock-путь не отключается в production: `POST /transport-documents/:id/edi/send` через 5 и 10 секунд ставит `signed_by_client`. `selectAdapter` работает по принципу fail-open: битые или отсутствующие креды означают mock без ошибки. Для ОФД уже есть fail-closed с `ALLOW_MOCK_OFD`, для EDI, телематики и маркировки нет.
- **Сценарий:** диспетчер на проде жмёт «Отправить в ЭДО». Документ получает `ediExternalId=mock-…`, затем статус «подписан грузоотправителем/получателем», хотя в ГИС ЭПД ничего не ушло. Close-gate досье засчитывает ЭТрН, рейс закрывается и выставляется счёт без юридически значимого документа. После 01.09.2026 это нарушение порядка ЭПД.
- **Исправление:** один порт `EtrnExchangePort` поверх `providers/edi/*` и удаление двух других путей. В production политика fail-closed: если нет активного реального адаптера, ответ 409/503 «ЭДО не подключено», mock доступен только при `NODE_ENV!=='production'` или явном `ALLOW_MOCK_EDI`. Статусы mock-документов помечать (`provider_mode='mock'`) и исключать из close-gate.
- **Статус:** CONFIRMED.

### [P1] CTO-04 — Tenant-изоляция «по соглашению»: nullable `organization_id`, неявный super-admin «без org», system-пользователь с правами super-admin
- **Где:** `apps/api/src/db/schema.ts` (`organization_id` nullable у users/orders/trips/vehicles/drivers/invoices…; без колонки 25 таблиц, включая `waybills`, `transport_documents`, `tech/med_inspections`, `contracts`, `tariffs`, `addresses`, `restriction_zones`, `payments`, `vehicle_positions`); `apps/api/src/auth/guards.ts:45-79`; `apps/api/src/auth/auth.ts:137`; `apps/api/src/db/seed.ts:30-38`; документ: `docs/architecture/adr/0001-multi-tenancy-via-organization-id.md`.
- **Что:** (1) Роль платформенного super-admin задаётся отсутствием `organization_id` (`isPlatformSuperAdmin = admin && !org`), явного флага нет. (2) Около 117 мест строят фильтр как `orgId ? and(…, eq(org)) : eq(id)`, то есть при null-орг фильтр исчезает. (3) `assertOrganizationScope` пропускает строки с `organization_id IS NULL` для любого арендатора (`knownOrganizationIds.length===0 → return`). (4) `seed.ts` создаёт пользователя `system@tms.internal` (UUID 0, роль `admin`, без org, пароль = `SEED_PASSWORD`, `isActive` по умолчанию). Этот пользователь нужен воркерам как FK `events.author_id`, но через `/api/auth/login` под ним можно войти как кросс-тенантный super-admin. (5) Защиты на уровне БД (RLS) нет. ADR-0001 утверждает «non-nullable organization_id on every domain table», что неверно.
- **Сценарий:** утёк `SEED_PASSWORD` (он же пароль демо-учёток из `first-pilot-deploy.md`) — у злоумышленника полный доступ ко всем арендаторам через system-пользователя. Другой путь: super-admin создаёт сущность (рейс, ТС) без org, и её видят и могут менять все арендаторы через guard. Любой новый эндпоинт, где разработчик забыл ветку `else`, становится межтенантной утечкой.
- **Исправление:** (а) Явный флаг `users.is_platform_admin` и `organization_id NOT NULL` для прочих пользователей. Для system-пользователя `is_active=false` / `password_hash=NULL` и запрет логина. (б) Backfill и `NOT NULL` на `organization_id` в корневых таблицах; денормализовать `organization_id` в `waybills`, `transport_documents`, `inspections`. (в) Postgres RLS с `SET app.org_id` на каждый запрос как второй рубеж. (г) Исправить ADR-0001 либо выпустить ADR, который его заменяет.
- **Статус:** CONFIRMED (логин system-пользователя: `auth.ts:167-181` проверяет только `isActive`). Связано с C3 из `remediation-tracker.md`, корень не закрыт. Глубокую проверку эксплуатации прошу у CISO.

### [P1] CTO-05 — Журнал событий связан с Redis внутри DB-транзакций; часть событий пишется вне транзакции домена
- **Где:** `apps/api/src/events/journal.ts:31-96` (`await Promise.race([enqueueNotification, 3s])`); `integrations/redis.ts:17` (`maxRetriesPerRequest:null`); пример: `modules/trips/service.ts:1094-1222` (`recordEvent(…, tx)` под `FOR UPDATE`); вне tx: `modules/finance/invoice-workflow.service.ts:160/180, 410/438, 617/674, 804`, `modules/sync/service.ts` (7 мест) и др.
- **Что:** 62 из 102 вызовов `recordEvent` выполняются внутри транзакции, и каждый ждёт постановки Telegram-уведомления в BullMQ до 3 секунд. Остальные ~40 вызываются **после** commit доменной записи. Это противоречит ADR-0003, где сказано «domain write + event в одной транзакции».
- **Сценарий:** (1) Redis недоступен или тормозит. ioredis с `maxRetriesPerRequest:null` держит команду в offline-очереди, и каждое событие ждёт полные 3 секунды. Транзакция смены статуса рейса держит `FOR UPDATE` на trip и связанных order 3–9 секунд. Пул из 40 соединений выбирается за секунды, весь API отвечает 5xx, хотя Redis к основному сценарию отношения не имеет. Это классический каскад. (2) Транзакция откатилась после `recordEvent`, а уведомление в Telegram уже ушло — фантомное событие. (3) Процесс упал между commit счёта и `recordEvent` — изменение счёта осталось без записи в журнале (152-ФЗ / ТЗ §А.2).
- **Исправление:** transactional outbox: в транзакции только `INSERT events`, публикацию в очередь делает отдельный relay по `events.id > last_published` либо `LISTEN/NOTIFY` после commit. Все `recordEvent` перенести внутрь доменных транзакций.
- **Статус:** CONFIRMED (кодовый путь). Масштаб деградации PLAUSIBLE, под нагрузкой не измерялся.

### [P1] CTO-06 — `GET /operations/exceptions` — последовательный N+1 с ЗАПИСЯМИ на каждый рейс, вызывается каждые 30 секунд с каждого экрана диспетчера
- **Где:** `apps/api/src/modules/operations/exceptions-service.ts:126-170`; `modules/trips/transport-documents-store.ts:604-611` (`syncPersistedRows`); `modules/operational-core/dossier-service.ts:340-382` (upsert в транзакции); вызов: `apps/web/src/app/dispatcher/page.tsx:314,346-353`.
- **Что:** GET-обработчик в цикле по 50–100 активным рейсам последовательно выполняет: проверку совместимости (несколько SELECT), полную пересборку транспортных документов с **записью** в `transport_documents` и **транзакционный upsert** `document_dossier_items`, затем чтение досье.
- **Сценарий:** 5 диспетчеров и 60 активных рейсов дают 5 × 60 × (десятки запросов плюс write-транзакция) каждые 30 секунд. Это постоянная запись в WAL на чтение, конкурентные upsert одних и тех же строк (возможны deadlock/serialization), латентность в секунды и упор в `statement_timeout`/пул при росте. GET перестаёт быть безопасным и идемпотентным: даже открытый экран мутирует данные.
- **Исправление:** синхронизацию документов и досье делать по событию (смена статуса, выпуск ПЛ, callback ЭДО) или фоновой задачей. GET только читает материализованное состояние, одним батч-запросом по `tripId IN (…)`.
- **Статус:** CONFIRMED. Повтор: D2 «N+1 / perf, `operations/exceptions-service:148`» в `docs/qa/remediation-tracker.md`, DEFER, не закрыто. Фактор записи на GET не был отмечен.

### [P1] CTO-07 — `xlsx@0.18.5` (SheetJS из npm, заброшенная ветка) парсит загружаемые пользователем файлы
- **Где:** `apps/api/package.json` (`"xlsx": "^0.18.5"`, в lock `0.18.5`); `apps/api/src/modules/import/templates.ts:124-127` (`XLSX.read(buffer)` на пользовательском upload).
- **Что:** у версии 0.18.5 известны CVE-2023-30533 (prototype pollution при чтении, исправлена в 0.19.3) и CVE-2024-22363 (ReDoS, исправлена в 0.20.2). На npm исправленных версий нет: SheetJS публикует их только на `cdn.sheetjs.com`.
- **Сценарий:** админ или менеджер любого арендатора (в том числе после self-signup) загружает специально подготовленный .xlsx. В худшем случае prototype pollution в общем процессе API влияет на всех арендаторов, ReDoS блокирует event loop, и API недоступен для всех.
- **Исправление:** `xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` или переход на `exceljs`. Парсинг вынести в worker thread с лимитом времени и памяти.
- **Статус:** CONFIRMED (версия и путь вызова). Эксплуатируемость конкретного payload не проверялась.

### [P2] CTO-08 — Мобильная синхронизация: потеря изменений при >500 рейсах, удаления не передаются, гонка водяного знака, неатомарный дедуп push
- **Где:** `apps/api/src/modules/sync/routes.ts:101-190`; `apps/api/src/modules/sync/service.ts:47-110`.
- **Что / Сценарий:**
  1. `select … where updated_at > since limit(500)` **без ORDER BY**, а в ответ возвращается `timestamp: now`. Если у водителя больше 500 изменённых рейсов (первая синхронизация, `since=0`, после года работы), лишние теряются навсегда, потому что курсор уже сдвинут на `now`.
  2. `deleted: []` всегда. Рейс, переназначенный на другого водителя или удалённый, остаётся на устройстве прежнего водителя.
  3. Курсор `now` берётся по часам приложения до чтения. Строка, у которой `updated_at` проставлен раньше, но транзакция закоммичена после SELECT, не попадёт ни в эту, ни в следующую выборку.
  4. Push: дедуп сделан как «SELECT events.externalId → действие → recordEvent(externalId)». Два параллельных ретрая одного офлайн-события оба проходят проверку и применяют действие дважды. Кроме того, `idx_events_org_external_id` уникален по `(org, external_id)`, а проверка идёт только по `external_id`.
- **Исправление:** курсор вида `(updated_at, id)` с ORDER BY и `hasMore`. Водяной знак = `max(updated_at)` выданных строк минус окно безопасности (или `xmin`/txid). Tombstones для переназначений. Push: `INSERT … ON CONFLICT DO NOTHING RETURNING` на ключ идемпотентности **до** действия, в той же транзакции.
- **Статус:** CONFIRMED (1, 2, 4 по коду). Пункт 3 PLAUSIBLE.

### [P2] CTO-09 — Денежные `numeric` типизированы как `number`, в рантайме это строки: системный источник арифметических багов
- **Где:** `apps/api/src/db/schema.ts` (44 поля с `numeric(...).$type<number>()`); `apps/api/src/db/connection.ts` (парсер типов не настроен); пример: `apps/api/src/modules/finance/tarification.service.ts:369-370,386-387`.
- **Что:** `$type<number>()` меняет только TS-тип. postgres-js возвращает `numeric` строкой. Компилятор не видит проблемы, а корректность держится на ручных `num()`. Прошлый аудит уже ловил конкатенацию `100 + "20.00"` (#9).
- **Сценарий:** отмена рейса. `cancellationFee` по умолчанию `"0.00"`, это непустая строка, то есть truthy. Выражение `("0.00" ?? 0) || baseCost*0.3` возвращает `"0.00"`, и запасная ставка 30% никогда не применяется: отмена с подачей ТС тарифицируется в 0 ₽ вместо 30%.
- **Исправление:** снять `$type<number>()` и типизировать как `string`/Decimal (decimal.js) с явной конверсией в слое репозитория, либо `customType` с парсером. Для денег лучше копейки в `bigint`. Добавить lint-правило против арифметики над полями `numeric`.
- **Статус:** CONFIRMED (механизм и пример). Денежные последствия передаю CFO.

### [P2] CTO-10 — Модель ошибок: 53 обработчика catch-all → HTTP 400, коды по подстроке сообщения
- **Где:** 53 вхождения `reply.status(400).send({ … safeClientError(err, …) })` в `apps/api/src/modules/**/routes.ts` (например `trips/routes.ts:480-481,503-504`); выбор кода по подстроке: `waybills/routes.ts:147,184`, `inspections/routes.ts:444,606`.
- **Что:** бизнес-ошибки — это голые `new Error('…')`. Большинство маршрутов отдают на любую ошибку 400, в том числе на таймауты БД, обрыв соединения и исчерпание пула. Иерархии доменных ошибок (`DomainError{code,httpStatus}`) нет, классов-ошибок всего 13 на весь API.
- **Сценарий:** Postgres перезапускается, и все мутации отдают 400 «Внутренняя ошибка сервера». Метрики и алерты по 5xx молчат, клиенты и мобильная очередь не ретраят (400 считается финальной ошибкой), офлайн-события теряются как «невалидные». Изменение текста сообщения меняет HTTP-контракт.
- **Исправление:** ввести `DomainError` с кодом (`TRIP_TRANSITION_FORBIDDEN` → 409 и т.д.). Всё прочее пробрасывать в глобальный handler (5xx). Убрать маппинг по `message.includes`.
- **Статус:** CONFIRMED.

### [P2] CTO-11 — Rate-limit API привязан к подделываемому `X-Forwarded-For`; ключ «по пользователю» не работает
- **Где:** `apps/api/src/server.ts:113` (`trustProxy: true`), `server.ts:196-213` (keyGenerator); `nginx/default.conf:33`, `nginx/default-ssl.conf:50` (`$proxy_add_x_forwarded_for`).
- **Что:** nginx дописывает реальный IP к клиентскому XFF, а Fastify с `trustProxy:true` доверяет всей цепочке и берёт самый левый адрес, то есть тот, что прислал клиент. Глобальный rate-limit срабатывает на `onRequest`, до `app.authenticate` (preHandler), поэтому `request.user` там всегда пуст и ключ «user:…» не используется ни разу.
- **Сценарий:** при переборе пароля злоумышленник меняет `X-Forwarded-For` в каждом запросе, и лимит логина 5/мин не действует. Остаётся только nginx `30r/s` на IP. Одновременно все сотрудники перевозчика за одним NAT делят один бакет на 500/мин.
- **Исправление:** `trustProxy: '<ip nginx>'` или число хопов (1). В nginx `proxy_set_header X-Forwarded-For $remote_addr` (перезапись, а не дописывание). Для ключа по пользователю — rate-limit с `hook:'preHandler'`. Rate-limit store в Redis на случай нескольких инстансов.
- **Статус:** CONFIRMED (конфигурация). Влияние на auth передаю CISO.

### [P2] CTO-12 — Планировщик: cron в UTC при комментариях «МСК», биллинг без догона пропущенных суток, воркеры не переживают недоступность Redis на старте
- **Где:** `apps/api/src/integrations/queues.ts:108-146` (нет `tz`, комментарий «03:00 MSK»); `integrations/workers/billing.worker.ts:26-31`; `apps/api/src/server.ts:460-475`; `docker-compose.prod.yml` (нет `TZ`).
- **Что / Сценарий:**
  1. Контейнер в UTC: «02:00» биллинга — это 05:00 МСК, «03:00 МСК» штрафов — 06:00 МСК, SF-deadline — 09:00 МСК.
  2. `billing.daily` всегда обрабатывает «предыдущие UTC-сутки». Если в 02:00 UTC API или Redis лежали (деплой, сбой), за эти сутки автосчета не будет никогда: окно не «с последнего успешного прогона», а фиксированное. Граница суток при этом сдвинута на 3 часа относительно МСК.
  3. Если Redis недоступен в момент старта API, воркеры и повторяющиеся задачи **не запускаются вообще**, повторной попытки нет. API работает, а биллинг, SF-напоминания и штрафы молча стоят до следующего рестарта.
  4. Воркеры живут в том же процессе, что и HTTP. Тяжёлый bulk-биллинг конкурирует за event loop и пул соединений.
- **Исправление:** `repeat: { pattern, tz: 'Europe/Moscow' }`. Биллинг с водяным знаком «последний успешно обработанный период» в БД и догоном. Запуск воркеров с ретраем подключения (BullMQ сам переподключается, достаточно убрать gate `redisOk`) и алерт в health. Отдельный процесс или контейнер `worker` с той же кодовой базой.
- **Статус:** CONFIRMED (1, 2, 3). Пункт 4 — архитектурный риск.

### [P2] CTO-13 — Append-only гарантии неполные: TRUNCATE не блокируется, роль приложения владеет таблицами, журналы ЭДО и история счетов не защищены
- **Где:** `apps/api/src/db/triggers.ts:12-145`; `apps/api/src/server.ts:507` (DDL при каждом старте); `apps/api/drizzle/0036_invoice_schema_rebuild.sql:200-243`.
- **Что:** триггеры есть только на `events`, `tech/med_inspections` и `med_access_log`, и только `BEFORE UPDATE OR DELETE … FOR EACH ROW`: `TRUNCATE` их обходит. API подключается ролью, которая выполняет `DROP/CREATE TRIGGER` на старте, следовательно владеет таблицами и может снять защиту. `invoice_history`, `transport_document_events`, `edi_events` и `transport_document_receipts` защиты не имеют, хотя это юридически значимая история.
- **Сценарий:** скомпрометированный процесс API, ошибочный скрипт или оператор с кредами приложения выполняют `TRUNCATE events` или `ALTER TABLE … DISABLE TRIGGER`, и журнал стёрт без следа. Также ничто не мешает тихо поправить `invoice_history`.
- **Исправление:** разделить роли: `tms_migrator` (owner, DDL) и `tms_app` (только DML, без TRUNCATE, без владения). Добавить `BEFORE TRUNCATE … FOR EACH STATEMENT`. Распространить триггер на `invoice_history` и `transport_document_*`/`edi_events`. Перенести триггеры в миграцию, а не в boot.
- **Статус:** CONFIRMED (TRUNCATE и состав таблиц). Владение ролью PLAUSIBLE: вывод сделан по выполнению DDL на старте, права в БД не проверялись.

### [P2] CTO-14 — Документация архитектуры расходится с кодом (ADR-0001, ADR-0003, diagram, overview)
- **Где:** `docs/architecture/adr/0001-*.md`; `docs/architecture/adr/0003-*.md`; `docs/architecture/diagram.md` (секция 1); `docs/architecture/overview.md`; `docs/architecture/README.md`.
- **Что:** ADR-0001 утверждает «non-nullable organization_id on every domain table», в коде nullable и 25 таблиц вообще без колонки (CTO-04). ADR-0003 утверждает, что каждая запись идёт через journal.ts в одной транзакции, и описывает колонки `aggregate_type/aggregate_id/actor_id/occurred_at`: ~40 вызовов вне транзакции, а колонки называются `entity_type/entity_id/author_id/timestamp`. На диаграмме воркеры ходят в Diadoc/ЦРПТ/ЮKassa/SMTP/ОФД: на деле воркеры — это wialon, fines, notifications, billing, edi-mock, sf-deadline, а внешние вызовы делает API синхронно. В overview путь мобильного приложения указан как `D:\Ai\TMS\apps\mobile`. README называет «самым свежим аудитом» отчёт от 2026-05-12.
- **Сценарий:** новый разработчик или внешний аудитор (ФНС-оператор, банк) принимает решения по неверной модели изоляции и неизменяемости, а ревью полагается на гарантии, которых нет.
- **Исправление:** ADR-0010, заменяющий 0001 (фактическая модель и план до NOT NULL+RLS). Исправить 0003 или выпустить заменяющий (outbox). Перерисовать диаграмму. Пометить overview как archived.
- **Статус:** CONFIRMED.

### [P3] CTO-15 — Миграции: два реестра применённых миграций, дубль номера, ранние файлы без транзакции
- **Где:** `scripts/deploy.sh:66-84` (`tms_schema_migrations`); `apps/api/scripts/migrate.ts` (`drizzle.__drizzle_migrations`); `apps/api/drizzle/0037_app_notifications.sql` + `0037_missing_fk_indexes.sql`; файлы 0000–0037 и 0048–0049 без `BEGIN/COMMIT`; `.github/workflows/p0-gate.yml:110-111` (`drizzle-kit check || true`); устаревший `drizzle/meta/_journal.json`.
- **Что:** прод и CI/разработка ведут разные реестры. Запуск `pnpm db:migrate` на прод-БД начнёт с 0000 (там `CREATE TABLE` без IF NOT EXISTS, так что упадёт сразу, поэтому вред сейчас ограничен). Порядок двух файлов 0037 определяется лексикографической сортировкой. Проверка дрейфа носит рекомендательный характер.
- **Исправление:** один раннер и один реестр (deploy.sh вызывает `migrate.ts`). Запрет дублей номеров в CI. `drizzle-kit check` сделать блокирующим или удалить вместе с meta.
- **Статус:** CONFIRMED.

### [P3] CTO-16 — Границы модулей размыты: god-файлы, доменная логика в роутерах, циклы
- **Где:** `apps/api/src/auth/auth.ts` (1844 строки; здесь же CRUD тарифов, договоров и шаблонов чек-листов: `:982-1350`); `modules/waybills/routes.ts` (42 прямых обращения к `db`), `modules/sprint9/` (модуль назван по спринту), `modules/operations` и `modules/operational-core`, `src/integrations` и `modules/integrations`; циклы `trips↔waybills`, `documents↔trips`; 52 динамических `await import('../…')`, в основном для обхода циклов; `apps/web/src/app/trips/page.tsx` — 3597 строк.
- **Сценарий:** изменения в тарифах затрагивают модуль авторизации. Тестировать сервисный слой изолированно нельзя, циклы ломают порядок инициализации ESM.
- **Исправление:** вынести tariffs/contracts/checklists в `modules/finance`/`modules/inspections`. Правило «route → service → repo» проверять через eslint `import/no-restricted-paths`/dependency-cruiser. Переименовать `sprint9` по домену. Разбить `trips/page.tsx`.
- **Статус:** CONFIRMED.

### [P3] CTO-17 — Масштабирование: состояние в памяти процесса, лишняя нагрузка в WebSocket-рассылке, нет ретенции
- **Где:** `apps/api/src/integrations/websocket.ts:16,62-75,114` (реестр клиентов в `Map`, полный SELECT ТС всех арендаторов каждые 10 секунд даже без подключённых клиентов); `providers/base.ts:139-148` и `providers/index.ts:113-122` (кэши кредов и адаптеров на 5 минут в памяти); rate-limit без Redis-store; `vehicle_positions`, `events` без партиционирования и ретенции.
- **Что:** второй инстанс API невозможен без потери WS-рассылок (нет pub/sub) и рассинхрона кэшей (инвалидация только локальная, до 5 минут устаревших кредов). Таблица позиций растёт неограниченно.
- **Исправление:** Redis pub/sub для WS, рассылка только при наличии подписчиков и только по их org. Инвалидация кэшей через pub/sub. Политика ретенции (например, позиции 90 дней) и месячные партиции для `events` при росте.
- **Статус:** CONFIRMED (для текущего single-instance это не дефект, а потолок масштабирования).

### [P3] CTO-18 — Зависимости и CI-гейты
- **Где:** `apps/api/package.json`, `pnpm-lock.yaml`, `package.json` (pnpm.overrides), `apps/mobile/package.json:36`, `.github/workflows/p0-gate.yml:103-111`.
- **Что:** `drizzle-orm@0.38.4`/`drizzle-kit@0.30.6` и `@anthropic-ai/sdk@0.40.1` заметно отстают. `nodemailer@6.10.1` — PLAUSIBLE уязвимость GHSA-mm7p-fcc7-pg87 (интерпретация адреса, исправлена в 7.0.7). Корневой override `react: 19.2.4` перекрывает пин мобилки `react: 19.2.0` под Expo SDK 55 и RN 0.83.2, у которого рендерер собран под 19.2.0: в lock `react-native@0.83.2(react@19.2.4)`. В CI `pnpm audit … || true`, мобильные тесты с `continue-on-error: true`.
- **Сценарий:** уязвимость высокой критичности в зависимостях не блокирует merge. Рассинхрон React и рендерера RN проявится как трудноуловимые баги в мобилке.
- **Исправление:** Renovate или Dependabot. `pnpm audit --audit-level high` сделать блокирующим (с allowlist). Override React ограничить `apps/web` (`"apps/web>react"`) или выровнять мобилку по версии, которую ожидает Expo. Обновить nodemailer до 7.x.
- **Статус:** CONFIRMED (версии). Для nodemailer — PLAUSIBLE.

### [P3] CTO-19 — Проверки «внутри транзакции» в `changeTripStatus` читают через глобальный пул
- **Где:** `apps/api/src/modules/trips/service.ts:1129`; `apps/api/src/utils/db-helpers.ts:44-60`.
- **Что:** фикс TOCTOU (P2 из аудита 2026-06-14) повторяет проверку непройденных точек «под FOR UPDATE», но `getIncompleteRoutePoints` использует `db`, а не `tx`, и строки `route_points` не блокируются. Гарантия атомарности, заявленная в комментарии, не обеспечена: параллельная правка точки между проверкой и commit проходит.
- **Исправление:** передавать `tx` и блокировать точки (`FOR SHARE`) либо выразить инвариант в БД (триггер или constraint на завершение).
- **Статус:** CONFIRMED. Повтор: P2 «TOCTOU COMPLETED» (code-audit-2026-06-14), закрыт частично.

---

## Рекомендации / Next Actions

1. **(P0, сегодня)** Отключить в production mock-воркеры и mock-broadcast (флаг `MOCK_INTEGRATIONS_ENABLED=false`), остановить запись в `vehicles.current_odometer_km` и `fines` из mock-источников. Провести data-fix одометров и штрафов и перепроверить ПЛ, выпущенные с завышенным `odometerOut` (CTO-01).
2. **(P1)** Перевести `selectAdapter` и все пути ЭДО/ЭТрН на fail-closed в production и свести три абстракции ЭДО в один порт (CTO-03). Mock-статусы не засчитывать в close-gate.
3. **(P1)** Нумерация: per-org счётчики и валидация номера при импорте. До этого — хотфикс: в MAX учитывать только `~ '^\d+$'` и фильтровать по `organization_id` (CTO-02).
4. **(P1)** Запретить логин system-пользователя, ввести явный `is_platform_admin`, начать путь к `organization_id NOT NULL` + RLS (CTO-04).
5. **(P1)** Transactional outbox для events и уведомлений: убрать ожидание Redis из транзакций, перенести `recordEvent` внутрь доменных транзакций (CTO-05).
6. **(P1)** Сделать `GET /operations/exceptions` read-only и батчевым, синхронизацию документов — по событиям (CTO-06).
7. **(P1)** Заменить `xlsx@0.18.5` (CTO-07).
8. **(P2)** Протокол синхронизации мобилки: курсор с `hasMore`, tombstones, атомарный ключ идемпотентности (CTO-08).
9. **(P2)** Модель ошибок `DomainError` и 5xx на инфраструктурные сбои (CTO-10). `trustProxy` на один хоп и перезапись XFF в nginx (CTO-11).
10. **(P2)** Планировщик: `tz: Europe/Moscow`, водяной знак биллинга, воркеры в отдельном процессе с переподключением (CTO-12). Разделение ролей БД и TRUNCATE-триггеры (CTO-13).
11. **(P2)** Типизация `numeric` (CTO-09) и регрессионные тесты денежного расчёта совместно с CFO.
12. **(P2/P3)** Актуализировать ADR и диаграммы (CTO-14). Один реестр миграций (CTO-15). Границы модулей и dependency-cruiser в CI (CTO-16). Renovate и блокирующий audit (CTO-18).

## Открытые вопросы к другим ролям

- **CISO/Security:** оценить эксплуатацию CTO-04 (system-пользователь `system@tms.internal` с `SEED_PASSWORD`, NULL-org строки, проходящие `assertOrganizationScope`) и CTO-11 (обход лимита логина через XFF) на текущем проде.
- **CFO / финансы:** CTO-09 — отмена рейса с `cancellationFee` по умолчанию тарифицируется в 0 ₽ вместо 30%; проверить остальные поля `numeric` в тарификации, счетах и выплатах субподрядчикам. CTO-12 — нужен ли догон автосчетов за пропущенные сутки и в какой TZ считаются «сутки».
- **Compliance/Юрист:** CTO-01 — путевые листы, выпущенные с фиктивным `odometerOut`: нужна ли корректировка или аннулирование и уведомление клиентов. CTO-03 — допустим ли в проде любой статус «подписан» без реального оператора ЭДО.
- **DevOps/SRE:** роль БД приложения (owner или DML-only), `TZ` контейнеров, вынос воркеров в отдельный сервис, алерт «воркеры не запущены».
- **Mobile:** подтвердить поведение клиента WatermelonDB при `deleted: []` и на 400-ответах push-синхронизации (CTO-08, CTO-10).
