// Quick smoke test to validate the integration infra itself.
import './setup.js';
import { describe, it, expect, beforeAll } from 'vitest';
import {
    ensureTestDbReady,
    getTestSql,
    truncateAllTables,
    seedBaseFixture,
    buildTestApp,
    signTestToken,
    authHeaders,
} from './setup.js';

describe('integration infra smoke', () => {
    beforeAll(async () => {
        await ensureTestDbReady();
    });

    it('test DB is reachable and has migrations applied', async () => {
        const sql = await getTestSql();
        const rows = await sql<{ count: bigint }[]>`
            SELECT COUNT(*)::bigint AS count
            FROM information_schema.tables
            WHERE table_schema = 'public'
        `;
        expect(Number(rows[0]!.count)).toBeGreaterThan(20);
    });

    it('truncate + seed gives a clean fixture', async () => {
        await truncateAllTables();
        const fx = await seedBaseFixture();
        expect(fx.organizationId).toBeTruthy();
        expect(fx.adminUserId).toBeTruthy();
        expect(fx.driverId).toBeTruthy();
        expect(fx.vehicleId).toBeTruthy();
    });

    it('builds a test Fastify app and answers /api/auth/me', async () => {
        await truncateAllTables();
        const fx = await seedBaseFixture();

        const app = await buildTestApp();
        const token = signTestToken(app, {
            userId: fx.adminUserId,
            roles: ['admin'],
            organizationId: fx.organizationId,
        });
        const res = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: authHeaders(token),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.email).toBe('admin@test.local');
        await app.close();
    });
});
