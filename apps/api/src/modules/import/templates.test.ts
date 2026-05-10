// ============================================================
// Round 3B — D11: import templates unit tests
// ============================================================
import { describe, it, expect } from 'vitest';
import { buildTemplate, parseTemplate, getTemplateColumns } from './templates.js';

describe('import templates', () => {
    const types = ['contractors', 'vehicles', 'drivers', 'orders'] as const;

    it.each(types)('builds a non-empty xlsx buffer for %s', (type) => {
        const buf = buildTemplate(type);
        expect(buf).toBeDefined();
        expect(buf.length).toBeGreaterThan(500);
        // XLSX files start with the ZIP magic bytes "PK"
        expect(buf[0]).toBe(0x50);
        expect(buf[1]).toBe(0x4b);
    });

    it.each(types)('round-trips %s template — sample rows are parseable', (type) => {
        const buf = buildTemplate(type);
        const rows = parseTemplate(type, buf);
        // Built-in template carries 2 sample rows
        expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('contractor template includes ИНН column', () => {
        const cols = getTemplateColumns('contractors');
        expect(cols.find((c) => c.key === 'inn')).toBeDefined();
    });

    it('order template includes contractorInn column', () => {
        const cols = getTemplateColumns('orders');
        expect(cols.find((c) => c.key === 'contractorInn')).toBeDefined();
    });

    it('parses licenseCategories as array', () => {
        const buf = buildTemplate('drivers');
        const rows = parseTemplate('drivers', buf);
        const sample = rows[0];
        expect(Array.isArray(sample.licenseCategories)).toBe(true);
    });

    it('parses coldChainRequired as boolean', () => {
        const buf = buildTemplate('orders');
        const rows = parseTemplate('orders', buf);
        const second = rows[1];
        expect(typeof second.coldChainRequired).toBe('boolean');
    });
});
