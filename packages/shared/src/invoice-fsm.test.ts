// ============================================================
// M7 — Unit tests для FSM helpers per invoice-spec.md acceptance §10.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    canTransitionInvoice,
    canIssueInvoiceType,
    defaultIncludesVat,
    allowedVatRates,
    checkSfIssueDeadline,
    isVatPayingRegime,
    SF_ISSUE_DEADLINE_DAYS,
    resolveVatRate,
    baseVatRateForDate,
    allSameVatPeriod,
    vatRateShipmentMismatch,
} from './invoice-fsm.js';

const DAY = 24 * 60 * 60 * 1000;

describe('checkSfIssueDeadline — 5-дневный срок СФ/УПД (spec §6)', () => {
    const realization = new Date('2026-05-01T10:00:00Z');

    it('payment/act не подпадают под правило (applies=false)', () => {
        for (const t of ['payment', 'act'] as const) {
            const r = checkSfIssueDeadline({ invoiceType: t, realizationDate: realization, issuedAt: new Date(realization.getTime() + 30 * DAY) });
            expect(r.applies).toBe(false);
            expect(r.overdue).toBe(false);
        }
    });

    it('нет даты реализации → applies=false (не пугаем ложной просрочкой)', () => {
        const r = checkSfIssueDeadline({ invoiceType: 'sf', realizationDate: null, issuedAt: new Date() });
        expect(r.applies).toBe(false);
        expect(r.overdue).toBe(false);
    });

    it('СФ в срок (ровно 5 дней) — не просрочено', () => {
        const r = checkSfIssueDeadline({ invoiceType: 'sf', realizationDate: realization, issuedAt: new Date(realization.getTime() + SF_ISSUE_DEADLINE_DAYS * DAY) });
        expect(r.applies).toBe(true);
        expect(r.overdue).toBe(false);
        expect(r.daysLate).toBe(0);
    });

    it('СФ на 7-й день — просрочка 2 дня', () => {
        const r = checkSfIssueDeadline({ invoiceType: 'sf', realizationDate: realization, issuedAt: new Date(realization.getTime() + 7 * DAY) });
        expect(r.overdue).toBe(true);
        expect(r.daysLate).toBe(2);
        expect(r.deadlineDate).toBe(new Date(realization.getTime() + 5 * DAY).toISOString());
    });

    it('УПД тоже подпадает под 5-дневное правило', () => {
        const r = checkSfIssueDeadline({ invoiceType: 'upd', realizationDate: realization, issuedAt: new Date(realization.getTime() + 10 * DAY) });
        expect(r.overdue).toBe(true);
        expect(r.daysLate).toBe(5);
    });
});

describe('isVatPayingRegime (spec §6)', () => {
    it('osno и usn_with_vat — плательщики НДС', () => {
        expect(isVatPayingRegime('osno')).toBe(true);
        expect(isVatPayingRegime('usn_with_vat')).toBe(true);
    });
    it('спецрежимы без НДС и unspecified/null — нет', () => {
        for (const r of ['usn_income', 'ausn', 'patent', 'npd', 'unspecified'] as const) {
            expect(isVatPayingRegime(r)).toBe(false);
        }
        expect(isVatPayingRegime(null)).toBe(false);
    });
});

