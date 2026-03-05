// ============================================================
// Integration Tests — Mock services + Worker processors
// ============================================================

process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock DB ---
vi.mock('../db/connection.js', () => ({
    db: {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{ id: 'test-uuid' }]),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
    } as any,
}));

vi.mock('../events/journal.js', () => ({
    recordEvent: vi.fn().mockResolvedValue({ id: 'event-uuid' }),
}));

// --- Test Mock Services ---

describe('WialonMockService', () => {
    it('should return telemetry for a plate number', async () => {
        const { getVehicleTelemetry } = await import('../integrations/mocks/wialon.mock.js');
        const result = getVehicleTelemetry('А001АА77', 50000);

        expect(result).toBeDefined();
        expect(result.plateNumber).toBe('А001АА77');
        expect(result.odometerKm).toBeGreaterThan(50000); // Should increment
        expect(result.lat).toBeGreaterThan(55);
        expect(result.lon).toBeGreaterThan(37);
        expect(typeof result.speed).toBe('number');
        expect(typeof result.fuelLevelLiters).toBe('number');
        expect(typeof result.engineOn).toBe('boolean');
    });

    it('should return deterministic results for same plate', async () => {
        const { getVehicleTelemetry } = await import('../integrations/mocks/wialon.mock.js');
        const result1 = getVehicleTelemetry('Б002ББ99', 10000);
        const result2 = getVehicleTelemetry('Б002ББ99', 10000);

        expect(result1.odometerKm).toBe(result2.odometerKm);
        expect(result1.lat).toBe(result2.lat);
        expect(result1.lon).toBe(result2.lon);
    });

    it('should handle batch telemetry', async () => {
        const { getBatchTelemetry } = await import('../integrations/mocks/wialon.mock.js');
        const vehicles = [
            { plateNumber: 'А001АА77', currentOdometerKm: 10000 },
            { plateNumber: 'Б002ББ99', currentOdometerKm: 20000 },
        ];

        const results = getBatchTelemetry(vehicles);
        expect(results).toHaveLength(2);
        expect(results[0].plateNumber).toBe('А001АА77');
        expect(results[1].plateNumber).toBe('Б002ББ99');
    });
});

describe('GibddMockService', () => {
    it('should return fines for a plate number', async () => {
        const { lookupFines } = await import('../integrations/mocks/gibdd.mock.js');
        const fines = lookupFines('А001АА77');

        expect(Array.isArray(fines)).toBe(true);
        for (const fine of fines) {
            expect(fine.resolutionNumber).toBeTruthy();
            expect(fine.plateNumber).toBe('А001АА77');
            expect(fine.violationType).toBeTruthy();
            expect(fine.amount).toBeGreaterThan(0);
        }
    });

    it('should return deterministic results', async () => {
        const { lookupFines } = await import('../integrations/mocks/gibdd.mock.js');
        const fines1 = lookupFines('В003ВВ77');
        const fines2 = lookupFines('В003ВВ77');

        expect(fines1.length).toBe(fines2.length);
        if (fines1.length > 0) {
            expect(fines1[0].resolutionNumber).toBe(fines2[0].resolutionNumber);
        }
    });

    it('should batch lookup', async () => {
        const { batchLookupFines } = await import('../integrations/mocks/gibdd.mock.js');
        const result = batchLookupFines(['А001АА77', 'Б002ББ99']);

        expect(result['А001АА77']).toBeDefined();
        expect(result['Б002ББ99']).toBeDefined();
    });
});

describe('DaDataMockService', () => {
    it('should return known company by INN', async () => {
        const { findByInn } = await import('../integrations/mocks/dadata.mock.js');
        const sber = findByInn('7707083893');

        expect(sber).not.toBeNull();
        expect(sber!.name).toContain('Сбербанк');
        expect(sber!.inn).toBe('7707083893');
        expect(sber!.kpp).toBeTruthy();
        expect(sber!.legalAddress).toBeTruthy();
        expect(sber!.status).toBe('ACTIVE');
    });

    it('should generate mock company for unknown INN', async () => {
        const { findByInn } = await import('../integrations/mocks/dadata.mock.js');
        const company = findByInn('1234567890');

        expect(company).not.toBeNull();
        expect(company!.inn).toBe('1234567890');
        expect(company!.name).toBeTruthy();
        expect(company!.legalAddress).toBeTruthy();
    });

    it('should return null for invalid INN format', async () => {
        const { findByInn } = await import('../integrations/mocks/dadata.mock.js');
        const result = findByInn('invalid');

        expect(result).toBeNull();
    });

    it('should suggest addresses', async () => {
        const { suggestAddress } = await import('../integrations/mocks/dadata.mock.js');
        const suggestions = suggestAddress('ул. Ленина');

        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions[0].value).toContain('Ленина');
    });

    it('should validate BIK', async () => {
        const { validateBik } = await import('../integrations/mocks/dadata.mock.js');

        const valid = validateBik('044525225');
        expect(valid.valid).toBe(true);
        expect(valid.bankName).toContain('Сбербанк');

        const invalid = validateBik('12345');
        expect(invalid.valid).toBe(false);
    });
});

describe('FuelCardMockService', () => {
    it('should return transactions', async () => {
        const { getTransactions } = await import('../integrations/mocks/fuel-card.mock.js');
        const txns = getTransactions('А001АА77', 100000, 30);

        expect(txns.length).toBeGreaterThan(0);
        for (const tx of txns) {
            expect(tx.plateNumber).toBe('А001АА77');
            expect(tx.liters).toBeGreaterThan(0);
            expect(tx.totalCost).toBeGreaterThan(0);
            expect(tx.stationName).toBeTruthy();
        }
    });

    it('should return fuel summary', async () => {
        const { getFuelSummary } = await import('../integrations/mocks/fuel-card.mock.js');
        const summary = getFuelSummary('А001АА77', 100000, 30);

        expect(summary.totalLiters).toBeGreaterThan(0);
        expect(summary.totalCost).toBeGreaterThan(0);
        expect(summary.transactions).toBeGreaterThan(0);
        expect(summary.avgPricePerLiter).toBeGreaterThan(0);
    });
});
