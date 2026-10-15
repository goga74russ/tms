# DevOps/SRE — аудит TMS 2026-10-15

**Персона/взгляд:** Kelsey Hightower — простая, воспроизводимая, наблюдаемая инфраструктура. «Если вы не можете восстановиться из бэкапа — у вас нет бэкапа. Если алерт никуда не приходит — у вас нет мониторинга».

**Охват (прочитано):** `docker-compose.prod.yml`, `docker-compose.monitoring.yml`, `apps/api/docker-compose.test.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`, `.gitignore`, `.env.example`, `nginx/default.conf`, `nginx/default-ssl.conf`, `scripts/{deploy.sh,deploy.ps1,rollback-prod.sh,backup-db.sh,backup-cron-example,restore-db.sh,restore-db-to-staging.sh,dr-drill.sh}`, `apps/api/scripts/migrate.ts`, `apps/api/drizzle/*.sql` (выборочно, плюс проверка BEGIN/идемпотентности), `apps/api/src/server.ts` (trustProxy, rate-limit, metrics, health, shutdown), `apps/api/src/services/storage.service.ts`, `.github/workflows/p0-gate.yml`, `docs/operations/monitoring/{prometheus.yml,prometheus-rules.yml,setup-grafana-cloud.md}`, `docs/operations/{deployment,runbook,pre-launch-checklist,release-gate,first-pilot-deploy}.md`, `docs/TODO-OPS.md`, `docs/tasks/_status.md`, а также прошлые отчёты (`docs/qa/code-audit-2026-06-14.md`, `docs/tasks/transpult/2026-05-23-code-inventory.md`).

**Метод:** статическое чтение конфигов и скриптов, сверка кода и документации, трассировка env-переменных от `.env.example` через compose до `process.env` в коде, сопоставление с фактическим продом из документов (Selectel VPS 135.106.152.23, `/opt/transpult`). Каждую находку я перечитал повторно и попытался опровергнуть. Где вывод зависит от состояния хоста, которое из репозитория не видно, стоит PLAUSIBLE.

## Вердикт

Скелет production-стека добротный: non-root образы, multi-stage сборка, healthcheck'и, лимиты памяти, ротация логов, `${VAR:?}`-валидация, fail-closed для секретов вебхуков, Prometheus на 127.0.0.1. Но **цепочка «бэкап → восстановление → откат → алерт» на практике не работает ни в одном звене**. Файлы в MinIO (сканы, подписанные документы) не бэкапятся вообще. PG-бэкапы, судя по `TODO-OPS.md`, лежат на том же хосте. Перед деплоем дамп не снимается, а `rollback-prod.sh` сломан. Ни один алерт никуда не доставляется. DR drill ни разу не проводился, поэтому заявленные RTO 4 ч / RPO 24 ч ничем не подтверждены. В git лежит пароль seed-админа прода. Документация для развёртывания нового клиента (TLS, cron, миграции) при буквальном исполнении приводит к простою или к молча неработающим бэкапам. Первичный хостинг находится в РФ (Selectel), и с точки зрения 152-ФЗ это правильно. Риски для ПДн создают побочные копии: staging-БД с прод-ПДн на открытом порту и метрики в Grafana Cloud EU.

**Зрелость области: 4/10.**

## Сильные стороны

- Multi-stage Dockerfile'ы, `USER tms` (non-root), Next.js standalone, `NEXT_TELEMETRY_DISABLED`; `.dockerignore` исключает `.env*`, `.git`, `docs` (кроме нужных юр-текстов).
- В compose: `restart: unless-stopped`, json-file ротация 10m×3, `deploy.resources.limits.memory` на каждом сервисе, `depends_on: service_healthy` для БД/Redis/MinIO, обязательные секреты через `${VAR:?}`. Postgres, Redis и MinIO наружу не публикуются.
- Redis: `noeviction` и AOF, что правильно для BullMQ. Prometheus слушает только `127.0.0.1:9090`.
- В API: fail-closed при отсутствии `GOSKLYUCH_CALLBACK_SECRET` / `TELEGRAM_WEBHOOK_SECRET`; `/metrics` в prod не публикуется без basic-auth; есть `/api/health` (liveness) и `/api/health/ready` (503 при деградации); graceful shutdown по SIGTERM с остановкой воркеров.
- `backup-db.sh` и `restore-*.sh` написаны аккуратно: `set -euo pipefail`, `PIPESTATUS`, проверка размера, подтверждение фразой, row-count diff.
- CI (`p0-gate.yml`): build, lint, unit, OpenAPI drift, Playwright, smoke-chain и integration на реальных Postgres/Redis; `docker compose config` валидируется.
- Хостинг прода — Selectel (РФ), почта — Selectel Mail Service. Требование 152-ФЗ о первичной записи ПДн в РФ по основному контуру выполнено.

