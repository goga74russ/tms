// ============================================================
// M6 (Этап 3) — Invoice workflow service per invoice-spec.md.
//
// Реализует:
//   • createDraftInvoice — пустой draft с invoice_type, payer/payee
//   • issueDraftInvoice — draft → issued: basis_text, invoice_orders[],
//                        VAT rules от tax_regime, 5-day warning per spec §6
//   • createCorrection — выпуск КСФ/ИСФ per spec §5
//   • registerPayment — issued/paid_partial → paid_full (через FSM)
//   • cancelInvoice — issued → cancelled (с проверкой VAT rules)
//
// FSM-проверки — через canTransitionInvoice() из @tms/shared.
// Tax-regime проверки — через canIssueInvoiceType().
//
// invoice_history audit-trail заполняется автоматически DB-trigger'ом
// (invoice_history_capture), не application-слоем.
// CHECK Σ allocated_amount = total — DEFERRED trigger на БД.
// ============================================================
import { db } from '../../db/connection.js';
import { invoices, invoiceOrders, invoiceHistory, organizations, orders, trips, events, contractors } from '../../db/schema.js';
import { eq, and, sql, inArray, gte, lte, ne, isNotNull, desc } from 'drizzle-orm';
import {
    canTransitionInvoice,
    canIssueInvoiceType,
    allowedVatRates,
    checkSfIssueDeadline,
    FIVE_DAY_DEADLINE_TYPES,
    type InvoiceType,
    type InvoiceCorrectionKind,
    type TaxRegime,
} from '@tms/shared';
import { recordEvent } from '../../events/journal.js';
import { isPlatformSuperAdmin } from '../../auth/guards.js';

export interface Author {
    userId: string;
    role: string;
    organizationId?: string | null;
}

function num(v: unknown): number {
    return typeof v === 'number' ? v : Number(v ?? 0);
}

// ============================================================
// Helpers
// ============================================================

async function getInvoiceWithOrgRegime(invoiceId: string, author?: Author) {
    const [row] = await db.select({
        invoice: invoices,
        taxRegime: organizations.taxRegime,
        // P0-S1: владелец счёта = payee-организация ИЛИ организация контрагента-плательщика.
        payerOrgId: contractors.organizationId,
    })
        .from(invoices)
        .leftJoin(organizations, eq(invoices.payeeOrganizationId, organizations.id))
        .leftJoin(contractors, eq(invoices.contractorId, contractors.id))
        .where(eq(invoices.id, invoiceId))
        .limit(1);
    if (!row) return null;

    // P0-S1: cross-tenant guard. Если у actor есть organizationId (не super-admin),
    // он может оперировать только счетами своей орг. Иначе — IDOR (плати/отменяй/
    // корректируй чужие счета по UUID).
    const ownerOrgId = row.invoice.payeeOrganizationId ?? row.payerOrgId ?? null;
    // C3 (механизм «б»): org-less actor не может оперировать счетами — super-admin-роли
    // нет, значит org-less = мисконфиг. Раньше guard ниже пропускал его (`author?.organizationId &&`).
    if (author && !author.organizationId && !isPlatformSuperAdmin(author)) {
        throw new InvoiceWorkflowError('FORBIDDEN', 'Учётная запись не привязана к организации', 403);
    }
    if (author?.organizationId && ownerOrgId && author.organizationId !== ownerOrgId) {
        throw new InvoiceWorkflowError('FORBIDDEN', 'Счёт принадлежит другой организации', 403);
    }
    return { invoice: row.invoice, taxRegime: (row.taxRegime ?? 'unspecified') as TaxRegime };
}

