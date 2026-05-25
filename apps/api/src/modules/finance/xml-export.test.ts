// ============================================================
// Finance — CommerceML 2.x XML export (1C transformation).
// Pure builder; no DB or env required.
// ============================================================
import { describe, it, expect } from 'vitest';
import { buildCommerceMLXml, type InvoiceExportRow } from './xml-export.service.js';

const baseInv = (over: Partial<InvoiceExportRow> = {}): InvoiceExportRow => ({
    id: 'inv-1',
    number: 'INV-2026-00001',
    type: 'payment',
    status: 'sent',
    subtotal: 1000,
    vatAmount: 200,
    total: 1200,
    periodStart: new Date('2026-05-01T00:00:00Z'),
    periodEnd: new Date('2026-05-31T23:59:59Z'),
    createdAt: new Date('2026-06-01T10:00:00Z'),
    contractor: {
        name: 'ООО Ромашка',
        inn: '7701234567',
        kpp: '770101001',
        legalAddress: 'г. Москва, ул. Тверская, 1',
    },
    tripIds: ['t-1', 't-2'],
    ...over,
});

describe('buildCommerceMLXml', () => {
    it('produces a well-formed CommerceML wrapper for a single invoice', () => {
        const xml = buildCommerceMLXml([baseInv()], {
            companyName: 'ООО ТМС',
            companyInn: '7700000001',
            companyKpp: '770000001',
        });
        expect(xml).toContain('<?xml');
        expect(xml).toContain('<КоммерческаяИнформация');
        expect(xml).toContain('<Документ>');
        expect(xml).toContain('INV-2026-00001');
        // Seller block.
        expect(xml).toContain('ООО ТМС');
        expect(xml).toContain('7700000001');
        // Buyer block.
        expect(xml).toContain('ООО Ромашка');
        expect(xml).toContain('7701234567');
    });

    it('emits no Документ element when invoice list is empty', () => {
        const xml = buildCommerceMLXml([]);
        expect(xml).toContain('<КоммерческаяИнформация');
        expect(xml).not.toContain('<Документ');
    });

    it('maps invoice type "act" → АктВыполненныхРабот', () => {
        const xml = buildCommerceMLXml([baseInv({ type: 'act' })]);
        expect(xml).toContain('АктВыполненныхРабот');
        expect(xml).toContain('Реализация услуг');
    });

    it('maps invoice type "upd" → УниверсальныйПередаточныйДокумент', () => {
        const xml = buildCommerceMLXml([baseInv({ type: 'upd' })]);
        expect(xml).toContain('УниверсальныйПередаточныйДокумент');
    });

    it('translates invoice status to Russian label', () => {
        const xml = buildCommerceMLXml([baseInv({ status: 'paid' })]);
        expect(xml).toContain('Оплачен');
    });

    it('falls back to "Неизвестный контрагент" when contractor missing', () => {
        const xml = buildCommerceMLXml([baseInv({ contractor: null })]);
        expect(xml).toContain('Неизвестный контрагент');
    });

    it('renders multiple invoices as an array of Документ nodes', () => {
        const xml = buildCommerceMLXml([
            baseInv({ id: 'a', number: 'INV-2026-00001' }),
            baseInv({ id: 'b', number: 'INV-2026-00002' }),
        ]);
        // The fast-xml-parser builder repeats <Документ> for each array entry.
        const matches = xml.match(/<Документ>/g) ?? [];
        expect(matches.length).toBe(2);
    });

    it('rounds money values to 2 decimal places', () => {
        const xml = buildCommerceMLXml([baseInv({
            subtotal: 1000.123,
            vatAmount: 200.456,
            total: 1200.579,
        })]);
        // Extract money-bearing tag contents and check none has > 2 decimals.
        const moneyTags = ['Сумма', 'СуммаБезНДС', 'СуммаНДС', 'СуммаВсего', 'ЦенаЗаЕдиницу', 'Итого'];
        for (const tag of moneyTags) {
            const matches = xml.matchAll(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'g'));
            for (const m of matches) {
                expect(m[1]).not.toMatch(/\.\d{3,}$/);
            }
        }
    });

    it('formats period and createdAt as YYYY-MM-DD', () => {
        const xml = buildCommerceMLXml([baseInv()]);
        expect(xml).toContain('2026-05-01');
        expect(xml).toContain('2026-05-31');
        expect(xml).toContain('2026-06-01');
    });

    it('aggregates line item count from tripIds length', () => {
        const xml = buildCommerceMLXml([baseInv({ tripIds: ['t1', 't2', 't3', 't4'] })]);
        expect(xml).toContain('(4 шт.)');
    });
});
