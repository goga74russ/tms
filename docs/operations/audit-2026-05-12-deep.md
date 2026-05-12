# Deep audit — 2026-05-12

Параллельный аудит 7 агентами по зонам: security, api+db, web, tests, docs, providers, mobile. Read-only walkthrough всего проекта.

## Финальный статус (после волны закрытия)

**P0**: 13/13 закрыто (100%).
**P1**: 27/27 закрыто (100%) — критичные через 5 параллельных агентов + архитектурные фиксы.
**P2**: defense-in-depth, остаются как backlog.
**P3**: polish, остаются как backlog.

Закрывающие коммиты:
- `8bab538` — первая волна P0 (HMAC, CREDENTIALS_KEY, CSPRNG, error handler, tempPassword, pino redact)
- `3138a4b` — массовая волна (provider registry, multi-tenancy, import transactions + 5 агентов: mobile P0, P1 security, P1 frontend, P1 providers, doc sweep)
- `d949c25` — критичные тесты (+52, total 192) + CI gate hardening (Playwright blocking, smoke-chain job)

Тесты: было 140 → стало **192/192** (+52 на критичные пути: HMAC, CSPRNG, audit-log org scope, RBAC enum, provider registry, credentials cache).
TSC: API + web + mobile clean.
CI: P0 Gate теперь реально gate'ит (3 job'а: static, Playwright с DB+Redis services, smoke-chain).

## Severity

- **P0** — exploit-now / data corruption / unreleaseable. Чинить до пилота.
- **P1** — реальный баг или явная дыра. Чинить в ближайшие 1-2 спринта.
- **P2** — defense in depth / correctness risk / tech debt.
- **P3** — стиль / nice-to-have.

## P0 — критичные блокеры пилота

