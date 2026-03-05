# Changelog — Агент 0: Фундамент

## [2026-03-04] Инициализация

### Монорепо
- Создан npm workspaces монорепо: `apps/api`, `apps/web`, `packages/shared`
- Настроен TypeScript: `tsconfig.base.json` + per-package configs
- Docker Compose: PostgreSQL 16 (порт 5433), Redis 7 (порт 6379)

### Shared Package (`packages/shared`)
- `enums.ts` — все статусы, роли, типы событий (161 строка)
- `schemas.ts` — Zod-схемы для 20+ сущностей (303 строки)

### API Backend (`apps/api`)
- Drizzle ORM схема: 22 таблицы, native PG enums, FK, индексы
- Append-only SQL триггеры: events, tech/med_inspections, med_access_log
- JWT auth: login/me endpoints
- RBAC (CASL): 10 ролей по Приложению А ТЗ, 152-ФЗ ограничения
- Event journal service: recordEvent, getEntityEvents, markConflict
- Seed: 11 аккаунтов, 5 ТС, 3 контрагента, 2 договора, чек-листы

### Frontend (`apps/web`)
- Next.js 15 + Tailwind CSS + Inter font
- Sidebar: навигация по 12 разделам с иконками Lucide
- API client: JWT-aware fetch wrapper
- Home page: stat cards + module overview

### Верификация
- ✅ PostgreSQL: 22 таблицы, триггеры применены
- ✅ API: health OK, login OK (JWT выдаётся)
- ✅ Seed: все тестовые данные загружены
