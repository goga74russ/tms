// ============================================================
// M7 — Unit tests для FSM helpers per invoice-spec.md acceptance §10.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    canTransitionInvoice,
    canIssueInvoiceType,
    defaultIncludesVat,
    allowedVatRates,
} from './invoice-fsm.js';

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
    it('osno: includes_vat default true, ставки 0/10/20', () => {
        expect(defaultIncludesVat('osno')).toBe(true);
        expect(allowedVatRates('osno')).toEqual([0, 10, 20]);
    });

    it('usn_with_vat: includes_vat default true, ставки 5/7/20', () => {
        expect(defaultIncludesVat('usn_with_vat')).toBe(true);
        expect(allowedVatRates('usn_with_vat')).toEqual([5, 7, 20]);
    });

    it('usn_income / ausn / npd: НДС не платят', () => {
        for (const r of ['usn_income', 'usn_income_expense', 'ausn', 'patent', 'npd'] as const) {
            expect(defaultIncludesVat(r)).toBe(false);
            expect(allowedVatRates(r)).toEqual([]);
        }
    });
});
