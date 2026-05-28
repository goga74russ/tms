// ============================================================
// M5 (Этап 3) — Invoice FSM helpers per invoice-spec.md §2 + §4.
//
// Все enum'ы и переходы реализованы по обязательной spec'и от Jurist.
// Acceptance criteria §10:
//   • Enum invoice_type (7) + correction_kind
//   • FSM статусов с матрицей переходов (см. spec §2)
//   • Правила НДС от tax_regime (см. spec §4)
// ============================================================
import { z } from 'zod';

export const InvoiceTypeEnum = z.enum([
    'payment',
    'advance',
    'sf',
    'upd',
    'corrective_sf',
    'corrective_upd',
    'act',
]);
export type InvoiceType = z.infer<typeof InvoiceTypeEnum>;

export const InvoiceStatusEnum = z.enum([
    'draft',
    'issued',
    'paid_partial',
    'paid_full',
    'cancelled',
    'corrected',
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusEnum>;

export const InvoiceCorrectionKindEnum = z.enum(['adjustment', 'replacement']);
export type InvoiceCorrectionKind = z.infer<typeof InvoiceCorrectionKindEnum>;

export const TaxRegimeEnum = z.enum([
    'osno',
    'usn_income',
    'usn_income_expense',
    'usn_with_vat',
    'ausn',
    'patent',
    'npd',
    'unspecified',
]);
export type TaxRegime = z.infer<typeof TaxRegimeEnum>;

/**
 * Налоговые режимы — плательщики НДС, обязанные выставлять СФ/УПД.
 * Только для них действует 5-дневный срок (ст. 168 ч. 3 НК).
 */
export const VAT_PAYING_REGIMES: TaxRegime[] = ['osno', 'usn_with_vat'];

export function isVatPayingRegime(regime: TaxRegime | null | undefined): boolean {
    return regime != null && VAT_PAYING_REGIMES.includes(regime);
}

// ============================================================
// 5-дневный срок выпуска СФ/УПД (spec §6, ст. 168 ч. 3 НК)
// ============================================================

/** Типы документов, для которых действует 5-дневный срок от даты реализации. */
export const FIVE_DAY_DEADLINE_TYPES: InvoiceType[] = ['sf', 'upd', 'corrective_sf', 'advance'];

/** Срок выпуска СФ/УПД от даты реализации, календарных дней. */
export const SF_ISSUE_DEADLINE_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SfDeadlineCheck {
    /** Тип подпадает под 5-дневное правило И есть дата реализации для расчёта. */
    applies: boolean;
    /** Выпуск позже срока. */
    overdue: boolean;
    /** На сколько календарных дней просрочен выпуск (сверх 5). 0 если в срок. */
    daysLate: number;
    /** Крайняя дата выпуска (реализация + 5 дней), ISO. null если applies=false. */
    deadlineDate: string | null;
    /** Использованная дата реализации, ISO. null если applies=false. */
    realizationDate: string | null;
}

/**
 * spec §6 — проверка 5-дневного срока выпуска СФ/УПД.
 * Чистая функция (без БД) — даёт фактуру для warning'а в UI и для отчёта
 * «СФ выпущенные с просрочкой». НЕ блокирует выпуск (это soft-warning).
 *
 * `realizationDate` — дата реализации: для СФ это MAX(unloading_date) связанных
 * заявок, для УПД — actual_completion_at рейса. Если null/неизвестна — applies=false
 * (нет базы для расчёта, не пугаем ложной просрочкой).
 */
export function checkSfIssueDeadline(args: {
    invoiceType: InvoiceType;
    realizationDate: Date | string | null | undefined;
    issuedAt: Date | string;
}): SfDeadlineCheck {
    const none: SfDeadlineCheck = {
        applies: false, overdue: false, daysLate: 0, deadlineDate: null, realizationDate: null,
    };
    if (!FIVE_DAY_DEADLINE_TYPES.includes(args.invoiceType)) return none;
    if (args.realizationDate == null) return none;

    const realization = new Date(args.realizationDate);
    const issued = new Date(args.issuedAt);
    if (Number.isNaN(realization.getTime()) || Number.isNaN(issued.getTime())) return none;

    const deadline = new Date(realization.getTime() + SF_ISSUE_DEADLINE_DAYS * MS_PER_DAY);
    const elapsedDays = Math.floor((issued.getTime() - realization.getTime()) / MS_PER_DAY);
    const daysLate = Math.max(0, elapsedDays - SF_ISSUE_DEADLINE_DAYS);

    return {
        applies: true,
        overdue: daysLate > 0,
        daysLate,
        deadlineDate: deadline.toISOString(),
        realizationDate: realization.toISOString(),
    };
}

// ============================================================
// FSM матрица переходов (spec §2)
// ============================================================
export interface TransitionContext {
    from: InvoiceStatus;
    to: InvoiceStatus;
    invoiceType: InvoiceType;
    paidAmount?: number;
    total?: number;
}

export interface TransitionResult {
    allowed: boolean;
    reason?: string;
}

const VAT_DOCUMENT_TYPES: InvoiceType[] = ['sf', 'upd', 'corrective_sf', 'corrective_upd'];

export function canTransitionInvoice(ctx: TransitionContext): TransitionResult {
    const { from, to, invoiceType, paidAmount = 0, total = 0 } = ctx;

    if (from === to) return { allowed: true };

    // cancelled — финальный (никогда не возвращаемся)
    if (from === 'cancelled') {
        return { allowed: false, reason: 'Cancelled invoices cannot be revived' };
    }

    // paid_full → paid_partial запрещён (только через возвратный документ)
    if (from === 'paid_full' && to === 'paid_partial') {
        return { allowed: false, reason: 'Cannot revert paid_full to paid_partial (use return doc)' };
    }

    // Создание/draft
    if (to === 'draft') {
        return { allowed: from === 'draft', reason: from !== 'draft' ? 'Only stay-in-draft allowed' : undefined };
    }

    // draft → issued
    if (from === 'draft' && to === 'issued') {
        return { allowed: true };
    }

    // issued → paid_partial
    if (from === 'issued' && to === 'paid_partial') {
        if (paidAmount <= 0 || paidAmount >= total) {
            return { allowed: false, reason: 'paid_partial requires 0 < paid_amount < total' };
        }
        return { allowed: true };
    }

    // issued/paid_partial → paid_full
    if ((from === 'issued' || from === 'paid_partial') && to === 'paid_full') {
        if (paidAmount < total) {
            return { allowed: false, reason: 'paid_full requires paid_amount >= total' };
        }
        return { allowed: true };
    }

    // issued → cancelled (запрещено для sf/upd если payments_received > 0)
    if (from === 'issued' && to === 'cancelled') {
        if (VAT_DOCUMENT_TYPES.includes(invoiceType) && paidAmount > 0) {
            return {
                allowed: false,
                reason: 'Cannot cancel SF/UPD with received payments — use corrective_sf instead',
            };
        }
        return { allowed: true };
    }

    // paid_partial → cancelled (запрещено для sf/upd всегда — только через возврат)
    if (from === 'paid_partial' && to === 'cancelled') {
        if (VAT_DOCUMENT_TYPES.includes(invoiceType)) {
            return {
                allowed: false,
                reason: 'Cannot cancel paid SF/UPD — use return document',
            };
        }
        return { allowed: true };
    }

    // paid_full → cancelled — для всех типов запрещён в стандартном FSM.
    if (from === 'paid_full' && to === 'cancelled') {
        return { allowed: false, reason: 'Cannot cancel paid_full (use return doc)' };
    }

    // issued → corrected (через выпуск corrective_*)
    if (from === 'issued' && to === 'corrected') {
        return { allowed: true };
    }

    return { allowed: false, reason: `Transition ${from} → ${to} not in FSM` };
}

// ============================================================
// tax_regime → allowed invoice_type rules (spec §4)
// ============================================================
const REGIMES_THAT_CAN_VAT: TaxRegime[] = ['osno', 'usn_with_vat'];

export function canIssueInvoiceType(taxRegime: TaxRegime, invoiceType: InvoiceType): TransitionResult {
    if (taxRegime === 'unspecified') {
        return { allowed: false, reason: 'Tax regime not set — invoice issuance blocked' };
    }

    // Документы с НДС только для osno / usn_with_vat
    if (VAT_DOCUMENT_TYPES.includes(invoiceType) && !REGIMES_THAT_CAN_VAT.includes(taxRegime)) {
        return {
            allowed: false,
            reason: `${invoiceType} not allowed for ${taxRegime} (no VAT obligation)`,
        };
    }

    return { allowed: true };
}

export function defaultIncludesVat(taxRegime: TaxRegime): boolean {
    return REGIMES_THAT_CAN_VAT.includes(taxRegime);
}

export function allowedVatRates(taxRegime: TaxRegime): number[] {
    if (taxRegime === 'osno') return [0, 10, 20];
    if (taxRegime === 'usn_with_vat') return [5, 7, 20];
    return [];
}

// ============================================================
// Zod schemas для invoice workflow
// ============================================================

/** Создание draft — минимальные поля (spec §3 «draft»). */
export const InvoiceCreateSchema = z.object({
    invoiceType: InvoiceTypeEnum,
    payerId: z.string().uuid(),
    payeeId: z.string().uuid().optional(),
    payeeOrganizationId: z.string().uuid().optional(),
    contractId: z.string().uuid().optional(),
});

/** Выпуск (draft → issued) — все обязательные поля per spec §3 «issued». */
export const InvoiceIssueSchema = z.object({
    basisText: z.string().min(5, 'basis_text обязателен (см. invoice-spec.md §3)'),
    issuedAt: z.string().datetime().optional(),
    // Для sf/upd — обязательная ставка НДС, проверим в service.
    vatRate: z.number().optional(),
    includesVat: z.boolean().optional(),
    // spec §6 — причина выпуска СФ/УПД с просрочкой (>5 дней от реализации).
    // Без неё просроченный выпуск возвращает SF_OVERDUE_WARNING.
    overdueReason: z.string().min(3).max(1000).optional(),
    invoiceOrders: z.array(z.object({
        orderId: z.string().uuid(),
        allocatedAmount: z.number().positive(),
        allocatedVat: z.number().nonnegative().optional(),
    })).min(1, 'Требуется хотя бы одна связка с заявкой'),
});

/** Корректировка (КСФ или ИСФ) — spec §5. */
export const InvoiceCorrectionCreateSchema = z.object({
    relatedInvoiceId: z.string().uuid(),
    correctionKind: InvoiceCorrectionKindEnum,
    correctionReason: z.string().min(5, 'Требуется обоснование корректировки'),
    correctionBasisArtifactId: z.string().uuid().optional(),
    // КСФ — разница, ИСФ — полная сумма (валидация в service)
    subtotal: z.number(),
    vatAmount: z.number(),
    total: z.number(),
    invoiceOrders: z.array(z.object({
        orderId: z.string().uuid(),
        allocatedAmount: z.number(),
        allocatedVat: z.number().optional(),
    })).min(1),
});

/** Оплата (issued → paid_partial / paid_full). */
export const InvoicePaymentSchema = z.object({
    amount: z.number().positive(),
    paymentDate: z.string().datetime().optional(),
    paymentReference: z.string().optional(),
});

/** Отмена. */
export const InvoiceCancelSchema = z.object({
    cancellationReason: z.string().min(5, 'Требуется причина отмены'),
});
