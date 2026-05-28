// ============================================================
// Integration tests — T-2 cross-tenant event-leak fix.
//
// events/journal.ts readers раньше игнорировали organizationId:
//   getRecentEvents()  → последние события по ВСЕМ орг (явная утечка)
//   getEntityEvents()  → по entityId без org-фильтра (чужой журнал по UUID)
//
// Теперь organizationId обязателен. Эти тесты фиксируют инвариант:
// чтение скоупится по орг; null = осознанный system/super-admin cross-tenant.
// ============================================================
import './setup.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
    ensureTestDbReady,
    truncateAllTables,
    seedBaseFixture,
    getTestDb,
    type BaseFixture,
} from './setup.js';
import { getEntityEvents, getRecentEvents } from '../../src/events/journal.js';

let fx: BaseFixture;
let orgBId: string;
let orgBUserId: string;

// Один и тот же entityId под обеими орг — ключевой кейс утечки:
// зная чужой UUID, нельзя прочитать его журнал.
const SHARED_TRIP_ID = '00000000-0000-4000-8000-000000000abc';

beforeAll(async () => {
    await ensureTestDbReady();
});

beforeEach(async () => {
    await truncateAllTables();
    fx = await seedBaseFixture();

    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const { hashPassword } = await import('../../src/auth/auth.js');

    const [orgB] = await db.insert(schema.organizations).values({ name: 'Org B' }).returning();
    orgBId = orgB!.id;
    const [userB] = await db.insert(schema.users).values({
        email: 'admin-b@test.local',
        passwordHash: await hashPassword('IntegrationTest1!'),
        fullName: 'Org B Admin',
        roles: ['admin'],
        organizationId: orgBId,
        isActive: true,
        emailVerifiedAt: new Date(),
    }).returning();
    orgBUserId = userB!.id;

    // orgA: 2 события (одно — на SHARED_TRIP_ID)
    await db.insert(schema.events).values([
        {
            organizationId: fx.organizationId, authorId: fx.adminUserId, authorRole: 'admin',
            eventType: 'trip.created', entityType: 'trip', entityId: SHARED_TRIP_ID,
            data: { tenant: 'A' },
        },
        {
            organizationId: fx.organizationId, authorId: fx.adminUserId, authorRole: 'admin',
            eventType: 'order.created', entityType: 'order',
            entityId: '00000000-0000-4000-8000-0000000000a1', data: { tenant: 'A' },
        },
    ]);
    // orgB: 2 события (одно — на ТОТ ЖЕ SHARED_TRIP_ID)
    await db.insert(schema.events).values([
        {
            organizationId: orgBId, authorId: orgBUserId, authorRole: 'admin',
            eventType: 'trip.created', entityType: 'trip', entityId: SHARED_TRIP_ID,
            data: { tenant: 'B' },
        },
        {
            organizationId: orgBId, authorId: orgBUserId, authorRole: 'admin',
            eventType: 'order.created', entityType: 'order',
            entityId: '00000000-0000-4000-8000-0000000000b1', data: { tenant: 'B' },
        },
    ]);
});

afterAll(async () => {
    await truncateAllTables();
});

describe('T-2 — getRecentEvents org-scope', () => {
    it('orgA sees only its own events', async () => {
        const rows = await getRecentEvents(fx.organizationId);
        expect(rows.length).toBe(2);
        expect(rows.every((r) => r.organizationId === fx.organizationId)).toBe(true);
    });

    it('orgB sees only its own events', async () => {
        const rows = await getRecentEvents(orgBId);
        expect(rows.length).toBe(2);
        expect(rows.every((r) => r.organizationId === orgBId)).toBe(true);
    });

    it('null (system/super-admin) sees all tenants', async () => {
        const rows = await getRecentEvents(null);
        expect(rows.length).toBe(4);
    });
});

describe('T-2 — getEntityEvents org-scope (same entityId across tenants)', () => {
    it('orgA reading the shared trip id gets ONLY its own event', async () => {
        const rows = await getEntityEvents('trip', SHARED_TRIP_ID, fx.organizationId);
        expect(rows.length).toBe(1);
        expect(rows[0]!.organizationId).toBe(fx.organizationId);
        expect((rows[0]!.data as Record<string, unknown>).tenant).toBe('A');
    });

    it('orgB reading the same trip id gets ONLY its own event (no cross-tenant leak)', async () => {
        const rows = await getEntityEvents('trip', SHARED_TRIP_ID, orgBId);
        expect(rows.length).toBe(1);
        expect(rows[0]!.organizationId).toBe(orgBId);
        expect((rows[0]!.data as Record<string, unknown>).tenant).toBe('B');
    });

    it('null returns both tenants events for the shared id (system)', async () => {
        const rows = await getEntityEvents('trip', SHARED_TRIP_ID, null);
        expect(rows.length).toBe(2);
    });
});
