# Agent 2 — Changelog: Осмотры + Путевые листы

## [2026-03-04] Инициализация модулей

### Backend

#### Модуль осмотров (`apps/api/src/modules/inspections/`)

**service.ts** — бизнес-логика (480+ строк):
- `getTechInspectionQueue()` — очередь ТС: рейсы с status='assigned', LEFT JOIN tech_inspections (сегодня)
- `createTechInspection()` — создание осмотра, событие, при недопуске → авто-заявка на ремонт
- `getDocumentExpiryStatus()` — светофор сроков: техосмотр, ОСАГО, ТО, тахограф
- `getMedInspectionQueue()` — очередь водителей на медосмотр
- `createMedInspection()` — 152-ФЗ: проверка согласия, запись, лог доступа
- `listMedInspections()` — полные данные для медика, PublicSchema для остальных
- `getMedRejectionStats()` — статистика недопусков
- `getExpiringMedCertificates()` — медсправки, истекающие в ближайшие N дней
- `hasValidTechInspectionToday()` / `hasValidMedInspectionToday()` — проверки для путевого листа

**routes.ts** — 12 эндпоинтов:
- `GET /api/inspections/tech/queue` — очередь ТС (механик)
- `GET /api/inspections/tech/checklist` — шаблон чек-листа
- `GET /api/inspections/tech` — список осмотров (пагинация)
- `GET /api/inspections/tech/:id` — один осмотр
- `POST /api/inspections/tech` — создать осмотр (механик)
- `GET /api/inspections/med/queue` — очередь водителей (медик)
- `GET /api/inspections/med/checklist` — шаблон чек-листа
- `GET /api/inspections/med/stats` — статистика (медик/руководитель)
- `GET /api/inspections/med/expiring-certificates` — истекающие медсправки
- `GET /api/inspections/med` — список осмотров (152-ФЗ фильтрация)
- `GET /api/inspections/med/:id` — один осмотр (152-ФЗ)
- `POST /api/inspections/med` — создать осмотр (медик, проверка согласия)

#### Модуль путевых листов (`apps/api/src/modules/waybills/`)

**service.ts** — бизнес-логика:
- `generateWaybill()` — формирование ТОЛЬКО при обоих допусках, нумерация WB-YYYY-NNNNN
- `closeWaybill()` — закрытие: одометр, топливо, время возврата
- `listWaybills()` / `getWaybillById()` — CRUD

**routes.ts** — 4 эндпоинта:
- `GET /api/waybills` — список (пагинация)
- `GET /api/waybills/:id` — один путевой лист с данными ТС/водителя/рейса
- `POST /api/waybills/generate/:tripId` — формирование (409 без допусков)
- `POST /api/waybills/:id/close` — закрытие

#### Регистрация маршрутов
- `apps/api/src/server.ts` — добавлены inspections и waybills

### Frontend

#### Дашборд механика (`apps/web/src/app/mechanic/page.tsx`)
- Очередь ТС на осмотр (карточки)
- Интерактивный чек-лист: ОК / Неисправность + комментарий
- Светофор сроков документов (зелёный/жёлтый/красный)
- Кнопки «Допустить» / «Не допустить» (крупные, планшетные)
- Подтверждение ПЭП (пароль)
- Журнал осмотров (readonly таблица)

#### Дашборд медика (`apps/web/src/app/medic/page.tsx`)
- Очередь водителей (с проверкой согласия ПД)
- Форма: АД, пульс, температура, состояние, алкотест, жалобы
- Контроль медсправок (предупреждения за 30 дней)
- Кнопки «Допустить» / «Не допустить»
- Статистика недопусков (карточки + таблица истекающих справок)
- Журнал осмотров

### Список файлов
| Файл | Статус |
|------|--------|
| `apps/api/src/modules/inspections/service.ts` | NEW |
| `apps/api/src/modules/inspections/routes.ts` | NEW |
| `apps/api/src/modules/waybills/service.ts` | NEW |
| `apps/api/src/modules/waybills/routes.ts` | NEW |
| `apps/api/src/server.ts` | MODIFIED |
| `apps/web/src/app/mechanic/page.tsx` | NEW |
| `apps/web/src/app/medic/page.tsx` | NEW |

---

## [2026-03-04] Sprint 4.1: Путевые листы + Sidebar

### Frontend