describe('canTransitionInvoice — FSM matrix (spec §2)', () => {
    it('draft → issued разрешено для всех типов', () => {
        for (const t of ['payment', 'sf', 'upd', 'act'] as const) {
            expect(canTransitionInvoice({ from: 'draft', to: 'issued', invoiceType: t }).allowed).toBe(true);
        }
    });

    it('cancelled → * запрещено всегда', () => {
        expect(canTransitionInvoice({ from: 'cancelled', to: 'draft', invoiceType: 'sf' }).allowed).toBe(false);
        expect(canTransitionInvoice({ from: 'cancelled', to: 'issued', invoiceType: 'sf' }).allowed).toBe(false);
    });

    it('paid_full → paid_partial запрещён', () => {
        const r = canTransitionInvoice({ from: 'paid_full', to: 'paid_partial', invoiceType: 'sf' });
        expect(r.allowed).toBe(false);
    });

    it('issued → paid_partial требует 0 < paid < total', () => {
        expect(canTransitionInvoice({ from: 'issued', to: 'paid_partial', invoiceType: 'sf', paidAmount: 0, total: 100 }).allowed).toBe(false);
        expect(canTransitionInvoice({ from: 'issued', to: 'paid_partial', invoiceType: 'sf', paidAmount: 50, total: 100 }).allowed).toBe(true);
        expect(canTransitionInvoice({ from: 'issued', to: 'paid_partial', invoiceType: 'sf', paidAmount: 100, total: 100 }).allowed).toBe(false);
    });

    it('issued → paid_full требует paid >= total', () => {
        expect(canTransitionInvoice({ from: 'issued', to: 'paid_full', invoiceType: 'sf', paidAmount: 99, total: 100 }).allowed).toBe(false);
        expect(canTransitionInvoice({ from: 'issued', to: 'paid_full', invoiceType: 'sf', paidAmount: 100, total: 100 }).allowed).toBe(true);
    });

    it('issued → cancelled для SF с received payments запрещён', () => {
        const r = canTransitionInvoice({
            from: 'issued', to: 'cancelled', invoiceType: 'sf',
            paidAmount: 50, total: 100,
        });
        expect(r.allowed).toBe(false);
        expect(r.reason).toMatch(/corrective_sf/i);
    });

    it('issued → cancelled для payment без payments разрешён', () => {
        expect(canTransitionInvoice({ from: 'issued', to: 'cancelled', invoiceType: 'payment', paidAmount: 0, total: 100 }).allowed).toBe(true);
    });

    it('paid_partial → cancelled для SF запрещён всегда', () => {
        const r = canTransitionInvoice({
            from: 'paid_partial', to: 'cancelled', invoiceType: 'sf',
            paidAmount: 50, total: 100,
        });
        expect(r.allowed).toBe(false);
    });

    it('paid_full → cancelled запрещён для всех', () => {
        expect(canTransitionInvoice({ from: 'paid_full', to: 'cancelled', invoiceType: 'payment', paidAmount: 100, total: 100 }).allowed).toBe(false);
    });
});

describe('canIssueInvoiceType — tax_regime rules (spec §4)', () => {
    it('osno может выпускать любой тип', () => {
        for (const t of ['payment', 'advance', 'sf', 'upd', 'act'] as const) {
            expect(canIssueInvoiceType('osno', t).allowed).toBe(true);
        }
    });

    it('usn_with_vat может выпускать VAT-документы', () => {
        expect(canIssueInvoiceType('usn_with_vat', 'sf').allowed).toBe(true);
        expect(canIssueInvoiceType('usn_with_vat', 'upd').allowed).toBe(true);
    });

    it('usn_income не может выпускать sf/upd', () => {
        expect(canIssueInvoiceType('usn_income', 'sf').allowed).toBe(false);
        expect(canIssueInvoiceType('usn_income', 'upd').allowed).toBe(false);
        // payment и act разрешены
        expect(canIssueInvoiceType('usn_income', 'payment').allowed).toBe(true);
        expect(canIssueInvoiceType('usn_income', 'act').allowed).toBe(true);
    });

    it('npd не может sf/upd', () => {
        expect(canIssueInvoiceType('npd', 'sf').allowed).toBe(false);
    });

    it('unspecified блокирует ВСЁ', () => {
        for (const t of ['payment', 'sf', 'upd', 'act'] as const) {
            expect(canIssueInvoiceType('unspecified', t).allowed).toBe(false);
        }
    });

    it('corrective_sf требует VAT режим', () => {
        expect(canIssueInvoiceType('osno', 'corrective_sf').allowed).toBe(true);
        expect(canIssueInvoiceType('usn_with_vat', 'corrective_sf').allowed).toBe(true);
        expect(canIssueInvoiceType('usn_income', 'corrective_sf').allowed).toBe(false);
    });
});

