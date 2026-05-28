# Полный аудит кодовой базы — 2026-05-28

Метод: 7 параллельных глубоких аудит-агентов (security/auth, multitenancy/data/migrations,
finance/tax, ЭТрН/ЭПД-compliance, providers/workers/resilience, web+mobile, infra/build/test).
Все находки проверены по реальному коду; CONFIRMED если подтверждено чтением, SUSPECTED иначе.

**Важный контекст:** многие P0 — в недавнем W4-коде (T-16 invoice migration, субподряд-гейты),
часть уже в проде (`93f4ada`/`7e63fcd`). Это не легаси — это свежие регрессии.

---

## 🔴 P0 — критично (безопасность / закон / прод-пайплайн). Чинить в первую очередь.

### S1. Cross-tenant IDOR на invoice-workflow — чужие счета можно платить/отменять/корректировать
`apps/api/src/modules/finance/invoice-workflow.service.ts` — `getInvoiceWithOrgRegime(invoiceId)` (:47) грузит счёт `WHERE id=` БЕЗ org-фильтра; `issueDraftInvoice`(:178), `createCorrection`(:437), `registerPayment`(:540), `cancelInvoice`(:594) получают `author.organizationId`, но НЕ сравнивают. Роуты (routes.ts:325/346/371/cancel) только `requireAbility('manage','Invoice')`.
**Эксплойт:** юзер орг A с правом manage Invoice шлёт `POST /finance/invoices/{UUID орг B}/register-payment|cancel|corrections` → мутирует юр-документы чужого тенанта. Легаси `/status` это проверял (`ensureInvoiceAccess`), новый workflow — нет. **Регрессия T-16.**
**Fix:** в каждой функции сравнить `invoice.payeeOrganizationId`/payer-org с `author.organizationId` → 403; `createDraftInvoice` тоже валидировать payerId/payeeId на принадлежность орг.

### S2. Cross-tenant утечка уведомлений — каждый Telegram-подписчик получает события ВСЕХ орг
`apps/api/src/integrations/workers/notification.worker.ts:46-48` — select всех подписок без org-фильтра; `db/schema.ts:1128` — у `notification_subscriptions` нет `organization_id`; подписка через неваладированный `/start <userId>`.
**Эксплойт:** `invoice.created` (номер+₽), `order.created` (маршрут) орг A уходят всем чатам бота во всех тенантах.
**Fix:** добавить `organization_id` (бинд при /start), прокинуть в job, фильтровать в воркере.

### S3. Cross-tenant утечка через AI-copilot by-id tools
`apps/api/src/modules/copilot/tools/index.ts` — `get_trip_details`(:136), `get_driver_hos_status`(:151), `compute_trip_cost`(:243), `propose_reassignment`(:263) грузят по id без org-проверки (list-tools — scoped, by-id — нет). `tarificationService.calculateTripCost` вообще без org-параметра (также роут `GET /finance/trips/:id/cost`).
**Fix:** прокинуть `ctx.organizationId` в каждый by-id handler + фильтр в сервисе.

### F1. Нулевой НДС на ВСЕХ выпущенных через UI СФ/УПД — юридически недействительные налоговые документы
`invoice-workflow.service.ts:230-232` считает `vatAmount = Σ(allocatedVat ?? 0)`, а UI `InvoiceWorkflowActions.tsx:133` шлёт строки только `{orderId, allocatedAmount}` — `allocatedVat` НЕ передаётся, `vatRate`/`includesVat` уровня счёта не используются для расчёта. Итог: каждый СФ/УПД сохраняется с `vatAmount=0`, `subtotal=total`, при `vatRate=20`. PDF/УПД/1С-экспорт берут vatAmount=0. **Регрессия T-16. ФНС-риск №1.**
**Fix:** считать НДС в `issueDraftInvoice` из vatRate/includesVat (как `tarification.service.ts:375`) когда allocatedVat отсутствует.

### INFRA1. Drizzle journal заморожен на 0028 → CI-гейты и `drizzle-kit migrate` применяют устаревшую схему
`apps/api/drizzle/meta/_journal.json` (до idx27/0028) vs файлы 0029–0037 на диске (mchd, cascade→restrict, tax_regime, **0036 invoice rebuild**, fk-indexes). **Прод НЕ ломается** (его `scripts/deploy.sh` использует кастомный раннер по `ls *.sql`), но `.github/workflows/p0-gate.yml:188,297` (playwright + smoke-chain, «блокирующие merge») и `pnpm db:migrate` у разработчиков читают журнал → применяют только 0001-0028 → seed-demo падает на mchd/invoices. Эту же ошибку команда **уже чинила** (`06abc73`) и она регрессировала.
**Fix:** дописать журнал для 0029-0037 + CI-проверка `entries == count(*.sql)`; либо выпилить drizzle-kit migrate из CI/доков.