// H5 (P1-C) + #17 (E2): генерация номера счёта — PER-ORG серия.
// ВАЖНО: вызывать ВНУТРИ транзакции (tx) — функция берёт advisory-xact-lock
// по (серия, орг), чтобы конкурентные выпуски одной орг не получили один номер.
// Лок снимается на COMMIT/ROLLBACK, поэтому number-gen и insert — в одной tx.
//
// Серия независима у каждой орг (п.5.1 ст.169 НК — у каждого налогоплательщика
// свой ряд с 1). Уникальность гарантирует composite unique(payee_organization_id,
// number) (миграция 0039). orgId null → глобальная серия (legacy/без орг).
// Тип транзакционного executor'а (db.transaction callback arg).
type InvoiceTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function generateInvoiceNumber(type: InvoiceType, tx: InvoiceTx, orgId?: string | null): Promise<string> {
    // Spec §3 «Нумерация раздельная по invoice_type» (п. 5.1 ст. 169 НК).
    const year = new Date().getFullYear();
    const prefix = {
        payment: `СЧ-${year}-`,
        advance: `АВ-${year}-`,
        sf: `СФ-${year}-`,
        upd: `УПД-${year}-`,
        corrective_sf: `КСФ-${year}-`,
        corrective_upd: `КУПД-${year}-`,
        act: `АКТ-${year}-`,
    }[type];

    // Сериализуем генерацию для серии В ПРЕДЕЛАХ ОРГ (lock живёт до конца tx).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${prefix + '|' + (orgId ?? 'global')})::bigint)`);

    // Числовой максимум суффикса в серии этой орг (не лексический — иначе после
    // 99999 «100000» сортируется ниже «99999»). Берём цифры после последнего '-'.
    const orgFilter = orgId
        ? sql`${invoices.payeeOrganizationId} = ${orgId}`
        : sql`${invoices.payeeOrganizationId} IS NULL`;
    const [row] = await tx.execute<{ maxseq: number | null }>(sql`
        SELECT COALESCE(MAX(CAST(regexp_replace(${invoices.number}, '^.*-', '') AS INTEGER)), 0) AS maxseq
        FROM ${invoices}
        WHERE ${invoices.number} LIKE ${prefix + '%'}
          AND ${orgFilter}
          AND regexp_replace(${invoices.number}, '^.*-', '') ~ '^[0-9]+$'
    `) as unknown as Array<{ maxseq: number | null }>;

    const seq = Number(row?.maxseq ?? 0) + 1;
    return `${prefix}${String(seq).padStart(5, '0')}`;
}

// ============================================================
// 1) createDraftInvoice
// ============================================================
export async function createDraftInvoice(
    input: {
        invoiceType: InvoiceType;
        payerId: string;
        payeeId?: string;
        payeeOrganizationId?: string;
        contractId?: string;
    },
    author: Author,
): Promise<{ id: string; number: string }> {
    // P0-S1: плательщик (контрагент) должен принадлежать организации actor'а —
    // иначе можно создать счёт на чужого контрагента. payeeOrganizationId не
    // доверяем из тела запроса: фиксируем по actor'у.
    if (author.organizationId) {
        const [payer] = await db.select({ id: contractors.id })
            .from(contractors)
            .where(and(eq(contractors.id, input.payerId), eq(contractors.organizationId, author.organizationId)))
            .limit(1);
        if (!payer) {
            throw new InvoiceWorkflowError('FORBIDDEN', 'Контрагент-плательщик не найден в вашей организации', 403);
        }
    }

    // H5 (P1-C): номер + insert в одной транзакции — advisory-lock в
    // generateInvoiceNumber защищает от гонки только в пределах tx.
    const [created] = await db.transaction(async (tx) => {
        const number = await generateInvoiceNumber(input.invoiceType, tx, author.organizationId ?? null);
        return tx.insert(invoices).values({
            number,
            contractorId: input.payerId, // backward compat
            contractId: input.contractId,
            type: input.invoiceType,
            status: 'draft',
            subtotal: 0,
            vatAmount: 0,
            total: 0,
            periodStart: new Date(),
            periodEnd: new Date(),
            payerId: input.payerId,
            payeeId: input.payeeId,
            // P0-S1: payee-орг = всегда орг actor'а (не из тела запроса).
            payeeOrganizationId: author.organizationId ?? null,
        }).returning({ id: invoices.id, number: invoices.number });
    });

    await recordEvent({
        authorId: author.userId,
        authorRole: author.role,
        eventType: 'invoice.draft_created',
        entityType: 'invoice',
        entityId: created.id,
        data: { number: created.number, invoiceType: input.invoiceType },
    });

    return created;
}

