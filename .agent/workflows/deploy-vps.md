---
description: Инструкция по деплою TMS на production-сервер (VPS)
---

# Памятка по деплою TMS на Ubuntu VPS

Этот воркфлоу описывает процесс ручного или полуавтоматического обновления production-сервера.

## 1. Подготовка (Локально)

Перед деплоем убедись, что все тесты проходят и код готов к проду.

```bash
# 1. Запуск линтера и тестов локально
pnpm lint
pnpm test
```

## 2. Подключение к серверу

У нас настроен VPS (Ubuntu 24.04).

```bash
# Подключение по SSH (замени IP на актуальный, если он изменился, сейчас это 5.42.102.58)
ssh root@5.42.102.58
# или если настроен alias в ~/.ssh/config:
ssh tms-prod
```

## 3. Процесс деплоя (На сервере)

Выполни эти команды находясь в папке с проектом на сервере:

```bash
# 1. Переход в директорию проекта
cd /opt/tms

# 2. Получение свежего кода из git (main ветка)
git pull origin main

# 3. Перестройка docker образов (API и Web)
# Используем --no-cache если были изменения в package.json
docker-compose -f docker-compose.prod.yml build

# 4. Применение миграций базы данных
docker-compose -f docker-compose.prod.yml run --rm api pnpm prisma migrate deploy
# Если используем drizzle:
docker-compose -f docker-compose.prod.yml run --rm api pnpm drizzle-kit push

# 5. Перезапуск контейнеров без даун-тайма (по возможности)
docker-compose -f docker-compose.prod.yml up -d

# 6. Проверка логов (опционально)
docker-compose -f docker-compose.prod.yml logs -f --tail=100
```

## 4. Решение проблем (Troubleshooting)

### Если база данных "развалилась" или нужно применить seed:
```bash
docker-compose -f docker-compose.prod.yml exec api pnpm db:seed
```

### Если не хватает места на диске от старых docker images:
```bash
docker system prune -a -f
```

### Если нужно откатиться:
```bash
git checkout <previous-commit-hash>
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
```

## 5. Автоматизированный скрипт (./deploy.sh)

На сервере уже должен лежать скрипт `deploy.sh`. Его можно запустить одной командой:

```bash
cd /opt/tms && ./deploy.sh
```

Содержимое скрипта `deploy.sh` (для проверки):
```bash
#!/bin/bash
set -e
echo "Starting deployment..."
git pull origin main
echo "Building images..."
docker-compose -f docker-compose.prod.yml build
echo "Applying migrations..."
docker-compose -f docker-compose.prod.yml run --rm api npm run db:push
echo "Restarting services..."
docker-compose -f docker-compose.prod.yml up -d
echo "Deployment complete!"
```
