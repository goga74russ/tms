# First Pilot Deploy — runbook (TMS v2)

Пошаговый сценарий развёртывания первого пилотного клиента: от чистого
прод-хоста до подписанного go-live чек-листа. Все команды копируемые,
оператор работает под root или sudo, прод-хост на Ubuntu 24.04 LTS.

Целевые показатели DR (см. `pre-launch-checklist.md` §10):
- **RTO** = 4 часа
- **RPO** = 24 часа (бэкап каждый день в 03:00 UTC)

---

## 1. Предусловия

### 1.1 Инфраструктура

| Компонент | Минимум | Рекомендация |
|-----------|---------|--------------|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 ГБ | 16 ГБ |
| Диск | 100 ГБ SSD | 200 ГБ NVMe + отдельный том на бэкапы |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| Сеть | публичный IPv4 | IPv4 + IPv6, исходящий 25/465 порт открыт |

Облако: **Yandex Cloud** (compute-c100m, RU-Central1-A) или
**Selectel** (CL12 / CL22). Не использовать burstable-инстансы — Postgres
страдает от throttling.

### 1.2 DNS

- A-запись `tms.<client-domain>.ru` → IP сервера, TTL ≤ 300.
- (Опционально) MX/SPF/DKIM настроены, если SMTP идёт с того же домена.

### 1.3 ПО на хосте

```bash
sudo apt update && sudo apt install -y \
  ca-certificates curl gnupg lsb-release ufw fail2ban git
# Docker (официальный репозиторий)
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt update && sudo apt install -y \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker

# Node 22 LTS + pnpm (для миграций / smoke)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pnpm@9
```

Проверка:

```bash
docker --version       # Docker version 27.x
docker compose version # v2.x
node --version         # v22.x
pnpm --version         # 9.x
```

### 1.4 Доступы к провайдерам (минимум для пилота)

| Провайдер | Что нужно | Куда вставить в `.env` |
|-----------|-----------|------------------------|
| ЮKassa | shopId + secret (sandbox на старте) | `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` |
| SMTP | host, port, user, pass (Mailgun/Postmark/Yandex) | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` |
| Anthropic | API-key для AI-помощника | `ANTHROPIC_API_KEY` |
| (опц.) Wialon | token | `WIALON_TOKEN` |
| (опц.) Telegram | bot token | `TELEGRAM_BOT_TOKEN` |
| (опц.) S3/MinIO для бэкапов | bucket + ключи | `BACKUP_S3_BUCKET`, `AWS_*` |

Остальные провайдеры (Diadoc, ЦРПТ, Госключ) могут оставаться
в mock-режиме — реквизиты подключаются по мере прохождения клиентом
KYC/договорной части.

### 1.5 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 2. Initial deploy

```bash
# 1. Каталог + код
sudo mkdir -p /opt/tms && sudo chown -R "$USER":"$USER" /opt/tms
git clone https://github.com/<org>/tms-prod.git /opt/tms
cd /opt/tms
git checkout v0.1.1-pilot

# 2. .env из шаблона
cp .env.example .env
chmod 600 .env

# 3. Сгенерировать секреты
echo "JWT_SECRET=$(openssl rand -hex 32)"          >> /tmp/tms-secrets
echo "CREDENTIALS_KEY=$(openssl rand -hex 32)"     >> /tmp/tms-secrets
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" >> /tmp/tms-secrets
echo "REDIS_PASSWORD=$(openssl rand -base64 24)"   >> /tmp/tms-secrets
echo "MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)" >> /tmp/tms-secrets
echo "SEED_PASSWORD=$(openssl rand -base64 18)"    >> /tmp/tms-secrets
echo "YOOKASSA_WEBHOOK_SECRET=$(openssl rand -hex 32)" >> /tmp/tms-secrets
cat /tmp/tms-secrets   # перенести значения в .env
shred -u /tmp/tms-secrets

# 4. Открыть .env и заполнить все CHANGE_ME_* + DOMAIN / CORS_ORIGIN /
#    NEXT_PUBLIC_API_URL / SMTP_* / ANTHROPIC_API_KEY / YOOKASSA_*
nano .env

# 5. Подъём стека (без TLS — пока nginx слушает 80)
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f api   # ждём "ready" / Ctrl+C

# 6. Миграции + сид (демо-данные минимальные, потом удаляются)
docker compose -f docker-compose.prod.yml exec api \
  pnpm --filter @tms/api db:migrate