// ============================================================
// 2) issueDraftInvoice — draft → issued
// ============================================================
export class InvoiceWorkflowError extends Error {
    constructor(
        public code: string,
        message: string,
        public httpStatus: number = 422,
        /** Доп. payload для клиента (например, детали 5-дневной просрочки). */
        public details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'InvoiceWorkflowError';
    }
}

/**
 * spec §6 — дата реализации для 5-дневного срока выпуска СФ/УПД.
 * СФ привязана к заявкам → MAX(unloading_date) фактической разгрузки.
 * УПД может быть привязан к рейсам → fallback MAX(trips.actual_completion_at).
 * Возвращает null, если ни одну дату определить нельзя (не пугаем ложной просрочкой).
 */
async function resolveRealizationDate(
    orderIds: string[],
    tripIds: string[],
): Promise<Date | null> {
    let max: Date | null = null;
    if (orderIds.length > 0) {
        const rows = await db.select({ unloadingDate: orders.unloadingDate })
            .from(orders)
            .where(inArray(orders.id, orderIds));
        for (const r of rows) {
            if (r.unloadingDate && (!max || r.unloadingDate > max)) max = r.unloadingDate;
        }
    }
    if (!max && tripIds.length > 0) {
        const rows = await db.select({ done: trips.actualCompletionAt })
            .from(trips)
            .where(inArray(trips.id, tripIds));
        for (const r of rows) {
            if (r.done && (!max || r.done > max)) max = r.done;
        }
    }
    return max;
}

