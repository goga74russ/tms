# ⚙️ TMS — Переменные окружения

> **Обновлено:** 05.03.2026
> Все переменные читаются из `.env` файла в корне `apps/api/`

## 🔴 Обязательные (fail-fast)

| Переменная | Описание | Пример |
|-----------|----------|--------|
| `JWT_SECRET` | Секрет для подписи JWT токенов | `your-super-secret-key-256-bit` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://tms:pass@localhost:5433/tms` |

## 🟡 Рекомендуемые

| Переменная | Описание | Умолчание |
|-----------|----------|-----------|
| `NODE_ENV` | Режим работы | `development` |
| `PORT` | Порт API сервера | `4000` |
| `HOST` | Host для bind | `0.0.0.0` |
| `LOG_LEVEL` | Уровень логирования (pino) | `info` |
| `CORS_ORIGIN` | Разрешённые origins (через запятую) | `http://localhost:3000` |
| `REDIS_URL` | Redis connection string | — |
| `REDIS_HOST` | Redis host (если нет REDIS_URL) | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis пароль | — |
| `SEED_PASSWORD` | Пароль для seed-пользователей | — |
| `APP_TIMEZONE` | Таймзона приложения | `Europe/Moscow` |

## 🟢 Опциональные (бизнес-настройки)

### Организация (ЭПД / 1С)
| Переменная | Описание | Умолчание |
|-----------|----------|-----------|
| `CARRIER_NAME` | Название организации-перевозчика | `ООО «ТМС Логистик»` |
| `CARRIER_INN` | ИНН перевозчика | `0000000000` |
| `CARRIER_ADDRESS` | Юридический адрес перевозчика | `г. Москва` |
| `COMPANY_NAME` | Название компании (1С export) | `ООО «ТМС Логистик»` |
| `COMPANY_INN` | ИНН (1С export) | `7701234567` |
| `COMPANY_KPP` | КПП (1С export) | `770101001` |

### Себестоимость рейсов
| Переменная | Описание | Умолчание |
|-----------|----------|-----------|
| `FUEL_PRICE_PER_LITER` | Цена топлива ₽/л | `60` |
| `FUEL_NORM_PER_100KM` | Норма расхода л/100км (fallback) | `30` |
| `DRIVER_SALARY_PER_HOUR` | Ставка водителя ₽/ч | `350` |
| `AMORTIZATION_PER_KM` | Амортизация ₽/км | `3` |
| `BASE_OPERATIONAL_COST` | Базовые операционные расходы ₽/мес | `100000` |

### Интеграции
| Переменная | Описание | Умолчание |
|-----------|----------|-----------|
| `TELEGRAM_BOT_TOKEN` | Токен Telegram бота (@BotFather) | — |
| `API_PUBLIC_URL` | Публичный URL API (для OpenAPI spec) | `http://localhost:4000` |

## 🌐 Frontend (apps/web/.env.local)

| Переменная | Описание | Умолчание |
|-----------|----------|-----------|
| `NEXT_PUBLIC_API_URL` | URL бэкенда | `http://localhost:4000/api` |

## 📱 Mobile (apps/mobile/.env)

| Переменная | Описание | Умолчание |
|-----------|----------|-----------|
| `EXPO_PUBLIC_API_URL` | URL бэкенда | `http://localhost:4000/api` |

## Пример .env для разработки

```env
# === Core ===
JWT_SECRET=dev-secret-change-in-production
DATABASE_URL=postgresql://tms:tmspass@localhost:5433/tms
NODE_ENV=development
PORT=4000

# === Redis ===
REDIS_HOST=localhost
REDIS_PORT=6379

# === CORS ===
CORS_ORIGIN=http://localhost:3000

# === Организация ===
CARRIER_NAME=ООО «ТМС Логистик»
CARRIER_INN=7700123456
CARRIER_ADDRESS=г. Москва, ул. Примерная, 1

# === Себестоимость ===
FUEL_PRICE_PER_LITER=60
DRIVER_SALARY_PER_HOUR=350
AMORTIZATION_PER_KM=3

# === Интеграции ===
# TELEGRAM_BOT_TOKEN=  (создать через @BotFather)
```
