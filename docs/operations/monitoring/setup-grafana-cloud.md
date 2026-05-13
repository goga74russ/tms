# Установка Grafana Cloud для TMS v2

Пошаговое руководство по подключению мониторинга TMS к **Grafana Cloud (free tier)**. Цель — поднять полный observability-стек за < 30 минут.

Что получим в итоге:
- метрики API (latency, error rate), хоста (CPU, диск), контейнеров (RSS vs limit), Postgres, Redis ;
- 8 алертов (`prometheus-rules.yml`) с маршрутизацией в email / Telegram / Slack;
- dashboard с обзорной панелью на 7 виджетов.

---

## 1. Регистрация в Grafana Cloud

1. Откройте https://grafana.com/products/cloud/ → **Create free account**.
2. Подтвердите email, выберите название организации (slug), регион (для РФ — `eu-west` ближе всего).
3. После регистрации Grafana создаст stack вида `https://<your-slug>.grafana.net`.

**Лимиты free tier (актуально на 2026):**
- 10 000 активных series метрик
- 14 дней retention
- 3 пользователя
- неограниченные алерты

Для пилота TMS (1–10 организаций) этого с запасом хватает. Если упрётесь — `write_relabel_configs` в `prometheus.yml` уже отбрасывает `go_*` метрики Prometheus, можно дополнительно дропать `cadvisor` cardinality.

---

## 2. Получение remote_write credentials

1. В Grafana Cloud UI: **Home → Connections → Add new connection → Hosted Prometheus metrics → Prometheus**.
2. Скопируйте три значения с открывшейся страницы:
   - **URL** (`https://prometheus-prod-XX-prod-eu-west-X.grafana.net/api/prom/push`)
   - **Username** (числовой ID, например `123456`)
   - **API Key** — нажмите **Generate now**, выберите role `MetricsPublisher`, скопируйте токен (`glc_eyJ...`). Сохраните сразу — повторно его не покажут.
3. Запишите в `.env` рядом с `docker-compose.prod.yml`:

   ```bash
   GRAFANA_CLOUD_REMOTE_WRITE_URL=https://prometheus-prod-XX-prod-eu-west-X.grafana.net/api/prom/push
   GRAFANA_CLOUD_USERNAME=123456
   GRAFANA_CLOUD_API_KEY=glc_eyJ...
   ```

4. Включите `/metrics` на API (по умолчанию выключен):

   ```bash
   # .env
   METRICS_ENABLED=true
   # опционально — basic auth (рекомендуется, даже несмотря на внутреннюю сеть):
   METRICS_BASIC_AUTH_USER=prometheus
   METRICS_BASIC_AUTH_PASS=$(openssl rand -hex 16)
   ```

   Если ставите basic auth — раскомментируйте блок `basic_auth:` в job `api` файла `docs/operations/monitoring/prometheus.yml`.

---

## 3. Развёртывание стека мониторинга

```bash
# 1. Перечитать .env и поднять overlay поверх прод-стека.
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.monitoring.yml \
  up -d

# 2. Убедиться, что все 5 новых сервисов running:
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.monitoring.yml \
  ps prometheus node_exporter cadvisor postgres_exporter redis_exporter

# 3. Посмотреть, что Prometheus стартанул и не сыпет ошибками remote_write:
docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.monitoring.yml \
  logs -f --tail 100 prometheus
```

В логах должны появиться строки `level=info ... msg="Server is ready to receive web requests."` и **не должно** быть `remote_write: 401 Unauthorized` / `403`. Если есть — проверьте `GRAFANA_CLOUD_*` ещё раз.

### Проверка scrape targets

UI Prometheus биндится на `127.0.0.1:9090` — открыть через SSH-туннель:

```bash
ssh -L 9090:127.0.0.1:9090 user@your-host
# затем в браузере: http://localhost:9090/targets
```

Все 6 jobs (`api`, `node`, `cadvisor`, `postgres`, `redis`, `prometheus`) должны быть **UP**. Если `api` в DOWN — `METRICS_ENABLED` не выставлен или basic auth расходится с `prometheus.yml`.

### Проверка push в Grafana Cloud

Grafana Cloud UI → **Explore** → выбрать datasource `grafanacloud-<slug>-prom` → ввести запрос:

```promql
up{job="api"}
```

Должно вернуть `1`. Метрики начинают приходить в первые 30–60 секунд после старта Prometheus.

---

