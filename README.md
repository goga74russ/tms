# 🚛 TMS — Transport Management System

> Операционная платформа управления транспортной компанией

[![CI](https://github.com/goga74russ/tms/actions/workflows/ci.yml/badge.svg)](https://github.com/goga74russ/tms/actions/workflows/ci.yml)

## Возможности

- **Заявки и рейсы** — управление жизненным циклом заявок, создание рейсов, канбан-доска логиста
- **Автопарк** — ТС, водители, контрагенты, контракты, тарифы
- **Диспетчер** — карта Leaflet с маркерами ТС, таймлайн рейсов
- **Ремонты** — заявки на ремонт, канбан-доска механика
- **Путевые листы** — генерация и закрытие (Приказ Минтранса)
- **Осмотры** — технические и медицинские осмотры с чек-листами
- **Финансы** — счета, акты, KPI-дашборд, тарификация (7 модификаторов)
- **RBAC** — 10 ролей (admin, logist, dispatcher, driver, mechanic…), CASL policies
- **Event Journal** — append-only SQL-триггер (152-ФЗ, неизменяемый аудит)
- **Offline-sync** — WatermelonDB + конфликт-разрешение для мобильного
- **Интеграции** — BullMQ (Wialon, ГИБДД, DaData), 1С XML export

## Стек

| Слой | Технология |
|------|-----------|
| **Backend** | TypeScript, Fastify, Drizzle ORM, Zod, BullMQ |
| **Frontend** | Next.js 15, React 19, shadcn/ui, Tailwind, Leaflet, Recharts |
| **Mobile** | React Native, Expo, WatermelonDB |
| **DB** | PostgreSQL 16, Redis 7 |
| **Infra** | Docker, GitHub Actions, pnpm workspaces |

## Быстрый старт

### Требования

- Node.js ≥ 20
- pnpm ≥ 9
- Docker + Docker Compose

### Локальная разработка

```bash
# 1. Клонировать
git clone https://github.com/goga74russ/tms.git
cd tms

# 2. Скопировать конфиг
cp .env.local.example .env

# 3. Запустить БД и Redis
docker compose up -d

# 4. Установить зависимости
pnpm install

# 5. Собрать shared-пакет
pnpm --filter @tms/shared build

# 6. Миграция + сид
pnpm db:migrate
pnpm db:seed

# 7. Запустить
pnpm dev:api    # → http://localhost:4000
pnpm dev:web    # → http://localhost:3000
```

### Production (Docker)

```bash
# Скопировать и заполнить .env
cp .env.example .env
# Обязательно: POSTGRES_PASSWORD, JWT_SECRET, REDIS_PASSWORD

# Запустить всё
docker compose -f docker-compose.prod.yml up -d --build

# Проверить
curl http://localhost:4000/api/health
curl http://localhost:4000/api/health/ready
```

## Структура monorepo

```
tms/
├── apps/
│   ├── api/          # Fastify API (TypeScript)
│   ├── web/          # Next.js frontend
│   └── mobile/       # React Native + Expo
├── packages/
│   └── shared/       # Zod-схемы, стейт-машины, типы
├── docs/             # Документация, ADR, changelogs
├── audits/           # Аудиты безопасности
├── drizzle/          # Миграции БД
└── scripts/          # Deploy, утилиты
```

## API Endpoints

| Группа | Prefix | Описание |
|--------|--------|----------|
| Auth | `/api/auth/*` | Login, logout, CRUD users |
| Orders | `/api/orders/*` | Заявки (CRUD + стейт-машина) |
| Trips | `/api/trips/*` | Рейсы (назначение, завершение) |
| Fleet | `/api/fleet/*` | ТС, водители, контрагенты |
| Repairs | `/api/repairs/*` | Ремонты (канбан) |
| Inspections | `/api/inspections/*` | Тех/Мед осмотры |
| Waybills | `/api/waybills/*` | Путевые листы |
| Finance | `/api/finance/*` | Счета, KPI |
| Health | `/api/health` | Liveness + `/ready` readiness |

## Тесты

```bash
# Запуск всех тестов
pnpm test

# Только API
pnpm --filter @tms/api test
```

279+ тестов в 18 файлах: auth, orders, trips, inspections, fleet, finance, RBAC, security, regression, e2e, geo, XML export.

## Безопасность

- JWT в httpOnly cookies + Bearer fallback для mobile
- CASL RBAC с 10 ролями
- Zod-валидация на всех endpoints
- Append-only event journal (SQL triggers)
- Rate limiting (5 req/min на login)
- Helmet security headers
- CORS multi-origin
- `numeric(12,2)` для финансовых полей (нет float-ошибок)

## Документация

- [Roadmap](docs/roadmap.md) — прогресс по спринтам
- [Audit Log](docs/audit-log.md) — результаты аудитов
- [ADR](docs/adr.md) — архитектурные решения
- [API Contracts](docs/api-contracts.md) — описание API

## Лицензия

Proprietary — © 2026. Все права защищены. См. [LICENSE](LICENSE).
