# scripts/

Operational скрипты для разработки, smoke-тестов, миграций и rollback.
Большинство — PowerShell (`.ps1`, Windows-first), оставшиеся — Node ESM
(`.mjs`, кроссплатформенные) и SQL.

## Cross-platform (Node / SQL / bash)

### `smoke-chain.mjs`

Сквозной API smoke: login → создание заказа → trip → waybill → inspect → start → temperature reading → complete → invoice. Прогоняет полный happy-path над запущенным API.

- **Когда запускать:** перед релизом; в CI advisory; после крупных рефакторов модулей operational-core / trips / waybills / inspections.
- **OS:** любая (Node ≥20).
- **Запуск:** `API_URL=http://localhost:3001 SEED_PASSWORD=<your-seed-pw> node scripts/smoke-chain.mjs`.

### `preview-proxy.mjs`

Локальный preview-прокси для тестирования web-сборки против production-like окружения (без полного docker-стека).

- **OS:** любая (Node ≥20).

### `db-integrity-check.sql`

SQL-чеклист целостности: orphaned FK, append-only нарушения, multi-tenant дрейф, дубликаты по уникальным ключам.

- **Когда запускать:** перед миграциями в продакшен; раз в неделю на staging.
- **OS:** любая (через psql).

### `rollback-prod.sh`

Откат production deployment к предыдущему snapshot'у (БД + загруженные blob'ы). Запускается на сервере.

- **OS:** Linux production host.

## PowerShell (Windows-first)

### `apply-local-migrations.ps1`

Применяет drizzle-миграции к локальной БД. Идемпотентен.

- **Когда запускать:** после `pnpm --filter @tms/api db:generate` или после `git pull` с новыми миграциями.

### `backup-restore-drill.ps1`

Прогон disaster-recovery drill: snapshot БД → restore в чистый instance → проверка целостности.

- **Когда запускать:** ежемесячно; перед крупными релизами.

### `clean-prod-copy.ps1`

Чистит локальную копию prod-БД от персональных данных для использования в dev (анонимизация email/phone/имён, оставляет структуру).

### `mobile-pilot-readiness.ps1`

Чек-лист готовности мобильного приложения к пилоту: build EAS, smoke endpoints, проверка expo-notifications конфигурации.

### `mobile-smoke.ps1`

Smoke против эндпоинтов, специфичных для мобильного: `/auth/login`, `/waybills/my`, `/trips/:id`, temperature submission, document upload. Полезно после API-изменений в `apps/mobile/src/api/`.

### `multi-tenant-smoke.ps1`

Проверяет multi-tenancy: два org'а одновременно делают параллельные операции, утверждает что данные не утекают между ними (A-P0-12-class regression guard).

### `operational-core-smoke.ps1`

Smoke над operational-core модулем: orders → trips → assign → close. Узкий focused вариант smoke-chain.mjs.

### `p0-local.ps1`

Локальный прогон того же гейта, что в CI (`.github/workflows/p0-gate.yml`): typecheck, lint, vitest, drizzle-kit check, pnpm audit. Запускать перед PR.

### `reset-demo-password.ps1`

Сбрасывает пароль seed/demo пользователей на значение из `SEED_PASSWORD`. Удобно при потере пароля после рестарта seed-БД.

### `seed-local.ps1`

Засеивает локальную БД демо-данными (организации, водители, ТС, заказы, рейсы — для UI walkthrough).

### `ui-workflow-smoke.ps1`

Прогон UI workflow smoke для основных ролей (logist / dispatcher / accountant / mechanic / medic / driver) — попадание в страницы, базовые действия, проверка отсутствия 500-х. Требуется поднятый web + api.

### `web-role-smoke.ps1`

Узкий вариант ui-workflow-smoke — только role-based-доступ: что admin видит то, что должен; driver не видит admin-страниц, etc.