export async function issueDraftInvoice(
    invoiceId: string,
    input: {
        basisText: string;
        invoiceOrders: Array<{ orderId: string; allocatedAmount: number; allocatedVat?: number }>;
        vatRate?: number;
        includesVat?: boolean;
        issuedAt?: string;
        /** spec §6 — причина выпуска с просрочкой (>5 дней). Без неё выпуск
         *  просроченного СФ/УПД блокируется soft-warning'ом SF_OVERDUE_WARNING. */
        overdueReason?: string;
    },
    author: Author,
): Promise<{ id: string; number: string; total: number; overdue?: boolean; daysLate?: number }> {
    const ctx = await getInvoiceWithOrgRegime(invoiceId, author);
    if (!ctx) throw new InvoiceWorkflowError('NOT_FOUND', 'Счёт не найден', 404);
    const { invoice, taxRegime } = ctx;

    if (invoice.status !== 'draft') {
        throw new InvoiceWorkflowError('INVALID_STATE', `Только draft можно выпускать. Текущий статус: ${invoice.status}`);
    }

    // spec §4 — tax_regime guard
    const regimeCheck = canIssueInvoiceType(taxRegime, invoice.type as InvoiceType);
    if (!regimeCheck.allowed) {
        throw new InvoiceWorkflowError('TAX_REGIME_MISMATCH', regimeCheck.reason ?? 'tax_regime не разрешает выпуск');
    }

    // FSM check
    const fsmCheck = canTransitionInvoice({
        from: 'draft', to: 'issued',
        invoiceType: invoice.type as InvoiceType,
    });
    if (!fsmCheck.allowed) {
        throw new InvoiceWorkflowError('FSM_BLOCKED', fsmCheck.reason ?? 'FSM не разрешает переход');
    }

    // spec §3 — обязательные поля для issued
    if (!input.basisText || input.basisText.trim().length < 5) {
        throw new InvoiceWorkflowError('BASIS_TEXT_REQUIRED', 'basis_text обязателен (invoice-spec.md §3)');
    }
    if (!input.invoiceOrders || input.invoiceOrders.length === 0) {
        throw new InvoiceWorkflowError('ORDERS_REQUIRED', 'Требуется хотя бы одна связка с заявкой');
    }

    // Для sf/upd — обязательная ставка НДС.
    const isVatDoc = ['sf', 'upd', 'corrective_sf', 'corrective_upd'].includes(invoice.type);
    if (isVatDoc && input.vatRate == null) {
        throw new InvoiceWorkflowError('VAT_RATE_REQUIRED', 'Для СФ/УПД ставка НДС обязательна');
    }
    // H3 (P1-C): ставка НДС должна соответствовать налоговому режиму орг.
    // Без этого ОСНО мог выпустить СФ под 5/7% (ставки УСН-с-НДС) или любую
    // произвольную ставку → неверный НДС в книге продаж/1С-экспорте.
    if (isVatDoc && input.vatRate != null) {
        const allowed = allowedVatRates(taxRegime);
        if (!allowed.includes(input.vatRate)) {
            throw new InvoiceWorkflowError(
                'VAT_RATE_NOT_ALLOWED',
                `Ставка НДС ${input.vatRate}% недопустима для режима ${taxRegime}. Допустимые: ${allowed.length ? allowed.join('/') + '%' : 'нет (режим без НДС)'}`,
            );
        }
    }

    // НДС + суммы. Модель invoice_orders: allocated_amount = GROSS (вкл. НДС),
    // allocated_vat = НДС внутри строки; Σ allocated_amount == invoice.total (DB CHECK).
    // C2 (P0-F1): разводим два режима, раньше обе ветки были ИДЕНТИЧНЫ (баг):
    //  • «НДС в том числе» (includesVat=true): allocatedAmount уже gross, НДС выделяем.
    //  • «НДС сверху» (includesVat=false): allocatedAmount = НЕТТО → начисляем НДС
    //    сверху и ГРОССИМ строку, иначе total<Σ нетто·(1+rate) и недосбор НДС.
    // Строка с явным allocatedVat трактуется как gross (UI прислал готовый разрез).
    const round2 = (x: number) => Math.round(x * 100) / 100;
    const rate = input.vatRate ?? 0;
    const grossUp = !input.includesVat && rate > 0; // «НДС сверху»
    const computedOrders = input.invoiceOrders.map((o) => {
        if (o.allocatedVat != null) {
            return { ...o, allocatedAmount: round2(o.allocatedAmount), allocatedVat: round2(o.allocatedVat) };
        }
        if (rate === 0) {
            return { ...o, allocatedAmount: round2(o.allocatedAmount), allocatedVat: 0 };
        }
        if (grossUp) {
            const vat = round2(o.allocatedAmount * rate / 100);
            return { ...o, allocatedAmount: round2(o.allocatedAmount + vat), allocatedVat: vat };
        }
        // «в том числе»: выделяем НДС из gross.
        const vat = round2(o.allocatedAmount - o.allocatedAmount / (1 + rate / 100));
        return { ...o, allocatedAmount: round2(o.allocatedAmount), allocatedVat: vat };
    });
    const total = round2(computedOrders.reduce((s, o) => s + o.allocatedAmount, 0));
    const vatAmount = round2(computedOrders.reduce((s, o) => s + (o.allocatedVat ?? 0), 0));
    const subtotal = round2(total - vatAmount);

    // spec §6 — 5-дневный срок выпуска СФ/УПД (ст. 168 ч. 3 НК).
    // Soft-warning, НЕ block: при просрочке без указанной причины возвращаем
    // SF_OVERDUE_WARNING (422) с деталями — UI показывает диалог «Подтвердить
    // выпуск с просрочкой» и обязательным полем причины. С причиной — выпускаем
    // и фиксируем факт+причину в аудит-журнале (для отчёта «СФ с просрочкой»).
    const issuedAtDate = input.issuedAt ? new Date(input.issuedAt) : new Date();
    const realizationDate = await resolveRealizationDate(
        input.invoiceOrders.map((o) => o.orderId),
        (invoice.tripIds as string[] | null) ?? [],
    );
    const deadline = checkSfIssueDeadline({
        invoiceType: invoice.type as InvoiceType,
        realizationDate,
        issuedAt: issuedAtDate,
    });
    const overdueReason = input.overdueReason?.trim();
    if (deadline.overdue && !overdueReason) {
        throw new InvoiceWorkflowError(
            'SF_OVERDUE_WARNING',
            `Выпуск СФ/УПД позже ${5} дней от даты реализации (просрочка ${deadline.daysLate} дн.). `
            + 'Укажите причину просрочки для подтверждения выпуска.',
            422,
            {
                daysLate: deadline.daysLate,
                realizationDate: deadline.realizationDate,
                deadlineDate: deadline.deadlineDate,
                requiresOverdueReason: true,
            },
        );
    }

    await db.transaction(async (tx) => {
        // 1. Insert invoice_orders
        await tx.insert(invoiceOrders).values(
            computedOrders.map((o) => ({
                invoiceId,
                orderId: o.orderId,
                allocatedAmount: o.allocatedAmount,
                allocatedVat: o.allocatedVat ?? null,
            })),
        );

        // 2. Update invoice → issued + финансовые поля.
        // ВАЖНО: DB-trigger invoice_immutable_check разрешает любые поля
        // если OLD.status='draft' (мы как раз тут).
        await tx.update(invoices).set({
            status: 'issued',
            basisText: input.basisText,
            issuedAt: issuedAtDate,
            vatRate: input.vatRate ?? null,
            includesVat: input.includesVat ?? false,
            total,
            vatAmount,
            subtotal,
        }).where(eq(invoices.id, invoiceId));
    });

    // 3. recordEvent — кроме DB-trigger который пишет invoice_history.
    // spec §6 — при просрочке фиксируем факт+причину в аудит-журнале.
    await recordEvent({
        authorId: author.userId,
        authorRole: author.role,
        eventType: 'invoice.issued',
        entityType: 'invoice',
        entityId: invoiceId,
        data: {
            number: invoice.number,
            invoiceType: invoice.type,
            total,
            vatAmount,
            basisText: input.basisText,
            ...(deadline.overdue
                ? {
                    sfOverdue: true,
                    sfDaysLate: deadline.daysLate,
                    sfRealizationDate: deadline.realizationDate,
                    sfOverdueReason: overdueReason,
                }
                : {}),
        },
    });

    return {
        id: invoiceId, number: invoice.number, total,
        ...(deadline.overdue ? { overdue: true, daysLate: deadline.daysLate } : {}),
    };
}

