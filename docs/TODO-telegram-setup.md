# 📋 TODO: Настройка Telegram бота

> **Приоритет:** 🔴 Высокий — бот готов, осталось создать в BotFather
> **Время:** ~5 минут
> **Зависимости:** Нет (код уже задеплоен)

## Шаги

- [ ] **Создать бота в BotFather** → получить `TELEGRAM_BOT_TOKEN`
- [ ] **Добавить токен на VPS:** `echo 'TELEGRAM_BOT_TOKEN=...' >> /opt/tms/.env`
- [ ] **Перезапустить API:** `docker compose -f docker-compose.prod.yml restart api`
- [ ] **Проверить:** `GET /api/telegram/bot-info` (должен вернуть имя бота)
- [ ] **Настроить webhook** (после SSL/домена): `POST /api/telegram/setup-webhook`
- [ ] **Тест:** отправить `/start` боту → убедиться что подписка создалась

## Без SSL (для тестирования)

Пока нет SSL можно тестировать через ручной long-polling или ngrok:

```bash
# Вариант 1: ngrok (на VPS)
ngrok http 4000
# Затем установить webhook на ngrok URL

# Вариант 2: Тест отправки напрямую
curl -X POST http://5.42.102.58:4000/api/telegram/test \
  -H "Content-Type: application/json" \
  -H "Cookie: token=<jwt>" \
  -d '{"chatId": "YOUR_CHAT_ID", "message": "Тест!"}'
```