| ID | Зона | Файл:Строка | Что не так | Действие |
|---|---|---|---|---|
| A-P0-1 | **Security/billing** | `apps/api/src/modules/billing/routes.ts:147-162` | ЮKassa webhook принимает любой POST как payment.succeeded — нет HMAC, нет signature check, нет source IP, нет replay protection. Anyone with the URL can mark any pending payment as paid and roll subscription 30 days. | HMAC `YOOKASSA_WEBHOOK_SECRET` против raw body + персистить `webhook_event_id` для дедупа + 409 на повтор. |
| A-P0-2 | **Security/encryption** | `apps/api/src/providers/base.ts:58-75` | `getKey()` молча возвращает `sha256("tms-dev-credentials-key")` если `CREDENTIALS_KEY` не задан. В проде без env — все AES-256-GCM зашифрованные provider keys (ЮKassa, Госключ, Диадок, Wialon, SMTP) дешифруются публично известным ключом. | Fail-fast при `NODE_ENV=production` без `CREDENTIALS_KEY`. Убрать "hash anything" fallback. |
| A-P0-3 | **Security/PRNG** | `apps/api/src/auth/auth.ts:752` + `modules/onboarding/routes.ts:282` | `Math.random()` для 6-значного email verification кода и для temp password при invite. PRNG предсказуема. Combined with 5-attempt rate limit per IP (не per-email), attacker может brute-force окно кода свежесозданного admin. | `crypto.randomInt(100000,1000000)` для кодов, `crypto.randomBytes(12).toString('base64url')` для паролей. |
| A-P0-4 | **Integrations** | `apps/api/src/providers/index.ts:46-63` | Adapter registry **никогда не создаёт реальные адаптеры**. Регистрируются только mocks + console + опционально SmtpEmailProvider. UI сохраняет API-ключи, статус становится `active`/`sandbox`, но `selectAdapter()` всё равно возвращает mock. Покупка реальных ключей буквально ничего не делает до фикса. | Per-org instantiation: на каждый запрос читать `provider_credentials`, decrypt, создавать конкретный класс. Cache (#A-P1-2). |
| A-P0-5 | **Mobile/build** | `apps/mobile/app.json` + отсутствие `eas.json` | Нет `bundleIdentifier` (iOS), `package` (Android), нет `eas.json`. Сборки не получится подписать → нечего ставить пилотам. | Заполнить app.json + добавить `eas.json` с dev/preview/production профайлами. |
| A-P0-6 | **Mobile/entrypoint** | `apps/mobile/app/` (parallel tree) | Двойной entrypoint: `package.json main = index.ts → App.tsx` + `app.json` plugins enable `expo-router` который видит `app/index.tsx` (английский fake-login на glass-morphism, без auth). В production build expo-router может выиграть и заменить настоящее приложение фейком. | Удалить `apps/mobile/app/` + remove `expo-router` из plugins; или мигрировать на expo-router. |
| A-P0-7 | **API/error handling** | `apps/api/src/server.ts` (нет global handler) | Не зарегистрирован `app.setErrorHandler()`. Default Fastify handler в проде эхо-ит `err.message` включая PG constraint текст (имена колонок/индексов). | Global `{success:false, error:'Internal error', requestId}` на 5xx в проде. |
| A-P0-8 | **API/transactions** | `apps/api/src/modules/import/routes.ts:96-122, 286-346, 351-391` | `/import/vehicles`, `/import/orders`, `/import/contractors` циклы `db.insert` без `db.transaction`. Частичный fail оставляет DB в несогласованном виде. (`/import/drivers` сделан правильно.) | Обернуть каждый цикл в `db.transaction`. |
| A-P0-9 | **Tests/CI** | `.github/workflows/p0-gate.yml:71-73` | Playwright job `continue-on-error: true` — комментарий явно говорит что не блокирует. Smoke chain в CI не вызывается. "P0 Gate" не gate. | Drop `continue-on-error`, поднять seeded Postgres+Redis service containers, добавить `node scripts/smoke-chain.mjs` шаг. |
| A-P0-10 | **Tests/coverage** | `apps/api/src/auth/auth.ts` + `auth/plan-guard.ts` + `modules/billing/*` + `modules/audit/*` | Login, JWT, plan-guard, ЮKassa webhook, audit-log append-only enforcement — **нет тестов**. Регрессия в этих местах = денежная утечка или RBAC bypass. | Минимум 5 тестов на каждый: happy path + 2 неважных edge cases + 2 security-critical. |
| A-P0-11 | **Mobile/sync** | `apps/mobile/src/api/sync.ts:7-54` + `database/schema.ts:1-47` | Sync push отправляет только `events.created` — `updated/deleted` молча игнорируются. Нет tombstone column → server deletes не применяются локально. Нет `migrations.ts` → любая schema-change v2 брикает existing installs. | Push всех коллекций + add tombstones + create migrations file (минимум для v1). |
| A-P0-12 | **Security/multitenancy** | `apps/api/src/db/schema.ts:943-963` (events) + `auth/auth.ts:651-721` (checklist_templates) | `events` (audit log) и `checklist_templates` **не имеют organization_id**. Любой tenant admin читает audit log других tenant'ов (PII, business data в `data` JSON) и редактирует шаблоны inspections соседних организаций. | Migration: add `organization_id` + FK + backfill + NOT NULL после verify. Scope queries по `request.orgId`. |
| A-P0-13 | **Security/onboarding** | `apps/api/src/modules/onboarding/routes.ts:271-292` | Bulk-invite возвращает `tempPassword` в plaintext в response body. Браузер админа, history, любой monitoring proxy — все хранят пароли пригласённых. | Не возвращать password из API. Только email-delivery (через SMTP provider). |

## P1 — серьёзные баги / дыры

### Security
- **A-P1-1** Token leak в логах. `apps/api/src/server.ts:38-48` — pino без `redact`. `/auth/login` body с plaintext паролем, `/integrations/credentials` с API ключами логируются.
- **A-P1-2** Credentials cache отсутствует. `apps/api/src/providers/base.ts:110-150` `loadCredentials` бьёт в DB на каждый `selectAdapter`. Hot paths (Wialon poll, fines lookup) — DB-heavy.
- **A-P1-3** SMTP transporter shared across orgs. `apps/api/src/providers/email/smtp.ts:20-49` `cachedTransporter` module-level. Первая организация залипает на весь процесс.
- **A-P1-4** MIME validation client-controlled. `apps/api/src/modules/uploads/routes.ts:31-36` MIME берётся из multipart header. Загрузка `evil.html` с `image/jpeg` → stored XSS через `S3_PUBLIC_URL`.
- **A-P1-5** CSRF / SameSite=lax + cookie auth. `apps/api/src/auth/auth.ts:133-139` — sameSite=lax всё ещё позволяет cross-site top-level POST. Нет анти-CSRF токена.
- **A-P1-6** RBAC — `roles: z.array(z.string())` принимает любые строки. `apps/api/src/auth/auth.ts:288` + `onboarding:71`. Tenant admin может создать user с произвольной ролью.
- **A-P1-7** XSS в email templates. `apps/api/src/auth/auth.ts:761-763`, onboarding:298 — `fullName`/`companyName` подставляются в HTML без escape.

### API / DB
- **A-P1-8** Route catch-all → 400. ~40 routes делают `catch(err){ reply.status(400).send({error: err.message}) }` независимо от типа. Domain errors (NotFound 404, Conflict 409, Forbidden 403) теряются.
- **A-P1-9** Wialon worker hardcoded mock. `apps/api/src/integrations/workers/wialon.worker.ts:46` всегда зовёт `WialonMock`. Реальные ключи не используются → telematics из коробки только mock. (См. A-P0-4.)
- **A-P1-10** N+1 в analytics, drivers HosBadge, billing. `apps/web/src/app/drivers/page.tsx:56-102` 1 запрос на каждую строку (200 параллельных fetch'ей).
- **A-P1-11** Cross-day misallocation в billing worker. UTC midnight cron в MSK-доменной модели → trips закрытые 02:30 MSK уезжают на предыдущий день.
- **A-P1-12** N+1 wialon worker. `integrations/workers/wialon.worker.ts:64-110` per-vehicle nested select. На 100+ ТС каждые 15min → O(N) round-trips.

### Frontend
- **A-P1-13** ErrorBoundary не используется. `apps/web/src/components/ui/error-boundary.tsx` определён, но не импортирован нигде. Любая render-ошибка падает в global `app/error.tsx`.
- **A-P1-14** Context value не мемоизирован. `apps/web/src/lib/user-context.tsx:69` — каждый рендер пересоздаёт `{user, loading, ...}`. Все consumer'ы перерендериваются.
- **A-P1-15** Dispatcher cluster — 4 параллельных live loop без `visibilitychange` gating. WS + 30s poll + 60s coldchain + 15s wialon все продолжают работать на background tab.
- **A-P1-16** Print pages re-fire window.print on data change. `apps/web/src/app/print/*/page.tsx` — `useEffect([data])` без `printedRef` flag.

### Mobile
- **A-P1-17** Logout не очищает WatermelonDB. `apps/mobile/src/context/AuthContext.tsx:70-74` — следующий driver на shared device видит данные предыдущего.
- **A-P1-18** AuthContext logs out on **any** `/me` failure (включая network blip). `apps/mobile/src/context/AuthContext.tsx:53-54` — водитель вылетает в середине смены при flaky сети.
- **A-P1-19** Hardcoded fake GPS. `apps/mobile/src/screens/CheckpointScreen.tsx:264` — "GPS-сигнал захвачен ±5м" но местоположение не запрашивается.
- **A-P1-20** Stub buttons в проде. CheckpointScreen "Простой/задержка" + "Пропустить точку" — alert("заглушка") или просто goBack(). TripCompletionScreen decorative pills.
- **A-P1-21** Дроп offline actions без UI. `apps/mobile/src/api/offlineQueue.ts:155-158` после 5 retries silently drops — driver теряет evidence.
- **A-P1-22** Offline gaps. MyWaybillScreen, MyHoursScreen, MechanicInspectionScreen — network-only, нет cache. На депо без Wi-Fi механик не видит очереди.

### Provider adapters
- **A-P1-23** Webhook handler для Diadoc/Kontur EDO missing. Push events упадут в 404.
- **A-P1-24** Telematics tokens без expiry tracking. Wialon eid 5min idle, Omnicomm 24h, Rosneft per-token — long-lived process использует stale token.
- **A-P1-25** ЮKassa Idempotence-Key = `nanoid()` (random per retry). Должен быть `${orderId}:create` иначе retries создают дубликаты платежей.
- **A-P1-26** ЦРПТ marking — `clientToken` отправляется даже на публичный verify endpoint. Утечка OMS токена.
- **A-P1-27** Tinkoff sign include nested objects. По доке Tinkoff nested objects **исключаются** из token. Подпись receipts будет fail.

## P2 — defense in depth и correctness

### Security / API
- WS token потенциально в URL/Referer.
- User enumeration через `/auth/signup` vs `/auth/resend-code` ответы.
- CORS multi-origin в single-origin mode silent downgrade.
- `/api/demo/cleanup` в проде без env-gate.
- `ilike(..., '%${search}%')` без index — DoS на больших таблицах.
- JWT 24h без refresh / revocation.
- `temperature_readings` нет `organization_id` — leak risk если query забывает join.
- `tachographRecords.date` тип может быть `date` vs `timestamptz` — TZ-loss bug.
- `getCurrentSeason()` использует server TZ для winter coefficient — flap на UTC vs MSK.

### Frontend
- 107 файлов с `'use client'` — Next 15 server components не используются.
- Нет `react-query`/`SWR` — каждая страница руками лепит fetch/loading/error.
- `apps/web/src/app/trips/page.tsx` (3,133 LOC, 46 `any`), `waybills/page.tsx` (1,607 LOC, 22 `any`), `repair/components/RepairKanban.tsx` (1,392 LOC, deprecated по TODO) — топ-3 tech-debt hotspots.
- English strings всё ещё в waybills (`Persisted transport documents`, `Next action:`, `Missing transport docs`, `ETRN blockers`).
- `window.location.href = '/trips'` вместо router.push — потеря client state.
- Color-only severity без icon в Pill — colorblind-неудобно.

### Mobile
- `AuthContext.user?.role` ignores `roles[]` array — multi-role users всегда driver.
- Upload без retry/timeout/progress. 5MB фото на EDGE = hung confirm flow.
- ETA polling never pauses on background — battery drain.
- TemperatureLog auto-mode timer session-only, force-kill teряет данные.

### Provider adapters
- Все real adapters без retry/timeout. Transient 5xx = hard fail.
- Decrypt failure swallows error → falls back to mock silently. Key rotation/tampering недетектируем.
- No RU error mapping в real adapters.
- Tachograph DDD parser — heuristic, нет CMAC signature validation.
- ЦРПТ mock возвращает productName даже при `valid=false` (real не возвращает).

## P3 — стиль / polish

(не критично, не блокирует пилот)

- 19 files c `key={i}` на dynamic lists.
- Raw `<a href>` для internal navigation (3 файла).
- Arbitrary Tailwind values: `text-[11px]`, `max-h-[85vh]` — без design tokens.
- Email/legal contacts в плейсхолдерах `privacy@tms-prod.ru` (домен не зарегистрирован).
- Hover tooltips без keyboard focus.
- Helmet/CSP не на Next.js side (только API).

## Документация (не severity-typed — fix-when-touched)

- `docs/architecture/overview.md` от 2026-04-28 — устарел на ~12 миграций, не упоминает Mobile v2.
- `docs/operations/security.md` — английский в RU-папке, P0 items уже закрыты.
- `docs/operations/migration-history.md` — листинг до 0024, отсутствует 0025.
- `docs/users/onboarding.md` описывает 6-step flow который НЕ соответствует фактическому wizard (ИНН lookup → ... → команда).
- `docs/legal/*.md` — dateline `подлежит уточнению` (B-36 пофиксил рендер на web, но markdown остался).
- `docs/operations/integrations-status.md` от 2026-05-10 — drift: ОФД/ОСАГО/маркировка/tachograph давно вышли из 🔴 mock-only.

## Test coverage

- API: 14 файлов, ~169 cases. Из 30 модулей 18 без тестов.
- Web: 0 unit tests. 1 Playwright spec (4 теста, soft-asserted, CI-advisory).
- Mobile: 0 tests.
- Shared package: 0 tests.

## Что закрываем СЕЙЧАС (этот session)

В этом коммите чиним эти P0:
1. **A-P0-3** Math.random → crypto.randomInt для verification кодов + crypto.randomBytes для temp passwords.
2. **A-P0-13** Drop tempPassword из onboarding response.
3. **A-P0-2** CREDENTIALS_KEY fail-fast при `NODE_ENV=production` без env.
4. **A-P0-7** Global error handler в `server.ts` — generic 500 message в проде, requestId для трассировки.
5. **A-P0-1 partial** ЮKassa webhook signature check (gated by env; replay protection через webhook_event_id).
6. **A-P1-1** pino redact для passwords / credentials / authorization headers.

Остальные P0 → следующие сессии (нужны архитектурные изменения):
- A-P0-4 (provider registry refactor)
- A-P0-5/6 (mobile build pipeline + dual entrypoint)
- A-P0-8 (import transactions — 3 routes)
- A-P0-11 (mobile sync + tombstones + migrations)
- A-P0-12 (audit log + checklist_templates multi-tenancy)
- A-P0-9/10 (CI gate hardening + auth/billing/audit tests)
