// ============================================================
// Integration tests — subcontract legal gating (MVP-fallback).
//
// Covers docs/legal/subcontract-legal-analysis.md:
//   Gap 1 — POST /api/waybills/generate/:tripId блокируется для
//           execution_mode='subcontract' (ПЛ оформляет эксплуатант-подрядчик)
//   Gap 2 — POST /api/transport-documents/:id/sign блокируется для
//           subcontract-рейса (ЭТрН-роли не определены для наёмного)
//
// Свой парк (execution_mode='own') НЕ затронут — оба flow работают.
// ============================================================
import './setup.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
    ensureTestDbReady,
    truncateAllTables,
    seedBaseFixture,
    buildTestApp,
    signTestToken,
    authHeaders,
    getTestDb,
    type BaseFixture,
} from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let fx: BaseFixture;

beforeAll(async () => {
    await ensureTestDbReady();
    app = await buildTestApp({
        routes: [
            async (a) => {
                const waybillsRoutes = (await import('../../src/modules/waybills/routes.js')).default;
                await a.register(waybillsRoutes, { prefix: '/api' });
                const signRoutes = (await import('../../src/modules/signatures/sign-endpoint.js')).default;
                await a.register(signRoutes, { prefix: '/api' });
            },
        ],
    });
});

afterAll(async () => {
    await app.close();
});

beforeEach(async () => {
    await truncateAllTables();
    fx = await seedBaseFixture();
});

function adminToken() {
    return signTestToken(app, {
        userId: fx.adminUserId, roles: ['admin'], organizationId: fx.organizationId,
    });
}

async function seedTrip(opts: { number: string; executionMode: 'own' | 'subcontract' }) {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const [trip] = await db.insert(schema.trips).values({
        number: opts.number,
        status: 'planning',
        vehicleId: fx.vehicleId,
        driverId: fx.driverId,
        executionMode: opts.executionMode,
        organizationId: fx.organizationId,
        createdBy: fx.adminUserId,
    }).returning();
    return trip!;
}

async function seedTransportDoc(opts: { tripId: string; titleType: string }) {
    const db = await getTestDb();
    const schema = await import('../../src/db/schema.js');
    const [doc] = await db.insert(schema.transportDocuments).values({
        artifactId: `etrn:${opts.tripId}:${opts.titleType}`,
        artifactKind: 'transport_document',
        correlationId: `corr-${opts.tripId}-${opts.titleType}`,
        snapshotId: `snap-${opts.titleType}`,
        externalId: `ext-${opts.tripId}-${opts.titleType}`,
        tripId: opts.tripId,
        titleType: opts.titleType,
        sourceKey: `etrn-${opts.titleType}`,
        status: 'pending',
    }).returning();
    return doc!;
}

// ============================================================
// Gap 1 — ПЛ (waybill) generation gating
// ============================================================

describe('Gap 1 — waybill generation gating by execution_mode', () => {
    it('blocks waybill generation for subcontract trip (422 SUBCONTRACT_WAYBILL_BLOCKED)', async () => {
        const trip = await seedTrip({ number: 'TR-SUB-1', executionMode: 'subcontract' });

        const res = await app.inject({
            method: 'POST', url: `/api/waybills/generate/${trip.id}`,
            headers: authHeaders(adminToken()),
        });
        expect(res.statusCode).toBe(422);
        const body = res.json();
        expect(body.error).toMatch(/подрядчик-эксплуатант/i);
    });

    it('own-fleet trip does NOT hit the subcontract block (fails later on readiness, not 422-subcontract)', async () => {
        const trip = await seedTrip({ number: 'TR-OWN-1', executionMode: 'own' });

        const res = await app.inject({
            method: 'POST', url: `/api/waybills/generate/${trip.id}`,
            headers: authHeaders(adminToken()),
        });
        // own trip проходит subcontract-gate; дальше упрётся в readiness
        // (нет осмотров) — но это НЕ наш SUBCONTRACT_WAYBILL_BLOCKED.
        const body = res.json();
        if (res.statusCode === 422) {
            expect(body.error ?? '').not.toMatch(/подрядчик-эксплуатант/i);
        }
    });
});

// ============================================================
// Gap 2 — ЭТрН (sign) gating
// ============================================================

describe('Gap 2 — ЭТрН sign gating by execution_mode', () => {
    it('blocks ЭТрН sign for subcontract trip (422 SUBCONTRACT_ETRN_BLOCKED)', async () => {
        const trip = await seedTrip({ number: 'TR-SUB-2', executionMode: 'subcontract' });
        const doc = await seedTransportDoc({ tripId: trip.id, titleType: 'T02' });

        const res = await app.inject({
            method: 'POST', url: `/api/transport-documents/${doc.id}/sign`,
            headers: authHeaders(adminToken()),
            payload: { titleType: 'T02', provider: 'gosklyuch' },
        });
        expect(res.statusCode).toBe(422);
        const body = res.json();
        expect(body.code).toBe('SUBCONTRACT_ETRN_BLOCKED');
    });

    it('own-fleet trip passes the subcontract ЭТрН gate', async () => {
        const trip = await seedTrip({ number: 'TR-OWN-2', executionMode: 'own' });
        const doc = await seedTransportDoc({ tripId: trip.id, titleType: 'T02' });

        const res = await app.inject({
            method: 'POST', url: `/api/transport-documents/${doc.id}/sign`,
            headers: authHeaders(adminToken()),
            payload: { titleType: 'T02', provider: 'gosklyuch' },
        });
        // own проходит subcontract-gate; дальше — МЧД-валидация или провайдер.
        // Главное: НЕ SUBCONTRACT_ETRN_BLOCKED.
        if (res.statusCode === 422) {
            const body = res.json();
            expect(body.code).not.toBe('SUBCONTRACT_ETRN_BLOCKED');
        }
    });
});
