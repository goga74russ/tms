# TMS v2 — Operational Runbook

> Назначение: первая линия реакции для дежурного инженера. Содержит 5 типовых инцидентов с готовыми командами для copy-paste.
> Стек: `docker-compose.prod.yml` (postgres:16-alpine, redis:7-alpine, minio, api Fastify, web Next.js 15, nginx + certbot).
> Связанные документы: `docs/operations/pre-launch-checklist.md`, `docs/operations/deployment.md`, `docs/operations/security.md`.

---

## INC-1: Postgres OOM kill / restart loop

**Симптомы**
- `docker compose ps` показывает `postgres` в статусе `unhealthy` или `restarting`.
- В API логи летят ошибки `ECONNREFUSED 127.0.0.1:5432` или `Connection terminated unexpectedly`.
- На хосте `dmesg | tail` показывает `Out of memory: Killed process ... postgres`.
- Метрики (если подключены): `container_memory_rss{name="postgres"}` достигает 2GB — потолок из `mem_limit`.

**Triage (read-only, 60 секунд)**
```bash
# Статус сервиса
docker compose -f docker-compose.prod.yml ps postgres

# Последние 200 строк логов
docker compose -f docker-compose.prod.yml logs --tail 200 postgres

# Текущее потребление памяти
docker stats --no-stream postgres

# Активные подключения и идл-сессии
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT state, count(*), max(now() - query_start) AS oldest FROM pg_stat_activity GROUP BY state;"
```

**Root cause investigation**
1. **Утечка соединений в API.** Каждый Drizzle pool должен корректно освобождать соединения — ищем `await db.execute(...)` без последующего `release()` или висящие транзакции:
   ```bash
   docker compose -f docker-compose.prod.yml exec postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
     "SELECT pid, usename, application_name, state, query_start, query
        FROM pg_stat_activity WHERE state != 'idle'
        ORDER BY query_start ASC LIMIT 20;"
   ```
2. **Большой импорт без батчей.** A-P0-8 закрыл это транзакционными батчами в `cold-chain` и `tachograph`, но новые импорты могут регрессировать. Проверить `docker compose logs api | grep -i "batch\|import\|COPY"`.
3. **Медленный запрос без индекса.** Включён ли `pg_stat_statements`:
   ```bash
   docker compose -f docker-compose.prod.yml exec postgres \
     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
     "SELECT query, calls, mean_exec_time, rows FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
   ```

**Fix sequence**
```bash
# 1. Сбросить idle-сессии старше 10 минут (даём API шанс переподключиться чисто)
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE state = 'idle' AND query_start < now() - interval '10 min';"

# 2. Перезапускать API первым, потом postgres (иначе API застрянет на reconnect-loop)
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart postgres

# 3. Если RSS на хосте подтверждён > 2GB — поднять лимит в compose
# vi docker-compose.prod.yml → services.postgres.deploy.resources.limits.memory: 4g
docker compose -f docker-compose.prod.yml up -d postgres
```

**Prevent**
- Drizzle pool max=20 (см. `apps/api/src/db/client.ts`), `idle_in_transaction_session_timeout=60s` в `postgresql.conf`.
- Алерт `HighMemoryUsage` (см. prometheus-rules.yml) на RSS > 80% от `mem_limit`.
- Перед релизом — `EXPLAIN ANALYZE` на новых запросах в PR review.

---

## INC-2: Redis stuck / queue not draining

**Симптомы**
- BullMQ-задачи копятся (видно в `/api/admin/integrations` через mock health checks, а также напрямую в Redis).
- В UI диспетчера: уведомления не приходят, штрафы ФССП не пересчитываются, EDI не отправляется.
- `redis-cli INFO clients` показывает рост `connected_clients` или висящие `blocking` клиенты.

**Triage**
```bash
# Память и клиенты Redis
docker compose -f docker-compose.prod.yml exec redis \
  redis-cli -a "$REDIS_PASSWORD" INFO clients

docker compose -f docker-compose.prod.yml exec redis \
  redis-cli -a "$REDIS_PASSWORD" INFO memory

# Длина очередей BullMQ (waiting / active / delayed / failed)
for q in wialon fines notification billing edi; do
  echo "=== $q ==="
  docker compose -f docker-compose.prod.yml exec redis \
    redis-cli -a "$REDIS_PASSWORD" --no-raw LLEN "bull:${q}:wait"
  docker compose -f docker-compose.prod.yml exec redis \
    redis-cli -a "$REDIS_PASSWORD" --no-raw LLEN "bull:${q}:active"
done

# Логи воркера
docker compose -f docker-compose.prod.yml logs --tail 200 api | grep -iE "worker|bullmq|queue"
```

