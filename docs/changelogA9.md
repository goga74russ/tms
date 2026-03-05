# Changelog — Agent 9 (Картограф и 1С-Инженер)

## Sprint 3 — 2026-03-04

### 1. Выгрузка в 1С (CommerceML 2.x)

- **[NEW]** `apps/api/src/modules/finance/xml-export.service.ts` — сервис генерации XML в формате КоммерческаяИнформация 2.10. Собирает полноценный XML-документ с `<Документ>`, контрагентами (ИНН, КПП), товарными строками и суммами (НДС 20%).
- **[MOD]** `apps/api/src/modules/finance/finance.service.ts` — добавлен метод `export1CXml(startDate, endDate)`, возвращающий готовый XML. Старый `get1CExportData()` сохранён для обратной совместимости.
- **[MOD]** `apps/api/src/modules/finance/routes.ts` — `GET /finance/export/1c` теперь возвращает `Content-Type: application/xml` с XML-телом и `Content-Disposition: attachment`. Поддержка `?format=json` для legacy.
- **[NEW]** `apps/api/src/__tests__/xml-export.test.ts` — 9 тестов: валидность XML, структура, суммы, edge cases.
- **[DEP]** `fast-xml-parser` добавлен в `apps/api/package.json`.

### 2. Геокодирование и Маршрутизация (Бэкенд)

- **[NEW]** `apps/api/src/modules/geo/geocoding.service.ts` — геокодер со встроенным словарём крупных городов РФ + хэш-мок для неизвестных адресов. Готов к замене на Nominatim/Яндекс Геокодер.
- **[NEW]** `apps/api/src/modules/geo/distance.service.ts` — Haversine distance, NxN distance matrix, route distance, nearest point, estimated driving distance (×1.3).
- **[NEW]** `apps/api/src/modules/geo/routes.ts` — 6 эндпоинтов: `GET /geo/geocode`, `POST /geo/geocode/batch`, `GET /geo/reverse`, `POST /geo/distance`, `POST /geo/distance-matrix`, `POST /geo/nearest`.
- **[MOD]** `apps/api/src/server.ts` — зарегистрирован префикс `/api/geo`.
- **[NEW]** `apps/api/src/__tests__/geo.test.ts` — 20 тестов: словарь, case-insensitive, Haversine (Москва↔СПб ≈ 634 км), симметрия матрицы, edge cases.

### 3. Leaflet Routing (Фронтенд)

- **[NEW]** `apps/web/src/app/dispatcher/components/TripRouteLayer.tsx` — компонент отрисовки маршрута рейса: цветные полилинии по статусу сегмента (pending/arrived/completed), маркеры точек с emoji (📦 погрузка, 🏁 выгрузка), номерация, тултипы.
- **[MOD]** `apps/web/src/app/dispatcher/components/DispatcherMap.tsx` — принимает `tripRoutePoints` prop, рендерит `TripRouteLayer` поверх маркеров ТС.
- **[MOD]** `apps/web/src/app/dispatcher/page.tsx` — при выборе ТС загружает route points активного рейса через API, передаёт в карту. Добавлен баннер «Маршрут рейса: N точек».
- **[DEP]** `leaflet-routing-machine` добавлен в `apps/web/package.json`.
