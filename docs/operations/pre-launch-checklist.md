# Pre-launch checklist

Прохождение этого чек-листа = готовность к пилоту (Phase 2 в roadmap). Каждый пункт либо отмечен ✓ (уже в коде), либо ⏳ (надо сделать перед запуском), либо ⚠️ (нужно решение/внешний gate).

## 0. Версия зафиксирована

- ✓ Все изменения смержены в `claude/dazzling-robinson-91868a`, готовы к мержу в `main`.
- ⏳ Запустить `git tag v0.1.0-pilot` на momentе мержа.

## 1. Секреты и env

- ✓ `.env.example` покрывает все 56 env-vars, что читает код (раньше было 18). Сгруппирован по: Required-for-boot / Security / Optional integrations / Carrier identity / Tunables.
- ✓ `JWT_SECRET` обязателен в обоих контейнерах (api + web), валидируется через `${VAR:?Set VAR}` в compose.
- ✓ Все `CHANGE_ME_*` значения — заведомо невалидные, прод не загрузится с дефолтами.
- ⏳ Сгенерировать прод-секреты:
  ```bash
  openssl rand -hex 32                 # JWT_SECRET
  openssl rand -base64 24              # DB / Redis / MinIO passwords
  ```
- ⏳ Положить `.env` на прод-хост, права `chmod 600`, владелец non-root.

## 2. База данных

- ✓ 25 миграций (0000–0025), drizzle-managed, deterministic.
- ✓ Append-only triggers на events / tech_inspections / med_inspections / med_access_log (с relaxed-update в 0025 для decision/comment).
- ✓ AES-256-GCM шифрование credentials в provider_credentials.
- ⏳ Запустить миграции на прод-БД:
  ```bash
  pnpm --filter @tms/api db:migrate
  ```
- ⏳ Сидинг — **только** `pnpm db:seed` (минимальные роли + админ), **не** `db:seed-demo` (это для песочниц).
- ⏳ Бэкапы: настроить `pg_dump | gzip | aws s3 cp` (или Yandex Object Storage), CronJob ежедневно в 03:30 MSK. Хранить 30 дней.
- ⏳ Тест восстановления: раз в неделю автоматически пробовать восстановление в staging DB.

## 3. Безопасность

- ✓ **Helmet + CSP**: `default-src 'self'`, scriptSrc/styleSrc разрешают `unsafe-inline` (нужно для swagger-ui), imgSrc разрешает `https:` и `data:`.
- ✓ **Rate limiting**:
  - глобально: `RATE_LIMIT_MAX=500` за 1 минуту на IP;
  - `/auth/login`, `/auth/signup`, `/auth/verify-email`: `LOGIN_RATE_LIMIT_MAX=5` за 1 минуту.
- ✓ **CORS**: multi-origin через `CORS_ORIGIN` (comma-separated).
- ✓ **JWT**: подписывается API, проверяется в Next.js middleware (edge runtime) через `jose`. Один секрет — оба контейнера.
- ✓ **Cookies**: `COOKIE_SECURE=true` обязательно в проде (через HTTPS).
- ✓ **Swagger off**: `ENABLE_API_DOCS=false` по умолчанию в проде.
- ✓ **0 console.log leaks** в `apps/web/src`. В `apps/api/src` все console-вызовы только в seed-скриптах или bootstrap-fallback'ах (до инициализации pino).
- ⏳ TLS-сертификат через certbot (профиль `ops` уже в compose):
  ```bash
  docker compose -f docker-compose.prod.yml run certbot certonly --webroot -w /var/www/certbot -d <domain>
  ```
- ⏳ Переключить nginx на `NGINX_CONF=./nginx/default-tls.conf`.

## 4. Инфраструктура (docker-compose.prod.yml)

- ✓ **Restart policy**: `unless-stopped` на всех сервисах.
- ✓ **Healthchecks**: postgres / redis / minio / api / web / nginx — все с `interval`, `timeout`, `retries`.
- ✓ **Depends-on healthy**: api ждёт постгрес+redis+minio здоровыми, web ждёт api.
- ✓ **Resource limits** (новое в этом коммите):
  - postgres: 2g limit / 512m reservation
  - api / web: 1g / 256m
  - redis: 384m / 128m
  - minio: 512m / 128m
  - nginx: 128m / 32m
- ✓ **Log rotation**: json-file driver, 10MB × 3 файла на сервис — предотвращает заполнение диска.
- ⏳ Поднять монитор-хост: cAdvisor + Prometheus + Grafana (или Yandex Cloud Monitoring).
- ⏳ Алёрты на `/api/health/ready` (Statuscake / UptimeRobot / Healthchecks.io).