## Находки

### [P0] OPS-01 — Пароль seed-аккаунтов прода в открытом виде в git

- **Где:** `docs/TODO-OPS.md:61` (коммит `d01af91`, находится в HEAD); связано с `docs/operations/deployment.md:80` («shared seed password»).
- **Что:** в документ записан фактический пароль `admin@tms.local` на проде (значение `SEED_PASSWORD` из прод-`.env`; здесь не повторяю, начинается с `_hk0…`). По `deployment.md:80` и `first-pilot-deploy.md:166` тот же `SEED_PASSWORD` получают все seed-аккаунты, включая `super@tms.local` (платформенный super-admin). В `TODO-OPS.md` смена пароля значится как невыполненная задача. Репозиторий `github.com/goga74russ/tms`.
- **Сценарий:** любой человек с доступом на чтение к репозиторию (контрибьютор, форк, утечка, публичная видимость) входит на `https://transpult.ru` как admin или super-admin и получает межтенантный доступ ко всем ПДн, документам и биллингу. Это утечка ПДн и инцидент по 152-ФЗ (уведомление РКН в течение 24 ч).
- **Исправление:** сразу сменить пароли всех `*@tms.local` на проде (или отключить эти аккаунты), задать новый `SEED_PASSWORD` и сбросить сессии. Удалить строку из файла и вычистить историю (`git filter-repo`, затем force-push), учитывая, что старые клоны и форки останутся скомпрометированы. Добавить secret-scanning (gitleaks / GitHub push protection) в CI.
- **Статус:** CONFIRMED (секрет в репозитории). Был ли он уже сменён на проде, из репо не видно, поэтому исходить нужно из того, что не сменён.

### [P1] OPS-02 — Объектное хранилище (MinIO) не бэкапится вообще; PG-бэкапы, вероятно, на том же хосте и без шифрования

- **Где:** `scripts/backup-db.sh` (только `pg_dump`); в репозитории нет ни одного скрипта для `miniodata` (по grep: ни `mc mirror`, ни `rclone`, ни snapshot тома); `docs/TODO-OPS.md:9` («Daily Postgres backups → MinIO»); `scripts/backup-db.sh:113-132` (offsite необязателен, без шифрования).
- **Что:** (1) Фото осмотров, подписи, сканы, PDF документов и ЭТрН-артефакты хранятся только в томе `miniodata` на единственном VPS. Путевые листы и первичка подлежат хранению 5 лет. (2) Единственное упоминание места хранения PG-бэкапов — «→ MinIO». Если это тот же MinIO на том же хосте, бэкап разделяет судьбу продакшена. (3) Дампы с ПДн уходят offsite в открытом виде.
- **Сценарий:** отказ диска или VPS, ошибка `docker volume rm`, ransomware. В результате безвозвратно теряются все файлы клиентов и, вероятно, сами бэкапы БД. Фактический RPO равен бесконечности, а не 24 ч.
- **Исправление:** ежедневный `mc mirror --overwrite` (или versioned bucket с репликацией) в объектное хранилище **другого провайдера/региона в РФ** (Yandex Object Storage, Selectel S3 в другой зоне). PG-дампы шифровать (`age`/`gpg` с ключом вне хоста) и отправлять туда же. Включить object-lock/versioning от удаления. Добавить в DR drill восстановление файлов.
- **Статус:** CONFIRMED (отсутствие бэкапа MinIO, отсутствие шифрования); PLAUSIBLE (бэкапы на том же хосте). Повтор: `docs/tasks/_status.md:53` (DevOps: «Backup encryption…») — не закрыто.

### [P1] OPS-03 — Деплой без pre-deploy бэкапа, `rollback-prod.sh` нерабочий и может оставить прод лежать

