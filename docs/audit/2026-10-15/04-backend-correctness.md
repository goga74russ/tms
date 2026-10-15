# Full-Stack/Backend (корректность бизнес-логики) — аудит TMS 2026-10-15

**Персона/взгляд:** DHH — прагматичная корректность кода: деньги должны сходиться до копейки, конечный автомат не должен иметь «чёрного хода», один факт — один источник правды.

**Охват (прочитано):**
- `apps/api/src/modules/billing/{service,routes}.ts`, `apps/api/src/auth/plan-guard.ts`, `packages/shared/src/{billing,invoice-fsm,enums,copilot}.ts`
- `apps/api/src/modules/finance/{finance.service,invoice-workflow.service,tarification.service,tariff-rules.service,routes}.ts` (платёжные/корректировочные/экспортные ветки), `apps/api/src/integrations/workers/billing.worker.ts`
- `apps/api/src/modules/trips/{service,state,routes,margin}.ts` (assign, changeTripStatus, delivery-confirmation), `orders/service.ts`, `operational-core/write-service.ts`
- `apps/api/src/modules/waybills/{service,lifecycle}.ts`, `inspections/service.ts` (create + decision-flip), `apps/api/src/utils/timezone.ts`, `utils/db-helpers.ts`
- `claims/service.ts`, `operational-core/claim-policy.ts`, `rto/{service,helpers}.ts`, `cold-chain/service.ts`, `import/routes.ts`, `copilot/{service,routes,tools/index}.ts`, `notifications/*`, `sync/service.ts` (уведомление ЭТрН), `documents/routes.ts` (возврат оригиналов), `documents/upd-pdf.ts` (НДС-строки)
- Предыдущий аудит `docs/qa/code-audit-2026-06-14.md` (таблица закрытия P1).

**Метод:** чтение кода по сквозному потоку заказ → рейс → ПЛ → осмотры → выпуск → доставка → возврат документов → биллинг; для каждой находки — повторное чтение и попытка опровержения (adversarial self-check). Две гипотезы проверены исполнением: `getBusinessDayBounds()` под `TZ=UTC`/`TZ=Europe/Moscow` и float-суммы платежей в Node. Код не менялся.

## Вердикт

Отдельные места системы аккуратные и защищены: блокировки `FOR UPDATE` в платежах и webhook'е, идемпотентность ЮKassa, FSM претензий, per-org нумерация в invoice-workflow. Но биллинг в целом — это три независимых генератора счетов и два независимых реестра оплат, которые друг о друге не знают. Отсюда двойные счета, черновики, которые невозможно выпустить, и рассинхрон `paidAmount`. Самый опасный дефект для эксплуатации — «бизнес-день» осмотров в production-контейнере (UTC) сдвинут на 6 часов: предрейсовые осмотры с 00:00 до 06:00 МСК система не видит, а ранний выпуск на линию — норма для перевозчика. Кроме того, отрицательное решение по осмотру после выпуска не отзывает путевой лист. Подписки фактически не ограничивают доступ: статус и срок нигде не проверяются, счётчики использования не растут. Все 10 P1 прошлого аудита в моей зоне закрыты кодом, но inspections decision-flip закрыт лишь частично (см. BE-04), а фикс #2 billing обходится через `startTrial` (см. BE-06). **Зрелость области: 5/10.**

## Сильные стороны

