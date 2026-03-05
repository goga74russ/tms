---
description: Агент 10 — QA Engineer (Тестировщик). Запусти в отдельном окне.
---

// turbo-all

# Агент 10 — QA Engineer (Спринт 5)

## Контекст
Монорепо `d:\Ai\TMS\`. 167+ тестов, 100% pass rate. Нужно закрыть пробелы в покрытии.

## Скиллы
Используй: `testing-patterns`, `playwright-skill`, `systematic-debugging`

---

## Задачи

### 1. RBAC тесты (`apps/api/src/__tests__/rbac.test.ts`) [NEW]
Проверить RBAC для **каждого endpoint-а**:
- Driver: может видеть только свои рейсы, PUT route-points, не может видеть чужие
- Mechanic: может создать tech-inspection, не может видеть finance
- Client: видит только свои заявки (когда RLS готов)
- Admin: доступ ко всему
- Неавторизованный: 401 на всех protected endpoints

### 2. Security тесты (`apps/api/src/__tests__/security.test.ts`) [NEW]
- JWT httpOnly cookie работает (login ставит cookie, logout чистит)
- Bearer header fallback работает (для мобилки)
- Rate limiting на login (6-й запрос = 429)
- Zod валидация: невалидные body → 400
- CORS: правильные заголовки

### 3. Sprint 4 фиксы — регрессия
- Убедиться что `calculateBatchTripCosts()` возвращает те же результаты что `calculateTripCost()` в цикле
- Проверить что `generateTripNumber()` и `generateOrderNumber()` НЕ дублируют номера при параллельных вызовах
- Проверить что FOR UPDATE в транзакции держит блокировку

### 4. Playwright E2E (если есть browser)
- Login flow → sidebar отображается по ролям
- Logist: Kanban → drag order → trip creation
- Dispatcher: карта загружается, trip details panel

---

## Правила
- Vitest для unit-тестов, Playwright для E2E
- Все тесты должны проходить: `pnpm --filter @tms/api test`
- Все изменения в `docs/changelogA10.md`
- НЕ меняй production код — только тесты
