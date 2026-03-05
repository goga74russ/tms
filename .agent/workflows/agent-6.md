---
description: Агент 6 — E2E Интегратор (Завершение Спринта 2). Запусти в отдельном окне.
---

// turbo-all

# Агент 6 — Security Sprint (Волна 2)

## Контекст
Монорепо `d:\Ai\TMS\`. Спринт 2.5 (аудит) в основном закрыт. Остались **критичные security-проблемы**, блокирующие production-деплой.

## ⚠️ ОБЯЗАТЕЛЬНО: Прочитай `docs/audit-log.md` и `docs/api-contracts.md`.

## Скиллы
Используй: `typescript-expert`, `fastapi-pro`, `systematic-debugging`, `architecture-patterns`

---

## 🔴 CRITICAL — Приоритет 1

### 1. JWT → httpOnly cookie (`apps/api/src/auth/auth.ts`)
Сейчас JWT хранится в `localStorage` — это XSS-уязвимость.
- **Login endpoint** (`POST /api/auth/login`):
  - Вместо `{ token }` в body → устанавливай `reply.setCookie('tms_token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 86400 })`
  - Установи `@fastify/cookie` в `apps/api/package.json`
  - Ответ: `{ success: true, data: { user } }` (без токена в body!)
- **authenticate decorator**:
  - Читай JWT из `request.cookies.tms_token` вместо `Authorization` header
  - Fallback на `Authorization: Bearer` для мобилки (она не шлёт cookie)
- **Logout endpoint** (`POST /api/auth/logout`) [NEW]:
  - `reply.clearCookie('tms_token')` + `{ success: true }`
- **Frontend** (`apps/web/src/lib/api.ts`):
  - Добавь `credentials: 'include'` во все fetch-запросы
  - Убери `localStorage.setItem/getItem('tms_token')` — cookie автоматические
  - Оставь `getToken()`/`setToken()` пустыми для обратной совместимости

### 2. N+1 в generateInvoices (`apps/api/src/modules/finance/finance.service.ts`)
Строка 77: `calculateTripCost(tripId)` вызывается **в цикле** для каждого рейса.
- Предзагрузи все нужные рейсы + заказы одним JOIN-запросом
- Передавай предзагруженные данные в tarification service через параметр
- Или сделай `calculateBatchTripCosts(tripIds: string[])` в tarification.service.ts

### 3. Row-Level Security (RLS) для driver и client

#### Driver — видит только свои рейсы
В `modules/trips/routes.ts` (`GET /api/trips`):
```ts
if (user.roles.includes('driver')) {
    // Найти driver record по userId
    const [driver] = await db.select({ id: drivers.id }).from(drivers).where(eq(drivers.userId, user.userId));
    // Добавить фильтр: trips.driverId = driver.id
}
```

#### Client — видит только свои заявки
В `modules/orders/routes.ts` (`GET /api/orders`):
```ts
if (user.roles.includes('client')) {
    // Найти contractor по userId (нужна связь user→contractor)
    // Добавить фильтр: orders.contractorId = contractor.id
}
```

#### Применить тот же паттерн:
- `GET /api/waybills` — driver sees only own
- `GET /api/inspections/tech` и `/med` — только свои
- `GET /api/finance/invoices` — client sees only own contractor's

---

## 🟠 HIGH — Приоритет 2

### 4. Zod-валидация в 17 route handlers (H-4)
Замени `request.body as any` на Zod `.parse()`:

| Файл | Роуты |
|------|-------|
| `fleet/routes.ts` | createVehicle, updateVehicle, createDriver, updateDriver, createContractor, createPermit |
| `repairs/routes.ts` | createRepair, updateRepairStatus, updateRepair |
| `trips/routes.ts` | createTrip, updateTrip, assignTrip |
| `waybills/routes.ts` | closeWaybill |
| `orders/routes.ts` | проверить (может уже есть) |

Паттерн:
```ts
import { VehicleCreateSchema } from '@tms/shared';
const parsed = VehicleCreateSchema.safeParse(request.body);
if (!parsed.success) {
    return reply.status(400).send({ success: false, error: 'Validation failed', details: parsed.error.flatten() });
}
// Дальше используй parsed.data
```

### 5. CORS для production (`apps/api/src/server.ts`)
Строка 30: `origin: process.env.CORS_ORIGIN || 'http://localhost:3000'`
- Добавь поддержку массива origins: `origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',')`
- Добавь `credentials: true` (для httpOnly cookies)

---

## Правила
- Все изменения фиксируй в `docs/changelogA6.md`
- После каждого фикса — отметь в `docs/audit-log.md` как ✅
- НЕ трогай фронтенд-дашборды (это Агенты 1, 2, 5)
- НЕ трогай мобилку (Агент 4)
- **Сначала JWT cookie, потом N+1, потом RLS, потом Zod** — строго по порядку
