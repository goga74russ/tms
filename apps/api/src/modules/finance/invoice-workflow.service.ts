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
import { invoices, invoiceOrders, invoiceHistory, organizations } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import {
    canTransitionInvoice,
    canIssueInvoiceType,
    type InvoiceType,
    type InvoiceCorrectionKind,
    type TaxRegime,
} from '@tms/shared';
import { recordEvent } from '../../events/journal.js';

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

async function getInvoiceWithOrgRegime(invoiceId: string) {
    const [row] = await db.select({
        invoice: invoices,
        taxRegime: organizations.taxRegime,
    })
        .from(invoices)
        .leftJoin(organizations, eq(invoices.payeeOrganizationId, organizations.id))
        .where(eq(invoices.id, invoiceId))
        .limit(1);
    if (!row) return null;
    return { invoice: row.invoice, taxRegime: (row.taxRegime ?? 'unspecified') as TaxRegime };
}

async function generateInvoiceNumber(type: InvoiceType, tx: typeof db = db): Promise<string> {
    // Spec §3 «Нумерация раздельная по invoice_type» (п. 5.1 ст. 169 НК).
    // Для каждого типа — свой числовой ряд.
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

    const [last] = await tx.select({ number: invoices.number })
        .from(invoices)
        .where(sql`${invoices.number} LIKE ${prefix + '%'}`)
        .orderBy(sql`${invoices.number} DESC`)
        .limit(1);

    let seq = 1;
    if (last?.number) {
        const parts = last.number.split('-');
        const lastSeq = parseInt(parts[parts.length - 1], 10);
        if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
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
    const number = await generateInvoiceNumber(input.invoiceType);

    const [created] = await db.insert(invoices).values({
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
        payeeOrganizationId: input.payeeOrganizationId ?? author.organizationId ?? null,
    }).returning({ id: invoices.id, number: invoices.number });

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
    constructor(public code: string, message: string, public httpStatus: number = 422) {
        super(message);
        this.name = 'InvoiceWorkflowError';
    }
}

export async function issueDraftInvoice(
    invoiceId: string,
    input: {
        basisText: string;
        invoiceOrders: Array<{ orderId: string; allocatedAmount: number; allocatedVat?: number }>;
        vatRate?: number;
        includesVat?: boolean;
        issuedAt?: string;
    },
    author: Author,
): Promise<{ id: string; number: string; total: number }> {
    const ctx = await getInvoiceWithOrgRegime(invoiceId);
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

    // Сумма allocated_amount → total. CHECK на БД дополнительно подтвердит.
    const total = input.invoiceOrders.reduce((s, o) => s + o.allocatedAmount, 0);
    const vatAmount = input.invoiceOrders.reduce((s, o) => s + (o.allocatedVat ?? 0), 0);
    const subtotal = total - vatAmount;

    await db.transaction(async (tx) => {
        // 1. Insert invoice_orders
        await tx.insert(invoiceOrders).values(
            input.invoiceOrders.map((o) => ({
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
            issuedAt: input.issuedAt ? new Date(input.issuedAt) : new Date(),
            vatRate: input.vatRate ?? null,
            includesVat: input.includesVat ?? false,
            total,
            vatAmount,
            subtotal,
        }).where(eq(invoices.id, invoiceId));
    });

    // 3. recordEvent — кроме DB-trigger который пишет invoice_history.
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
        },
    });

    return { id: invoiceId, number: invoice.number, total };
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
    const orig = await getInvoiceWithOrgRegime(input.relatedInvoiceId);
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

    const newType = orig_inv.type === 'sf' ? 'corrective_sf' : 'corrective_upd';
    const number = await generateInvoiceNumber(newType);

    await db.transaction(async (tx) => {
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
        //    - КСФ (adjustment)  → исходный остаётся issued, has_corrections=true
        if (input.correctionKind === 'replacement') {
            await tx.update(invoices).set({
                status: 'cancelled',
                cancellationReason: `replaced_by:${created.id}`,
            }).where(eq(invoices.id, input.relatedInvoiceId));
        } else {
            await tx.update(invoices).set({
                hasCorrections: true,
            }).where(eq(invoices.id, input.relatedInvoiceId));
        }
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
            newNumber: number,
            reason: input.correctionReason,
        },
    });

    const [created] = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.number, number)).limit(1);
    return { id: created.id, number, correctionKind: input.correctionKind };
}

// ============================================================
// 4) registerPayment — issued/paid_partial → paid_partial/paid_full
// ============================================================
export async function registerPayment(
    invoiceId: string,
    input: { amount: number; paymentDate?: string; paymentReference?: string },
    author: Author,
): Promise<{ id: string; status: string; paidAmount: number; total: number }> {
    const ctx = await getInvoiceWithOrgRegime(invoiceId);
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
    const ctx = await getInvoiceWithOrgRegime(invoiceId);
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
