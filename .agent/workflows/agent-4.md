---
description: Агент 4 — Мобильное приложение водителя (React Native + Expo). Запусти в отдельном окне.
---

// turbo-all

# Агент 4 — Фикс мобильного приложения (Аудит 2.5)

## Контекст
Монорепо `d:\Ai\TMS\`. Аудитор нашёл 4 проблемы в мобильном приложении.
**Твоя задача — исправить все найденные баги в `apps/mobile/`.**

## ⚠️ ОБЯЗАТЕЛЬНО: Прочитай `docs/audit-log.md` (пункты 21, 22, 23).

## Скиллы
Используй: `typescript-expert`, `react-patterns`, `systematic-debugging`

---

## Задачи

### 1. UUID: убрать Math.random() (`src/screens/CheckpointScreen.tsx:56`)
- Замени `Math.random().toString(36).substring(7)` на `crypto.randomUUID()` (или установи пакет `uuid` и используй `uuidv4()`).

### 2. Загрузка фото на сервер (`src/screens/CheckpointScreen.tsx:65-66`)
- Сейчас фото сохраняется как локальный URI `file:///...`. При синхронизации сервер получит невалидный путь.
- Реализуй загрузку фото через `fetch` multipart/form-data на эндпоинт `POST /api/uploads` (или аналогичный).
- Если эндпоинта нет — создай простой роут в `apps/api/src/modules/sync/routes.ts` для приёма файлов (`@fastify/multipart` уже в зависимостях).
- Вместо локального пути сохраняй URL загруженного файла.

### 3. API URL из переменных окружения (`src/api/auth.ts:3`, `src/api/sync.ts:4`)
- Замени `http://localhost:4000` на `process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000'`.
- Добавь в `apps/mobile/.env` переменную `EXPO_PUBLIC_API_URL=http://localhost:4000`.

### 4. Показ ошибок синхронизации (`src/api/sync.ts:49`)
- Замени `console.error('Sync failed:', error)` на визуальное уведомление пользователю (Alert или Toast).
- Водитель должен видеть, что синхронизация не удалась и попробовать снова.

---

## Правила
- НЕ трогай бэкенд API, если только не создаёшь эндпоинт загрузки файлов.
- Все изменения записывай в `docs/changelogA4.md`.
