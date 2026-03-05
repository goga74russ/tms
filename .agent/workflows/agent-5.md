---
description: Агент 5 — Финансы + KPI (Бухгалтер, Руководитель). Запусти в отдельном окне.
---

// turbo-all

# Агент 5 — Спринт 4.1: Finance + KPI → Live API

## Контекст
Монорепо `d:\Ai\TMS\`. Backend финансов полностью готов (тарификация, счета, KPI, 1С XML экспорт).
Фронтенд существует, но использует **hardcoded данные вместо API.**
**Цель — подключить к реальным эндпоинтам.**

## ⚠️ ОБЯЗАТЕЛЬНО: Прочитай `docs/api-contracts.md` (секция Финансы + Агент 9) и `docs/changelogA5.md`.

## Скиллы
Используй: `typescript-expert`, `frontend-developer`, `react-patterns`, `ui-ux-pro-max`

---

## Задачи

### 1. Finance Dashboard (`apps/web/src/app/finance/page.tsx`)

#### Подключить реальные данные
- Строки 19-24: замени hardcoded invoices на `api.get('/api/finance/invoices')`.
- Summary карточки (Ожидает, Просрочено, Штрафы) → вычисляй из реальных данных.
- `handleGenerateInvoice`: замени `setTimeout` → `api.post('/api/finance/invoices', { tripIds, type: 'standard' })`.

#### Добавить действия
- Кнопка «Экспорт 1С» → `api.get('/api/finance/export/1c')`, скачать как XML файл.
  Hint: `const blob = new Blob([response.data], { type: 'application/xml' }); URL.createObjectURL(blob)`
- По клику на строку счёта → модалка деталей с изменением статуса: `api.put('/api/finance/invoices/:id/status', { status: 'paid' })`
- Фильтры: по статусу (draft/sent/paid/overdue), по дате, по контрагенту.

### 2. KPI Dashboard (`apps/web/src/app/kpi/page.tsx`)

#### Подключить реальные KPI
- Строки 49-93: удали все hardcoded массивы (`revenueData`, `maintenanceData`, `marginByClient`).
- Подключи `api.get('/api/finance/kpi?start=YYYY-MM-DD&end=YYYY-MM-DD')`.
- MetricCard: revenue, margin, utilization, fuelEfficiency → из API ответа.
- AreaChart maintenance costs → `api.get('/api/repairs/analytics/cost/:vehicleId')` (агрегация по всем ТС).
- Добавь date-range picker для выбора периода.

### 3. Страница Тарифов (`apps/web/src/app/tariffs/page.tsx`) [NEW]
- Таблица тарифов: тип, ставка, модификаторы, контрагент.
- API пока нет (бэклог) → сделай с mock-данными, но структуру под future API.
- shadcn/ui: Table, Badge, Input

---

## Правила
- НЕ трогай бэкенд — finance.service.ts, tarification.service.ts, routes.ts
- НЕ трогай другие дашборды
- Все изменения записывай в `docs/changelogA5.md`