#### Путевые листы (`apps/web/src/app/waybills/page.tsx`) [NEW]
- Таблица: номер (WB-YYYY-NNNNN), статус, ТС, водитель, одометр, дата
- Фильтры: поиск по номеру, статус (formed/issued/closed)
- Модалка деталей: полная информация + ТС/водитель/рейс + подписи ПЭП
- Модалка закрытия: одометр возврат + топливо → `POST /api/waybills/:id/close`
- Статусные бейджи: сформирован → выдан → закрыт
- Пагинация
- shadcn/ui: Card, Button

#### Sidebar role filtering (H-16) (`apps/web/src/components/sidebar.tsx`) [MODIFIED]
- Фильтрация навигации по ролям из UserContext
- Матрица: admin=всё, driver=ничего, mechanic=осмотры/автопарк/ремонты, и т.д.
- Добавлены: «Путевые листы», «Рейсы», «Контрагенты»
- Динамическое ФИО + роль из JWT
- Кнопка выхода

#### Layout role detection (`apps/web/src/app/layout.tsx`) [MODIFIED]
- UserProvider обёртка → `api.get('/api/auth/me')` при загрузке
- UserContext для sidebar и всех страниц

#### UserContext (`apps/web/src/lib/user-context.tsx`) [NEW]
- `useUser()` хук: user, loading, error, refetch, logout
- Автозагрузка из JWT при наличии токена

### Файлы Sprint 4.1
| Файл | Статус |
|------|--------|
| `apps/web/src/app/waybills/page.tsx` | NEW |
| `apps/web/src/lib/user-context.tsx` | NEW |
| `apps/web/src/components/sidebar.tsx` | MODIFIED |
| `apps/web/src/app/layout.tsx` | MODIFIED |
| `docs/changelogA2.md` | MODIFIED |

---

## [2026-03-04] Sprint 5: Admin Panel

### Backend (`apps/api/src/auth/auth.ts`) [MODIFIED]

9 новых CRUD-эндпоинтов:

**Пользователи:**
- `GET /api/auth/users` — список (admin only)
- `POST /api/auth/users` — создание (email, password, fullName, roles)
- `PUT /api/auth/users/:id` — обновление (roles, isActive, password)

**Тарифы:**
- `GET /api/auth/tariffs` — список (admin, accountant, manager)
- `POST /api/auth/tariffs` — создание (admin, accountant)
- `PUT /api/auth/tariffs/:id` — обновление

**Шаблоны чек-листов:**
- `GET /api/auth/checklist-templates` — список (admin)
- `POST /api/auth/checklist-templates` — создание (admin)
- `PUT /api/auth/checklist-templates/:id` — обновление (admin)

### Frontend

#### Admin layout (`apps/web/src/app/admin/layout.tsx`) [NEW]
- Проверка роли admin + redirect
- Боковое меню: Пользователи, Тарифы, Шаблоны ЧЛ

#### Пользователи (`apps/web/src/app/admin/users/page.tsx`) [NEW]
- Таблица: ФИО, email, роли (бейджи), статус, дата
- Поиск по имени/email
- Модалка создание/редактирование: email, пароль, роли (toggle), active

#### Тарифы (`apps/web/src/app/admin/tariffs/page.tsx`) [NEW]
- Таблица: тип, ставки, модификаторы (ночь/срочность/выходной), НДС
- Модалка создание/редактирование: все поля тарифа

#### Шаблоны ЧЛ (`apps/web/src/app/admin/checklists/page.tsx`) [NEW]
- Карточки: название, тип (tech/med), версия, статус, превью пунктов
- Модалка: динамический список пунктов (add/remove), responseType, required

#### Sidebar (`apps/web/src/components/sidebar.tsx`) [MODIFIED]
- Замена «Настройки» → «Админ-панель» (/admin/users)

### Client RLS миграция (schema.ts)
- `contractorId` и `organizationId` уже присутствуют в таблице `users` — изменения не нужны

### Файлы Sprint 5
| Файл | Статус |
|------|--------|
| `apps/api/src/auth/auth.ts` | MODIFIED |
| `apps/web/src/app/admin/layout.tsx` | NEW |
| `apps/web/src/app/admin/users/page.tsx` | NEW |
| `apps/web/src/app/admin/tariffs/page.tsx` | NEW |
| `apps/web/src/app/admin/checklists/page.tsx` | NEW |
| `apps/web/src/components/sidebar.tsx` | MODIFIED |