### C1. Генератор T01 ЭТрН выдаёт битый корневой тег `<СвТранworthy>`
`apps/api/src/modules/waybills/etrn-generator.ts:143,183` — мозаика `СвТран`+`worthy`, такого элемента нет ни в одной XSD ФНС (973_01). T01 — базовый титул всей цепочки → любой ГИС ЭПД/ЭДО отклонит. Отдаётся сырым через `GET /waybills/:id/etrn` без XSD-гейта. Теста на T01 нет.
**Fix:** заменить на корректный элемент ФНС (как `etrn-titles-generator.ts`), прогнать через `assertValidETrNPayload`, добавить T01-фикстуру.

### C2+C3 (compliance). Субподряд-гейты не герметичны + личность перевозчика — глобальный env
- **C2/H1:** `execution_mode='subcontract'` проверяется ТОЛЬКО в `generateWaybill`(service.ts:470) и `sign-endpoint`(:193). Минуют гейт: `recordTransportDocumentSignature` (trips/routes.ts:974 — пишет подпись ЭТрН без МЧД/роли/субподряд-проверки, `signerRole` — свободный текст!), EDI-progression (edi/service.ts:121), `updatePersistedTransportDocumentStatus`. **Fix:** единый `assertEtrnAllowed(tripId)` во ВСЕХ мутациях ЭТрН.
- **C3:** `waybills/routes.ts:511` берёт `carrierName/Inn` из `process.env.CARRIER_*` (fallback ИНН `0000000000`) — в мульти-тенанте каждый ЭТрН заявляет одного и того же/нулевого перевозчика. **Fix:** реквизиты из организации рейса, блокировать выпуск без ИНН.

---

## 🟠 P1 — высокий (ломает функции / корректность денег / безопасность-эксплуатация)

### Finance UI — сломанные действия (T-16, в проде):
- **C4/web-P0-3:** cancel шлёт `{reason}`, схема ждёт `{cancellationReason}` → 422 всегда. (`InvoiceWorkflowActions.tsx:210`)
- **C3/web-P0-1:** bulk «Отметить оплаченными» шлёт `status:'paid'` — нет в enum → падает каждый. (`finance/page.tsx:613`)
- **web-P0-2:** bulk «Удалить» → `DELETE /finance/invoices/:id` не существует → 404. (`page.tsx:638`)
- **web-P1-4:** register-payment теряет `paidAt`/`paymentRef` (схема ждёт `paymentDate`/`paymentReference`) → дата и платёжка не сохраняются. (`InvoiceWorkflowActions.tsx:176`)
- **finance-C2:** легаси `PUT /finance/invoices/:id/status` (finance.service.ts:228) пишет статус сырым `as any` без FSM/проверок — можно draft→paid_full, un-issue выпущенного, отмена оплаченного СФ.
- **web-P1-6:** `print/invoice/[id]` хардкодит «НДС 20%» и заголовок «СЧЁТ НА ОПЛАТУ» для всех типов → СФ/УПД печатается как счёт с неверным НДС.
- **web-P1-5:** клиентский портал ищет счёт по `orderIds` (API отдаёт `tripIds`) → счёт у заказчика никогда не виден.

### Finance correctness:
- **H3:** vatRate не валидируется против `allowedVatRates(regime)` — OSNO может выпустить СФ под 5/7%, любой rate. (invoice-workflow.service.ts:223)
- **H1:** двойная корректировка (несколько КСФ) разрешена на API (UI-гейт `!hasCorrections` есть, в `createCorrection` — нет); легаси `invoiceAdjustments` на issued-счёт → 500 от immutability-триггера.
- **H2:** статус `corrected` никогда не выставляется — КСФ оставляет оригинал `issued`.
- **H4:** два механизма оплаты (`registerPayment` колонка vs `recordPartialPayment` сумма событий) рассинхронят `paidAmount`; нет защиты от переплаты.
- **H5:** генерация номера счёта без транзакции/FOR UPDATE (гонка, дубли); лексическая сортировка ломается после 99999.

### Multitenancy / data:
- **B-P1-2:** payment-webhook (`billing/service.ts:242`) — dedupe TOCTOU + не в транзакции → двойное продление подписки на retry.
- **B-P1-4:** lot-assignment capacity TOCTOU (`operational-core/write-service.ts:114`) — over-assignment сверх вместимости.
- **settings cost-model глобальный** (settings/service.ts:79) — tenant-admin перезаписывает топливо/зарплату для всех орг (ключ без organizationId).