- **Где:** `scripts/deploy.sh:58-88` (бэкапа нет); `scripts/rollback-prod.sh:4,8,24-32`; `docs/operations/deployment.md:35,47`; `docs/operations/release-gate.md:27,31`.
- **Что:** (1) `deploy.sh` применяет миграции, не сняв дамп, хотя `deployment.md` (шаг 7) и `release-gate.md` («Backup exists before any migration») требуют обратного. Файлов `backups/pre-deploy-*.dump`, которые ожидает rollback, никто не создаёт. (2) `rollback-prod.sh` по умолчанию делает `cd /opt/tms`, а прод находится в `/opt/transpult`. Скрипт ждёт несжатый `.dump`, но `backup-db.sh` пишет `.dump.gz`, а `cat file.gz | pg_restore` падает с «input file does not appear to be a valid archive». (3) Сначала выполняется `compose stop nginx web api`, затем restore. Из-за `set -e` при ошибке restore скрипт выходит, и **прод остаётся остановленным**. (4) Код и образы не откатываются: старая БД оказывается под новым кодом.
- **Сценарий:** миграция портит данные, дежурный запускает задокументированный rollback с `PROJECT_DIR=/opt/transpult` и последним `.dump.gz`. Приложение остановлено, restore падает, сервис лежит, свежего дампа нет.
- **Исправление:** в `deploy.sh` до миграций выполнять `backup-db.sh` (с тегом `pre-deploy-<sha>`) и проверять размер. В rollback: `gunzip -c | pg_restore`, валидация `pg_restore --list` **до** остановки сервисов, `trap` на обратный подъём, а также `git checkout <prev_sha>` с пересборкой или (лучше) переключением на предыдущий тег образа. Дефолт `PROJECT_DIR` привести к `/opt/transpult`.
- **Статус:** CONFIRMED. Повтор: `docs/tasks/transpult/2026-05-23-code-inventory.md:265` (#14 «Rollback-prod.sh fix (/opt/transpult + …)») — не закрыто.

### [P1] OPS-04 — Алертинга нет end-to-end: ни один сигнал не доходит до человека

- **Где:** `docs/operations/monitoring/prometheus.yml:31-35,46-49,87-91`; `docker-compose.monitoring.yml:126-135`; `docker-compose.prod.yml:100-174` (нет `METRICS_*`); `apps/api/src/server.ts:241-251`; `docs/TODO-OPS.md` («Telegram-мониторинг… Пока живём „по ощущениям“»); `docs/operations/first-pilot-deploy.md:361`.
- **Что:**
  1. В `prometheus.yml` стоят `url: ${GRAFANA_CLOUD_REMOTE_WRITE_URL}` и `${GRAFANA_CLOUD_*}` в basic_auth. Prometheus 2.x **не подставляет env в конфиг**: флаг `expand-external-labels` действует только на `external_labels`. Remote write идёт по литеральной строке, поэтому в Grafana Cloud метрики не попадают и облачного алертинга нет.
  2. `alertmanagers: []`: локально вычисленные правила никуда не отправляются.
  3. API-метрики включить невозможно: в compose `api.environment` нет `METRICS_ENABLED` / `METRICS_BASIC_AUTH_*`, а `env_file` не используется. Значит, `job="api"` всегда down, и правила 5xx/latency никогда не сработают. Блок `basic_auth` для api закомментирован и тоже построен на неподставляемых `${}`.
  4. Внешнего uptime-монитора и heartbeat бэкапа нет (строка в `backup-cron-example:20` закомментирована). Алерта «backup-stale > 26h», обязательного по `first-pilot-deploy.md:361`, в правилах нет.
- **Сценарий:** ночью падает API или перестаёт делаться бэкап, и никто не узнаёт об этом, пока не позвонит клиент. Для пилота с SLA это неприемлемо.
- **Исправление:** минимально и просто: внешний HTTP-check `/api/health/ready` (UptimeRobot / Healthchecks.io / Yandex Monitoring) с доставкой в Telegram, плюс heartbeat-пинг в конце `backup-db.sh`. Для Prometheus: генерировать конфиг через `envsubst` при старте или хранить секреты в `*_file`, подключить Alertmanager с Telegram-receiver, пробросить `METRICS_*` в api и раскомментировать `basic_auth` (через `password_file`).
- **Статус:** CONFIRMED. Повтор: `docs/tasks/_status.md:53` («uptime monitor») — не закрыто.

### [P1] OPS-05 — Прод-ПДн копируются в «staging»-БД с паролем `tms_test` на публичном порту 15432

- **Где:** `scripts/backup-cron-example:14`; `scripts/restore-db-to-staging.sh:73-77,147-151`; `apps/api/docker-compose.test.yml:15-23`; `scripts/dr-drill.sh:59-64,81-91`; `docs/operations/first-pilot-deploy.md:82-85` (UFW).
- **Что:** еженедельный cron (или `dr-drill.sh`) на **прод-хосте** поднимает тестовый стек (`ports: "15432:5432"`, без `127.0.0.1`, пароль `tms_test`, а также Redis `16379` без пароля) и заливает туда полный прод-дамп без анонимизации. `restore-db-to-staging.sh` после себя стек не гасит: teardown есть только в `dr-drill.sh`, при этом `KEEP_STAGING=1` его отключает. Опубликованные Docker-порты обходят UFW: Docker пишет собственные iptables-правила в цепочку DOCKER до правил ufw.
- **Сценарий:** при установке cron по инструкции в шапке файла (`crontab -u tms -e`) копия всей прод-БД (ФИО и паспортные данные водителей, медосмотры, контрагенты) неделями доступна из интернета по `psql -h 135.106.152.23 -p 15432 -U tms_test` с паролем `tms_test`. Это утечка ПДн, включая данные о здоровье (специальная категория, 152-ФЗ ст. 10).
- **Исправление:** не выполнять DR-restore на прод-хосте, а использовать отдельную VM. Если иначе нельзя: `127.0.0.1:15432:5432`, случайный пароль, обязательный teardown через `trap` в `restore-db-to-staging.sh`, маскирование ПДн после restore. Убрать строку из cron-примера или заменить её на `dr-drill.sh`.
- **Статус:** CONFIRMED (конфигурация); фактическая эксплуатация зависит от того, установлен ли cron, — PLAUSIBLE.

### [P1] OPS-06 — Лимиты по IP (логин, verify-коды) обходятся подделкой `X-Forwarded-For`

- **Где:** `nginx/default.conf:33`, `nginx/default-ssl.conf:50` (`$proxy_add_x_forwarded_for`); `apps/api/src/server.ts:116` (`trustProxy: true`), `server.ts:217-219` (`keyGenerator` → `ip:${request.ip}`).
- **Что:** nginx **дописывает** клиентский XFF, а не заменяет его. Fastify с `trustProxy: true` доверяет всей цепочке, и `request.ip` становится самым левым значением, которое задаёт клиент. Исправление 2026-06-14 закрыло только `allowList` (там теперь используется `socket.remoteAddress`). Ключ бакета по-прежнему управляем.
- **Сценарий:** атакующий шлёт `POST /api/auth/login` с `X-Forwarded-For: <случайный IP>` на каждый запрос. Каждый запрос попадает в новый бакет, лимит `LOGIN_RATE_LIMIT_MAX=5/мин` не срабатывает, и можно перебирать пароли и 6-значные коды. Кроме того, IP в `med_access_log` (через `inspections/routes.ts:373,487`) подделывается, что подрывает доказательную ценность журнала доступа к медданным.
- **Исправление:** в nginx `proxy_set_header X-Forwarded-For $remote_addr;` (nginx здесь edge), в API `trustProxy: 1` (один hop) или IP/подсеть docker-сети nginx. Дополнительно ввести per-account лимит на логин.
- **Статус:** CONFIRMED. Повтор: `docs/qa/code-audit-2026-06-14.md:228` (P1 «Login rate-limit bypass … X-Forwarded-For spoof») — **закрыто частично**, ротация бакета не закрыта.

### [P1] OPS-07 — Процедура включения TLS по документации приводит к простою

- **Где:** `.env.example:32-34`; `docs/operations/first-pilot-deploy.md:139-155`; `docs/operations/pre-launch-checklist.md:50`; `docs/operations/runbook.md:159`; `nginx/default-ssl.conf:27-28`; `nginx/default.conf` (нет `/.well-known`).
- **Что:** (1) Документы и `.env.example` указывают `NGINX_CONF=./nginx/default-tls.conf`, но такого файла нет, существует `default-ssl.conf`. Docker bind-mount несуществующего пути создаёт **каталог** и монтирует его на место `default.conf`, после чего nginx не стартует. (2) В `default-ssl.conf` захардкожен `YOUR_DOMAIN`, и шаг его замены в инструкции отсутствует. (3) Шаг 1 инструкции (`certbot --webroot`) выполняется при `default.conf`, а там нет `location /.well-known/acme-challenge/`: запрос проксируется в Next.js, получает 404, и сертификат не выпускается. Том `certbot-webroot` смонтирован в nginx, но не обслуживается.
- **Сценарий:** инженер разворачивает второго пилотного клиента строго по `first-pilot-deploy.md`. Certbot падает, а после `sed … default-tls.conf` и `up -d nginx` весь сайт (80/443) недоступен.
- **Исправление:** переименовать файл или исправить все ссылки на одно имя, шаблонизировать домен (`envsubst` через `/etc/nginx/templates` в официальном образе nginx), добавить ACME-location в `default.conf`, проверять `nginx -t` в CI.
- **Статус:** CONFIRMED.

### [P1] OPS-08 — cron-пример для `/etc/cron.d` без поля пользователя: бэкапы молча не запускаются

- **Где:** `scripts/backup-cron-example:12,14`; `docs/operations/first-pilot-deploy.md:218-220`.
- **Что:** инструкция копирует файл в `/etc/cron.d/tms-backup`. Формат `/etc/cron.d` требует шестого поля с пользователем (`m h dom mon dow USER cmd`), а в примере его нет, поэтому cron принимает `/opt/tms/scripts/backup-db.sh` за имя пользователя и строку не исполняет. Вдобавок путь `/opt/tms` не совпадает с продом (`/opt/transpult`), а «Weekly DR drill» на деле запускает `restore-db-to-staging.sh`, а не `dr-drill.sh`.
- **Сценарий:** новый клиент разворачивается по инструкции, ручной первый бэкап проходит, после чего ежедневных бэкапов нет. Алерта на это нет (OPS-04). Пропажа обнаруживается в день аварии.
- **Исправление:** два явных файла: `tms-backup.crontab` (для `crontab -u`) и `tms-backup.cron.d` (с полем user); пути через переменную или `/opt/transpult`; heartbeat-пинг; проверка свежести бэкапа.
- **Статус:** CONFIRMED.

### [P2] OPS-09 — Bootstrap нового окружения по документации не работает

- **Где:** `docs/operations/first-pilot-deploy.md:122-125`, `pre-launch-checklist.md:27-29,134-135`; `apps/api/Dockerfile:39-54`; `apps/api/package.json` (`tsx`, `drizzle-kit` в devDependencies); `.env.example` (нет `GOSKLYUCH_CALLBACK_SECRET`); `apps/api/src/server.ts:193-196`; отсутствие создания бакета MinIO (по grep: ни `CreateBucket`, ни `mc mb`).
- **Что:** (1) `docker compose exec api pnpm --filter @tms/api db:migrate|db:seed` не сработает: runner-образ содержит только `dist/`, в нём нет `scripts/migrate.ts`, `drizzle/*.sql`, `tsx` и `../../.env`. (2) `GOSKLYUCH_CALLBACK_SECRET` в compose по умолчанию пустой, в `.env.example` отсутствует, а при `NODE_ENV=production` API выходит с кодом 1. В итоге свежий деплой уходит в crash-loop, а `pre-launch-checklist.md:12` утверждает «покрывает все env-vars». (3) Бакет `tms` нигде не создаётся, и anonymous-read политика для `/storage/` (на неё рассчитаны `S3_PUBLIC_URL`-ссылки) нигде не задаётся и не задокументирована. Первые загрузки получают `NoSuchBucket`.
- **Сценарий:** онбординг второго клиента занимает дни ручной отладки вместо часа, растёт риск «временных» небезопасных обходов.
- **Исправление:** одноразовый сервис `migrate` в compose (тот же образ с `drizzle/` и скомпилированным мигратором) с `depends_on: service_completed_successfully`; init-контейнер `minio-init` (`mc mb --ignore-existing`, явная политика); добавить `GOSKLYUCH_CALLBACK_SECRET` в `.env.example`; в CI выполнять `compose up` и smoke против собранных образов.
- **Статус:** CONFIRMED.

### [P2] OPS-10 — Миграции при деплое: неатомарны, выполняются до сборки, два несовместимых трекера

- **Где:** `scripts/deploy.sh:66-88`; `apps/api/scripts/migrate.ts:30-67`; `apps/api/drizzle/*.sql` (32 из 61 файла без `BEGIN`); `scripts/dr-drill.sh:197-213`.
- **Что:** (1) Комментарий в `deploy.sh` требует `BEGIN/COMMIT` в каждом файле, но примерно у половины миграций его нет, `psql` вызывается без `-1/--single-transaction`, а тег пишется **отдельной** командой. Сбой посередине оставляет частично применённую схему без тега, и повторный запуск падает на «already exists». (2) Миграции применяются **до** `compose up --build`. Сборка Next.js на проде длится минуты, и всё это время старый код работает на новой схеме. Если сборка упала (`set -e`), схема новая, код старый, а отката нет (OPS-03). (3) Прод учитывает миграции в `tms_schema_migrations`, а `pnpm db:migrate` в CI и `dr-drill` — в `drizzle.__drizzle_migrations`. Шаг 5 drill на восстановленном прод-дампе, вероятно, попробует применить `0000_full_schema` (`CREATE TYPE` без `IF NOT EXISTS`) и упадёт, так что drill всегда красный.
- **Исправление:** один мигратор (тот, что в `migrate.ts`) с единой таблицей; каждая миграция в транзакции вместе с записью тега; порядок «build → backup → migrate → up»; правило expand/contract для обратно совместимых миграций.
- **Статус:** CONFIRMED (1, 2); PLAUSIBLE (3: зависит от содержимого `drizzle.__drizzle_migrations` на проде).

### [P2] OPS-11 — Правила алертов семантически неверны и не сработают даже после починки доставки

- **Где:** `docs/operations/monitoring/prometheus-rules.yml:62-81,91-93,125-131,146-151`.
- **Что:** `DatabaseDown: up{job="postgres"} == 0` проверяет доступность **экспортера**, а не БД. postgres_exporter при недоступной БД отвечает 200 с `pg_up 0`, нужно `pg_up == 0`. То же с `RedisDown`, нужно `redis_up == 0`. `HighMemoryUsage` фильтрует `name=~"tms-(…)"`, а контейнеры на проде называются `transpult-<svc>-1` (проект = каталог `/opt/transpult`), так что правило не матчится никогда. `QueueBacklog` и `CertExpiringSoon` ссылаются на метрики, которых нет (сами помечены TEMPLATE/OPTIONAL). Правила «API недоступен» (`up{job="api"}==0` / probe) и «бэкап устарел» нет.
- **Исправление:** переписать на `pg_up`/`redis_up`, матчить по `container_label_com_docker_compose_service`, добавить blackbox_exporter (HTTP и TLS-срок), `time() - backup_last_success_timestamp > 26h` через textfile-collector, проверять правила `promtool test rules` в CI.
- **Статус:** CONFIRMED.

### [P2] OPS-12 — Документированные env-переменные молча не доходят до контейнеров

- **Где:** `docker-compose.prod.yml:100-174,193-206`; `.env.example:113-167,199-206`.
- **Что:** compose перечисляет переменные явно в `environment:` и не использует `env_file`. Поэтому `METRICS_*`, `TELEGRAM_BOT_TOKEN/WEBHOOK_SECRET`, `UNISENDER_*`, `AI_COPILOT_ENABLED`, `ANTHROPIC_API_KEY`, `ALLOW_ONLINE_PAYMENTS`, `S3_ENDPOINT` (для внешнего S3) из `.env` в api не попадают. `NEXT_PUBLIC_CARRIER_*` и `NEXT_PUBLIC_AI_COPILOT_ENABLED` не передаются как build-args в web, хотя используются (`apps/web/src/app/print/invoice/[id]/page.tsx`, `CopilotFab.tsx`).
- **Сценарий:** оператор включает Telegram, Unisender или метрики по `.env.example`, ничего не происходит, и диагностика уходит в код. Реквизиты в печатной форме счёта остаются пустыми или дефолтными.
- **Исправление:** либо `env_file: .env` с явным allowlist-документом, либо дописать недостающие ключи. Добавить CI-проверку, что множество `process.env.X` в коде ⊆ ключи compose ∪ build-args.
- **Статус:** CONFIRMED.

### [P2] OPS-13 — Базовые образы на Node.js 20, у которого закончилась поддержка

- **Где:** `apps/api/Dockerfile:7,33`; `apps/web/Dockerfile:7,50`; `.github/workflows/p0-gate.yml:15`.
- **Что:** поддержка Node 20 LTS закончилась 30.04.2026, сегодня 15.10.2026. Security-патчей рантайма нет. Образ к тому же не закреплён digest'ом.
- **Исправление:** перейти на `node:22-alpine` (LTS до 2027-04) или 24, закрепить `@sha256:` и прогнать CI.
- **Статус:** CONFIRMED.

### [P2] OPS-14 — Сборка на прод-хосте, нет версионированных образов, деплой не привязан к зелёному CI

- **Где:** `scripts/deploy.sh:38-49,88`; `.github/workflows/p0-gate.yml` (нет `docker build`, нет publish).
- **Что:** `deploy.sh` делает `git pull` текущего `origin/main`, не проверяя статус CI для этого SHA, и собирает образы на том же VPS, где работает прод (Next build требует 2–4 ГБ RAM при лимитах postgres 2g, api и web по 1g). Образы не тегируются, поэтому откат означает пересборку старого SHA за несколько минут. CI не собирает Dockerfile'ы, и их поломка обнаруживается прямо в момент деплоя.
- **Исправление:** в CI `docker build` → push в registry (Selectel CR / Yandex CR, то есть в РФ) с тегом `<sha>`. Деплой выполняет `IMAGE_TAG=<sha> compose pull && up -d`, откат — `IMAGE_TAG=<prev>`. Перед деплоем `gh run list --commit <sha>` с проверкой на success.
- **Статус:** CONFIRMED.

### [P2] OPS-15 — Документация эксплуатации не соответствует реальности; RTO/RPO не подтверждены

- **Где:** `docs/operations/deployment.md:30-40` (путь `/opt/tms`; шаги «bucket», «pre-migration backup», «seed if empty», которых в `deploy.sh` нет); `pre-launch-checklist.md:24` («25 миграций», на деле 61), `:117-122`; `release-gate.md:27-31`; `runbook.md:213,270` (`/opt/tms/.env`, `tms-api-1` при проекте `transpult`); `scripts/dr-drill.sh:6-8`; `docs/TODO-OPS.md:77-78` («Не делали полноценный DR drill»).
- **Что:** runbook и чек-листы описывают несуществующий процесс, команды copy-paste из runbook на проде не работают. RTO 4 ч и RPO 24 ч заявлены, но ни разу не проверялись drill'ом. Restore файлов MinIO не предусмотрен вовсе.
- **Исправление:** одна страница «как устроен прод сейчас» (пути, проект compose, cron, куда идут бэкапы); провести и задокументировать первый DR drill на отдельной VM с замером фактических RTO/RPO; пометить устаревшие документы как archived.
- **Статус:** CONFIRMED. Повтор: `docs/tasks/_status.md:53`, `2026-05-23-code-inventory.md:265` («DR-drill verified once») — не закрыто.

### [P3] OPS-16 — Опасная команда в runbook INC-5

- **Где:** `docs/operations/runbook.md:279` — `docker system prune -af --volumes`.
- **Что:** в инциденте «диск полон» postgres может быть остановлен. На Docker < 23 эта команда удаляет все неиспользуемые тома, включая именованный `pgdata`, если контейнер был удалён. Даже на новых версиях `-a` сносит все неиспользуемые образы, что делает невозможным быстрый откат без пересборки.
- **Исправление:** заменить на `docker image prune -a --filter until=168h` и `docker builder prune`, тома не трогать.
- **Статус:** PLAUSIBLE (зависит от версии Docker и состояния контейнеров).

### [P3] OPS-17 — Деплой не zero-downtime и рвёт WebSocket-сессии

- **Где:** `scripts/deploy.sh:88-94`; `nginx/*.conf` (`proxy_pass http://api:4000` без `resolver`).
- **Что:** recreate api и web даёт окно 502, `compose restart nginx` разрывает все WS (GPS, live). Перезапуск nginx лечит симптом (кэш DNS), а не причину.
- **Исправление:** `resolver 127.0.0.11 valid=10s;` и `set $upstream api:4000; proxy_pass http://$upstream;` либо `nginx -s reload` вместо restart. Для api задать `stop_grace_period` и readiness-gate; при росте — blue/green двумя репликами.
- **Статус:** CONFIRMED.

### [P3] OPS-18 — Гигиена образов и compose

- **Где:** `docker-compose.prod.yml:5-6,22,44,51,63,222,249`.
- **Что:** плавающие теги (`nginx:alpine`, `certbot/certbot`, `redis:7-alpine`, `postgres:16-alpine`) без digest. В шапке заявлены «mem_limit / cpus», но CPU-лимитов нет. Пароль Redis передаётся в argv healthcheck'а (виден в `docker inspect` и `ps`). `web` и `nginx` используют `depends_on` без `condition: service_healthy`. MinIO закреплён на community-релизе 2025-04-22: MinIO прекратила публикацию community-образов, и обновления безопасности для этого тега, вероятно, недоступны (PLAUSIBLE).
- **Исправление:** pin по digest и Renovate; `cpus:` в limits; `REDISCLI_AUTH` вместо `-a`; health-conditions; план замены или сборки MinIO (или managed S3 в РФ).
- **Статус:** CONFIRMED (кроме пункта о MinIO).

### [P3] OPS-19 — `.env.example`: небезопасные дефолты и ложное обещание

- **Где:** `.env.example:4-6,22-30`.
- **Что:** шапка обещает, что «CHANGE_ME_* intentionally invalid so production never boots», но ни compose, ни код `CHANGE_ME` не проверяют, и Postgres, Redis, MinIO и JWT стартуют с этими значениями. Дефолты `COOKIE_SECURE=false` и `TMS_PUBLIC_SCHEME=http` в шаблоне для прода переопределяют безопасный дефолт compose (`true`).
- **Исправление:** boot-check в API (`/CHANGE_ME/` в любом секрете → exit 1) и pre-flight в `deploy.sh`; в шаблоне по умолчанию `COOKIE_SECURE=true`.
- **Статус:** CONFIRMED.

### [P3] OPS-20 — Мелочи в deploy/health

- **Где:** `scripts/deploy.sh:103,123`; `apps/api/src/server.ts:422-426`.
- **Что:** health-loop ходит только на `https://localhost`, поэтому при `default.conf` (HTTP-only, дефолт шаблона) деплой всегда «падает». Финальный `curl -fsS http://localhost/api/health` при TLS-конфиге получает 301, `-f` считает это успехом и печатает HTML. `/api/health` отдаёт захардкоженную `version: '1.0.0'` вместо git SHA, так что невозможно проверить, какой билд работает.
- **Исправление:** проверять через `docker compose exec api` (внутренний `/api/health/ready`) плюс внешний URL из `.env`; вшивать `GIT_SHA` build-arg'ом.
- **Статус:** CONFIRMED.

### [P3] OPS-21 — Hardening nginx и CI

- **Где:** `nginx/default-ssl.conf:23,29-32,94-103`; `.github/workflows/p0-gate.yml:32,107-111`.
- **Что:** нет `server_tokens off`, OCSP stapling и `ssl_ciphers`; синтаксис `listen 443 ssl http2` устарел в nginx ≥ 1.25. `Connection "upgrade"` на `location /` навязывается каждому запросу к Next. В CI не задан `permissions:` (токен с правами по умолчанию), actions не закреплены SHA, `pnpm audit` и `drizzle-kit check` стоят с `|| true`, gitleaks нет.
- **Исправление:** `map $http_upgrade $connection_upgrade`, `http2 on;`, `server_tokens off;`, `permissions: contents: read`, pin actions, сделать audit блокирующим для critical.
- **Статус:** CONFIRMED.

### [P3] OPS-22 — Конфигурация хоста вне VCS (дрейф)

- **Где:** `docs/TODO-OPS.md:8-9` (certbot cron 03:17/15:17, backup cron 06:00 МСК). В репо renew-cron закомментирован (`backup-cron-example:23`).
- **Что:** реальные cron, UFW и fail2ban, mc alias и правки `nginx/default-ssl.conf` (домен) существуют только на хосте. Локальная правка tracked-файла может со временем сломать `git pull --ff-only` в `deploy.sh`. Пересоздать хост по репозиторию невозможно.
- **Исправление:** cloud-init или Ansible-плейбук (или хотя бы `host/`-каталог с файлами cron, ufw и logrotate) плюс шаблонизация nginx (см. OPS-07).
- **Статус:** PLAUSIBLE.

### 152-ФЗ (локализация) — сводка

- Основной контур (VPS, Postgres, MinIO, почта) у Selectel в РФ: **ОК**.
- Grafana Cloud (`…prod-eu-west…` в `.env.example:120`) находится за рубежом. Сами метрики обычно не ПДн, но при `routeMetrics.registeredRoutesOnly: false` (`server.ts:289`) в label `route` попадают сырые URL, в том числе с идентификаторами. Если remote_write починят (OPS-04), нужна оценка трансграничной передачи либо Yandex Monitoring.
- Копия прод-ПДн в незащищённой «staging»-БД описана в OPS-05.
- Offsite-бэкапы должны оставаться в РФ (Yandex/Selectel S3) и быть зашифрованы (OPS-02).

## Рекомендации / Next Actions

1. **Сегодня:** сменить пароли всех `*@tms.local` на проде и сбросить сессии; вычистить пароль из git; включить secret-scanning (OPS-01).
2. **Сегодня:** проверить на проде `docker ps` и `ss -ltnp` на наличие `15432/16379`, проверить `crontab -l` / `/etc/cron.d`, загасить staging-стек, если он поднят (OPS-05).
3. Внешний uptime-check `/api/health/ready` и heartbeat бэкапа в Telegram, примерно за 1 час работы (OPS-04).
4. Бэкап MinIO и PG-дампов с шифрованием в S3 другого провайдера в РФ; pre-deploy дамп в `deploy.sh` (OPS-02, OPS-03).
5. Переписать `rollback-prod.sh` (gz, валидация до остановки, `trap`, откат кода) и провести первый DR drill на отдельной VM с замером RTO/RPO (OPS-03, OPS-15).
6. Закрыть XFF-спуфинг: `X-Forwarded-For $remote_addr` в nginx и `trustProxy: 1` (OPS-06).
7. Починить процедуру развёртывания нового клиента: имя TLS-конфига и шаблон домена, ACME-location, cron с полем user, сервис `migrate`, `minio-init`, `GOSKLYUCH_CALLBACK_SECRET` в `.env.example` (OPS-07, OPS-08, OPS-09).
8. Единый мигратор с транзакцией на файл; порядок build → backup → migrate → up (OPS-10).
9. Сборка образов в CI, registry в РФ, деплой по тегу SHA только после зелёного CI; перейти на Node 22 (OPS-13, OPS-14).
10. Довести мониторинг: `envsubst` или `*_file`, Alertmanager→Telegram, корректные правила (`pg_up`, `redis_up`, compose-label), blackbox, `promtool test` в CI; пробросить недостающие env (OPS-04, OPS-11, OPS-12).
11. Актуализировать `deployment.md`, `runbook.md`, `pre-launch-checklist.md` под `/opt/transpult`, убрать опасный `prune` (OPS-15, OPS-16).

## Открытые вопросы к другим ролям

- **Security:** обслуживает ли `/storage/` (nginx → MinIO) бакет с anonymous-read, и включает ли политика `s3:ListBucket`? Если да, `GET /storage/` отдаёт листинг всех ключей с документами и фото. Ссылки бессрочные и без авторизации. Что в бакете на проде, из репозитория не видно.
- **Legal/Compliance:** допустима ли передача метрик (с URL-лейблами) в Grafana Cloud EU? Каков требуемый срок хранения файлов (путевые листы и медосмотры — 5 лет?) и, соответственно, retention для бэкапов MinIO?
- **Backend:** есть ли на проде данные в `drizzle.__drizzle_migrations`? От этого зависит, проходит ли `dr-drill` шаг 5 (OPS-10).
- **Product/Owner:** нужен ли SLA на пилоте? От ответа зависит, хватит ли однохостовой схемы с RTO 4 ч или нужен warm standby.
