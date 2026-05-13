# @tms/api

Fastify 5 + Drizzle + PostgreSQL + Redis + BullMQ. ~200 эндпоинтов
(~287 declarations), 140+ unit-тестов (Vitest).

## Запуск

```
pnpm --filter @tms/api dev         # tsx watch
pnpm --filter @tms/api build       # tsc → dist/
pnpm --filter @tms/api start       # node dist/server.js
pnpm --filter @tms/api test        # vitest run
pnpm --filter @tms/api db:generate # drizzle-kit generate (после schema.ts)
pnpm --filter @tms/api db:migrate  # drizzle-kit migrate
pnpm --filter @tms/api db:seed     # засеять demo-data (нужен SEED_PASSWORD)
```

Swagger UI: `http://localhost:3001/docs`. Health: `/health`.

## Раскладка `src/`

```
auth/            JWT, RBAC, plan-guard, authenticate decorator
db/              schema.ts + seed + migration loader
events/          DB-trigger fixtures (append-only audit log)
integrations/    legacy mock'и (dadata, gibdd, fuel-card, wialon-track-generator)
modules/         бизнес-модули (см. список ниже)
providers/       Provider adapter framework (8 типов: signature/edi/telematics/fuel-card/fines/marking/payment/email)
services/        cross-module helpers
utils/           pure helpers (date, math, money, encoding)
server.ts        Fastify bootstrap, plugin registration, error handler
```

### Модули

`adr`, `analytics`, `audit`, `billing`, `carriers`, `claims`, `cold-chain`, `compliance`, `copilot` (AI MVP), `demo`, `documents` (PDF), `edi`, `finance`, `fleet`, `geo`, `import` (xlsx), `inspections`, `integrations` (credentials cabinet), `notifications`, `onboarding`, `operational-core`, `operations`, `orders`, `repairs`, `rto` (HOS / driving time), `scoring`, `settings`, `sprint9` (legacy), `sync` (mobile pull/push), `trips`, `uploads` (S3 presign), `waybills`.

Каждый модуль обычно содержит:

- `routes.ts` — Fastify route declarations.
- `service.ts` — бизнес-логика (тестируется unit'ом).
- `schema.ts` — Zod schemas для request/response.
- При необходимости: `worker.ts` (BullMQ), `provider.ts` / `*-provider.ts`, `pdf.ts`, `*.test.ts`.

## Как добавить новый route + миграцию

1. Расширить `src/db/schema.ts` (новая таблица или колонка).
2. `pnpm --filter @tms/api db:generate` — drizzle-kit создаст `drizzle/NNNN_*.sql` + обновит `meta/_journal.json`.
3. Дописать строку в `docs/operations/migration-history.md` (это обязательно, см. CONTRIBUTING.md).
4. Применить локально: `pnpm --filter @tms/api db:migrate`.
5. В `src/modules/<area>/`:
   - Объявить Zod-схему в `schema.ts`.
   - Реализовать чистую функцию в `service.ts`. **Всегда** передавать `organizationId` явно и фильтровать по нему в любом select/insert/update (multi-tenancy, см. A-P0-12).
   - Зарегистрировать route в `routes.ts`. Использовать `authenticate` декоратор + `requireRole(...)` / `requireOrgId(request)` / `requirePlan(...)`.
6. Добавить unit-тест на сервисную функцию (в идеале без БД, mock'ая зависимости).
7. Если route мутирует state — добавить в `scripts/smoke-chain.mjs` или один из `*-smoke.ps1` (см. `scripts/README.md`).

## Безопасность

- Любой security-sensitive random — `crypto.randomInt` / `crypto.randomBytes`, не `Math.random()` (см. A-P0-3).
- Webhook'и — HMAC verify против raw body. См. ЮKassa импл. в `modules/billing/service.ts` (A-P0-1).
- Credentials AES-256-GCM шифруются ключом `CREDENTIALS_KEY` (32 байта). В проде без ключа сервер падает fast (A-P0-2).
- `setErrorHandler` маскирует internal errors в проде и проставляет `requestId` (A-P0-7).
- Pino logger redact'ит `body.password / credentials / apiKey / token / tempPassword` (A-P1-1).

## Тесты

- Vitest, конфиг — `vitest.config.ts`.
- Запуск одного файла: `pnpm --filter @tms/api exec vitest run src/modules/<area>/service.test.ts`.
- Watch: `pnpm --filter @tms/api test:watch`.