### Security / providers / infra:
- **SEC-P1:** Fastify без `trustProxy` (server.ts) → `request.ip` = IP nginx для всех → rate-limit (5/min логин) — глобальный бакет, brute-force/lockout. **Fix:** `trustProxy: true`.
- **PROV-P0-2/P0-3:** реальные провайдеры (yookassa/wialon/diadoc/…) — заглушки, но `healthCheck` ok + `mode='production'`; credential-test всегда падает и ставит row в `error`. Go-live капкан.
- **PROV-P1-1:** нет таймаутов на реальный outbound (email/telegram `fetch`) — зависший SMTP вешает signup-запрос. `httpFetch` с таймаутом есть, но не используется.
- **PROV-P1-7:** mock-роуты интеграций (`/integrations/wialon-mock`, dadata, fuel) доступны в проде, без org-scope.
- **INFRA-P1-1:** два `deploy.sh`; корневой бьёт по СТАРОМУ IP `5.42.102.58` + пишет `BASE_OPERATIONAL_COST=100000` (×200 vs 500). **Fix:** удалить корневой.
- **INFRA-P1-2:** миграции не обёрнуты в BEGIN/COMMIT (5 из 37) — частичное применение при сбое.
- **INFRA-P1-3:** `@tms/shared` без тест-раннера — invoice-FSM не гоняется в CI.
- **INFRA-P1-4:** `/api/health/ready` отдаёт 200 даже при degraded (БД down) → LB шлёт трафик на мёртвый инстанс.
- **COMPL-H2:** Госключ-callback при отсутствии `mchdId` всё равно ставит `signed` (нет МЧД = валидно). ЭТрН без МЧД с 01.09 — юр-ничтожен.
- **SEC-P2:** анонимный signature перезаписывает passwordHash/орг неподтверждённого аккаунта (известно, TODO P0-3).

---

## 🟡 P2 — средний (отложить на после демо/P0)

- JWT 24ч без revocation (деактивация юзера живёт до суток) — known tradeoff.
- `sign-endpoint` без role-гейта (org-scope есть) — любой член орг инициирует подпись.
- compliance: XSD-валидация — поверхностный tag-presence, реальные XSD не в репо (`D:\Ai\TMS\…`); МЧД scope — substring-match; `subcontract-legal-analysis.md` отсутствует, но код на него ссылается в user-facing ошибках.
- web middleware RBAC: `/kpi`,`/analytics`,`/import`,`/claims`,`/drivers`,`/fleet`,`/waybills` не в `routeRoles` → доступны любому залогиненному (API-гейт должен ловить, но страницы открываются).
- client-портал status-map и print используют старый enum → сырой статус виден заказчику.
- `as any` ×73 в 28 файлах; 2 — в money-пути (finance.service.ts:230/501). `noUnusedLocals` выключен везде.
- `/metrics` без auth если env не задан; Swagger открыт при NODE_ENV≠production.
- `.env.example` содержит реальные ИНН/р-счёт ИП Бардин (не секрет, но в шаблоне/клиентском бандле).
- events.external_id unique-индекс глобальный, не per-org (теоретический cross-tenant idempotency-collision).
- margin.ts: смешение валют без FX; costCurrency репортится как carrierCostCurrency даже если стоимость из subcontractorCost.
- markdown `<a href>` без whitelist схем (latent XSS, источники сейчас серверные).
- wialon worker: реальный адаптер всё равно пишет mock-одометр с `source:'mock'`.
- 5-дневный срок СФ: floor по UTC-суткам (±1 день у полуночи/DST), считать в Europe/Moscow.
- 6 skipped gosklyuch-тестов; finance.integration 5 fails (старый enum).

---

## Что хорошо (чтобы не переусердствовать)
Auth-примитивы (bcrypt12, CSPRNG, fail-fast секретов, AES-256-GCM, pino-redact, enumeration-safe), HMAC ЮKassa/Госключ + replay-dedupe, T-7 RBAC-sweep реально полный, org-scope в orders/fleet/guards/waybills, транзакции+FOR UPDATE в waybills/operational-core, BullMQ (cron-dedupe, idempotency, Redis-down degradation), compose-hardening (non-root, mem-limits, healthchecks, required-var guards), backup-скрипт + DR-drill, graceful shutdown. DB-триггеры invoice (immutability/history/sum-check) корректны.

## Сводка
| Severity | Кол-во | Тема |
|---|---|---|
| P0 | 8 | cross-tenant IDOR счетов, утечка уведомлений, copilot-leak, zero-VAT СФ, journal-drift, T01 битый, субподряд-гейты дырявые, carrier=env |
| P1 | ~20 | сломанные finance-UI действия, finance-correctness, TOCTOU, trustProxy, provider go-live капканы, deploy/infra |
| P2 | ~20 | JWT-revocation, XSD-заглушка, middleware-RBAC, as-any, метрики, env-PII, и пр. |

**Вывод:** ядро архитектуры и auth — крепкие, но **свежий W4 finance/ЭТрН-слой содержит серьёзные регрессии, часть в проде прямо сейчас**: cross-tenant запись счетов (S1) и нулевой НДС (F1) — это безопасность + закон, не косметика. Для демо-цели большинство P0/P1 невидимы зрителю, НО S1/S2/S3 (утечки) и F1 (нулевой НДС) — реальный риск, если демо на реальных данных или с >1 тенантом. Рекомендация: закрыть 8×P0 ближайшим спринтом до любого пилота; finance-UI P1 (сломанные кнопки) — до демо финансов.