docker compose -f docker-compose.prod.yml exec api \
  pnpm --filter @tms/api db:seed

# 7. Health-check
curl -fsS http://localhost/api/health | jq .
# {"status":"ok","db":"ok","redis":"ok",...}
```

**Если api не поднимается** — `docker compose logs api` → искать
`FATAL:` / `Missing env`. Чаще всего: CREDENTIALS_KEY не 64 hex /
44 base64 символа.

---

## 3. TLS via Let's Encrypt (certbot)

```bash
# 1. Получить сертификат (webroot challenge)
docker compose -f docker-compose.prod.yml run --rm certbot \
  certonly --webroot -w /var/www/certbot \
           -d tms.<client-domain>.ru \
           --email ops@<your-domain>.ru \
           --agree-tos --no-eff-email --non-interactive

# 2. Переключить nginx на TLS-конфиг
sed -i 's|^NGINX_CONF=.*|NGINX_CONF=./nginx/default-tls.conf|' .env
docker compose -f docker-compose.prod.yml up -d nginx

# 3. Проверить
curl -fsS https://tms.<client-domain>.ru/api/health
# Заголовок Strict-Transport-Security должен присутствовать.

# 4. Авто-обновление сертификата — раскомментировать строку renew
#    в scripts/backup-cron-example и установить cron.
```

---

## 4. Onboarding первого тенанта

Есть два пути — выбрать один.

### 4.1 Через UI (рекомендуется)

1. Открыть `https://tms.<client>.ru/admin/organizations` под
   `super@tms.local` / `$SEED_PASSWORD`.
2. **+ Создать организацию** → ИНН + название → сохранить.
3. `/admin/users` → **Пригласить администратора** → почта клиента,
   роль `org_admin`, привязать к созданной организации.
4. Клиент получает письмо с magic-link, задаёт пароль, входит в
   `/onboarding` — 6-шаговый мастер (orgInfo → users → fleet →
   drivers → routes → first-trip).

### 4.2 Через SQL (для миграции с легаси)

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
INSERT INTO organizations (id, name, inn, kpp, created_at)
VALUES (gen_random_uuid(), 'ООО Ромашка', '7700000000', '770001001', now())
RETURNING id;

-- скопировать id, подставить ниже:
INSERT INTO users (id, organization_id, email, role, password_hash, created_at)
VALUES (
  gen_random_uuid(),
  '<скопированный-org-id>',
  'admin@romashka.ru',
  'org_admin',
  crypt('TempPassw0rd!', gen_salt('bf')),
  now()
);
SQL
```

После SQL-пути обязательно попросить клиента сменить пароль в
`/profile`.

После приземления администратора — удалить демо-сид:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "DELETE FROM users WHERE email LIKE '%@tms.local';"
```

---

## 5. Эксплуатационная обвязка

### 5.1 Бэкапы + DR drill (cron)

```bash
sudo cp /opt/tms/scripts/backup-cron-example /etc/cron.d/tms-backup
sudo chmod 644 /etc/cron.d/tms-backup
sudo systemctl restart cron

# Первый ручной бэкап (проверка цепочки)
sudo bash /opt/tms/scripts/backup-db.sh
ls -lh /var/backups/tms/

# Первый DR drill — обязан пройти полностью
sudo bash /opt/tms/scripts/dr-drill.sh
# отчёт: /var/log/tms-dr-drills/<ts>.md
```

Если drill красный — пилот не запускаем, разбираемся.

### 5.2 Offsite бэкапы (S3 / MinIO)

В `.env`:
```
BACKUP_S3_BUCKET=tms-backups-<client>
BACKUP_S3_PREFIX=tms/postgres
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=ru-central1
AWS_ENDPOINT_URL=https://storage.yandexcloud.net   # или selectel
```

Перезапустить cron не нужно — `backup-db.sh` подхватит при следующем
ночном запуске.

### 5.3 Monitoring — Grafana Cloud

См. `docs/operations/setup-grafana-cloud.md` (отдельный runbook).
Минимум на старте: alert на API 5xx-rate > 1% и на отсутствие свежего
бэкапа > 26 часов.

### 5.4 Логи / certbot renew

```bash
# Логи rotate (если нет logrotate ещё):
sudo tee /etc/logrotate.d/tms <<'EOF'
/var/log/tms-backup.log /var/log/tms-dr-drills/cron.log {
  weekly
  rotate 12
  compress
  missingok
  notifempty
}
EOF
```