describe('defaultIncludesVat / allowedVatRates', () => {
    it('osno: includes_vat default true, ставки 0/10/20/22 (① ФЗ-425)', () => {
        expect(defaultIncludesVat('osno')).toBe(true);
        expect(allowedVatRates('osno')).toEqual([0, 10, 20, 22]);
    });

    it('usn_with_vat: includes_vat default true, ставки 5/7/20/22', () => {
        expect(defaultIncludesVat('usn_with_vat')).toBe(true);
        expect(allowedVatRates('usn_with_vat')).toEqual([5, 7, 20, 22]);
    });

    it('usn_income / ausn / npd: НДС не платят', () => {
        for (const r of ['usn_income', 'usn_income_expense', 'ausn', 'patent', 'npd'] as const) {
            expect(defaultIncludesVat(r)).toBe(false);
            expect(allowedVatRates(r)).toEqual([]);
        }
    });
});

// ① НДС 22% + историчность (spec v1.2 §4.1, ФЗ-425)
describe('resolveVatRate / историчность по дате отгрузки', () => {
    const dec2025 = new Date('2025-12-15T10:00:00+03:00');
    const jan2026 = new Date('2026-01-15T10:00:00+03:00');

    it('osno: 20% до 2026, 22% с 2026 (по дате отгрузки)', () => {
        expect(resolveVatRate('osno', dec2025)).toBe(20);
        expect(resolveVatRate('osno', jan2026)).toBe(22);
    });

    it('usn_with_vat: usn_vat_rate 5/7 имеет приоритет над датой', () => {
        expect(resolveVatRate('usn_with_vat', jan2026, 5)).toBe(5);
        expect(resolveVatRate('usn_with_vat', dec2025, 7)).toBe(7);
        // без выбранной 5/7 — по дате (основная ставка)
        expect(resolveVatRate('usn_with_vat', jan2026, null)).toBe(22);
        expect(resolveVatRate('usn_with_vat', dec2025, null)).toBe(20);
    });

    it('режимы без НДС → null', () => {
        for (const r of ['usn_income', 'ausn', 'patent', 'npd'] as const) {
            expect(resolveVatRate(r, jan2026)).toBeNull();
        }
    });

    it('граница 01.01.2026 по МСК', () => {
        expect(baseVatRateForDate(new Date('2025-12-31T23:59:00+03:00'))).toBe(20);
        expect(baseVatRateForDate(new Date('2026-01-01T00:00:00+03:00'))).toBe(22);
    });

    it('allSameVatPeriod: Q1 запрет смешивания периодов', () => {
        expect(allSameVatPeriod([dec2025, jan2026])).toBe(false);
        expect(allSameVatPeriod([jan2026, new Date('2026-03-01T00:00:00+03:00')])).toBe(true);
        expect(allSameVatPeriod([dec2025])).toBe(true);
        expect(allSameVatPeriod([])).toBe(true);
    });

    it('vatRateShipmentMismatch: 20% c 2026 и 22% до 2026 — ошибка', () => {
        expect(vatRateShipmentMismatch(20, jan2026)).toMatch(/недопустима/);
        expect(vatRateShipmentMismatch(22, dec2025)).toMatch(/недопустима/);
        expect(vatRateShipmentMismatch(22, jan2026)).toBeNull();
        expect(vatRateShipmentMismatch(20, dec2025)).toBeNull();
        // льготные не зависят от смены основной ставки
        expect(vatRateShipmentMismatch(10, jan2026)).toBeNull();
        expect(vatRateShipmentMismatch(0, jan2026)).toBeNull();
    });
});