// ============================================================
// Отчёт «СФ/УПД выпущенные с просрочкой» (spec §6)
// ============================================================
export interface OverdueInvoiceRow {
    id: string;
    number: string;
    type: InvoiceType;
    status: string;
    total: number;
    issuedAt: string;
    realizationDate: string | null;
    deadlineDate: string | null;
    daysLate: number;
    overdueReason: string | null;
}

/**
 * spec §6 — список СФ/УПД, выпущенных позже 5-дневного срока от даты реализации.
 * Для контроля бухгалтером (дашборд). Org-scoped по payee. Дата реализации
 * вычисляется так же, как при выпуске: MAX(unloading_date) связанных заявок,
 * fallback — MAX(trips.actual_completion_at). Причина просрочки берётся из
 * аудит-журнала (событие invoice.issued, data.sfOverdueReason).
 */
export async function getOverdueInvoices(
    organizationId: string,
    range?: { from?: string; to?: string },
): Promise<OverdueInvoiceRow[]> {
    const conds = [
        eq(invoices.payeeOrganizationId, organizationId),
        inArray(invoices.type, FIVE_DAY_DEADLINE_TYPES),
        isNotNull(invoices.issuedAt),
        ne(invoices.status, 'draft'),
        ne(invoices.status, 'cancelled'),
    ];
    if (range?.from) conds.push(gte(invoices.issuedAt, new Date(range.from)));
    if (range?.to) conds.push(lte(invoices.issuedAt, new Date(range.to)));

    const candidates = await db.select({
        id: invoices.id,
        number: invoices.number,
        type: invoices.type,
        status: invoices.status,
        total: invoices.total,
        issuedAt: invoices.issuedAt,
        tripIds: invoices.tripIds,
    }).from(invoices).where(and(...conds));

    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);

    // realization per invoice: MAX(unloading_date) связанных заявок
    const orderRows = await db.select({
        invoiceId: invoiceOrders.invoiceId,
        unloadingDate: orders.unloadingDate,
    })
        .from(invoiceOrders)
        .innerJoin(orders, eq(orders.id, invoiceOrders.orderId))
        .where(inArray(invoiceOrders.invoiceId, ids));
    const realizationByInvoice = new Map<string, Date>();
    for (const r of orderRows) {
        if (!r.unloadingDate) continue;
        const cur = realizationByInvoice.get(r.invoiceId);
        if (!cur || r.unloadingDate > cur) realizationByInvoice.set(r.invoiceId, r.unloadingDate);
    }

    // overdue reasons из аудит-журнала
    const issuedEvents = await db.select({ entityId: events.entityId, data: events.data })
        .from(events)
        .where(and(
            eq(events.entityType, 'invoice'),
            eq(events.eventType, 'invoice.issued'),
            inArray(events.entityId, ids),
        ))
        .orderBy(desc(events.timestamp));
    const reasonByInvoice = new Map<string, string>();
    for (const e of issuedEvents) {
        const reason = (e.data as Record<string, unknown>)?.sfOverdueReason;
        if (typeof reason === 'string' && !reasonByInvoice.has(e.entityId)) {
            reasonByInvoice.set(e.entityId, reason);
        }
    }

    const out: OverdueInvoiceRow[] = [];
    for (const c of candidates) {
        let realization = realizationByInvoice.get(c.id) ?? null;
        if (!realization && (c.tripIds as string[] | null)?.length) {
            realization = await resolveRealizationDate([], c.tripIds as string[]);
        }
        const check = checkSfIssueDeadline({
            invoiceType: c.type as InvoiceType,
            realizationDate: realization,
            issuedAt: c.issuedAt!,
        });
        if (!check.overdue) continue;
        out.push({
            id: c.id,
            number: c.number,
            type: c.type as InvoiceType,
            status: c.status,
            total: num(c.total),
            issuedAt: c.issuedAt!.toISOString(),
            realizationDate: check.realizationDate,
            deadlineDate: check.deadlineDate,
            daysLate: check.daysLate,
            overdueReason: reasonByInvoice.get(c.id) ?? null,
        });
    }
    out.sort((a, b) => b.daysLate - a.daysLate);
    return out;
}

