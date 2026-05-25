# Invoice Spec Acceptance — M (Этап 3 backend foundation)

**Дата:** 25 мая 2026
**Коммит:** (заполнить после push)
**Реализатор:** TransPult
**Покрытие spec:** invoice-spec.md §1-5, §8 (частично), §10 (foundation)

## Что закрыто

### Spec §1 — invoice_type ENUM (7 значений)
- ✅ Postgres enum `invoice_type` с 7 значениями (payment / advance / sf / upd / corrective_sf / corrective_upd / act)
- ✅ Postgres enum `invoice_correction_kind` (adjustment / replacement)
- ✅ Drizzle schema + Zod (`InvoiceTypeEnum` в @tms/shared)
- ✅ Unit tests pass (18 тестов)

### Spec §2 — FSM invoice_status (расширенный)
- ✅ Новый enum `invoice_status` (draft / issued / paid_partial / paid_full / cancelled / corrected)
- ✅ Backfill старого enum: sent→issued, paid→paid_full, overdue→issued
- ✅ Helper `canTransitionInvoice(ctx)` с матрицей spec §2
- ✅ Запрет cancelled→*, paid_full→paid_partial, paid SF→cancelled

### Spec §3 — Обязательные поля по статусам
- ✅ Поля: payer_id, payee_id, payee_organization_id, basis_text, vat_rate, includes_vat, currency, issued_at, paid_amount, correction_kind, related_invoice_id, correction_reason, has_corrections, cancellation_reason
- ✅ CHECK constraint `invoices_correction_kind_consistency` (corrective_* требуют correction_kind + related_invoice_id + correction_reason)
- ✅ Service-валидация basis_text при issue
- ✅ Junction `invoice_orders` с `allocated_amount`

### Spec §4 — Tax_regime rules
- ✅ Helper `canIssueInvoiceType(taxRegime, invoiceType)`
- ✅ Enforcement: unspecified → блок всех типов
- ✅ Enforcement: usn_income/ausn/patent/npd → нельзя sf/upd
- ✅ defaultIncludesVat от tax_regime
- ✅ allowedVatRates от tax_regime

### Spec §5 — КСФ vs ИСФ
- ✅ Service `createCorrection` различает adjustment/replacement
- ✅ Replacement → исходный cancelled с reason='replaced_by:<id>'
- ✅ Adjustment → исходный issued + has_corrections=true
- ✅ Подпись basis_text автогенерируется как «Корректировка к <num> от <date>: <reason>»

### Spec §8 — Аудит и неизменяемость
- ✅ DB-trigger `invoice_check_immutable_fields` запрещает UPDATE финансовых полей после issued
- ✅ DB-trigger `invoice_history_capture` auto-fill на INSERT/UPDATE invoices
- ✅ DEFERRED CHECK trigger `check_invoice_orders_sum` (Σ allocated = total)
- ✅ Table `invoice_history` для audit-trail

### Spec §10 — Acceptance criteria

| # | Критерий | Статус |
|---|---|---|
| 1 | Enum invoice_type 7 значений | ✅ |
| 2 | correction_kind поле | ✅ |
| 3 | FSM с матрицей переходов | ✅ |
| 4 | Junction invoice_orders + Σ CHECK | ✅ (DEFERRED trigger) |
| 5 | related_invoice_id FK | ✅ |
| 6 | basis_text NOT NULL при issued | ✅ (service-валидация + future trigger) |
| 7 | Backfill invoice_trips → invoice_orders | ✅ (миграция 0036, prod 0 invoices, local 6 backfill'нуто) |
| 8 | DB-trigger запрет UPDATE | ✅ (`invoice_check_immutable_fields`) |
| 9 | Auto-trigger invoice_history | ✅ (`invoice_history_capture`) |
| 10 | Tests: FSM/КСФ/ИСФ/RBAC/CHECK/audit | ⚠️ Частично — 18 unit tests на FSM прошли; полный E2E цикл требует org-setup |

## Что НЕ закрыто (backlog для следующих сессий)

- **UI invoice ↔ orders (Этап 5)** — двусторонняя навигация, отдельная сессия
- **PDF-шаблоны СФ/КСФ/УПД (Этап 6)** — verstaка по приказам ФНС, отдельный sprint
- **§6 5-day warning** на выпуск СФ — placeholder без UI, нужен Desing для админ-дашборда «СФ выпущенные с просрочкой»
- **Multi-currency** — в MVP только RUB (spec §11 «вне рамок»)
- **Возвратные документы** — через corrective_sf с отриц. суммой, отдельный flow (spec §11)
- **Полный E2E smoke под accountant с org+osno** — требует обновления seed-demo (отдельный батч)

## Подпись Jurist'а

_Этот документ создан TransPult'ом по реализации._
_Перед мерджем в main / прод требуется review от Jurist'а._
_Если найдены отклонения от invoice-spec.md — TransPult вносит правки._

| Поле | Значение |
|---|---|
| Дата acceptance | _(дата подписания)_ |
| Хэш коммита | _(SHA коммита, который реализует Этап 3)_ |
| Подпись | _(Jurist)_ |
| Замечания | _(если есть)_ |
