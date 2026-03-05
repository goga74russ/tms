# 🔒 SSL/TLS Setup — Let's Encrypt via Nginx

> **Статус:** ✅ Конфиг готов, нужен домен
> **Sprint:** 6, Phase 2

## Требования

- **Домен** (например `tms.example.ru`) → A-запись на `5.42.102.58`
- Порты **80** и **443** открыты на VPS

## Быстрый старт

### 1. Привязать домен

```bash
# У регистратора (Reg.ru, Namecheap, и т.д.):
# A-запись: tms.example.ru → 5.42.102.58
```

### 2. Обновить nginx config

```bash
ssh root@5.42.102.58
cd /opt/tms
# Замените `tms.example.ru` на свой домен в nginx/default.conf:
sed -i 's/tms.example.ru/ваш-домен.ru/g' nginx/default.conf
```

### 3. Первый запуск (HTTP only)

Перед получением сертификата нужно временно закомментировать HTTPS блок:

```bash
# Закомментировать HTTPS блок в nginx/default.conf (server listen 443)
# Оставить только HTTP блок (server listen 80)
# Затем:
docker compose -f docker-compose.prod.yml up -d nginx
```

### 4. Получить сертификат

```bash
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  -d ваш-домен.ru \
  --email admin@ваш-домен.ru \
  --agree-tos --no-eff-email
```

### 5. Включить HTTPS

```bash
# Раскомментировать HTTPS блок в nginx/default.conf
docker compose -f docker-compose.prod.yml restart nginx
```

### 6. Автоматическое обновление

Добавить в crontab:

```bash
crontab -e
# Каждый день в 3:00 пытаемся обновить сертификат:
0 3 * * * cd /opt/tms && docker compose -f docker-compose.prod.yml run --rm certbot renew && docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

## После SSL

1. Обновить `CORS_ORIGIN` в `.env`: `https://ваш-домен.ru`
2. Обновить `NEXT_PUBLIC_API_URL`: `https://ваш-домен.ru/api`
3. Установить Telegram webhook: `POST /api/telegram/setup-webhook` → `https://ваш-домен.ru/api/telegram/webhook`
4. Обновить `.env` мобильного приложения: `EXPO_PUBLIC_API_URL=https://ваш-домен.ru/api`

## Файлы

- `nginx/default.conf` — конфигурация nginx
- `docker-compose.prod.yml` — сервисы nginx + certbot