**Root cause investigation**
1. **Воркер упал тихо.** Fastify грейсфул-shutdown мог не дождаться close воркеров — ищем `worker.close()` в логах перед последним рестартом.
2. **Зависшее задание блокирует concurrency.** Если `concurrency=5` и 5 задач висят в `active` без прогресса — все новые ждут.
3. **Redis maxmemory-policy=noeviction + переполнение.** Если включена `noeviction`, при OOM Redis начинает отвечать `OOM command not allowed`.

**Fix**
```bash
# Предпочтительно: перезапуск API — BullMQ автоматически повторяет stalled jobs
docker compose -f docker-compose.prod.yml restart api

# Если конкретный job завис в active — вытащить ID и переместить в failed/retry:
docker compose -f docker-compose.prod.yml exec redis \
  redis-cli -a "$REDIS_PASSWORD" LRANGE "bull:wialon:active" 0 -1

# КРАЙНЯЯ МЕРА (теряет очередь!): полный сброс БД Redis
# docker compose -f docker-compose.prod.yml exec redis \
#   redis-cli -a "$REDIS_PASSWORD" FLUSHDB
# После этого: ручной ребилд состояния (cron-перезапуск синков).
```

**BullMQ admin UI.** Если установлен `@bull-board/fastify` — доступ через `/admin/queues` за JWT-гардом (см. `apps/api/src/admin/queues.ts`, если файл присутствует). Если нет — добавить в backlog.

**Prevent**
- Stalled-job watchdog: BullMQ `stalledInterval=30s`, `maxStalledCount=2`.
- Алерт `QueueBacklog` (waiting > 100 за 10 минут).
- `redis.conf`: `maxmemory-policy allkeys-lru` (или `volatile-ttl` если все ключи имеют TTL).

---

## INC-3: Certbot renewal failure

**Симптомы**
- HTTPS отваливается через ~90 дней после первого выпуска.
- Cron-задача `certbot renew` возвращает non-zero, в `/var/log/letsencrypt/letsencrypt.log` — ошибки.
- Браузер: `NET::ERR_CERT_DATE_INVALID`.

**Triage**
```bash
# Dry-run прогон обновления
docker compose -f docker-compose.prod.yml run --rm certbot renew --dry-run

# Проверка срока действия текущего сертификата
docker compose -f docker-compose.prod.yml exec nginx \
  openssl x509 -enddate -noout -in /etc/letsencrypt/live/${DOMAIN}/fullchain.pem

# DNS-резолв (с хоста)
dig +short ${DOMAIN} A
dig +short ${DOMAIN} AAAA

# Тест acme-challenge — должен отдаваться через 80 порт
curl -v http://${DOMAIN}/.well-known/acme-challenge/test-token
```

**Root cause investigation**
1. **DNS A-record изменился** или указывает на другой IP.
2. **Nginx не отдаёт `/.well-known/acme-challenge/`.** Проверить `nginx/default-tls.conf` — должна быть локация:
   ```
   location /.well-known/acme-challenge/ { root /var/www/certbot; }
   ```
3. **Rate limit Let's Encrypt.** Лимиты: 5 ошибочных попыток в час на аккаунт, 50 сертификатов в неделю на домен, 5 дубликатов в неделю. См. https://letsencrypt.org/docs/rate-limits/.

**Fix**
```bash
# Принудительное ручное обновление через webroot
docker compose -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d ${DOMAIN} -d www.${DOMAIN} \
  --email ops@${DOMAIN} --agree-tos --no-eff-email --force-renewal

# Перезагрузить nginx с новыми сертификатами
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

**Prevent**
- Алерт `CertExpiringSoon` (<14 дней) — даёт две недели запаса до жёсткого rate-limit.
- Cron: `0 4 * * * certbot renew --quiet && docker compose exec nginx nginx -s reload`.
- Мониторить количество запросов на ACME в неделю — не зацикливаться на `--force-renewal`.

---

## INC-4: JWT secret mismatch between api+web

**Симптомы**
- Cookie ставится успешно (видно в DevTools → Application → Cookies).
- Каждый вызов `/api/me` возвращает 401.
- В логах api: `jwt malformed` или `invalid signature`.

**Triage**
```bash
# Сравнить JWT_SECRET в обоих контейнерах — должны быть идентичны
docker compose -f docker-compose.prod.yml exec api env | grep -E "JWT_SECRET|CREDENTIALS_KEY"
docker compose -f docker-compose.prod.yml exec web env | grep -E "JWT_SECRET|CREDENTIALS_KEY"

# Проверка через эндпоинт
curl -i -H "Cookie: tms_token=<paste>" https://${DOMAIN}/api/me
```

**Root cause investigation**
- Кто-то редактировал `.env` и сделал `docker compose up -d api`, забыв пересоздать `web` (или наоборот).
- Использован `docker compose restart` вместо `up -d --force-recreate` — env-vars не перечитались.
- Установлено два разных секрета в `.env.api` и `.env.web` (если стек на split-env).

**Fix**
```bash
# Сгенерировать новый секрет (256 бит)
NEW_SECRET=$(openssl rand -hex 32)
echo "JWT_SECRET=$NEW_SECRET"

