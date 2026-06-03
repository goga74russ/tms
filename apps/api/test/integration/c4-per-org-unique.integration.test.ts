// ============================================================
// C4 (миг.0041) — per-org уникальность госномера/VIN ТС и ИНН контрагента.
// Инвариант: две РАЗНЫЕ орг могут иметь один госномер/ИНН; дубль ВНУТРИ орг — нет.
// ============================================================
import './setup.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
    ensureTestDbReady, truncateAllTables, seedBaseFixture, getTestDb, type BaseFixture,
} from './setup.js';

let fx: BaseFixture;
let orgBId: string;

beforeAll(async () => {
    await ensureTestDbReady();
});

beforeEach(async () => {
    await truncateAllTables();
    fx = await seedBaseFixture();
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const [orgB] = await db.insert(schema.organizations).values({ name: 'Org B', taxRegime: 'osno' }).returning();
    orgBId = orgB!.id;
});

afterAll(async () => { /* pool closed by setup */ });

const vehicle = (orgId: string, plate: string, vin: string) => ({
    plateNumber: plate, vin, make: 'KAMAZ', model: 'Test', year: 2024,
    bodyType: 'tent', payloadCapacityKg: 20000, status: 'available' as const, organizationId: orgId,
});

describe('C4: per-org уникальность ТС', () => {
    it('две РАЗНЫЕ орг могут иметь один госномер и VIN', async () => {
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        await db.insert(schema.vehicles).values(vehicle(fx.organizationId, 'A111AA77', 'VINSAME0000000001'));
        // Та же plate + VIN, но другая орг — раньше падало (глобальный unique), теперь ok.
        await expect(
            db.insert(schema.vehicles).values(vehicle(orgBId, 'A111AA77', 'VINSAME0000000001')),
        ).resolves.toBeDefined();
    });

    it('дубль госномера ВНУТРИ одной орг — отклоняется (unique violation)', async () => {
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        await db.insert(schema.vehicles).values(vehicle(fx.organizationId, 'B222BB77', 'VINDUP00000000001'));
        await expect(
            db.insert(schema.vehicles).values(vehicle(fx.organizationId, 'B222BB77', 'VINDUP00000000002')),
        ).rejects.toThrow();
    });
});

describe('C4: per-org уникальность ИНН контрагента', () => {
    const contractor = (orgId: string, inn: string) => ({
        name: 'Test', inn, legalAddress: 'addr', organizationId: orgId,
    });

    it('две РАЗНЫЕ орг могут иметь контрагента с одним ИНН', async () => {
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        await db.insert(schema.contractors).values(contractor(fx.organizationId, '7712345678'));
        await expect(
            db.insert(schema.contractors).values(contractor(orgBId, '7712345678')),
        ).resolves.toBeDefined();
    });

    it('дубль ИНН ВНУТРИ одной орг — отклоняется', async () => {
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        await db.insert(schema.contractors).values(contractor(fx.organizationId, '7787654321'));
        await expect(
            db.insert(schema.contractors).values(contractor(fx.organizationId, '7787654321')),
        ).rejects.toThrow();
    });
});
