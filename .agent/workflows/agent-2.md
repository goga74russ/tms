---
description: Агент 2 — Admin Panel + Client RLS (Спринт 5). Запусти в отдельном окне.
---

// turbo-all

# Агент 2 — Admin Panel (Спринт 5)

## Контекст
Монорепо `d:\Ai\TMS\`. Спринт 4 завершён. Нужен Admin Panel для ролей admin/manager.

## Скиллы
Используй: `frontend-developer`, `react-patterns`, `ui-ux-pro-max`

---

## Задачи

### 1. Admin Layout (`apps/web/src/app/admin/layout.tsx`) [NEW]
- Проверка роли `admin` через UserContext
- Если не admin → redirect на `/`
- Вложенный layout с боковым меню: Пользователи, Тарифы, Шаблоны ЧЛ

### 2. Управление пользователями (`/admin/users`) [NEW]
- Таблица: email, fullName, roles, isActive, createdAt
- CRUD: создание, редактирование ролей, деактивация
- API: `GET /api/auth/users`, `POST /api/auth/users`, `PUT /api/auth/users/:id`
- Если API не существует — создай endpoint в `apps/api/src/auth/auth.ts`

### 3. Управление тарифами (`/admin/tariffs`) [NEW]
- Таблица тарифов из API `GET /api/finance/tariffs`
- CRUD: создание/редактирование тарифа
- Поля: type (fixed/per_km/per_hour), baseCost, перколометр, модификаторы (night, weekend, urgent)
- Если API не существует — создай endpoint в `apps/api/src/modules/finance/routes.ts`

### 4. Шаблоны чек-листов (`/admin/checklists`) [NEW]
- Таблица шаблонов из `checklist_templates`
- CRUD: создание, редактирование, версионирование
- Привязка к типу осмотра (tech/med)

### 5. Client RLS миграция
- Добавить `organizationId` в таблицу `users` (nullable, для будущей мультитенантности)
- Добавить `contractorId` в таблицу `users` (nullable, для Client RLS)
- **НЕ** применяй миграцию — только schema change в `apps/api/src/db/schema.ts`

---

## Правила
- shadcn/ui компоненты (Table, Dialog, Button, Input, Select, Badge)
- Все изменения в `docs/changelogA2.md`
- НЕ трогай существующие дашборды (логист, диспетчер, механик, медик)
- НЕ трогай мобилку
