// ============================================================
// Integration tests — /api/auth/*
//
// Covers login, signup, email verification, /me, logout. Hits the
// real test Postgres so RBAC + cookie flow are exercised end to
// end.
// ============================================================
import './setup.js';
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
    ensureTestDbReady,
    truncateAllTables,
    seedBaseFixture,
    buildTestApp,
    type BaseFixture,
} from './setup.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let fx: BaseFixture;

beforeAll(async () => {
    await ensureTestDbReady();
    app = await buildTestApp();
});

afterAll(async () => {
    await app.close();
});

beforeEach(async () => {
    await truncateAllTables();
    fx = await seedBaseFixture();
});

describe('POST /api/auth/login', () => {
    it('returns 200 + sets cookie on valid credentials', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'admin@test.local', password: fx.password },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.user.email).toBe('admin@test.local');
        expect(body.data.user.roles).toEqual(['admin']);
        const setCookie = res.headers['set-cookie'];
        const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : setCookie ?? '';
        expect(cookieStr).toMatch(/tms_token=/);
        expect(cookieStr).toMatch(/HttpOnly/i);
    });

    it('returns 401 on wrong password', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'admin@test.local', password: 'wrong-password' },
        });
        expect(res.statusCode).toBe(401);
        // Сообщение локализовано (RU-facing продукт); enumeration-safe — одинаковое
        // для несуществующего email и неверного пароля.
        expect(res.json().error).toBe('Неверный email или пароль');
    });

    it('returns 401 on unknown email (no enumeration leak)', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'nobody@test.local', password: 'anything-long' },
        });
        expect(res.statusCode).toBe(401);
    });

    it('returns 400 when email is missing', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { password: 'whatever' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('returns 400 on malformed email', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'not-an-email', password: 'whatever' },
        });
        expect(res.statusCode).toBe(400);
    });
});

describe('POST /api/auth/signup + verify-email flow', () => {
    it('creates inactive user + organization and returns 201', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/signup',
            payload: {
                email: 'newuser@test.local',
                password: 'Password123!',
                fullName: 'New User',
                companyName: 'New Co',
            },
        });
        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.status).toBe('pending');
        expect(body.data.signupId).toBeTruthy();
    });

    it('returns enumeration-safe 201 on duplicate verified email', async () => {
        // admin@test.local is already verified in the fixture
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/signup',
            payload: {
                email: 'admin@test.local',
                password: 'Password123!',
                fullName: 'Phisher',
            },
        });
        // A-P2: same 201 shape regardless of whether email is registered
        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.status).toBe('pending');
    });

    it('verifies email with correct code → 200 + activates user', async () => {
        const signupRes = await app.inject({
            method: 'POST',
            url: '/api/auth/signup',
            payload: {
                email: 'verify@test.local',
                password: 'Password123!',
                fullName: 'Verify User',
            },
        });
        expect(signupRes.statusCode).toBe(201);

        // Pull the code from the DB (the email provider is the console mock).
        const { getTestDb } = await import('./setup.js');
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const { eq, desc } = await import('drizzle-orm');
        const [row] = await db.select().from(schema.emailVerifications)
            .where(eq(schema.emailVerifications.email, 'verify@test.local'))
            .orderBy(desc(schema.emailVerifications.createdAt))
            .limit(1);
        expect(row).toBeTruthy();

        const verifyRes = await app.inject({
            method: 'POST',
            url: '/api/auth/verify-email',
            payload: { email: 'verify@test.local', code: row!.code },
        });
        expect(verifyRes.statusCode).toBe(200);
        const body = verifyRes.json();
        expect(body.success).toBe(true);
        expect(body.data.user.email).toBe('verify@test.local');
        // Cookie set
        const setCookie = verifyRes.headers['set-cookie'];
        const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : setCookie ?? '';
        expect(cookieStr).toMatch(/tms_token=/);

        // Verify isActive flipped + emailVerifiedAt set.
        const [u] = await db.select().from(schema.users)
            .where(eq(schema.users.email, 'verify@test.local'))
            .limit(1);
        expect(u!.isActive).toBe(true);
        expect(u!.emailVerifiedAt).not.toBeNull();
    });

    it('returns 400 on wrong code', async () => {
        await app.inject({
            method: 'POST',
            url: '/api/auth/signup',
            payload: {
                email: 'wrongcode@test.local',
                password: 'Password123!',
                fullName: 'X',
            },
        });
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/verify-email',
            payload: { email: 'wrongcode@test.local', code: '000000' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('returns 400 on malformed code', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/verify-email',
            payload: { email: 'admin@test.local', code: 'abc' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('returns 400 on expired code', async () => {
        await app.inject({
            method: 'POST',
            url: '/api/auth/signup',
            payload: {
                email: 'expired@test.local',
                password: 'Password123!',
                fullName: 'Expired',
            },
        });
        const { getTestDb } = await import('./setup.js');
        const db = await getTestDb();
        const schema = await import('../../src/db/schema.js');
        const { eq } = await import('drizzle-orm');
        // Manually expire the code.
        await db.update(schema.emailVerifications)
            .set({ expiresAt: new Date(Date.now() - 60_000) })
            .where(eq(schema.emailVerifications.email, 'expired@test.local'));

        const [row] = await db.select().from(schema.emailVerifications)
            .where(eq(schema.emailVerifications.email, 'expired@test.local'))
            .limit(1);
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/verify-email',
            payload: { email: 'expired@test.local', code: row!.code },
        });
        expect(res.statusCode).toBe(400);
    });
});

describe('GET /api/auth/me', () => {
    it('returns user data when authenticated via cookie', async () => {
        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'admin@test.local', password: fx.password },
        });
        const setCookie = loginRes.headers['set-cookie'];
        const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie ?? '';

        const meRes = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: { cookie: cookieStr },
        });
        expect(meRes.statusCode).toBe(200);
        const body = meRes.json();
        expect(body.data.email).toBe('admin@test.local');
    });

    it('returns 401 without a cookie or bearer', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
        });
        expect(res.statusCode).toBe(401);
    });

    it('returns driverId when authenticated as driver', async () => {
        const loginRes = await app.inject({
            method: 'POST',
            url: '/api/auth/login',
            payload: { email: 'driver@test.local', password: fx.password },
        });
        const setCookie = loginRes.headers['set-cookie'];
        const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie ?? '';

        const meRes = await app.inject({
            method: 'GET',
            url: '/api/auth/me',
            headers: { cookie: cookieStr },
        });
        expect(meRes.statusCode).toBe(200);
        const body = meRes.json();
        expect(body.data.driverId).toBe(fx.driverId);
    });
});

describe('POST /api/auth/logout', () => {
    it('clears the cookie and returns 200', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/logout',
        });
        expect(res.statusCode).toBe(200);
        const setCookie = res.headers['set-cookie'];
        const cookieStr = Array.isArray(setCookie) ? setCookie.join(';') : setCookie ?? '';
        // Clearing the cookie sets it to empty or with an Expires in the past.
        expect(cookieStr).toMatch(/tms_token=/);
    });
});

describe('POST /api/auth/mobile/login', () => {
    it('returns bearer token in body on success', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/mobile/login',
            payload: { email: 'admin@test.local', password: fx.password },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.data.token).toBeTruthy();
        expect(body.data.user.email).toBe('admin@test.local');
    });

    it('returns 401 on wrong password', async () => {
        const res = await app.inject({
            method: 'POST',
            url: '/api/auth/mobile/login',
            payload: { email: 'admin@test.local', password: 'wrong-but-long-enough' },
        });
        expect(res.statusCode).toBe(401);
    });
});
