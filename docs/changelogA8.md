# Changelog — Агент 8 (External API / Integration Worker)

## Sprint 5 — ЭПД Ресёрч и Прототип (2026-03-04)

### Добавлено

#### Ресёрч-документация
- **docs/epd-research.md** — Полное исследование ГИС ЭПД: архитектура, сроки (обязателен с 01.09.2026), формат ЭТрН XML (приказ ФНС ЕД-7-26/383@), требования к КЭП, процесс подключения, стоимость.
- **docs/edo-comparison.md** — Сравнение Диадок vs СБИС vs 1С-ЭДО: API, цены, поддержка ЭПД, SDK. Рекомендация: Контур.Логистика.
- **docs/kep-research.md** — КЭП исследование: CryptoPro CSP 5.0 + Node.js (n-cryptopro, xmldsigjs), облачная ЭП (Контур.Крипто API), облачная ФНС. Рекомендация: Контур.Крипто API + CryptoPro CSP fallback.

#### Прототип ЭТрН XML
- **etrn-generator.ts** — Генератор электронной транспортной накладной. `generateETrN()` — Титул 1 (грузоотправитель/перевозчик). `generateETrNTitle4()` — Титул 4 (данные о доставке). Формат приближён к XSD-схеме ФНС.
- **etrn-generator.test.ts** — 18 unit-тестов: XML-структура, все секции данных, экранирование спецсимволов, необязательные поля.

---

## Sprint 3 — 2026-03-04

### Добавлено

#### Mock-сервисы внешних API
- **wialon.mock.ts** — Имитация Wialon API: GPS-координаты, одометр, скорость, уровень топлива. Детерминированные данные по госномеру.
- **gibdd.mock.ts** — Имитация агрегатора штрафов ГИБДД: поиск по госномеру, 0–3 штрафа с номерами постановлений, типами нарушений, суммами.
- **dadata.mock.ts** — Имитация DaData findById/party: поиск компании по ИНН. Известные тестовые ИНН (Сбербанк, Газпром, Яндекс) + генерация для неизвестных. Подсказки адресов. Валидация БИК.
- **fuel-card.mock.ts** — Имитация процессинга АЗС (Газпромнефть/Роснефть): транзакции заправок с литрами, ценами, станциями. Сводка для план-факт анализа ГСМ.

#### BullMQ Infrastructure
- **redis.ts** — Конфигурация подключения к Redis для BullMQ (raw config, не IORedis-инстанс).
- **queues.ts** — Очереди `wialon-sync` (каждые 15 мин) и `fines-sync` (ежедневно в 03:00). Repeatable cron-задачи с дедупликацией при перезапуске.
- **wialon.worker.ts** — Воркер синхронизации одометра: обходит все активные ТС, запрашивает телеметрию, обновляет `vehicles.currentOdometerKm`. Событие `integration.wialon_sync` в журнале.
- **fines.worker.ts** — Воркер импорта штрафов: обходит все ТС, запрашивает штрафы, дедуплицирует по `resolutionNumber`, вставляет в таблицу `fines`. Событие `fine.auto_imported` по каждому штрафу.

#### API Endpoints (Integration Routes)
- `POST /api/integrations/wialon/sync` — Ручной запуск синхронизации одометров
- `POST /api/integrations/fines/sync` — Ручной запуск импорта штрафов
- `GET /api/integrations/status` — Статус очередей (waiting/active/completed/failed)
- `GET /api/integrations/dadata/lookup/:inn` — Поиск компании по ИНН
- `GET /api/integrations/dadata/suggest-address?query=` — Подсказки адресов
- `GET /api/integrations/fuel/transactions/:vehicleId?days=30` — Транзакции топливных карт

### Изменено
- **server.ts** — Импорт и запуск воркеров BullMQ при старте сервера. Graceful shutdown с остановкой воркеров. Redis-подключение опциональное (если Redis недоступен — воркеры просто не запускаются).
- **validators.ts** — `lookupByInn` теперь использует DaData mock-сервис вместо заглушки `return null`.
- **fleet/service.ts** — `createContractor` теперь автоматически обогащает данные из DaData (имя, КПП, юр. адрес) при создании контрагента по ИНН. Пользовательские данные имеют приоритет. Добавлено событие `contractor.created`.
