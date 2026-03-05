# 🏗️ TMS — Архитектура системы

> **Версия:** 1.0 | **Обновлено:** 05.03.2026

## Стек технологий

| Слой | Технология | Версия |
|------|-----------|--------|
| **Runtime** | Node.js | 20 LTS |
| **Backend** | Fastify | 4.x |
| **ORM** | Drizzle ORM | 0.37+ |
| **Database** | PostgreSQL | 16 |
| **Cache/Queue** | Redis + BullMQ | 7 / 5.x |
| **Frontend** | Next.js (React 19) | 15.x |
| **Mobile** | Expo + React Native | SDK 52 |
| **Offline DB** | WatermelonDB | 0.73 |
| **Auth** | @fastify/jwt + httpOnly cookies | — |
| **Validation** | Zod | 3.x |
| **Monorepo** | pnpm workspaces | 9.15.2 |
| **Containerization** | Docker + Docker Compose | — |
| **Reverse Proxy** | Nginx + Let's Encrypt | — |

## Структура монорепозитория

```
d:\Ai\TMS\
├── apps/
│   ├── api/            ← Backend (Fastify + Drizzle)
│   │   ├── src/
│   │   │   ├── auth/           — JWT, RBAC, cookie auth
│   │   │   ├── db/             — schema.ts, connection.ts, seed.ts, triggers.ts
│   │   │   ├── events/         — journal.ts (append-only 152-ФЗ)
│   │   │   ├── integrations/   — redis, websocket, telegram, workers/
│   │   │   ├── modules/        — бизнес-модули (см. ниже)
│   │   │   ├── utils/          — timezone, helpers
│   │   │   └── server.ts       — entry point
│   │   └── Dockerfile
│   ├── web/            ← Frontend (Next.js 15)
│   │   ├── src/
│   │   │   ├── app/            — pages (Next.js App Router)
│   │   │   ├── components/     — UI kit (shadcn/ui)
│   │   │   ├── hooks/          — useVehiclePositions, etc
│   │   │   └── lib/            — api.ts, utils
│   │   └── Dockerfile
│   └── mobile/         ← Mobile (Expo + React Native)
│       └── src/
│           ├── screens/        — Login, TripList, TripDetails, Checkpoint
│           ├── db/             — WatermelonDB schema + models
│           └── api/            — auth.ts, sync
├── packages/
│   └── shared/         ← @tms/shared (типы, enum, Zod-схемы)
├── nginx/              ← Reverse proxy config
├── docs/               ← Документация
├── docker-compose.yml          — development
├── docker-compose.prod.yml     — production
└── pnpm-workspace.yaml
```

## Бизнес-модули (apps/api/src/modules/)

| Модуль | Путь | Описание |
|--------|------|----------|
| **orders** | `modules/orders/` | Заявки: CRUD, стейт-машина, RLS |
| **trips** | `modules/trips/` | Рейсы: назначение, маршрутные точки, assign |
| **inspections** | `modules/inspections/` | Техосмотры + медосмотры (152-ФЗ) |
| **waybills** | `modules/waybills/` | Путевые листы + ЭТрН XML генератор |
| **fleet** | `modules/fleet/` | ТС, водители, контрагенты, пропуска, штрафы |
| **repairs** | `modules/repairs/` | Ремонты: стейт-машина, канбан |
| **finance** | `modules/finance/` | Тарификация, счета, KPI, 1С XML export |
| **notifications** | `modules/notifications/` | Telegram routes |
| **sync** | `modules/sync/` | Mobile sync: pull + push events |
| **geo** | `modules/geo/` | Геокодинг, Haversine, матрица |

## Безопасность

### Аутентификация
- **Web:** httpOnly cookie `tms_token` (JWT, 24ч)
- **Mobile:** Bearer token в `Authorization` header (SecureStore)
- **WebSocket:** Short-lived JWT (5 минут) через `?token=` query param
- **Login:** Rate-limited (5 попыток/мин)

### Авторизация (RBAC)
10 ролей: `admin`, `manager`, `logist`, `dispatcher`, `mechanic`, `medic`, `driver`, `accountant`, `client`, `security`

Используется CASL — декларативные policies:
```
preHandler: [app.authenticate, requireAbility('read', 'Order')]
```

### RLS (Row-Level Security)
- Водитель видит только **свои** рейсы/заявки/путевые листы
- Клиент видит только заявки **своего контрагента**
- Реализовано на уровне SQL WHERE-clause

### Данные
- **152-ФЗ:** медданные доступны только медику, доступ логируется в `med_access_log`
- **Append-only:** SQL-триггеры запрещают UPDATE/DELETE на `events`, `inspections`
- **Деньги:** `numeric(12,2)` вместо `float`

## Real-time

```
┌─────────────┐    WebSocket     ┌──────────────┐
│   Browser   │ ←── ?token= ──→ │  Fastify WS   │
│  (Leaflet)  │   positions     │  /ws/vehicles  │
└─────────────┘                 └──────┬───────┘
                                       │ broadcast
                                       │ every 10s
                               ┌───────┴───────┐
                               │  WialonMock    │
                               │  (→ real API)  │
                               └───────────────┘
```

## Очереди (BullMQ)

| Queue | Cron | Описание |
|-------|------|----------|
| `wialon-sync` | `*/15 * * * *` | Синхронизация одометров с GPS |
| `fines-sync` | `0 3 * * *` | Импорт штрафов ГИБДД |
| `notifications` | on-demand | Telegram уведомления (12 типов) |

## Деплой

```
Production: VPS 5.42.102.58
├── Docker Compose (api + web + postgres + redis + nginx)
├── Nginx reverse proxy (порт 80/443)
├── PostgreSQL 16 (порт 5433, internal network)
└── Redis 7 (порт 6379, internal network, requirepass)
```

Подробнее: [deployment.md](deployment.md) | [ssl-setup.md](ssl-setup.md)