// ============================================================
// 3) createCorrection — выпуск КСФ или ИСФ (spec §5)
// ============================================================
export async function createCorrection(
    input: {
        relatedInvoiceId: string;
        correctionKind: InvoiceCorrectionKind;
        correctionReason: string;
        correctionBasisArtifactId?: string;
        subtotal: number;
        vatAmount: number;
        total: number;
        invoiceOrders: Array<{ orderId: string; allocatedAmount: number; allocatedVat?: number }>;
    },
    author: Author,
): Promise<{ id: string; number: string; correctionKind: InvoiceCorrectionKind }> {
    const orig = await getInvoiceWithOrgRegime(input.relatedInvoiceId, author);
    if (!orig) throw new InvoiceWorkflowError('NOT_FOUND', 'Исходный счёт не найден', 404);
    const { invoice: orig_inv, taxRegime } = orig;

    if (!['sf', 'upd'].includes(orig_inv.type)) {
        throw new InvoiceWorkflowError('NOT_VAT_DOCUMENT', 'Корректировки доступны только для СФ/УПД');
    }
    if (orig_inv.status === 'draft') {
        throw new InvoiceWorkflowError('ORIGINAL_DRAFT', 'Исходный документ ещё не выпущен — корректировки не нужны');
    }
    if (orig_inv.status === 'cancelled') {
        throw new InvoiceWorkflowError('ORIGINAL_CANCELLED', 'Исходный документ аннулирован');
    }
    // H1 (P1-C): гейт двойной корректировки на уровне API (UI-гейт !hasCorrections
    // был, серверного — нет). Повторный КСФ/ИСФ к уже скорректированному документу
    // запрещён: корректируется новый (последний) документ цепочки, не оригинал.
    if (orig_inv.hasCorrections || orig_inv.status === 'corrected') {
        throw new InvoiceWorkflowError('ALREADY_CORRECTED', 'Документ уже скорректирован — выпускайте корректировку к последнему документу цепочки');
    }

    const newType = orig_inv.type === 'sf' ? 'corrective_sf' : 'corrective_upd';

    const createdId = await db.transaction(async (tx) => {
        // H5 (P1-C): номер — внутри tx (advisory-lock).
        const number = await generateInvoiceNumber(newType, tx, orig_inv.payeeOrganizationId ?? null);
        // 1. Insert новый corrective invoice (сразу в статусе issued — корректировки
        //    создаются как выпуск, не draft, per spec §5).
        const [created] = await tx.insert(invoices).values({
            number,
            contractorId: orig_inv.contractorId, // backward compat
            type: newType,
            status: 'issued',
            subtotal: input.subtotal,
            vatAmount: input.vatAmount,
            total: input.total,
            periodStart: new Date(),
            periodEnd: new Date(),
            payerId: orig_inv.payerId,
            payeeId: orig_inv.payeeId,
            payeeOrganizationId: orig_inv.payeeOrganizationId,
            currency: orig_inv.currency,
            includesVat: orig_inv.includesVat,
            vatRate: orig_inv.vatRate,
            basisText: `Корректировка к ${orig_inv.number} от ${orig_inv.issuedAt?.toISOString().slice(0, 10) ?? '?'}: ${input.correctionReason}`,
            issuedAt: new Date(),
            correctionKind: input.correctionKind,
            relatedInvoiceId: input.relatedInvoiceId,
            correctionReason: input.correctionReason,
            correctionBasisArtifactId: input.correctionBasisArtifactId ?? null,
        }).returning({ id: invoices.id, number: invoices.number });

        // 2. Insert invoice_orders для нового корректировочного.
        await tx.insert(invoiceOrders).values(
            input.invoiceOrders.map((o) => ({
                invoiceId: created.id,
                orderId: o.orderId,
                allocatedAmount: o.allocatedAmount,
                allocatedVat: o.allocatedVat ?? null,
            })),
        );

        // 3. Effect на исходный документ (spec §5):
        //    - ИСФ (replacement) → исходный cancelled (replaced_by:<new_id>)
        //    - КСФ (adjustment)  → исходный помечается corrected (H2: статус
        //      'corrected' раньше не выставлялся, оригинал оставался issued).
        if (input.correctionKind === 'replacement') {
            await tx.update(invoices).set({
                status: 'cancelled',
                cancellationReason: `replaced_by:${created.id}`,
            }).where(eq(invoices.id, input.relatedInvoiceId));
        } else {
            await tx.update(invoices).set({
                status: 'corrected',
                hasCorrections: true,
            }).where(eq(invoices.id, input.relatedInvoiceId));
        }
        return { id: created.id, number: created.number };
    });

    await recordEvent({
        authorId: author.userId,
        authorRole: author.role,
        eventType: 'invoice.correction_issued',
        entityType: 'invoice',
        entityId: input.relatedInvoiceId,
        data: {
            correctionKind: input.correctionKind,
            relatedNumber: orig_inv.number,
            newNumber: createdId.number,
            reason: input.correctionReason,
        },
    });

    return { id: createdId.id, number: createdId.number, correctionKind: input.correctionKind };
}

