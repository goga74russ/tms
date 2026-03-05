# Changelog — Agent 3 (Автопарк + Ремонты)

## [2026-03-04] Начальная реализация модулей Fleet и Repairs

### Backend — Fleet Module (`apps/api/src/modules/fleet/`)

**Создано:**
- `validators.ts` — ИНН (контрольная сумма 10/12 цифр), госномер (А000АА00), VIN (17 символов), светофор сроков документов, placeholder DaData, валидация ВУ
- `service.ts` — CRUD для ТС, водителей, контрагентов, пропусков, штрафов. Стейт-машина штрафов. Архивирование вместо удаления.
- `routes.ts` — Fastify-плагин, все маршруты с RBAC

**Эндпоинты:** `GET/POST /fleet/vehicles`, `GET/PUT /fleet/vehicles/:id`, `GET/POST /fleet/drivers`, `GET/PUT /fleet/drivers/:id`, `GET/POST /fleet/contractors`, `PUT /fleet/contractors/:id`, `GET /fleet/contractors/lookup/:inn`, `GET/POST /fleet/permits`, `PUT /fleet/permits/:id`, `GET/POST /fleet/fines`, `PUT /fleet/fines/:id`, `GET /fleet/fines/analytics`

### Backend — Repairs Module (`apps/api/src/modules/repairs/`)

**Создано:**
- `service.ts` — CRUD, стейт-машина (created→waiting_parts→in_progress→done), автосмена статуса ТС, плановое ТО, аналитика
- `routes.ts` — Fastify-плагин с RBAC

**Эндпоинты:** `GET/POST /repairs`, `GET/PUT /repairs/:id`, `PUT /repairs/:id/status`, `GET /repairs/analytics/by-status`, `GET /repairs/analytics/cost/:vehicleId`

### Frontend — Автопарк (`apps/web/src/app/fleet/`)
- `page.tsx` — табы (Транспорт, Водители, Пропуска, Штрафы, Контрагенты)
- Компоненты: VehiclesTable (светофор), VehicleCard (карточка с ремонтами/пропусками/штрафами), DriversTable, PermitsTable, FinesTable, ContractorsTable

### Frontend — Ремонты (`apps/web/src/app/repair/`)
- `page.tsx` — дашборд со статистикой
- RepairKanban — канбан с drag-and-drop
- RepairCard — карточка заявки