- `handlePaymentCallback` целиком в одной транзакции с `FOR UPDATE`, двойная дедупликация (eventId и состояние платежа), статус берётся из re-query ЮKassa, а не из тела webhook'а.
- `registerPayment`: read-modify-write под `FOR UPDATE`, защита от переплаты. FSM претензий с терминальными статусами под блокировкой.
- Нумерация в invoice-workflow: advisory-lock внутри tx, числовой (а не лексический) максимум, per-org серия.
- Ставка НДС 20/22 % с учётом историчности и запретом смешивать периоды в `issueDraftInvoice`, 5-дневный срок СФ считается по МСК-суткам.
- Блокировка ТС и создание ремонтной заявки при decision-flip техосмотра (P1 прошлого аудита закрыт).
- Числа из колонок `numeric` в критичных местах приводятся через `num()`/`toFiniteNumber` (НДС-конкатенация #9 закрыта).
- Copilot-инструменты только читают данные, by-id-инструменты проверяют org (`tripInOrg`/`driverInOrg`).

## Проверка закрытия P1 из code-audit-2026-06-14 (моя зона)

| P1 | Статус | Комментарий |
|---|---|---|
| billing: смена тарифа не меняла planId (#2) | ✅ закрыт | `targetPlanId` применяется на webhook'е. Но для орг без подписки `createPayment` → `startTrial(orgId, planId)` ставит платный plan ДО оплаты → см. BE-06 |
| billing: refund webhook no-op (#3) | ✅ закрыт | `payment_id` используется. Остаточные проблемы — BE-25 |
| claims: пере-resolve (#5) | ✅ закрыт | FSM под `FOR UPDATE` |
| НДС string-concat в tarification (#9) | ✅ закрыт | `num(tariff.vatRate)`. Остаточные проблемы НДС тарифа — BE-10 |
| recordPartialPayment без статус-гейта (#10) | ✅ закрыт | Но два реестра оплат расходятся — BE-08 |
| confirmationMode bypass | ✅ закрыт | `forcedByDispatcher` вычищается из тела на `/status` |
| inspections decision-flip каскад | ⚠️ частично | ТС блокируется, ремонт создаётся, но выпущенный ПЛ не отзывается — BE-04 |
| assign-carrier executionMode | ✅ закрыт | |
| documents docType collapse | ✅ закрыт | |
| import orders.number per-org | ✅ закрыт | `idx_orders_org_number` |

## Находки

### [P1] BE-01 — «Бизнес-день» осмотров в UTC-контейнере сдвинут на +6 ч: осмотры 00:00–06:00 МСК не засчитываются
- **Где:** `apps/api/src/utils/timezone.ts:22-38`; используется в `apps/api/src/modules/waybills/service.ts:221,239` (допуск к выпуску ПЛ), `apps/api/src/modules/inspections/service.ts:144,496,897,920` (очереди медика и механика)
- **Что:** функция строит `new Date(dateInTz + 'T00:00:00')` в локальной зоне сервера, переводит в строку МСК и снова парсит в локальной зоне. При `TZ=UTC` (образ `node:20-alpine` без TZ в Dockerfile, `APP_TIMEZONE` выставлен, а TZ процесса — нет) смещение применяется с обратным знаком. Проверено исполнением: при `TZ=UTC` и времени 2026-03-05 02:30Z функция возвращает `[2026-03-05T03:00Z, 2026-03-06T02:59:59Z]` (то есть с 06:00 до 05:59 МСК следующего дня) вместо `[2026-03-04T21:00Z, 2026-03-05T20:59:59Z]`. При `TZ=Europe/Moscow` результат корректный — поэтому локально и в тестах дефект не виден.
- **Сценарий:** водитель выезжает в 05:00 МСК. Медосмотр в 04:30 и техосмотр в 04:40 записаны (01:30Z/01:40Z), но `getTodayApproved*Inspection` их не находит → ПЛ остаётся `draft`, выпуск на линию заблокирован до 06:00. Очереди медика и механика в это окно показывают уже осмотренных водителей как неосмотренных. Вечерний осмотр 23:30 МСК засчитывается «на сегодня» до 06:00 следующего дня.
- **Исправление:** считать границы арифметически от фиксированного смещения МСК (UTC+3, как в `invoice-fsm`/`tarification`) или через `Intl` с вычислением offset; дополнительно выставить `TZ=UTC` явно и добавить тест на `TZ=UTC`.
- **Статус:** CONFIRMED

### [P1] BE-02 — Двойной счёт за один рейс: автосчёт при завершении + ручная генерация за период
- **Где:** `apps/api/src/modules/trips/service.ts:1230-1242` (вызов `tryAutoCreateInvoice`), `apps/api/src/modules/finance/finance.service.ts:858-981` (автосчёт), `:149-254` (`generateInvoices`, условия 172-188), `:1003-1156` (`bulkGenerateInvoices`)
- **Что:** при завершении рейса `tryAutoCreateInvoice` создаёт черновик со связью в `invoice_trips`, но рейс остаётся в статусе `completed`. Ручной `POST /finance/invoices/generate` выбирает рейсы по `status='completed' AND originalDocumentsReceived` и не проверяет `invoice_trips`. Тот же рейс попадает во второй счёт и только после этого переводится в `billed`. Кроме того, `bulkGenerateInvoices` (ежедневный воркер и ручной запуск) не блокирует рейсы: два параллельных вызова оба видят `invoice_trips IS NULL`, а уникальный индекс стоит только на паре `(invoiceId, tripId)`, не на `tripId`.
- **Сценарий:** рейс завершён → черновик СЧ-…-00012 на 120 000 ₽. В конце месяца бухгалтер запускает «Сформировать счета за период» → СЧ-…-00031 включает тот же рейс. Клиенту выставлено 240 000 ₽.
- **Исправление:** единственный генератор счетов. Во всех путях исключать рейсы, у которых есть `invoice_trips` (`LEFT JOIN … IS NULL`), брать `FOR UPDATE SKIP LOCKED` на рейсы, добавить UNIQUE на `invoice_trips(trip_id)` для неотменённых счетов.
- **Статус:** CONFIRMED

### [P1] BE-03 — Автоматически созданные счета не имеют payee-организации: их нельзя выпустить, реквизиты пустые, номера коллидируют
- **Где:** `apps/api/src/modules/finance/finance.service.ts:215-227, 950-965, 1106-1121` (insert без `payeeOrganizationId`); `apps/api/src/modules/finance/invoice-workflow.service.ts:58-86` (налоговый режим берётся через payee), `packages/shared/src/invoice-fsm.ts:237-240`; `finance.service.ts:122-145` и `invoice-workflow.service.ts:99-130` — две разные серии и блокировки для префикса «СЧ-»
- **Что:** все три генератора (`generateInvoices`, `tryAutoCreateInvoice`, `bulkGenerateInvoices`) создают `invoices` с `payee_organization_id = NULL`. Последствия:
  - `getInvoiceWithOrgRegime` делает LEFT JOIN организации по payee → `taxRegime='unspecified'` → `issueDraftInvoice` всегда отклоняет выпуск: «Tax regime not set — invoice issuance blocked».
  - PDF получает пустые реквизиты исполнителя (`resolveOrgRequisites(null)`).
  - Copilot `list_pending_invoices` такие счета не видит.
  - `getNextInvoiceNumber` берёт глобальный максимум «СЧ-YYYY-» по всем орг под общей блокировкой, а workflow — per-org максимум по `payee=org` под per-org блокировкой. Автосчета с payee NULL не участвуют в per-org максимуме → ручной счёт орг получает тот же номер, что её автосчёт. Уникальный индекс `(payee_organization_id, number)` дубль с NULL не ловит.
- **Сценарий:** рейс завершён → автосчёт СЧ-2026-00005 (payee NULL). Бухгалтер жмёт «Выпустить» → 422 TAX_REGIME_MISMATCH. Он создаёт счёт вручную через workflow → тоже СЧ-2026-00005 у той же организации — нарушение п.1 ст.169 НК (уникальность нумерации).
- **Исправление:** проставлять `payeeOrganizationId` из `trips.organizationId`/`contractors.organizationId` во всех генераторах, перевести их на `generateInvoiceNumber(type, tx, orgId)`, миграцией бэкфилить существующие строки.
- **Статус:** CONFIRMED

### [P1] BE-04 — Отказ по осмотру после выпуска не отзывает путевой лист; более позднее «rejected» не перекрывает утреннее «approved»
- **Где:** `apps/api/src/modules/inspections/service.ts:961-1047` (tech decision-flip), `:1049-1137` (med decision-flip), `:584-680` (`createMedInspection`, sync только при approved); `apps/api/src/modules/waybills/service.ts:220-254` (`getTodayApproved*` ищет любой approved за день); `apps/api/src/modules/trips/service.ts:1037-1048` (переходы в `waybill_issued`/`in_transit` проверяют только статус ПЛ)
- **Что:** при смене решения approved→rejected `syncWaybillStateForTrip` вызывается только для `approved`. ПЛ остаётся `issued` со ссылкой на уже отклонённый осмотр, а рейс может уйти в `loading`/`in_transit`. Флип медосмотра пишет только событие `trip.driver_cleared`: водителя с рейса фактически не снимают. Кроме того, допуск берёт «любой approved pre_trip за сегодня», поэтому новый rejected-осмотр (например, повторный алкотест) не отменяет более ранний approved.
- **Сценарий:** медик в 06:10 допустил водителя, ПЛ выпущен. В 06:30 он повторно проверил водителя (алкотест положительный) или сменил решение на rejected → ПЛ остаётся «выпущен», `POST /trips/:id/status {in_transit}` проходит. Это выпуск на линию без действующего допуска (ст. 12.31.1 КоАП, ФЗ-196).
- **Исправление:** на любое rejected (создание или flip) пересчитывать допуск по ПОСЛЕДНЕМУ осмотру. Если ПЛ `issued` и рейс ещё не `in_transit` — откатывать ПЛ и рейс и создавать blocking incident. В `changeTripStatus` перед `loading`/`in_transit` проверять действительность допуска.
- **Статус:** CONFIRMED (повтор: P1 «inspections decision-flip каскад» code-audit-2026-06-14 — закрыт частично)

### [P1] BE-05 — Заявка, разбитая на лоты по нескольким рейсам, тарифицируется полным весом на КАЖДОМ рейсе
- **Где:** `apps/api/src/modules/operational-core/write-service.ts:244` (`tripOrders` для каждого рейса лота), `apps/api/src/modules/finance/tarification.service.ts:140` и батч-вариант (сумма `order.cargoWeightKg` по всем `tripOrders`); `apps/api/src/modules/trips/margin.ts:52-70` (то же для `customerPrice`)
- **Что:** `assignLotToTrip` связывает рейс со всей заявкой через `trip_orders`, а назначенный вес хранит в `trip_lot_assignments.assignedWeightKg`. Тарификация берёт `orders.cargoWeightKg` целиком; маржа рейса — `customerPrice` целиком.
- **Сценарий:** заявка на 40 т разбита на 2 лота по 20 т и 2 рейса, тариф `per_ton` 1 500 ₽/т. Каждый рейс считается как 40 т × 1 500 = 60 000 ₽ — клиенту выставлено 120 000 ₽ вместо 60 000. Маржа по каждому рейсу тоже учитывает полный `customerPrice`.
- **Исправление:** если у рейса есть `trip_lot_assignments`, тарифицировать по `assignedWeightKg`, а `customerPrice` распределять пропорционально; для `per_km`/`fixed` явно задать правило.
- **Статус:** CONFIRMED

### [P1] BE-06 — Подписки не ограничивают доступ: статус и срок нигде не проверяются, платный план выдаётся до оплаты
- **Где:** `apps/api/src/modules/billing/service.ts:67-106` (`getActiveSubscription` возвращает план по `planId`, игнорируя `status`/`trialEndsAt`/`currentPeriodEnd`), `:186-190` (`createPayment` → `startTrial(orgId, planId)`), `:452-470` (refund → `cancelled`); `apps/api/src/auth/plan-guard.ts:55-66`; нет ни одного воркера, который истекает trial или период (grep по `subscriptions` вне billing ничего не находит)
- **Что:** у орг без подписки `createPayment` сначала создаёт подписку `trial` сразу на ЦЕЛЕВОЙ платный план, и только потом идёт в ЮKassa. `requireFeature` смотрит только `plan.features`. Ни истечение trial, ни `past_due`, ни `cancelled` (в том числе после возврата денег — «фикс P2») не отключают фичи. Фикс #2 («до оплаты planId менять нельзя») обходится этим путём.
- **Сценарий:** при `ALLOW_ONLINE_PAYMENTS=true` админ free-орг жмёт «Перейти на Enterprise» и закрывает страницу оплаты. Орг навсегда получает `edi/adr/tachograph/ai_copilot`. Клиент, получивший возврат (`cancelled`), тоже продолжает пользоваться платным планом.
- **Исправление:** `getActiveSubscription` должен деградировать до free при `status ∉ {trial, active}` или `now > currentPeriodEnd/trialEndsAt` (с grace-периодом для `past_due`). Trial стартовать на текущем (free) плане. Нужен cron истечения подписок.
- **Статус:** CONFIRMED (эксплуатация — при включённой онлайн-оплате; сейчас по умолчанию она выключена)

### [P2] BE-07 — Лимиты тарифа не работают: `recordUsage` нигде не вызывается
- **Где:** `apps/api/src/modules/billing/service.ts:479-496` (единственное определение, вызовов нет), `:498-504`, `apps/api/src/modules/copilot/routes.ts:30`, `apps/api/src/auth/plan-guard.ts:76-100`
- **Что:** `usage_counters` никогда не инкрементируются, поэтому `requireWithinLimit('copilot_messages')` всегда видит 0. Лимиты `orders`/`vehicles` вообще нигде не подключены. Вдобавок «дневной» лимит copilot считается по месячному `currentBillingPeriodStart`. Реально работает только хардкод в 500 сообщений/сутки на орг (`copilot/service.ts:31,79`).
- **Сценарий:** на Free (лимит 30 заявок/мес) можно создать хоть 10 000 заявок; на Pro лимит copilot не действует.
- **Исправление:** инкрементировать счётчики в той же tx, что и создание сущности (или считать `count(*)` по фактам). Copilot считать по суткам МСК. Подключить `requireWithinLimit` к `POST /orders` и `POST /fleet/vehicles`.
- **Статус:** CONFIRMED

### [P2] BE-08 — Два реестра оплат счёта расходятся: `paidAmount` против событий `partial_payment`
- **Где:** `apps/api/src/modules/finance/invoice-workflow.service.ts:694-770` (`registerPayment` → колонка `paidAmount`), `apps/api/src/modules/finance/finance.service.ts:597-670` (`recordPartialPayment` → сумма событий); KPI `finance.service.ts:388-395`
- **Что:**
  - `recordPartialPayment` считает оплачено = Σ событий `invoice.partial_payment.recorded` и не учитывает оплаты, внесённые через `/invoices/:id/payment`.
  - Если счёт уже `paid_partial`, `paidAmount` не обновляется (ветка только для `issued`).
  - Защиты от переплаты нет — излишек молча «съедает» `Math.max(…,0)`.
  - Идемпотентности по `paymentRef` нет ни в одном из путей.
  - KPI «задолженность» учитывает только `status='issued'`: частично оплаченные счета из долга выпадают целиком.
- **Сценарий:** счёт на 100 000. `registerPayment` 60 000 → `paid_partial`, `paidAmount`=60 000. Затем `/payments` 40 000 → события дают 40 000, остаток 60 000, статус остаётся `paid_partial`. Счёт навсегда «не оплачен», хотя получено 100 000. Повторная отправка той же банковской выписки (двойной клик) засчитывается дважды.
- **Исправление:** одна таблица `invoice_payments` (сумма, дата, ссылка, UNIQUE по `(invoice_id, payment_ref)`), `paidAmount` = агрегат в той же tx; один endpoint; в долг включать `paid_partial`.
- **Статус:** CONFIRMED

### [P2] BE-09 — Деньги в float: полностью оплаченный счёт остаётся `paid_partial`, НДС тарифа не округлён до копейки
- **Где:** `apps/api/src/modules/finance/invoice-workflow.service.ts:716,735`; `finance.service.ts:650-656`; `tarification.service.ts:398-407`; суммирование в `finance.service.ts:199-211, 1081-1094`
- **Что:** `newPaid = num(paidAmount) + amount`, сравнение `newPaid >= total` идёт в float. Проверено: `50000.1 + 50000.2 = 100000.29999999999 < 100000.3`. НДС в тарификации (`subtotal * vr/(100+vr)`) не округляется, а `subtotal` и `vatAmount` округляются в `numeric(12,2)` по отдельности → `subtotal + vat ≠ total` на копейку. Сводные счета суммируют неокруглённые float по рейсам.
- **Сценарий:** счёт на 100 000,30 ₽ оплачен двумя платежами (50 000,10 и 50 000,20) → статус `paid_partial`. Попытка «доплатить» 0,01 ₽ укладывается в допуск переплаты — грязные данные. В PDF строки «Без НДС + НДС» не сходятся с «Итого».
- **Исправление:** все суммы — в копейках (integer) или через decimal-библиотеку; округлять НДС до копейки на строке, итог = Σ строк; сравнивать в копейках.
- **Статус:** CONFIRMED

### [P2] BE-10 — НДС тарифа не зависит ни от даты, ни от налогового режима; маржа считается с НДС
- **Где:** `apps/api/src/db/schema.ts` (`tariffs.vatRate` default 20, `vatIncluded` default true); `apps/api/src/modules/finance/tarification.service.ts:398-411`
- **Что:** автосчета и copilot `compute_trip_cost` берут `tariff.vatRate` как есть: 20 % для отгрузок 2026 года (должно быть 22 %), ненулевой НДС у орг на УСН без НДС. `margin = total − cost`, где `total` включает НДС, — маржа завышена на сумму НДС.
- **Сценарий:** тариф заведён в 2025 году (20 %) → автосчёт за рейс в 2026 году содержит НДС 20 %. Перевозчик на УСН видит «НДС 18 032 ₽» в черновике. Маржа рейса на 120 000 ₽ завышена на ~21 600 ₽.
- **Исправление:** ставку брать через `resolveVatRate(taxRegime, shipmentDate, usnVatRate)` из `@tms/shared`; маржу считать от нетто-суммы.
- **Статус:** CONFIRMED

### [P2] BE-11 — Корректировка (КСФ/ИСФ) без валидации сумм; ИСФ к оплаченному счёту «теряет» оплату
- **Где:** `apps/api/src/modules/finance/invoice-workflow.service.ts:582-689`
- **Что:**
  - `subtotal`/`vatAmount`/`total` принимаются из тела без проверки (`subtotal + vat = total`, ставка против режима — `taxRegime` деструктурирован, но не используется).
  - Позиции `invoiceOrders` не проверяются на принадлежность исходному счёту.
  - ИСФ (`replacement`) переводит оригинал в `cancelled` в обход FSM (`paid_full → cancelled` запрещён матрицей). Новый документ создаётся с `paidAmount = 0`.
- **Сценарий:** СФ на 100 000 оплачен полностью; оформлена ИСФ на 100 000 → оригинал «Отменён», ИСФ «Выпущен», неоплачено 100 000. Дебиторка удвоена, клиенту уходит повторное требование оплаты.
- **Исправление:** валидация сумм и ставки; при ИСФ переносить `paidAmount` на новый документ (или запретить ИСФ для оплаченных); проводить переход оригинала через `canTransitionInvoice`.
- **Статус:** CONFIRMED

### [P2] BE-12 — Отмена счёта: гонка с оплатой, повторная отмена затирает ссылку `replaced_by`, рейсы не освобождаются
- **Где:** `apps/api/src/modules/finance/invoice-workflow.service.ts:775-814`; `packages/shared/src/invoice-fsm.ts:148`
- **Что:**
  - `cancelInvoice` читает статус без блокировки и делает безусловный UPDATE. Параллельный `registerPayment` может закоммитить оплату, после чего счёт всё равно станет `cancelled` с ненулевым `paidAmount`.
  - `canTransitionInvoice` возвращает `allowed` при `from === to` раньше проверки `cancelled`, поэтому повторная отмена перезаписывает `cancellationReason='replaced_by:<id>'` (теряется связь с ИСФ).
  - Отмена не удаляет `invoice_trips` и не возвращает рейсы из `billed`: после отмены ошибочного счёта рейсы больше нельзя выставить ни bulk-, ни ручным путём.
- **Исправление:** `SELECT … FOR UPDATE` + `WHERE status = :expected`; в FSM запретить `cancelled → cancelled`; при отмене освобождать рейсы в той же tx.
- **Статус:** CONFIRMED

### [P2] BE-13 — Корректировки и допуслуги черновика теряются при выпуске
- **Где:** `apps/api/src/modules/finance/finance.service.ts:508-552, 672-727`; `invoice-workflow.service.ts:357-433`
- **Что:** `createAdjustment`/`addAdditionalService` меняют только `invoices.total` (не трогая `subtotal`/`vatAmount` и игнорируя `vatRate` допуслуги). `issueDraftInvoice` затем полностью пересчитывает `total/vat/subtotal` из `invoiceOrders`. Простой, погрузка и пропуск, добавленные к черновику, исчезают из выпущенного документа.
- **Исправление:** хранить допуслуги как строки документа и включать их в расчёт при выпуске (с НДС), либо запретить корректировки, которые не переживут выпуск.
- **Статус:** CONFIRMED

### [P2] BE-14 — Выпуск счёта не проверяет связанные заявки; дата оплаты игнорируется; ставка НДС для «не-НДС» типов произвольна
- **Где:** `apps/api/src/modules/finance/invoice-workflow.service.ts:260-465`, `:309`, `:751`
- **Что:**
  - `invoiceOrders[].orderId` не проверяются на принадлежность орг/плательщику и на то, что заявка ещё не выставлена — одна заявка может попасть в N счетов.
  - `registerPayment` пишет `paidAt = new Date()` вместо `input.paymentDate`, хотя дата банковского поступления важна для учёта.
  - Для `payment/act/advance` `isVatDoc=false`: проверки ставки по режиму нет, и УСН-организация может выставить счёт с НДС 22 % (п.5 ст.173 НК — обязанность уплатить НДС). Авансовый СФ (`advance`), у которого действует 5-дневный срок, при этом не считается НДС-документом.
- **Исправление:** проверять заявки (org, плательщик, нет активной связи `invoice_orders` в неотменённом счёте); сохранять `paymentDate`; применять `allowedVatRates` ко всем типам при ненулевой ставке; `advance` трактовать как НДС-документ.
- **Статус:** CONFIRMED

### [P2] BE-15 — `syncWaybillStateForTrip` перезаписывает выпущенный или закрытый ПЛ по осмотрам «сегодня»
- **Где:** `apps/api/src/modules/waybills/service.ts:372-446`; вызывается из `inspections/service.ts:407,688,1041,1130` и `waybills/routes.ts:210`
- **Что:** у функции нет защиты по статусу существующего ПЛ: `status`, `techInspectionId`, `medInspectionId`, подписи и `departureAt` безусловно перезаписываются вычисленным состоянием. Создание осмотра принимает `tripId` рейса в любом статусе.
- **Сценарий:** многодневный рейс, день 2: механик делает pre_trip-осмотр с `tripId` → у водителя нет медосмотра «сегодня» → ПЛ `issued → medical_check`, `medInspectionId=null`, `departureAt=null`. `closeWaybill` (требует `issued`) теперь недоступен. Закрытый (`closed`) ПЛ таким же путём «оживает».
- **Исправление:** не синхронизировать ПЛ в статусах `issued`/`closed` (только понижение по явному отзыву, см. BE-04); отклонять осмотр с `tripId` рейса не в pre-trip-статусах.
- **Статус:** CONFIRMED

### [P2] BE-16 — Двойное бронирование ТС и водителя при назначении рейса
- **Где:** `apps/api/src/modules/trips/service.ts:714` (статус ТС проверяется до tx), `:937-960` (в tx блокируется только рейс); проверки занятости водителя нет совсем
- **Что:** два диспетчера параллельно назначают одно ТС на разные рейсы — оба видят `available`, оба коммитят. Водитель может быть назначен на любое число одновременно активных рейсов: статуса занятости у водителя нет, и пересечение по времени не проверяется.
- **Исправление:** в tx делать `SELECT … FOR UPDATE` по vehicle и перепроверять `available`; проверять отсутствие у водителя активных рейсов (`status ∈ assigned…in_transit`) с пересечением по плановому окну.
- **Статус:** CONFIRMED

### [P2] BE-17 — Возврат оригиналов не связан с биллингом; рейс можно перевести в `billed` без счёта
- **Где:** `apps/api/src/modules/documents/routes.ts:166-243` (PUT `received` не трогает `trips.originalDocumentsReceived`), `apps/api/src/modules/finance/finance.service.ts:174`; `apps/api/src/modules/trips/routes.ts:446-477` + `packages/shared/src/enums.ts:397`
- **Что:** ручной биллинг требует `trips.originalDocumentsReceived=true`, но реестр возврата документов этот флаг не выставляет (его ставит только тело `/status` или `operations/trip-change`). `POST /trips/:id/status {status:'billed'}` разрешён FSM из `completed`: рейс помечается выставленным без счёта и выпадает из всех генераторов, которые фильтруют `completed`.
- **Исправление:** при `received` всех обязательных оригиналов выставлять флаг в той же tx; переход в `billed` — только из биллинга (убрать из публичного `/status`).
- **Статус:** CONFIRMED

### [P2] BE-18 — Повторная привязка лота плодит точки маршрута; лот обходит FSM заявки и статус рейса
- **Где:** `apps/api/src/modules/operational-core/write-service.ts:148-252` (точки 206-226, upsert 228-242, заявка 246-250)
- **Что:** при повторном `assignLotToTrip` той же пары `(trip, lot)` срабатывает `onConflictDoUpdate`, но погрузочная и разгрузочная точки вставляются заново, а ссылки в assignment не обновляются. Старые `pending`-точки остаются → `changeTripStatus(completed)` падает с «Не все точки маршрута пройдены», а `extraPointsCost` растёт. Если `!order.tripId`, статус заявки ставится в `assigned` из любого состояния (`draft`/`cancelled`); статус рейса не проверяется (можно привязать к `completed`/`billed`).
- **Исправление:** при конфликте переиспользовать или обновлять существующие точки; проверять `canTransitionOrder` и статус рейса (только pre-loading).
- **Статус:** CONFIRMED

### [P2] BE-19 — Отменённые заявки тарифицируются; заявку можно править после доставки и выставления счёта
- **Где:** `apps/api/src/modules/finance/tarification.service.ts:119-135` (все `tripOrders` без фильтра статуса); `apps/api/src/modules/orders/service.ts:475-532` (`updateOrder` без статус-гейта), `:534-590` (ASSIGNED → CANCELLED не отвязывает заявку от рейса)
- **Что:** заявка, отменённая клиентом после назначения, остаётся в `trip_orders`, и её вес попадает в тариф `per_ton`. `updateOrder` позволяет менять вес, договор и `customerPrice` у `delivered`/выставленных заявок — следующий пересчёт тарифа или маржи даст другие суммы, чем в выпущенном документе.
- **Исправление:** исключать `cancelled` из тарификации и отвязывать заявку при отмене; запретить правку коммерческих и грузовых полей после `in_transit`/выставления (только через корректировку).
- **Статус:** CONFIRMED

### [P2] BE-20 — Экспорт в 1С и KPI включают черновики и отменённые счета; маржа KPI на заглушке
- **Где:** `apps/api/src/modules/finance/finance.service.ts:460-504` (JSON 1С: тип «РеализацияУслуг», без фильтра и без статуса), `:781-848` (CommerceML без фильтра), `:346-353` (выручка KPI), `:427-428` (`BASE_OPERATIONAL_COST || 100000`)
- **Что:** выгрузка в 1С отдаёт `draft` и `cancelled` как реализацию — завышение выручки и НДС в учёте, если бухгалтер не фильтрует вручную. Выручка KPI (и copilot `get_monthly_margin`) включает черновики и отменённые счета; в себестоимость добавляется константа 100 000 ₽ на любой период.
- **Исправление:** экспортировать и считать только `issued/paid_partial/paid_full` (и `corrected` с корректировками); заглушку себестоимости убрать или явно маркировать в UI как оценку.
- **Статус:** CONFIRMED

### [P2] BE-21 — РТО: ложные «недельные» нарушения, нет нормы 90 ч за 2 недели, несогласованные пороги
- **Где:** `apps/api/src/modules/rto/service.ts:62-135` (сумма за весь запрошенный период сравнивается с 56 ч), `apps/api/src/modules/trips/state.ts:271-300` и `trips/service.ts:828-870` (10 ч против 9 ч в rto; «сегодня» = `setHours(0)` по UTC сервера)
- **Что:** `getDriverHoursSummary` за окно 30 дней почти всегда выдаёт `weekly_limit_exceeded`. Норма Приказа Минтранса №424 «90 ч за 2 недели» и допустимое продление до 10 ч дважды в неделю не реализованы. При назначении все нарушения РТО только soft. Начало дня считается по UTC, поэтому запись тахографа за МСК-сутки может не попасть в «сегодня».
- **Исправление:** скользящие 7/14-дневные окна внутри периода; единые константы в `@tms/shared`; МСК-сутки; настройка «hard-блок при превышении».
- **Статус:** CONFIRMED (нормативная часть — на подтверждение у Jurist)

### [P2] BE-22 — Импорт водителей подставляет выдуманные данные допуска
- **Где:** `apps/api/src/modules/import/routes.ts:196-203`
- **Что:** если поля пустые: `licenseExpiry = 2027-01-01`, `birthDate = 1990-01-01`, `licenseCategories = ['B','C']`. Проверки назначения (`LICENSE_EXPIRED`, категория) проходят на фиктивных данных.
- **Сценарий:** импортирован водитель без срока ВУ (на деле просрочено) → назначается на грузовой рейс без hard-блока.
- **Исправление:** без значения сохранять NULL и трактовать NULL как hard-блок «данные ВУ не заполнены».
- **Статус:** CONFIRMED

### [P2] BE-23 — Copilot отдаёт финансы ролям без финансового доступа
- **Где:** `packages/shared/src/copilot.ts:65-75`, `apps/api/src/modules/copilot/tools/index.ts:273-292, 362-425`
- **Что:** `dispatcher`/`logist` имеют доступ к copilot, а инструменты `compute_trip_cost` (тариф, себестоимость, маржа), `list_pending_invoices` и `get_monthly_margin` не проверяют роль. REST при этом прячет `customerPrice` от тех же ролей (K3). Инструменты только читают — запись без прав невозможна, но это обход K3 через ИИ.
- **Исправление:** проверять роль внутри handler'ов финансовых инструментов (либо фильтровать список tools по ролям).
- **Статус:** CONFIRMED (пересечение с ролью Security)

### [P2] BE-24 — Cold-chain: при несовместимых диапазонах лотов мониторинг молча отключается; инцидент на каждый замер
- **Где:** `apps/api/src/modules/cold-chain/service.ts:95-102` (несовместимые диапазоны → границы `{null,null}`), `:179-200` (инцидент на каждый замер с нарушением)
- **Что:** у рейса с лотами [2..8] и [-18..-15] замеры без `orderId` никогда не считаются нарушением — перегрев рефрижератора не детектится. Датчик, опрашиваемый раз в минуту, за 2 часа отклонения создаёт около 120 инцидентов. Дедупликации ретраев по `(sensorId, recordedAt)` нет.
- **Исправление:** при несовместимых лотах требовать `orderId`/`sensorId` → лот (отказ или предупреждение), а назначение несовместимых лотов блокировать; агрегировать нарушения в одно открытое событие на эпизод; UNIQUE по `(sensor_id, recorded_at)`.
- **Статус:** CONFIRMED (первая часть — осознанное, но опасное решение прошлого фикса)

### [P2] BE-25 — Обработка возврата: частичный или старый возврат отменяет текущую подписку; сам возврат не верифицируется
- **Где:** `apps/api/src/modules/billing/routes.ts:271-298`, `apps/api/src/modules/billing/service.ts:452-470`
- **Что:** для `refund.succeeded` делается re-query платежа, но статус принудительно ставится `refunded`. Ни факт, ни сумма возврата не проверяются (`refunded_amount`/GET `/refunds/{id}`). Частичный возврат 100 ₽ или возврат прошлогоднего платежа переводит текущую подписку в `cancelled`. Подделанный webhook с известным `payment_id` проходит re-query (платёж существует).
- **Исправление:** проверять возврат через API `/refunds/{object.id}`, учитывать сумму; отменять подписку, только если возвращён платёж текущего периода целиком.
- **Статус:** PLAUSIBLE (подделка требует знания `payment_id`)

### [P2] BE-26 — Маржа рейса складывает разные валюты и смешивает цены с НДС и без
- **Где:** `apps/api/src/modules/trips/margin.ts:57-87`
- **Что:** `revenue += price` по всем заявкам независимо от `customerPriceCurrency` (валюта — первой заявки) и от `customerPriceIncludesVat`; себестоимость при этом нетто. Сценарий: 1 000 USD + 50 000 RUB → выручка «51 000 USD».
- **Исправление:** группировать по валюте (или конвертировать по курсу на дату), приводить к нетто.
- **Статус:** CONFIRMED

### [P3] BE-27 — Даты и таймзоны: год в номерах документов, дедлайн в уведомлении, окно воркера
- **Где:** `new Date().getFullYear()` — `trips/service.ts:38`, `orders/service.ts:36`, `finance/invoice-workflow.service.ts:101`, `finance/finance.service.ts:126`, `waybills/service.ts:203`; `sync/service.ts:203` (`deadline.toLocaleString('ru-RU')` без `timeZone`); `integrations/workers/billing.worker.ts:27-30` (UTC-сутки); `packages/shared/src/billing.ts:157-159` (UTC-месяц)
- **Что:** документы, созданные 1 января с 00:00 до 03:00 МСК, получают прошлый год в номере. Водитель и подписант видят дедлайн подписи Т2 по UTC (на 3 часа раньше МСК). Период usage/billing начинается по UTC.
- **Исправление:** единый helper «МСК-дата/год» из `@tms/shared`; `toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })`.
- **Статус:** CONFIRMED

### [P3] BE-28 — Продление подписки обнуляет остаток периода; брошенная оплата ставит активной подписке `past_due`
- **Где:** `apps/api/src/modules/billing/service.ts:359-377, 434-449`
- **Что:** новый период = `paidAt + 30d`, а не `max(currentPeriodEnd, paidAt) + 30d` — досрочное продление съедает оплаченные дни. `canceled` (пользователь закрыл страницу апгрейда) переводит оплаченную `active`-подписку в `past_due`, и MRR в админке её не считает.
- **Исправление:** продлевать от `currentPeriodEnd`; при отменённом апгрейде не менять статус активной подписки.
- **Статус:** CONFIRMED

### [P3] BE-29 — Тариф: `cancellationFee` всегда «truthy», минималка применяется к отменённым рейсам
- **Где:** `apps/api/src/modules/finance/tarification.service.ts:369-391`
- **Что:** `numeric` приходит строкой `"0.00"`, которая truthy → запасной вариант «30 % от базы» никогда не срабатывает. Затем `minTripCost` поднимает сумму у отменённого рейса без ТС (0 → минималка).
- **Исправление:** `num(tariff.cancellationFee)`; не применять `minTripCost` к `cancelled`.
- **Статус:** CONFIRMED

### [P3] BE-30 — Отмена рейса «воскрешает» отменённые заявки; привязка заявки к рейсу без проверки статуса рейса
- **Где:** `apps/api/src/modules/trips/service.ts:366-371`; `apps/api/src/modules/orders/service.ts:651-705`
- **Что:** при `CANCELLED` рейса все связанные заявки получают `confirmed`, включая уже `cancelled`. `assignOrderToTrip` не проверяет статус рейса (`in_transit`/`completed`/`billed`/`cancelled`) и не блокирует строки.
- **Статус:** CONFIRMED

### [P3] BE-31 — Тело `/trips/:id/status` не валидируется, хотя влияет на одометр и тариф
- **Где:** `apps/api/src/modules/trips/routes.ts:453-477`, `apps/api/src/modules/trips/service.ts:1083-1093, 1172-1176`
- **Что:** `odometerEnd`, `actualDistanceKm`, `originalDocumentsReceived` пишутся без Zod-схемы и монотонности: одометр ТС можно уменьшить, `actualDistanceKm` (база `per_km`) — задать произвольно (роли с `manage Trip`).
- **Исправление:** Zod-схема и `validateOdometerReadings` для перехода `completed`.
- **Статус:** CONFIRMED

### [P3] BE-32 — Уведомление «подписать ЭТрН» уходит неактивным пользователям; дедлайн по часам устройства
- **Где:** `apps/api/src/modules/notifications/app-notifications.service.ts:24-36`; `apps/api/src/modules/sync/service.ts:189-215`
- **Что:** в адресатах нет фильтра `users.isActive`. Дедлайн и `completedAt` точки берутся из `offlineTimestamp` устройства — сбитые часы на телефоне сдвигают и дедлайн, и тарифицируемый простой (`idleCost` по `arrivedAt/completedAt`).
- **Статус:** CONFIRMED

### [P3] BE-33 — ОФД-фискализация — сетевой вызов внутри транзакции webhook'а с `FOR UPDATE`
- **Где:** `apps/api/src/modules/billing/service.ts:386-429`
- **Что:** `ofd.fiscalize()` выполняется внутри `db.transaction`, удерживая блокировку платежа и соединение пула на время внешнего HTTP. При таймауте ОФД ретраи ЮKassa встают в очередь на блокировке.
- **Исправление:** фискализировать после COMMIT (outbox или очередь) с идемпотентным ключом `paymentId`.
- **Статус:** CONFIRMED

## Рекомендации / Next Actions

1. **(BE-01)** Починить `getBusinessDayBounds` (фиксированный UTC+3), добавить тест под `TZ=UTC` и явно задать `TZ` в Dockerfile. Это быстрая правка, которая разблокирует ранний выпуск на линию.
2. **(BE-04, BE-15)** Допуск к выпуску — по последнему осмотру. Rejected (создание или flip) отзывает ПЛ и рейс до `in_transit`; sync не трогает `issued/closed`.
3. **(BE-02, BE-03, BE-12)** Свести биллинг к одному генератору счетов: payee-организация, per-org серия, исключение уже выставленных рейсов, `UNIQUE(invoice_trips.trip_id)` для активных счетов, освобождение рейсов при отмене.
4. **(BE-05, BE-19, BE-18)** Тарифицировать по фактически назначенным лотам и неотменённым заявкам; при повторной привязке лота не плодить точки.
5. **(BE-06, BE-07)** Включить проверку статуса и срока подписки в `getActiveSubscription`, добавить cron истечения, вызывать `recordUsage` или считать фактические `count(*)`, trial стартовать без смены плана. Сделать до `ALLOW_ONLINE_PAYMENTS=true`.
6. **(BE-08, BE-09)** Таблица `invoice_payments` с уникальностью по ссылке платежа, деньги в копейках (integer), НДС с округлением построчно.
7. **(BE-10, BE-11, BE-13, BE-14)** НДС через `resolveVatRate` везде (тариф, допуслуги, «не-НДС» типы); валидация КСФ/ИСФ с переносом оплаты; допуслуги как строки документа.
8. **(BE-16)** Блокировка ТС и проверка занятости водителя при назначении.
9. **(BE-17, BE-20)** Связать возврат оригиналов с флагом биллинга; экспорт в 1С и KPI — только по выпущенным документам.
10. **(BE-21–BE-26)** РТО-окна и нормы, NULL вместо выдуманных значений при импорте, ролевой фильтр финансовых copilot-инструментов, эпизоды cold-chain, верификация возвратов, валюта в марже.
11. Добавить интеграционные тесты сквозного потока на 3 сценария: «рейс завершён → автосчёт → ручная генерация» (двойной счёт), «осмотр 04:30 МСК под `TZ=UTC`», «оплата 50 000,10 + 50 000,20».

## Открытые вопросы к другим ролям

- **Jurist / ЭТрН-ЭПД:** BE-03 — нарушение уникальности нумерации счетов внутри одного налогоплательщика (п.1 ст.169 НК); BE-14 — выставление НДС УСН-организацией через тип `payment` и авансовый СФ без НДС-логики; BE-21 — подтвердить нормы Приказа №424 (9/10 ч в сутки, 56 ч в неделю, 90 ч за 2 недели); BE-04 — правовые последствия «выпущенного» ПЛ с отклонённым осмотром.
- **Security:** BE-23 (обход K3 через copilot), BE-25 (подделка refund-webhook при известном `payment_id`), импорт водителей с `orgId=null` (`import/routes.ts:144`, в отличие от vehicles/contractors).
- **DevOps/SRE:** BE-01 — подтвердить фактический `TZ` в production-контейнере и добавить `TZ=UTC` (или `Europe/Moscow`) явно; воркер `billing.daily` работает по UTC-суткам.
- **Product/PM:** BE-06 — что делать с подпиской после истечения trial (деградация до free или блокировка); BE-24 — допускаются ли рейсы с несовместимыми температурными лотами (мультикамерный рефрижератор?).