# Прописать в .env (заменить старое значение)
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$NEW_SECRET/" /opt/tms/.env

# Полная пересборка обоих сервисов с новым env
docker compose -f docker-compose.prod.yml up -d --force-recreate api web

# Проверка
docker compose -f docker-compose.prod.yml exec api env | grep JWT_SECRET
docker compose -f docker-compose.prod.yml exec web env | grep JWT_SECRET
```

**Внимание:** все существующие сессии будут инвалидированы — пользователи увидят логин-экран. Запланируйте окно или предупредите через статус-страницу.

**Prevent**
- В CI добавить smoke-тест: `docker compose exec api env | grep JWT_SECRET` равен `docker compose exec web env | grep JWT_SECRET`. См. B-3 в `bug-tracker.md`.
- Деплой-скрипт всегда использует `--force-recreate api web` при изменении `.env`.
- Секрет в одном месте — единый `.env`, никаких `.env.api` / `.env.web` дубликатов.

---

## INC-5: Disk full from logs / WAL

**Симптомы**
- `docker compose logs` или сам docker daemon валится с `no space left on device`.
- Контейнеры произвольно крашатся, postgres переходит в read-only.
- Файлы загрузок (MinIO) перестают записываться.

**Triage**
```bash
# Где кончилось место
df -h

# Топ потребителей в /var/lib/docker
sudo du -h --max-depth=1 /var/lib/docker | sort -hr | head -10

# Размер docker-логов по контейнерам
sudo du -sh /var/lib/docker/containers/*/*-json.log | sort -hr | head -10

# Размер WAL и таблиц в postgres
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT pg_size_pretty(pg_total_relation_size('pg_wal'));"

docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT schemaname, relname, pg_size_pretty(pg_total_relation_size(relid)) AS size
     FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"

# Объёмы MinIO
docker compose -f docker-compose.prod.yml exec minio du -sh /data
```

**Что уже настроено**
Log rotation: в `docker-compose.prod.yml` есть `x-logging: &default-logging` якорь — `max-size: 10m`, `max-file: 3`. Это ~30MB на контейнер, ~210MB на стек. Если диск всё равно забит — копают логи приложения (`apps/api/logs/`), не docker-логи.

**Fix**
```bash
# Truncate docker-логов конкретного контейнера (live, без рестарта)
sudo truncate -s 0 $(docker inspect --format='{{.LogPath}}' tms-api-1)

# Если задавил WAL — checkpoint + archive cleanup
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CHECKPOINT;"

# Если есть лаг репликации — отдельный инцидент (см. backup-restore-drill.ps1).

# Прибраться в docker overlay (потеряет неиспользуемые слои)
docker system prune -af --volumes  # ВНИМАНИЕ: проверить, не удалит ли неиспользуемые volumes!

# Поднять max-size в x-logging anchor (compose) если нужно больше истории
# x-logging: { options: { max-size: "50m", max-file: "5" } }
```

**Prevent**
- Алерт `DiskFull` (>85%).
- Метрика `pg_database_size_bytes` в Grafana — рост постоянный или ступенчатый?
- Внешний log shipper (Loki / Vector / journald → S3) — освобождает локальный диск, упрощает поиск.
- Ежемесячный `VACUUM FULL` на больших таблицах (`events`, `temperature_readings`) в окно.

---

## Severity ladder

| Severity | Описание | Реакция |
|----------|----------|---------|
| **SEV-1** | Customer-facing outage > 5 минут. Сайт/API не отвечает, авторизация полностью сломана, потеря данных. | Будить дежурного немедленно, эскалация в чат `#tms-incident`, статус-страница обновляется, post-mortem обязателен. |
| **SEV-2** | Degraded service или > 5% запросов фейлят. Часть тенантов не может работать, BullMQ-очередь не пуста > 30 минут. | Ack в течение 30 минут, фикс в течение 4 часов в рабочее время / 8 часов вне. Post-mortem желателен. |
| **SEV-3** | Один тенант пострадал, есть workaround. Косметический баг в UI, неблокирующий warning в логах. | Следующий рабочий день. Тикет в `bug-tracker.md`, фикс в ближайшем релизе. |
| **SEV-4** | Cosmetic / scheduled maintenance / технический долг. | Backlog. Группируем в спринт. |

**Контакты дежурных.** См. `docs/operations/security.md` → "On-call rotation".

**Post-mortem template.** `docs/operations/postmortems/TEMPLATE.md` (создать при первом SEV-1).