`certbot renew` идёт через cron из `backup-cron-example`
(раскомментировать).

---

## 6. Smoke-верификация

### 6.1 Автоматический сценарий

```bash
SEED_PASSWORD='<значение из .env>' \
API_URL='https://tms.<client>.ru/api' \
node /opt/tms/scripts/smoke-chain.mjs
```

Должен пройти всю цепочку: login → create-order → assign-trip →
inspect → start → arrive → close. Все шаги зелёные → API готов.

### 6.2 Ручной обход (UI, дублирует smoke на живом UX)

1. `/login` под админом клиента.
2. `/orders/new` → создать заказ, отправитель/получатель/груз.
3. `/dispatcher` → создать рейс из заказа, назначить ТС + водителя.
4. Mobile (или эмулятор) — водитель видит назначение, проходит
   pre-trip осмотр.
5. **Старт рейса** → координаты обновляются на карте у диспетчера.
6. **Прибытие** → подтверждение получателем.
7. **Закрытие** → закрывающие документы в `/documents`.

Если хоть один шаг падает — пилот **не go-live**, фиксируем
блокер в `docs/operations/bug-tracker.md`.

---

## 7. Rollback plan

### 7.1 Если smoke упал сразу после deploy

```bash
cd /opt/tms
docker compose -f docker-compose.prod.yml down       # volumes остаются
git fetch --tags
git checkout <previous-tag>                          # последний зелёный
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api \
  pnpm --filter @tms/api db:migrate                  # если откатные мигр.
```

### 7.2 Если повреждены данные (catastrophic)

```bash
cd /opt/tms
docker compose -f docker-compose.prod.yml stop api web
# Найти последний валидный бэкап:
ls -lt /var/backups/tms/ | head
# Восстановить (интерактивно подтвердить TMS-RESTORE):
bash scripts/restore-db.sh /var/backups/tms/tms-tms-<TS>.dump.gz
docker compose -f docker-compose.prod.yml up -d api web
```

Целевые показатели: RTO ≤ 4 ч, RPO ≤ 24 ч. Если приближаемся к
порогу — переключить DNS на статичную "восстановление, ETA…" странице
(вариант в `nginx/maintenance.html`).

### 7.3 Полный re-deploy на запасном хосте

1. Поднять новый VM по разделам §1.3.
2. Восстановить `/var/backups/tms/` из offsite (S3).
3. Прогнать `git checkout <tag>` + `.env` (из менеджера секретов).
4. `docker compose up -d` + `restore-db.sh` свежим дампом.
5. Переключить DNS на новый IP, TTL 300 даёт ≤ 5 мин.

---

## Sign-off checklist

Оператор проходит сверху вниз. Все галочки обязательны для declaration
"pilot live".

- [ ] **1.** Прод-хост развёрнут по спекам §1.1, доступ по SSH только по ключу.
- [ ] **2.** DNS A-record указывает на сервер, ping проходит.
- [ ] **3.** `docker --version` ≥ 27, `node --version` = v22.x, `pnpm --version` ≥ 9.
- [ ] **4.** Все `CHANGE_ME_*` в `.env` заменены, файл `chmod 600`.
- [ ] **5.** `docker compose -f docker-compose.prod.yml ps` — все 6 сервисов healthy.
- [ ] **6.** `curl https://<domain>/api/health` возвращает `db:ok`, `redis:ok`.
- [ ] **7.** TLS-сертификат валиден ≥ 60 дней, HSTS заголовок присутствует.
- [ ] **8.** Первая организация + admin-пользователь созданы, демо-сид удалён.
- [ ] **9.** Cron `tms-backup` установлен, `/var/backups/tms/` содержит свежий дамп.
- [ ] **10.** `dr-drill.sh` отработал PASS, отчёт в `/var/log/tms-dr-drills/`.
- [ ] **11.** Offsite бэкап (S3 / MinIO) сконфигурирован и подтверждён первой выгрузкой.
- [ ] **12.** `smoke-chain.mjs` против прод-URL — все шаги зелёные.
- [ ] **13.** Ручной UX-обход (§6.2) — пройден на UI клиента.
- [ ] **14.** Grafana Cloud alerts активны: 5xx > 1%, backup-stale > 26h.
- [ ] **15.** Контакт on-call оператора передан клиенту, SLA-окно зафиксировано.

После 15/15 — обновить `docs/operations/release-gate.md`:
`pilot-<client>-<YYYYMMDD>: LIVE` + ссылка на отчёт первого DR drill.
