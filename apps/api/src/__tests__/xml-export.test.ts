// ============================================================
// XML Export Service — Unit Tests
// ============================================================
import { describe, it, expect } from 'vitest';
import { buildCommerceMLXml, type InvoiceExportRow } from '../modules/finance/xml-export.service.js';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const sampleInvoice: InvoiceExportRow = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    number: 'INV-2026-00001',
    type: 'invoice',
    status: 'draft',
    subtotal: 20833.33,
    vatAmount: 4166.67,
    total: 25000,
    periodStart: new Date('2026-02-01'),
    periodEnd: new Date('2026-02-28'),
    createdAt: new Date('2026-03-01T10:00:00Z'),
    contractor: {
        name: 'ООО «Тест Логистик»',
        inn: '7712345678',
        kpp: '771201001',
        legalAddress: 'г. Москва, ул. Тестовая, д. 1',
    },
    tripIds: ['trip-1', 'trip-2'],
};

describe('XML Export Service — buildCommerceMLXml', () => {
    it('should produce valid XML', () => {
        const xml = buildCommerceMLXml([sampleInvoice]);
        const result = XMLValidator.validate(xml);
        expect(result).toBe(true);
    });

    it('should contain <?xml header', () => {
        const xml = buildCommerceMLXml([sampleInvoice]);
        expect(xml).toContain('<?xml');
        expect(xml).toContain('UTF-8');
    });

    it('should contain КоммерческаяИнформация root element', () => {
        const xml = buildCommerceMLXml([sampleInvoice]);
        expect(xml).toContain('<КоммерческаяИнформация');
        expect(xml).toContain('ВерсияСхемы="2.10"');
    });

    it('should include invoice number and contractor info', () => {
        const xml = buildCommerceMLXml([sampleInvoice]);
        expect(xml).toContain('INV-2026-00001');
        expect(xml).toContain('7712345678');
        expect(xml).toContain('ООО «Тест Логистик»');
    });

    it('should include financial amounts', () => {
        const xml = buildCommerceMLXml([sampleInvoice]);
        // parse and check amounts
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
        const parsed = parser.parse(xml);
        const doc = parsed['КоммерческаяИнформация']['Документ'];
        expect(doc['Сумма']).toBe(25000);
    });

    it('should handle multiple invoices', () => {
        const secondInvoice: InvoiceExportRow = {
            ...sampleInvoice,
            id: '660e8400-e29b-41d4-a716-446655440001',
            number: 'ACT-2026-00001',
            type: 'act',
            total: 15000,
            subtotal: 12500,
            vatAmount: 2500,
        };

        const xml = buildCommerceMLXml([sampleInvoice, secondInvoice]);
        expect(xml).toContain('INV-2026-00001');
        expect(xml).toContain('ACT-2026-00001');
        expect(xml).toContain('АктВыполненныхРабот');
    });

    it('should produce valid XML with zero invoices', () => {
        const xml = buildCommerceMLXml([]);
        const result = XMLValidator.validate(xml);
        expect(result).toBe(true);
        expect(xml).toContain('<КоммерческаяИнформация');
        // No <Документ> element when empty
        expect(xml).not.toContain('<Документ>');
    });

    it('should handle missing contractor gracefully', () => {
        const noContractor: InvoiceExportRow = {
            ...sampleInvoice,
            contractor: null,
        };
        const xml = buildCommerceMLXml([noContractor]);
        const result = XMLValidator.validate(xml);
        expect(result).toBe(true);
        expect(xml).toContain('Неизвестный контрагент');
    });

    it('should map invoice types correctly', () => {
        const upd: InvoiceExportRow = { ...sampleInvoice, type: 'upd' };
        const xml = buildCommerceMLXml([upd]);
        expect(xml).toContain('УниверсальныйПередаточныйДокумент');
    });
});