## 5. Интеграции (mock → real)

Все live-провайдеры подключаются через `/admin/integrations` (UI шифрует API-ключи AES-256-GCM).

| Тип | Mock-default | Live-провайдеры |
|---|---|---|
| Подпись | ✓ mock | Госключ / Контур.Подпись / СБИС / КриптоПро CADES |
| ЭДО | ✓ mock | Контур.Диадок / СБИС / Калуга Астрал / Такском |
| Телематика | ✓ mock-track-generator | Wialon / Omnicomm / GLONASSsoft |
| Топливные карты | ✓ mock | Лукойл / Роснефть / Газпромнефть |
| Штрафы | ✓ mock | Автокод / ФССП / ГИБДД |
| Маркировка ЧЗ | ✓ mock | ЦРПТ |
| Платежи | ✓ mock | ЮKassa / Тинькофф / CloudPayments |
| Email | ✓ console-fallback | SMTP (Mail.ru) / Unisender |
| AI co-pilot | ✓ mock-responses | Anthropic Claude (ANTHROPIC_API_KEY) |
| ОФД | ⏳ skeleton | (ждёт договора с ОФД-провайдером) |
| ОСАГО / РСА | ✓ mock | (ждёт API-ключа РСА-АИС) |

**Перед пилотом**: минимально включить SMTP (для верификации email) и подпись (Госключ — самый простой вход). Остальные можно подключать по мере роста.

## 6. Юр-вопросы

- ✓ Privacy / Terms / Personal-data — пилотная редакция от 12 мая 2026 г.
- ⚠️ Реквизиты юрлица (ИНН / ОГРН / адрес) — placeholder'ы в legal-доках за draft-banner'ом. **Заполнить после регистрации юр.лица.**
- ⏳ Заполнить `CARRIER_*` env-vars + `COMPANY_*` — это идёт в каждый PDF (путевой лист / акт / счёт).
- ⏳ ОФД (54-ФЗ): требуется только когда начнём принимать платежи от физлиц. На B2B-старте можно пропустить.

## 7. Operational readiness

- ✓ Smoke chain script: `node scripts/smoke-chain.mjs` (env: `API_URL`, `SEED_PASSWORD`). Прогоняет login → order → trip → waybill → inspect → start → temperature → complete → invoice.
- ⏳ **Запустить smoke chain на staging** перед каждым релизом.
- ⏳ Onboarding-пакет: 1 пилотный клиент = ручное создание организации + первый админ-user через `pnpm db:seed` + invitation flow для остальных ролей.
- ⏳ Support escalation путь: `support@<domain>` MX-запись + автоответчик "получили, ответим в 4 часа".
- ⏳ Runbook на 5 типичных инцидентов (DB OOM, Redis OOM, certbot fail, queue stuck, JWT mismatch).

## 8. Pricing & monetization

- ✓ Plans / subscriptions / payments / usage counters / plan-guard — все таблицы и роуты.
- ✓ ЮKassa webhook receiver — готов в коде, mock-режим без API-ключа.
- ⚠️ Прайсинг (Free / Start / Pro / Enterprise) — указан в landing/Pricing, но **не закреплён договором**. Утвердить ставки + лимиты с юристом перед открытием платных подписок.

## 9. Mobile

- ✓ 10 экранов, визуальный редизайн v2.
- ✓ WatermelonDB offline-first, синхронизация через REST API.
- ⏳ Сборка через `pnpm --filter @tms/mobile build:android` (Expo EAS). Регистрация приложения в Google Play / RuStore.
- ⏳ Push-уведомления через FCM (для iOS — APN). Не обязательно для пилота, можно остаться на Telegram-bot.

## 10. Откат / disaster recovery

- ⏳ **Worst-case**: пилотный клиент работает 2 недели, что-то идёт не так — план?
  1. `docker compose down` (не удаляем volumes).
  2. Свежий `pg_restore` из последнего бэкапа.
  3. Переключение DNS на статичную страницу "восстановление, ETA X часов".
- ⏳ RTO target: 4 часа.
- ⏳ RPO target: 24 часа (ежедневные бэкапы).

---

## Минимальная команда для go-live (после прохождения чек-листа)

```bash
# На прод-хосте:
git clone <repo> /opt/tms && cd /opt/tms
git checkout <release-tag>
cp .env.example .env && nano .env       # заполнить все CHANGE_ME_*
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api pnpm --filter @tms/api db:migrate
docker compose -f docker-compose.prod.yml exec api pnpm --filter @tms/api db:seed
# Опционально: docker compose run certbot ... (TLS)
curl https://<domain>/api/health
```
