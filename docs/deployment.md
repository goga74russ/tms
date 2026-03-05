# 🚀 TMS — Деплой и эксплуатация

> **Обновлено:** 05.03.2026
> **Сервер:** VPS 5.42.102.58 | Ubuntu | Docker

## Быстрый деплой (первый раз)

### 1. Клонирование

```bash
ssh root@5.42.102.58
cd /opt
git clone https://github.com/goga74russ/tms.git
cd tms
```

### 2. Конфигурация

```bash
cp .env.example .env
nano .env
# Заполнить: DATABASE_URL, JWT_SECRET, REDIS_PASSWORD, CORS_ORIGIN
# См. docs/env-vars.md для полного списка
```

### 3. Запуск

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Инициализация БД

```bash
# Применить миграции
docker compose -f docker-compose.prod.yml exec api npx tsx src/db/migrate.ts

# Загрузить seed-данные (опционально)
docker compose -f docker-compose.prod.yml exec api npx tsx src/db/seed.ts
```

### 5. Проверка

```bash
# Здоровье API
curl http://5.42.102.58:4000/api/health/ready

# Логи
docker compose -f docker-compose.prod.yml logs -f api
```

## Обновление

```bash
cd /opt/tms
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build api web
```

> ⚠️ Если изменилась схема БД, перед перезапуском:
> ```bash
> docker compose exec api npx tsx src/db/migrate.ts
> ```

## Архитектура деплоя

```
                    ┌─────────────┐
     Internet ───→  │   Nginx     │ :80/:443
                    │  (SSL/TLS)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │   API    │ │   Web    │ │ Certbot  │
        │ :4000    │ │ :3000    │ │ (cron)   │
        └────┬─────┘ └──────────┘ └──────────┘
             │
    ┌────────┼────────┐
    ▼                 ▼
┌──────────┐   ┌──────────┐
│ Postgres │   │  Redis   │
│ :5433    │   │ :6379    │
│(internal)│   │(internal)│
└──────────┘   └──────────┘
```

## Docker Compose сервисы

| Сервис | Образ | Порты | Описание |
|--------|-------|-------|----------|
| `api` | Custom (Dockerfile) | 4000 | Fastify backend |
| `web` | Custom (Dockerfile) | 3000 | Next.js frontend |
| `postgres` | postgres:16 | 5433 (internal) | PostgreSQL |
| `redis` | redis:7-alpine | 6379 (internal) | Redis + BullMQ |
| `nginx` | nginx:alpine | 80, 443 | Reverse proxy |
| `certbot` | certbot/certbot | — | SSL сертификаты |

## Безопасность production

- ✅ PostgreSQL и Redis **не видны** снаружи (internal network)
- ✅ `JWT_SECRET` — fail-fast (сервер не стартует без него)
- ✅ Redis `requirepass` включён
- ✅ Docker images: pinned versions (`pnpm@9.15.2`, `--frozen-lockfile`)
- ✅ Helmet security headers
- ⏳ SSL/TLS — нужен домен (см. [ssl-setup.md](ssl-setup.md))

## Мониторинг

### Health checks
```bash
# Readiness (DB + Redis)
curl http://localhost:4000/api/health/ready

# Integration workers status
curl http://localhost:4000/api/integrations/status
```

### Логи
```bash
# Все сервисы
docker compose -f docker-compose.prod.yml logs -f

# Только API
docker compose -f docker-compose.prod.yml logs -f api

# Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli ping
```

### Бэкап PostgreSQL
```bash
# Dump
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U tms tms > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260305.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U tms tms
```

## Полезные команды

```bash
# Перезапуск только API (без пересборки)
docker compose -f docker-compose.prod.yml restart api

# Пересборка и запуск
docker compose -f docker-compose.prod.yml up -d --build api web

# Зайти в контейнер API
docker compose -f docker-compose.prod.yml exec api sh

# Зайти в PostgreSQL
docker compose -f docker-compose.prod.yml exec postgres psql -U tms tms

# Очистить BullMQ (если зависли job-ы)
docker compose -f docker-compose.prod.yml exec redis redis-cli FLUSHDB
```

## Связанные документы

- [env-vars.md](env-vars.md) — все переменные окружения
- [ssl-setup.md](ssl-setup.md) — настройка SSL/TLS
- [TODO-telegram-setup.md](TODO-telegram-setup.md) — настройка Telegram бота
- [architecture.md](architecture.md) — архитектура системы
