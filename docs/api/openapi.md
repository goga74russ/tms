# TMS API — Управление транспортом

> Auto-generated from `apps/api/scripts/export-openapi.ts` — do not edit by hand.
> Regenerate with: `pnpm --filter @tms/api openapi:export`

**Version:** 1.0.0

REST API для системы управления грузоперевозками (TMS). Включает управление заявками, рейсами, автопарком, водителями, финансами, аналитикой и импортом данных.

**Total routes:** 310 across 32 tag(s).

## Tag index

- [Авторизация](#авторизация) — 13 route(s)
- [Заявки](#заявки) — 14 route(s)
- [Рейсы](#рейсы) — 32 route(s)
- [Автопарк](#автопарк) — 37 route(s)
- [Осмотры](#осмотры) — 18 route(s)
- [Путевые листы](#путевые-листы) — 15 route(s)
- [Финансы](#финансы) — 27 route(s)
- [Аналитика](#аналитика) — 7 route(s)
- [Импорт](#импорт) — 8 route(s)
- [Геозоны](#геозоны) — 6 route(s)
- [Синхронизация](#синхронизация) — 2 route(s)
- [Уведомления](#уведомления) — 6 route(s)
- [Аудит](#аудит) — 2 route(s)
- [Здоровье](#здоровье) — 2 route(s)
- [Администрирование](#администрирование) — 10 route(s)
- [Trips](#trips) — 17 route(s)
- [Attachments](#attachments) — 4 route(s)
- [Repairs](#repairs) — 12 route(s)
- [Интеграции](#интеграции) — 15 route(s)
- [Настройки](#настройки) — 3 route(s)
- [Operations](#operations) — 8 route(s)
- [Документы](#документы) — 3 route(s)
- [Претензии](#претензии) — 5 route(s)
- [Claims](#claims) — 1 route(s)
- [Файлы](#файлы) — 1 route(s)
- [Холодовая цепь](#холодовая-цепь) — 4 route(s)
- [Водители](#водители) — 2 route(s)
- [ЭДО](#эдо) — 4 route(s)
- [AI Co-pilot](#ai-co-pilot) — 3 route(s)
- [Онбординг](#онбординг) — 7 route(s)
- [Биллинг](#биллинг) — 8 route(s)
- [Compliance](#compliance) — 14 route(s)

## Авторизация

_Вход, выход, обновление токенов_

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/api/auth/forgot-password` | Запрос сброса пароля |
| `POST` | `/api/auth/login` | Вход в систему |
| `POST` | `/api/auth/logout` | Выход |
| `GET` | `/api/auth/me` | Текущий пользователь |
| `DELETE` | `/api/auth/me/organization` | Отвязать пользователя от организации (вернуть super-admin) |
| `PATCH` | `/api/auth/me/organization` | Обновить реквизиты организации (tax_regime и т.п.) |
| `POST` | `/api/auth/me/organization` | Создать организацию для текущего пользователя |
| `POST` | `/api/auth/mobile/login` | Вход (mobile) |
| `POST` | `/api/auth/resend-code` | Повторная отправка кода |
| `POST` | `/api/auth/reset-password` | Сброс пароля по токену |
| `POST` | `/api/auth/signup` | Самостоятельная регистрация |
| `POST` | `/api/auth/verify-email` | Подтверждение email |
| `GET` | `/api/auth/ws-token` | WS токен |

## Заявки

_CRUD заявок на перевозку_

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/orders` | Список заявок |
| `POST` | `/api/orders` | Создать заявку |
| `GET` | `/api/orders/{id}` | Получить заявку |
| `PUT` | `/api/orders/{id}` | Обновить заявку |
| `GET` | `/api/orders/{id}/adr-validation` | Проверка ADR-совместимости |
| `POST` | `/api/orders/{id}/cancel` | Отменить заявку |
| `POST` | `/api/orders/{id}/confirm` | Подтвердить заявку |
| `GET` | `/api/orders/{id}/fulfillment` | Фулфилмент заявки |
| `POST` | `/api/orders/{id}/lots/split` | Разбить заявку на партии |
| `POST` | `/api/orders/{id}/status` | Изменить статус заявки |
| `GET` | `/api/orders/{id}/ttn` | PDF ТТН |
| `POST` | `/api/orders/from-template` | Создать из шаблона |
| `GET` | `/api/orders/kanban` | Kanban доска |
| `GET` | `/api/orders/list` | Список заявок (denormalized) |

## Рейсы

_Управление рейсами и маршрутами_

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/incidents` | Список инцидентов |
| `POST` | `/api/incidents` | Создать инцидент |
| `PUT` | `/api/incidents/{id}` | Обновить инцидент |
| `GET` | `/api/trips` | Список рейсов |
| `POST` | `/api/trips` | Создать рейс |
| `GET` | `/api/trips/{id}` | Получить рейс |
| `PUT` | `/api/trips/{id}` | Обновить рейс |
| `POST` | `/api/trips/{id}/assign` | Назначить ТС/водителя |
| `POST` | `/api/trips/{id}/assign-carrier` | Назначить субподрядчика на рейс |
| `POST` | `/api/trips/{id}/cancel` | Отменить рейс |
| `POST` | `/api/trips/{id}/complete` | Завершить рейс |
| `GET` | `/api/trips/{id}/delivery-confirmation` | Подтверждение доставки |
| `POST` | `/api/trips/{id}/delivery-confirmation` | Подтвердить доставку |
| `POST` | `/api/trips/{id}/delivery-confirmation/v2` | Подтвердить доставку (упрощённая схема) |
| `GET` | `/api/trips/{id}/eta` | ETA рейса |
| `GET` | `/api/trips/{id}/etrn-workflow` | ETRN workflow |
| `GET` | `/api/trips/{id}/load-plan` | План загрузки рейса |
| `POST` | `/api/trips/{id}/lot-assignments` | Назначить партию в рейс |
| `GET` | `/api/trips/{id}/points` | Точки маршрута |
| `POST` | `/api/trips/{id}/points` | Добавить точку |
| `DELETE` | `/api/trips/{id}/points/{pointId}` | Удалить точку |
| `PUT` | `/api/trips/{id}/points/{pointId}` | Обновить точку |
| `POST` | `/api/trips/{id}/shipment-facts` | Зафиксировать факт по партии |
| `POST` | `/api/trips/{id}/sort-route-points` | Отсортировать точки маршрута |
| `POST` | `/api/trips/{id}/start` | Начать рейс |
| `POST` | `/api/trips/{id}/status` | Сменить статус |
| `GET` | `/api/trips/{id}/transport-documents` | Документы перевозки |
| `GET` | `/api/trips/{id}/transport-documents/{documentId}` | Документ перевозки |
| `GET` | `/api/trips/{id}/transport-documents/{documentId}/exchange` | Transport document exchange |
| `GET` | `/api/trips/available-drivers` | Доступные водители |
| `GET` | `/api/trips/available-vehicles` | Доступные ТС |
| `GET` | `/api/trips/volume-preview` | Предпросмотр проверки кубов |

## Автопарк

_Транспортные средства и водители_

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/fleet/contractors` | Список контрагентов |
| `POST` | `/api/fleet/contractors` | Добавить контрагента |
| `PUT` | `/api/fleet/contractors/{id}` | Обновить контрагента |
| `POST` | `/api/fleet/contractors/{id}/addresses` | Добавить адрес |
| `DELETE` | `/api/fleet/contractors/{id}/addresses/{addressId}` | Удалить адрес |
| `PUT` | `/api/fleet/contractors/{id}/addresses/{addressId}` | Обновить адрес |
| `GET` | `/api/fleet/contractors/lookup/{inn}` | Поиск по ИНН |
| `GET` | `/api/fleet/downtime-records` | Простои ТС |
| `POST` | `/api/fleet/downtime-records` | Создать простой |
| `PUT` | `/api/fleet/downtime-records/{id}` | Закрыть/обновить простой |
| `GET` | `/api/fleet/downtime-records/vehicle/{vehicleId}/active` | Активный простой ТС |
| `GET` | `/api/fleet/drivers` | Список водителей |
| `POST` | `/api/fleet/drivers` | Добавить водителя |
| `GET` | `/api/fleet/drivers/{id}` | Получить водителя |
| `PUT` | `/api/fleet/drivers/{id}` | Обновить водителя |
| `GET` | `/api/fleet/fines` | Список штрафов |
| `POST` | `/api/fleet/fines` | Добавить штраф |
| `PUT` | `/api/fleet/fines/{id}` | Обновить штраф |
| `GET` | `/api/fleet/fines/analytics` | Аналитика штрафов |
| `GET` | `/api/fleet/fuel-records` | Список записей топлива |
| `POST` | `/api/fleet/fuel-records` | Создать запись топлива |
| `PUT` | `/api/fleet/fuel-records/{id}` | Обновить запись топлива |
| `GET` | `/api/fleet/maintenance-schedule` | План ТО |
| `POST` | `/api/fleet/maintenance-schedule` | Создать план ТО |
| `PUT` | `/api/fleet/maintenance-schedule/{id}` | Обновить план ТО |
| `GET` | `/api/fleet/odometer-readings` | Показания одометра |
| `POST` | `/api/fleet/odometer-readings` | Добавить показание одометра |
| `GET` | `/api/fleet/permits` | Список пропусков |
| `POST` | `/api/fleet/permits` | Добавить пропуск |
| `PUT` | `/api/fleet/permits/{id}` | Обновить пропуск |
| `GET` | `/api/fleet/trailers` | Список прицепов |
| `POST` | `/api/fleet/trailers` | Добавить прицеп |
| `PUT` | `/api/fleet/trailers/{id}` | Обновить прицеп |
| `GET` | `/api/fleet/vehicles` | Список ТС |
| `POST` | `/api/fleet/vehicles` | Добавить ТС |
| `GET` | `/api/fleet/vehicles/{id}` | Получить ТС |
| `PUT` | `/api/fleet/vehicles/{id}` | Обновить ТС |

## Осмотры

_Технические и медицинские осмотры_

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/inspections/med` | Все медосмотры |
| `POST` | `/api/inspections/med` | Провести медосмотр |
| `GET` | `/api/inspections/med/{id}` | Получить медосмотр |
| `POST` | `/api/inspections/med/{id}/decision` | Изменить решение по медосмотру |
| `GET` | `/api/inspections/med/{id}/pdf` | PDF акта медосмотра |
| `GET` | `/api/inspections/med/checklist` | Чек-лист медосмотра |
| `GET` | `/api/inspections/med/expiring-certificates` | Истекающие медсправки |
| `POST` | `/api/inspections/med/post-trip` | Послерейсовый медосмотр |
| `GET` | `/api/inspections/med/queue` | Очередь медосмотров |
| `GET` | `/api/inspections/med/stats` | Статистика медосмотров |
| `GET` | `/api/inspections/tech` | Все техосмотры |
| `POST` | `/api/inspections/tech` | Провести техосмотр |
| `GET` | `/api/inspections/tech/{id}` | Получить техосмотр |
| `POST` | `/api/inspections/tech/{id}/decision` | Изменить решение по техосмотру |
| `GET` | `/api/inspections/tech/{id}/pdf` | PDF акта техосмотра |
| `GET` | `/api/inspections/tech/checklist` | Чек-лист техосмотра |
| `POST` | `/api/inspections/tech/post-trip` | Послерейсовый техосмотр |
| `GET` | `/api/inspections/tech/queue` | Очередь техосмотров |

## Путевые листы

_Формирование и учёт путевых листов_

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/waybills` | Список путевых листов |
| `GET` | `/api/waybills/{id}` | Получить путевой лист |
| `POST` | `/api/waybills/{id}/close` | Р—акрыть путевой лист |
| `GET` | `/api/waybills/{id}/drivers` | Водители путевого листа |
| `POST` | `/api/waybills/{id}/drivers` | Добавить водителя в путевой |
| `GET` | `/api/waybills/{id}/etrn` | XML ЭТрН |
| `GET` | `/api/waybills/{id}/etrn-title4` | XML ЭТрН Титул 4 |
| `GET` | `/api/waybills/{id}/expenses` | Расходы путевого листа |
| `POST` | `/api/waybills/{id}/expenses` | Добавить расход |
| `GET` | `/api/waybills/{id}/pdf` | PDF путевого листа |
| `POST` | `/api/waybills/{id}/sync-status` | Синхронизировать статус путевого листа |
| `DELETE` | `/api/waybills/{waybillId}/drivers/{driverLinkId}` | Удалить водителя из путевого |
| `DELETE` | `/api/waybills/{waybillId}/expenses/{expenseId}` | Удалить расход |
| `PUT` | `/api/waybills/{waybillId}/expenses/{expenseId}` | Обновить расход |
| `POST` | `/api/waybills/generate/{tripId}` | Сформировать путевой лист |

## Финансы

_Счета, тарифы, KPI_

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/api/carrier-contracts` | Создать договор с перевозчиком |
| `GET` | `/api/carriers` | Перевозчики-субподрядчики |
| `POST` | `/api/carriers/{id}/promote` | Назначить контрагента перевозчиком |
| `DELETE` | `/api/finance/adjustments/{id}` | Удалить корректировку |
| `GET` | `/api/finance/export/1c` | Экспорт в 1С |
| `GET` | `/api/finance/fuel-analysis` | План-факт ГСМ |
| `GET` | `/api/finance/invoices` | Список счетов |
| `POST` | `/api/finance/invoices` | Сформировать счёт |
| `GET` | `/api/finance/invoices/{id}` | Детали счёта/акта |
| `POST` | `/api/finance/invoices/{id}/cancel` | Отменить счёт |
| `POST` | `/api/finance/invoices/{id}/corrections` | Выпустить корректировочный СФ или ИСФ |
| `POST` | `/api/finance/invoices/{id}/issue` | Выпустить счёт (draft → issued) |
| `GET` | `/api/finance/invoices/{id}/pdf` | PDF счёта/акта |
| `POST` | `/api/finance/invoices/{id}/register-payment` | Регистрация оплаты счёта |
| `GET` | `/api/finance/invoices/{id}/upd` | PDF УПД |
| `POST` | `/api/finance/invoices/{invoiceId}/1c-reconciliation` | Сверка с 1С |
| `POST` | `/api/finance/invoices/{invoiceId}/additional-services` | Добавить допуслугу |
| `GET` | `/api/finance/invoices/{invoiceId}/adjustments` | Список корректировок счёта |
| `POST` | `/api/finance/invoices/{invoiceId}/adjustments` | Создать корректировку счёта |
| `POST` | `/api/finance/invoices/{invoiceId}/payments` | Зафиксировать частичную оплату |
| `POST` | `/api/finance/invoices/bulk-generate` | Пакетная генерация счетов |
| `POST` | `/api/finance/invoices/bulk-pdf` | Bulk PDF archive |
| `POST` | `/api/finance/invoices/draft` | Создать черновик счёта (новый workflow) |
| `GET` | `/api/finance/invoices/overdue` | СФ/УПД выпущенные с просрочкой (>5 дней) |
| `GET` | `/api/finance/kpi` | KPI метрики |
| `POST` | `/api/finance/tariff-rules/evaluate` | Расчёт тарифного правила |
| `GET` | `/api/finance/trips/{id}/cost` | Стоимость рейса |

## Аналитика

_Предиктивное ТО и маржинальность_

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/analytics/fleet-health` | КТГ парка |
| `GET` | `/api/analytics/fleet-ktg` | КТГ парка (детальный) |
| `GET` | `/api/analytics/fuel-consumption` | Расход топлива |
| `GET` | `/api/analytics/maintenance-alerts` | ТО-алерты |
| `GET` | `/api/analytics/profitability` | Маржинальность рейсов |
| `GET` | `/api/drivers/{id}/score` | Скоринг водителя |
| `GET` | `/api/drivers/scoreboard` | Скоринг-доска водителей |

## Импорт

_Массовый импорт данных (JSON/CSV)_

| Method | Path | Summary |
| --- | --- | --- |
| `DELETE` | `/api/demo/cleanup` | Удалить демо-данные |
| `POST` | `/api/demo/generate` | Создать демо-данные |
| `POST` | `/api/import/{type}/preview` | Предпросмотр импорта |
| `POST` | `/api/import/contractors` | Импорт контрагентов |
| `POST` | `/api/import/drivers` | Импорт водителей |
| `POST` | `/api/import/orders` | Импорт заявок |
| `GET` | `/api/import/templates/{type}` | Скачать XLSX-шаблон |
| `POST` | `/api/import/vehicles` | Импорт ТС |

## Геозоны

_Ограничительные зоны (МКАД, ТТК)_

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/api/geo/distance` | Расстояние |
| `POST` | `/api/geo/distance-matrix` | Матрица расстояний |
| `GET` | `/api/geo/geocode` | Геокодирование |
| `POST` | `/api/geo/geocode/batch` | Геокодирование пакетное |
| `POST` | `/api/geo/nearest` | Ближайшая точка |
| `GET` | `/api/geo/reverse` | Обратное геокодирование |

## Синхронизация

_Офлайн-синхронизация мобильного приложения_

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/api/sync/events` | Push событий |
| `GET` | `/api/sync/pull` | Pull обновлений |

## Уведомления

_Push-уведомления и WebSocket_

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/telegram/bot-info` | Информация о боте |
| `POST` | `/api/telegram/setup-webhook` | Настроить webhook |
| `GET` | `/api/telegram/subscriptions` | Подписки |
| `POST` | `/api/telegram/test` | Тест уведомления |
| `DELETE` | `/api/telegram/webhook` | Удалить webhook |
| `POST` | `/api/telegram/webhook` | Telegram webhook |

## Аудит

_Журнал событий append-only_

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/audit-log` | Журнал событий |
| `GET` | `/api/audit-log/types` | Уникальные значения для фильтров журнала |

## Здоровье

_Health check и readiness_

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/health/ready` | Readiness check |

## Администрирование

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/auth/checklist-templates` | Шаблоны чек-листов |
| `POST` | `/api/auth/checklist-templates` | Создать шаблон |
| `PUT` | `/api/auth/checklist-templates/{id}` | Обновить шаблон чек-листа |
| `GET` | `/api/auth/contracts` | Список договоров |
| `GET` | `/api/auth/tariffs` | Список тарифов |
| `POST` | `/api/auth/tariffs` | Создать тариф |
| `PUT` | `/api/auth/tariffs/{id}` | Обновить тариф |
| `GET` | `/api/auth/users` | Список пользователей |
| `POST` | `/api/auth/users` | Создать пользователя |
| `PUT` | `/api/auth/users/{id}` | Обновить пользователя |

## Trips

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/trips/{id}/compatibility` | Trip cargo/vehicle compatibility |
| `GET` | `/api/trips/{id}/compliance-panel` | Compliance panel |
| `GET` | `/api/trips/{id}/dossier` | Transport dossier |
| `GET` | `/api/trips/{id}/dossier/close-gate` | Trip dossier close gate |
| `POST` | `/api/trips/{id}/dossier/items/{itemId}/exception` | Exception a dossier item |
| `GET` | `/api/trips/{id}/etrn-workflow/{titleType}` | ETRN title |
| `POST` | `/api/trips/{id}/execution-events` | Record trip execution event |
| `POST` | `/api/trips/{id}/transport-documents/{documentId}/exchange/attempts` | Create exchange attempt |
| `POST` | `/api/trips/{id}/transport-documents/{documentId}/exchange/receipts` | Record exchange receipt |
| `POST` | `/api/trips/{id}/transport-documents/{documentId}/provider-callback` | Register provider callback |
| `POST` | `/api/trips/{id}/transport-documents/{documentId}/provider-status` | Update provider status |
| `POST` | `/api/trips/{id}/transport-documents/{documentId}/retry` | Retry transport document |
| `POST` | `/api/trips/{id}/transport-documents/{documentId}/send` | Send transport document to provider |
| `POST` | `/api/trips/{id}/transport-documents/{documentId}/signature-refusals` | Record transport document signature refusal |
| `POST` | `/api/trips/{id}/transport-documents/{documentId}/signatures` | Record transport document signature |
| `POST` | `/api/trips/{id}/transport-documents/{documentId}/status` | Update transport document status |
| `POST` | `/api/trips/execution-events` | Record trip execution event |

## Attachments

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/waybills/{id}/attachments` | List waybill attachments |
| `POST` | `/api/waybills/{id}/attachments` | Upload waybill attachment |
| `DELETE` | `/api/waybills/{waybillId}/attachments/{attachmentId}` | Delete waybill attachment |
| `GET` | `/api/waybills/{waybillId}/attachments/{attachmentId}/download` | Download waybill attachment |

## Repairs

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/repairs` | List repairs |
| `POST` | `/api/repairs` | Create repair |
| `GET` | `/api/repairs/{id}` | Get repair |
| `PUT` | `/api/repairs/{id}` | Update repair |
| `PUT` | `/api/repairs/{id}/status` | Change repair status |
| `GET` | `/api/repairs/analytics/by-status` | Repairs analytics by status |
| `GET` | `/api/repairs/analytics/cost/{vehicleId}` | Repair cost by vehicle |
| `GET` | `/api/repairs/parts/catalog` | Repair parts catalog |
| `POST` | `/api/repairs/parts/catalog` | Create repair part catalog item |
| `DELETE` | `/api/repairs/parts/catalog/{id}` | Archive repair part catalog item |
| `PUT` | `/api/repairs/parts/catalog/{id}` | Update repair part catalog item |
| `GET` | `/api/repairs/parts/catalog/meta` | Repair parts catalog meta |

## Интеграции

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/integrations/credentials` | Список настроенных провайдеров |
| `POST` | `/api/integrations/credentials` | Сохранить ключи провайдера |
| `DELETE` | `/api/integrations/credentials/{id}` | Удалить ключи провайдера |
| `POST` | `/api/integrations/credentials/{id}/test` | Проверка соединения провайдера |
| `GET` | `/api/integrations/dadata/lookup/{inn}` | Поиск по ИНН |
| `GET` | `/api/integrations/dadata/suggest-address` | Подсказки адресов |
| `POST` | `/api/integrations/fines/sync` | Синхронизация штрафов |
| `POST` | `/api/integrations/fuel-card-mock/sync` | Mock-синхронизация топливной карты |
| `GET` | `/api/integrations/fuel/transactions/{vehicleId}` | Транзакции топливных карт |
| `GET` | `/api/integrations/status` | Статус очередей |
| `GET` | `/api/integrations/wialon-mock/positions` | История позиций ТС (mock) |
| `POST` | `/api/integrations/wialon-mock/start` | Старт mock-трека Wialon |
| `GET` | `/api/integrations/wialon-mock/status` | Активные mock-симуляции |
| `POST` | `/api/integrations/wialon-mock/stop` | Остановить mock-трек Wialon |
| `POST` | `/api/integrations/wialon/sync` | Синхронизация Wialon |

## Настройки

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/settings/cost-model` | Настройки cost model |
| `PUT` | `/api/settings/cost-model` | Обновить cost model |
| `GET` | `/api/settings/recent` | Недавние изменения настроек |

## Operations

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/operations/exceptions` | Dispatcher exception cockpit |
| `POST` | `/api/trips/{id}/breakdowns` | Record trip breakdown |
| `POST` | `/api/trips/{id}/cancel-after-arrival` | Cancel trip after vehicle arrival |
| `POST` | `/api/trips/{id}/crew-rest-plan` | Record trip crew and rest plan |
| `POST` | `/api/trips/{id}/post-trip-return` | Complete post-trip vehicle return |
| `POST` | `/api/trips/{id}/resource-replacements` | Replace trip vehicle, driver, or trailer |
| `POST` | `/api/trips/{id}/route-changes/readdress` | Record trip readdressing |
| `POST` | `/api/trips/{id}/route-points/{pointId}/downtime` | Record route point downtime |

## Документы

| Method | Path | Summary |
| --- | --- | --- |
| `PUT` | `/api/document-returns/{id}` | Обновить статус возврата документа |
| `GET` | `/api/trips/{id}/document-returns` | Список возвратов оригиналов по рейсу |
| `POST` | `/api/trips/{id}/document-returns` | Создать запись о возврате документа |

## Претензии

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/claims` | Список претензий |
| `POST` | `/api/claims` | Создать претензию |
| `GET` | `/api/claims/{id}` | Получить претензию |
| `POST` | `/api/claims/{id}/resolve` | Закрыть претензию (resolved/rejected) |
| `PATCH` | `/api/claims/{id}/status` | Изменить статус претензии |

## Claims

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/claims/exposure` | Claim exposure by trip/order |

## Файлы

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/api/uploads` | Загрузить файл |

## Холодовая цепь

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/api/trips/{tripId}/temperature-mock-tick` | Сгенерировать имитационный замер (admin) |
| `GET` | `/api/trips/{tripId}/temperature-readings` | Список показаний температуры |
| `POST` | `/api/trips/{tripId}/temperature-readings` | Записать показание температуры |
| `GET` | `/api/trips/{tripId}/temperature-summary` | Сводка по температуре рейса |

## Водители

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/drivers/{id}/hos-status` | Статус РТО (Hours of Service) |
| `GET` | `/api/drivers/{id}/hours-summary` | Часы вождения за период (РТО) |

## ЭДО

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/api/edi/webhook/{provider}` | Webhook от ЭДО-провайдера |
| `GET` | `/api/transport-documents/{id}/edi/history` | История EDI-событий |
| `POST` | `/api/transport-documents/{id}/edi/mock-progress` | Перевести EDI-статус вручную (admin) |
| `POST` | `/api/transport-documents/{id}/edi/send` | Отправить документ в EDI (mock) |

## AI Co-pilot

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/api/copilot/chat` | Stream chat reply (SSE) |
| `GET` | `/api/copilot/conversations` | List user's conversations |
| `GET` | `/api/copilot/conversations/{id}/messages` | Replay conversation messages |

## Онбординг

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/api/onboarding/complete` | Завершить онбординг |
| `POST` | `/api/onboarding/inn-lookup` | Поиск компании по ИНН |
| `POST` | `/api/onboarding/invite-team` | Пригласить сотрудников |
| `POST` | `/api/onboarding/profile` | Сохранить реквизиты |
| `POST` | `/api/onboarding/save-integration-choice` | Сохранить выбор интеграции |
| `POST` | `/api/onboarding/select-scenario` | Выбор сценария |
| `GET` | `/api/onboarding/status` | Состояние мастера |

## Биллинг

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/admin/billing/overview` | Все организации (super-admin) |
| `POST` | `/api/billing/cancel` | Отменить продление |
| `GET` | `/api/billing/payments` | История платежей |
| `GET` | `/api/billing/plans` | Список тарифов |
| `POST` | `/api/billing/subscribe` | Перейти на платный тариф |
| `GET` | `/api/billing/subscription` | Подписка организации |
| `GET` | `/api/billing/usage` | Использование лимитов в текущем периоде |
| `POST` | `/api/billing/webhook/yookassa` | Webhook ЮKassa (HMAC-signed) |

## Compliance

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/api/compliance/adr/orders` | Список заявок с ADR-классом |
| `GET` | `/api/compliance/adr/strict-mode` | Текущий режим строгости ADR |
| `POST` | `/api/compliance/adr/strict-mode` | Переключить режим строгости ADR (admin) |
| `POST` | `/api/compliance/adr/validate-hard` | Жёсткая валидация ADR (учитывает strict-mode) |
| `GET` | `/api/compliance/marking/by-shipment/{lotId}` | Коды маркировки по отгрузке |
| `GET` | `/api/compliance/marking/categories` | Сводка по категориям маркировки |
| `GET` | `/api/compliance/marking/recent` | Недавние проверки маркировки |
| `POST` | `/api/compliance/marking/scan-batch` | Привязать партию кодов к отгрузке |
| `POST` | `/api/compliance/marking/verify` | Проверить коды маркировки (Честный знак) |
| `GET` | `/api/compliance/osago/check/{vehicleId}` | Проверка ОСАГО для ТС |
| `GET` | `/api/compliance/osago/status` | Сводка ОСАГО по парку |
| `POST` | `/api/compliance/osago/sync` | Массовая проверка ОСАГО |
| `POST` | `/api/compliance/tachograph/upload` | Загрузить файл тахографа (.DDD / .ESM) |
| `GET` | `/api/compliance/tachograph/uploads` | Журнал загрузок тахографа |
