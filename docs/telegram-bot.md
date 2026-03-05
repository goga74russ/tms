# 📨 Telegram Bot — Уведомления TMS

> **Статус:** ✅ Код готов, ожидает настройки бота
> **Sprint:** 6, Phase 1

## Быстрый старт

### 1. Создать бота

1. Открой [@BotFather](https://t.me/botfather) в Telegram
2. Отправь `/newbot`
3. Имя: `TMS Уведомления` (или своё)
4. Username: `tms_notify_bot` (или своё, должен быть уникальный)
5. Скопируй токен: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`

### 2. Настроить VPS

```bash
# SSH на сервер
ssh root@5.42.102.58

# Добавить токен в .env
echo 'TELEGRAM_BOT_TOKEN=123456:ABC-DEF...' >> /opt/tms/.env

# Перезапустить API
cd /opt/tms && docker compose -f docker-compose.prod.yml restart api
```

### 3. Установить Webhook (после SSL)

```bash
curl -X POST http://5.42.102.58:4000/api/telegram/setup-webhook \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<admin_jwt>" \
  -d '{"url": "https://yourdomain.ru/api/telegram/webhook"}'
```

> ⚠️ **Webhook требует HTTPS.** Пока нет SSL, можно использовать polling (вручную) или ngrok для тестирования.

### 4. Подписка пользователей

Каждый пользователь:
1. Открывает бота в Telegram
2. Нажимает **Start** или пишет `/start`
3. Получает подтверждение подписки
4. Начинает получать уведомления автоматически

Deep link с привязкой к userId: `https://t.me/tms_notify_bot?start=<userId>`

## Команды бота

| Команда | Описание |
|---------|----------|
| `/start` | Подписаться на уведомления |
| `/status` | Показать статус подписки |
| `/mute` | Приостановить уведомления |
| `/unmute` | Возобновить уведомления |

## Отслеживаемые события (12)

| Событие | Emoji | Описание |
|---------|-------|----------|
| `trip.created` | 🚛 | Новый рейс создан |
| `trip.assigned` | ✅ | Рейс назначен водителю |
| `trip.departed` | 🚀 | Рейс отправлен |
| `trip.completed` | 🏁 | Рейс завершён |
| `trip.cancelled` | ❌ | Рейс отменён |
| `order.created` | 📦 | Новая заявка |
| `repair.created` | 🔧 | Заявка на ремонт |
| `repair.completed` | ✅ | Ремонт завершён |
| `invoice.created` | 💰 | Создан счёт |
| `invoice.paid` | ✅💰 | Счёт оплачен |
| `vehicle.status_changed` | 🚗 | Статус ТС изменён |
| `document.created` | 📄 | Путевой лист сформирован |

## Admin API

| Метод | Endpoint | Назначение |
|-------|----------|------------|
| `POST` | `/api/telegram/setup-webhook` | Установить webhook URL |
| `DELETE` | `/api/telegram/webhook` | Удалить webhook |
| `GET` | `/api/telegram/bot-info` | Информация о боте |
| `GET` | `/api/telegram/subscriptions` | Список подписчиков |
| `POST` | `/api/telegram/test` | Отправить тестовое сообщение |

## Архитектура

```
recordEvent() → BullMQ queue → Notification Worker → Telegram Bot API → 📱
                                     ↓
                          DB: notification_subscriptions
```

- **Очередь BullMQ** — асинхронная доставка, 3 retry, exponential backoff
- **Rate limit** — 30 сообщений/сек (лимит Telegram)
- **Best-effort** — если Redis недоступен, уведомления пропускаются без ошибок
- **Подписка `*`** — по умолчанию получают все события (можно фильтровать)

## Файлы

- `apps/api/src/integrations/telegram.service.ts` — Telegram Bot API
- `apps/api/src/integrations/workers/notification.worker.ts` — BullMQ worker
- `apps/api/src/modules/notifications/routes.ts` — Webhook + Admin routes
- `apps/api/src/db/schema.ts` → `notificationSubscriptions` — DB таблица