## 4. Импорт dashboard

1. Grafana Cloud UI → **Dashboards → New → Import**.
2. Скопируйте содержимое `docs/operations/monitoring/grafana-dashboard.json` и вставьте в текстовое поле, либо загрузите файлом.
3. В выпадашке **Prometheus** выберите `grafanacloud-<slug>-prom`.
4. Нажмите **Import**.

Дашборд называется **TMS v2 — Production Overview** и содержит 7 виджетов (request rate, error rate, p50/p95/p99 latency, DB connections, Redis ops/s, BullMQ depth, container memory).

> Виджеты с placeholder-таргетами (`targets: []` в JSON) подсказывают пустой график — пропишите PromQL вручную либо отредактируйте JSON. Примеры PromQL — в `alert-rules.md`.

---

## 5. Настройка алертов

### 5.1 Импорт правил

Grafana Cloud не поддерживает прямой импорт Prometheus-style YAML через UI, но рулы уже подхватываются локальным Prometheus (`prometheus-rules.yml` смонтирован в `/etc/prometheus/rules/`). Алерты считаются **локально** и стримятся в Grafana Cloud Alerting автоматически.

Альтернативный путь — пересоздать правила нативно в Grafana:

1. **Alerting → Alert rules → New alert rule**.
2. **Data source** = `grafanacloud-<slug>-prom`.
3. Скопировать `expr:` из YAML, указать `for:` и `severity`.
4. Повторить для каждого из 8 правил.

### 5.2 Contact points

**Alerting → Contact points → Add contact point**:

- **Email**: укажите команду on-call (`oncall@your-company.ru`).
- **Telegram**: создайте бота через `@BotFather`, добавьте его в SEV-канал, в Grafana — `Telegram` тип, токен бота + chat_id канала.
- **Slack**: webhook URL из Slack App.

### 5.3 Notification policies

**Alerting → Notification policies**:

| Label match | Contact point | Group wait | Repeat |
|-------------|---------------|------------|--------|
| `severity=sev1` | telegram-page + email | 0s | 30m |
| `severity=sev2` | telegram-team + email | 30s | 4h |
| `severity=sev3` | email | 5m | 24h |

SEV-1 будит дежурного немедленно; SEV-2 даёт 30 минут на ack; SEV-3 — рабочий день.

---

## 6. Проверка end-to-end

Симулируем `DatabaseDown` в non-prod:

```bash
# 1. Остановить postgres (DEV/STAGING — НИКОГДА на prod).
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml stop postgres

# 2. Подождать 60 секунд — `for: 1m` в правиле сработает.
sleep 75

# 3. Проверить в Grafana Cloud → Alerting → Alert rules → DatabaseDown
#    статус = Firing. Уведомление должно прийти в Telegram/email.

# 4. Поднять обратно.
docker compose -f docker-compose.prod.yml -f docker-compose.monitoring.yml start postgres

# 5. Через ~60 секунд алерт автоматически перейдёт в Resolved.
```

Если контакт-поинт не сработал — проверить **Alerting → Contact points → Test**. Чаще всего фейлится Telegram (бот не добавлен в чат / wrong chat_id).

---

## Чеклист готовности

- [ ] `.env` содержит `GRAFANA_CLOUD_*` и `METRICS_ENABLED=true`
- [ ] `docker compose ps` показывает 5 monitoring-сервисов running
- [ ] Prometheus `/targets` — все UP
- [ ] Grafana Cloud Explore → `up{job="api"} == 1`
- [ ] Dashboard импортирован и показывает живые данные
- [ ] 8 alert rules в Grafana Cloud Alerting
- [ ] Contact points сконфигурированы, прошли Test
- [ ] Test-инцидент `DatabaseDown` отстрелил уведомление
- [ ] Резолв инцидента очистил алерт

---

## Дальнейшие шаги

- **BullMQ queue exporter** — `QueueBacklog` rule пока висит на placeholder-series. Добавить в `apps/api/src/integrations/queues.ts` экспорт `bullmq_jobs_waiting` через Counter из `app.metrics.client.register`.
- **blackbox_exporter** для `CertExpiringSoon` — отдельный сервис, не в текущем overlay.
- **Logs** — для пилота хватит `docker compose logs`; для роста стоит подключить Grafana Loki (тот же tier).
- **Распределённое трейсинг** — Grafana Tempo, когда появится несколько сервисов на горизонтальном масштабе.