// ============================================================
// 4) registerPayment — issued/paid_partial → paid_partial/paid_full
// ============================================================
export async function registerPayment(
    invoiceId: string,
    input: { amount: number; paymentDate?: string; paymentReference?: string },
    author: Author,
): Promise<{ id: string; status: string; paidAmount: number; total: number }> {
    const ctx = await getInvoiceWithOrgRegime(invoiceId, author);
    if (!ctx) throw new InvoiceWorkflowError('NOT_FOUND', 'Счёт не найден', 404);
    const { invoice } = ctx;

    if (!['issued', 'paid_partial'].includes(invoice.status)) {
        throw new InvoiceWorkflowError('INVALID_STATE', `Оплата возможна только для issued/paid_partial. Текущий: ${invoice.status}`);
    }

    const total = num(invoice.total);
    const newPaid = num(invoice.paidAmount) + input.amount;
    const targetStatus = newPaid >= total ? 'paid_full' : 'paid_partial';

    const fsmCheck = canTransitionInvoice({
        from: invoice.status,
        to: targetStatus,
        invoiceType: invoice.type as InvoiceType,
        paidAmount: newPaid,
        total,
    });
    if (!fsmCheck.allowed) {
        throw new InvoiceWorkflowError('FSM_BLOCKED', fsmCheck.reason ?? 'FSM запретил переход');
    }

    await db.update(invoices).set({
        status: targetStatus,
        paidAmount: newPaid,
        paidAt: targetStatus === 'paid_full' ? new Date() : invoice.paidAt,
    }).where(eq(invoices.id, invoiceId));

    await recordEvent({
        authorId: author.userId,
        authorRole: author.role,
        eventType: 'invoice.payment_registered',
        entityType: 'invoice',
        entityId: invoiceId,
        data: {
            amount: input.amount,
            paidAmountTotal: newPaid,
            newStatus: targetStatus,
            paymentReference: input.paymentReference,
        },
    });

    return { id: invoiceId, status: targetStatus, paidAmount: newPaid, total };
}

