# Contributing

Краткий справочник для внутренней разработки TMS v2.

## Окружение

- **Node.js:** `>=20.0.0` (см. `engines` в корневом `package.json`).
- **pnpm:** `>=9` (предпочтительный package manager — корневой `package.json` использует workspaces). `npm` тоже работает для запуска dev-скриптов, но lockfile — `pnpm-lock.yaml`.
- **PostgreSQL 16**, **Redis 7**, **MinIO** (S3-совместимое объектное хранилище) — поднимаются через `docker-compose.prod.yml` (профиль `local` доступен для разработки).
- **Платформа:** разработка ведётся на Windows 11 + PowerShell и Linux. Скрипты есть в `.ps1` и `.mjs` вариантах.

## Первый запуск

```
cp .env.example .env
# Заполнить CHANGE_ME_* (минимум JWT_SECRET, DATABASE_URL, REDIS_URL, SEED_PASSWORD)
pnpm install
pnpm --filter @tms/api db:migrate
pnpm --filter @tms/api db:seed
pnpm dev:api   # терминал 1
pnpm dev:web   # терминал 2
```

После этого `http://localhost:3000` — веб, `http://localhost:3001/docs` — Swagger.

## Запуск тестов

- Все тесты: `pnpm test` (вызывает test во всех workspace'ах через `--if-present`).
- Только API: `pnpm --filter @tms/api test` (Vitest, 140+ unit).
- Один файл: `pnpm --filter @tms/api exec vitest run path/to/file.test.ts`.
- В watch-режиме: `pnpm --filter @tms/api test:watch`.
- Coverage: `pnpm --filter @tms/api test:coverage`.
- Typecheck (без сборки): `pnpm --filter @tms/api exec tsc --noEmit`.
- E2E (Playwright, advisory): `pnpm --filter @tms/web exec playwright test` (требует поднятой БД).
- Smoke-chain: `API_URL=http://localhost:3001 SEED_PASSWORD=<your-seed-pw> node scripts/smoke-chain.mjs`.

## Добавление миграции

1. Изменить `apps/api/src/db/schema.ts`.
2. `pnpm --filter @tms/api db:generate` — drizzle-kit создаст `apps/api/drizzle/NNNN_*.sql` и обновит `meta/_journal.json`.
3. **Всегда** добавить строку в [`docs/operations/migration-history.md`](docs/operations/migration-history.md) — workflow в конце того документа.
4. Проверить, что `idx` в `_journal.json` продолжает последовательность; человекочитаемый префикс (`NNNN_`) тоже должен быть следующим (пропуск `0005` — отдельная история, см. migration-history.md).
5. Применить локально: `pnpm --filter @tms/api db:migrate`. Не редактировать миграции, уже применённые в shared-окружении — только roll-forward.

## Конвенции модулей

- API-модули живут в `apps/api/src/modules/<area>/` со стандартной раскладкой: `routes.ts`, `service.ts`, `schema.ts` (Zod), плюс при необходимости `worker.ts` / `provider.ts` / `*.test.ts`.
- Web-страницы — `apps/web/src/app/<route>/page.tsx` (Next.js App Router). UI-примитивы — `apps/web/src/components/ui/` (см. там же `README.md` для inventory).
- Все user-facing строки — на русском. См. `docs/operations/bug-tracker.md` (Patterns) — паттерн «English engine-emitted strings» — самый частый класс багов.
- Мульти-tenancy: каждая бизнес-таблица должна иметь `organization_id`. Сервисные функции — через `requireOrgId(request)`. См. A-P0-12 в audit.
- Любой security-sensitive рандом — `crypto.randomInt` / `crypto.randomBytes`, не `Math.random()`.

## Документация

- Карта операционных доков — раздел «Ключевые операционные доки» в корневом `README.md`.
- Гайды для пользователей — `docs/users/`.
- Архитектура / mock→real интеграции — `docs/operations/integrations-status.md`, `docs/architecture/`.
- Аудиты — `docs/operations/audit-*.md` (последний — `audit-2026-05-12-deep.md`).

## Git / PR

- Ветки именуются от main: `claude/<topic>` для AI-сессий, `feat/`, `fix/`, `chore/` для людей.
- Pre-merge: `pnpm test` зелёный, typecheck чистый, новые UI-страницы прошли smoke (см. `release-gate.md`).
- Commits подписаны (BardinBox Bot ставит подпись автоматически).
