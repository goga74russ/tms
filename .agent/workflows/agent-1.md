---
description: Агент 1 — Заявки + Рейсы (Логист, Диспетчер). Запусти в отдельном окне.
---

// turbo-all

# Агент 1 — Спринт 4.1: Логист + Диспетчер до production-ready

## Контекст
Монорепо `d:\Ai\TMS\`. Логист и Диспетчер частично работают на API, но есть fallback-моки.
**Цель — убрать ВСЕ mock-данные, сделать production-ready.**

## ⚠️ ОБЯЗАТЕЛЬНО: Прочитай `docs/api-contracts.md` и `docs/audit-log.md`.

## Скиллы
Используй: `typescript-expert`, `frontend-developer`, `react-patterns`, `ui-ux-pro-max`

---

## Задачи

### 1. Логист (`apps/web/src/app/logist/page.tsx`)

#### Убрать FALLBACK_ORDERS
- Удали массив `FALLBACK_ORDERS` (строки ~37-92) и тип `MockOrder`.
- При ошибке API — показывай пустое состояние с кнопкой Retry, НЕ моковые данные.
- Сохрани polling каждые 30с (уже есть).

#### Модалка создания рейса (`CreateTripModal.tsx`) [NEW]
- Создай модалку создания рейса из дашборда логиста.
- Поля: выбор ТС (`api.get('/api/trips/available-vehicles')`), выбор водителя (`api.get('/api/trips/available-drivers')`), привязка заявок (чекбоксы).
- Submit → `api.post('/api/trips', { vehicleId, driverId, orderIds, ... })`
- shadcn/ui: Dialog, Select, Checkbox, Button

#### KanbanBoard — drag-n-drop improvement
- При перетаскивании: проверяй допустимые переходы из `@tms/shared` (`ORDER_STATE_TRANSITIONS`)
- Если переход запрещён — анимация отказа + toast

### 2. Диспетчер (`apps/web/src/app/dispatcher/page.tsx`)

#### Убрать TIMELINE_DATA mock
- Удали массив `TIMELINE_DATA` (строки ~47-56).
- Загружай реальные рейсы: `api.get('/api/trips?status=assigned&status=in_transit&status=loading')`.
- VehicleTimeline: рисуй сегменты из реальных `plannedDepartureAt` / `completedAt`.

#### Связь карта ↔ рейс
- При выборе ТС на карте — уже загружаются route points (TripRouteLayer), проверь что работает.
- Добавь панель «Детали рейса»: номер, водитель, статус, прогресс точек.

---

## Правила
- НЕ трогай бэкенд — service.ts, routes.ts
- НЕ трогай другие дашборды (mechanic, medic, finance)
- Все изменения записывай в `docs/changelogA1.md`