// ============================================================
// 5) cancelInvoice
// ============================================================
export async function cancelInvoice(
    invoiceId: string,
    input: { cancellationReason: string },
    author: Author,
): Promise<{ id: string }> {
    const ctx = await getInvoiceWithOrgRegime(invoiceId, author);
    if (!ctx) throw new InvoiceWorkflowError('NOT_FOUND', 'Счёт не найден', 404);
    const { invoice } = ctx;

    const fsmCheck = canTransitionInvoice({
        from: invoice.status,
        to: 'cancelled',
        invoiceType: invoice.type as InvoiceType,
        paidAmount: num(invoice.paidAmount),
        total: num(invoice.total),
    });
    if (!fsmCheck.allowed) {
        throw new InvoiceWorkflowError('FSM_BLOCKED', fsmCheck.reason ?? 'FSM запретил отмену');
    }

    if (!input.cancellationReason || input.cancellationReason.trim().length < 5) {
        throw new InvoiceWorkflowError('REASON_REQUIRED', 'Причина отмены обязательна (>= 5 символов)');
    }

    await db.update(invoices).set({
        status: 'cancelled',
        cancellationReason: input.cancellationReason,
    }).where(eq(invoices.id, invoiceId));

    await recordEvent({
        authorId: author.userId,
        authorRole: author.role,
        eventType: 'invoice.cancelled',
        entityType: 'invoice',
        entityId: invoiceId,
        data: { reason: input.cancellationReason, previousStatus: invoice.status },
    });

    return { id: invoiceId };
}
