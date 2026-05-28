// ============================================================
// Integration tests — T-7 RBAC sweep.
//
// Покрывает дыры авторизации, найденные аудитом T-7:
//   HIGH — POST /onboarding/invite-team: любой член орг мог создать
//          нового admin'а (privilege escalation). Теперь admin-only.
//   MED  — POST /onboarding/profile: перезапись реквизитов ЮЛ — admin-only.
//   MED  — POST /billing/subscribe / /billing/cancel: платёж/отмена
//          подписки орг — admin-only.
//
// Главный инвариант: не-admin роль (dispatcher) получает 403; admin
// проходит role-гейт (дальше может упасть по другой причине, но НЕ 403).
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
                const onboardingRoutes = (await import('../../src/modules/onboarding/routes.js')).default;
                await a.register(onboardingRoutes, { prefix: '/api' });
                const billingRoutes = (await import('../../src/modules/billing/routes.js')).default;
                await a.register(billingRoutes, { prefix: '/api' });
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
function dispatcherToken() {
    return signTestToken(app, {
        userId: fx.dispatcherUserId, roles: ['dispatcher'], organizationId: fx.organizationId,
    });
}

// ============================================================
// HIGH — onboarding/invite-team privilege escalation
// ============================================================

describe('T-7 HIGH — onboarding/invite-team admin gate', () => {
    const invitePayload = {
        invites: [{ email: 'evil-admin@example.com', fullName: 'Evil Admin', roles: ['admin'] }],
    };

    it('blocks non-admin (dispatcher) from inviting users — no priv-escalation (403)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/onboarding/invite-team',
            headers: authHeaders(dispatcherToken()),
            payload: invitePayload,
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toMatch(/admin only/i);
    });

    it('admin passes the invite-team role gate (not 403)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/onboarding/invite-team',
            headers: authHeaders(adminToken()),
            payload: invitePayload,
        });
        expect(res.statusCode).not.toBe(403);
    });
});

// ============================================================
// MED — onboarding/profile (org legal requisites)
// ============================================================

describe('T-7 MED — onboarding/profile admin gate', () => {
    const profilePayload = { inn: '7707083893', name: 'ООО Подмена Реквизитов' };

    it('blocks non-admin from rewriting org requisites (403)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/onboarding/profile',
            headers: authHeaders(dispatcherToken()),
            payload: profilePayload,
        });
        expect(res.statusCode).toBe(403);
    });

    it('admin passes the profile role gate (not 403)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/onboarding/profile',
            headers: authHeaders(adminToken()),
            payload: profilePayload,
        });
        expect(res.statusCode).not.toBe(403);
    });
});

// ============================================================
// MED — billing/subscribe + cancel (org subscription/payment)
// ============================================================

describe('T-7 MED — billing subscribe/cancel admin gate', () => {
    it('blocks non-admin from POST /billing/subscribe (403)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/billing/subscribe',
            headers: authHeaders(dispatcherToken()),
            payload: { planId: 'pro' },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toMatch(/admin only/i);
    });

    it('blocks non-admin from POST /billing/cancel (403)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/billing/cancel',
            headers: authHeaders(dispatcherToken()),
            payload: {},
        });
        expect(res.statusCode).toBe(403);
    });

    it('admin passes the subscribe role gate (not 403)', async () => {
        const res = await app.inject({
            method: 'POST', url: '/api/billing/subscribe',
            headers: authHeaders(adminToken()),
            payload: { planId: 'pro' },
        });
        // admin проходит role-гейт; может упасть на провайдере/валидации,
        // но это НЕ 403.
        expect(res.statusCode).not.toBe(403);
    });
});
