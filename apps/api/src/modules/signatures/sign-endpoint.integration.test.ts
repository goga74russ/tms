// ============================================================
// Integration tests for sign-endpoint routes.
//
// Покрываем auth/orgScope/валидация ветки маршрутов
//   POST /api/transport-documents/:id/sign
//   GET  /api/transport-documents/:id
//
// БД и провайдеры — мокаются. Реальный fastify-инстанс с auth-плагином
// поднимается через registerAuthRoutes(), JWT генерится через app.jwt.sign.
// Подход: ставим в очередь ожидаемые SELECT-результаты и распознаём
// таблицу по идентичности объекта (transportDocuments/trips/mchd).
// ============================================================
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';

// Env должно быть зафиксировано ДО любого импорта модулей, читающих env
// (db/connection, auth/auth).
vi.hoisted(() => {
    process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-jwt-secret-32b';
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

// ---- DB-моки -----------------------------------------------------------
// dbState — мутируемое состояние, которое тесты подгружают перед каждым
// вызовом. selectQueue читается строго по порядку: первый SELECT в коде
// должен соответствовать первому элементу в очереди.
interface SelectEntry {
    /** Опциональная проверка таблицы: если задано — должна совпасть. */
    table?: 'transportDocuments' | 'trips' | 'mchd';
    /** Результат (массив строк). limit(1) вернёт первый. */
    rows: unknown[];
}
const dbState: {
    selectQueue: SelectEntry[];
    updates: Array<{ values: Record<string, unknown>; where?: unknown }>;
    inserts: Array<{ values: unknown }>;
} = { selectQueue: [], updates: [], inserts: [] };

function tableName(tbl: unknown): string | undefined {
    // drizzle хранит имя в Symbol(drizzle:Name)
    if (!tbl || typeof tbl !== 'object') return undefined;
    const syms = Object.getOwnPropertySymbols(tbl);
    for (const s of syms) {
        if (s.description?.includes('Name')) {
            return (tbl as Record<symbol, string>)[s];
        }
    }
    return undefined;
}

function mapTableLabel(name: string | undefined): SelectEntry['table'] | undefined {
    if (name === 'transport_documents') return 'transportDocuments';
    if (name === 'trips') return 'trips';
    if (name === 'mchd') return 'mchd';
    return undefined;
}

vi.mock('../../db/connection.js', () => {
    const buildSelectChain = (tbl: unknown) => {
        const label = mapTableLabel(tableName(tbl));
        return {
            where: () => ({
                limit: () => {
                    const next = dbState.selectQueue.shift();
                    if (!next) {
                        throw new Error(`db.select(${label}): selectQueue is empty (unexpected query)`);
                    }
                    if (next.table && label && next.table !== label) {
                        throw new Error(`db.select: expected ${next.table}, got ${label}`);
                    }
                    return Promise.resolve(next.rows);
                },
            }),
        };
    };
    return {
        db: {
            select: () => ({ from: (tbl: unknown) => buildSelectChain(tbl) }),
            update: () => ({
                set: (values: Record<string, unknown>) => ({
                    where: (where: unknown) => {
                        dbState.updates.push({ values, where });
                        return Promise.resolve([]);
                    },
                }),
            }),
            insert: () => ({
                values: (values: unknown) => {
                    dbState.inserts.push({ values });
                    return Promise.resolve([]);
                },
            }),
        },
        sql: () => 'SQL',
    };
});

vi.mock('../../providers/index.js', () => ({
    getDefaultRegistry: () => ({ signature: [] }),
    selectAdapter: async () => ({
        name: 'gosklyuch',
        sign: async () => ({ externalId: 'gk-fake', deeplink: 'gosuslugi://x' }),
    }),
}));

// ---- Тестовое приложение -----------------------------------------------
import type { FastifyInstance } from 'fastify';
let app: FastifyInstance;

async function buildApp(): Promise<FastifyInstance> {
    const Fastify = (await import('fastify')).default;
    const a = Fastify({ logger: false });
    const { registerAuthRoutes } = await import('../../auth/auth.js');
    registerAuthRoutes(a);
    const signRoutes = (await import('./sign-endpoint.js')).default;
    await a.register(signRoutes, { prefix: '/api' });
    await a.ready();
    return a;
}

function signJwt(payload: { userId: string; roles: string[]; organizationId?: string | null }): string {
    return (app as unknown as { jwt: { sign: (p: unknown, o: unknown) => string } }).jwt.sign(
        {
            userId: payload.userId,
            roles: payload.roles,
            organizationId: payload.organizationId ?? undefined,
        },
        { expiresIn: '1h' },
    );
}

function authHdrs(token: string) {
    return { cookie: `tms_token=${token}`, authorization: `Bearer ${token}` };
}

const DOC_ID = '00000000-0000-0000-0000-000000000001';
const TRIP_ID = '00000000-0000-0000-0000-000000000002';
const ORG_ID = '00000000-0000-0000-0000-000000000003';
const OTHER_ORG_ID = '00000000-0000-0000-0000-000000000099';
const USER_ID = '00000000-0000-0000-0000-000000000004';
const MCHD_ID = '00000000-0000-0000-0000-000000000005';

function makeDoc(over: Partial<Record<string, unknown>> = {}) {
    return {
        id: DOC_ID,
        artifactId: 'a-1',
        tripId: TRIP_ID,
        titleType: null,
        externalId: 'ext-init',
        metadata: {},
        ...over,
    };
}

beforeAll(async () => {
    app = await buildApp();
});

afterAll(async () => {
    await app.close();
});

beforeEach(() => {
    dbState.selectQueue = [];
    dbState.updates = [];
    dbState.inserts = [];
});

// =========================================================================
// POST /api/transport-documents/:id/sign
// =========================================================================
describe('POST /api/transport-documents/:id/sign — auth + 404', () => {
    it('returns 401 without auth', async () => {
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(401);
        // SELECT-очередь не должна была тронуться: pre-handler отбил.
        expect(dbState.selectQueue).toEqual([]);
    });

    it('returns 404 when documentId not found', async () => {
        dbState.selectQueue.push({ table: 'transportDocuments', rows: [] });
        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            headers: authHdrs(token),
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toMatch(/не найден/i);
    });
});

describe('POST /api/transport-documents/:id/sign — org-scope', () => {
    it('returns 403 when document org != user org (cross-tenant)', async () => {
        dbState.selectQueue.push({ table: 'transportDocuments', rows: [makeDoc()] });
        dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: OTHER_ORG_ID }] });
        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            headers: authHdrs(token),
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toMatch(/другой организации/i);
    });

    it('returns 403 for super-admin (no organizationId)', async () => {
        dbState.selectQueue.push({ table: 'transportDocuments', rows: [makeDoc()] });
        dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: ORG_ID }] });
        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: null });
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            headers: authHdrs(token),
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toMatch(/super-admin/i);
    });
});

describe('POST /api/transport-documents/:id/sign — titleType mismatch', () => {
    it('returns 400 when titleType does not match stored doc.titleType', async () => {
        dbState.selectQueue.push({ table: 'transportDocuments', rows: [makeDoc({ titleType: 'T05' })] });
        dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: ORG_ID }] });
        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            headers: authHdrs(token),
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/титул T01.*титулу T05/);
    });
});

describe('POST /api/transport-documents/:id/sign — МЧД validation', () => {
    const okMchd = {
        id: MCHD_ID,
        status: 'active',
        issuedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2027-01-01T00:00:00Z'),
        granteeInn: '7707083893',
        organizationId: ORG_ID,
    };

    it('returns 400 when mchdId не принадлежит организации документа (запрос вернул пусто)', async () => {
        dbState.selectQueue.push({ table: 'transportDocuments', rows: [makeDoc()] });
        dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: ORG_ID }] });
        // запрос мчд возвращает пусто (and(eq id, eq organizationId) → 0)
        dbState.selectQueue.push({ table: 'mchd', rows: [] });
        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            headers: authHdrs(token),
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.error).toMatch(/МЧД/);
        expect(body.details.mchdProblems.some((p: string) => /не найдена/i.test(p))).toBe(true);
    });

    it('returns 400 when mchd.status != active', async () => {
        dbState.selectQueue.push({ table: 'transportDocuments', rows: [makeDoc()] });
        dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: ORG_ID }] });
        dbState.selectQueue.push({ table: 'mchd', rows: [{ ...okMchd, status: 'revoked' }] });
        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            headers: authHdrs(token),
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.details.mchdProblems.some((p: string) => /'revoked'/i.test(p))).toBe(true);
    });

    it('returns 400 when mchd.expiresAt < now', async () => {
        dbState.selectQueue.push({ table: 'transportDocuments', rows: [makeDoc()] });
        dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: ORG_ID }] });
        dbState.selectQueue.push({ table: 'mchd', rows: [{ ...okMchd, expiresAt: new Date('2020-01-01T00:00:00Z') }] });
        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            headers: authHdrs(token),
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.details.mchdProblems.some((p: string) => /истекла/i.test(p))).toBe(true);
    });

    it('returns 400 when signerInn !== mchd.granteeInn', async () => {
        dbState.selectQueue.push({ table: 'transportDocuments', rows: [makeDoc()] });
        dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: ORG_ID }] });
        dbState.selectQueue.push({ table: 'mchd', rows: [{ ...okMchd, granteeInn: '0000000000' }] });
        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            headers: authHdrs(token),
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.details.mchdProblems.some((p: string) => /не совпадает с granteeInn/i.test(p))).toBe(true);
    });
});

describe('POST /api/transport-documents/:id/sign — provider=mock in production', () => {
    it('returns 400 when provider=mock and NODE_ENV=production (МЧД обязательна, mock без mchdId)', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        try {
            dbState.selectQueue.push({ table: 'transportDocuments', rows: [makeDoc()] });
            dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: ORG_ID }] });
            const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
            const res = await app.inject({
                method: 'POST',
                url: `/api/transport-documents/${DOC_ID}/sign`,
                headers: authHdrs(token),
                // mock без mchdId — в prod должно дать 400
                payload: { provider: 'mock', titleType: 'T01' },
            });
            expect(res.statusCode).toBe(400);
            expect(res.json().error).toMatch(/МЧД|доверенности/i);
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });
});

describe('POST /api/transport-documents/:id/sign — happy path', () => {
    const okMchd = {
        id: MCHD_ID,
        status: 'active',
        issuedAt: new Date('2026-01-01T00:00:00Z'),
        expiresAt: new Date('2027-01-01T00:00:00Z'),
        granteeInn: '7707083893',
        organizationId: ORG_ID,
    };

    it('returns 200 with externalId + deeplink and writes pendingSignatures + signatureState', async () => {
        dbState.selectQueue.push({ table: 'transportDocuments', rows: [makeDoc()] });
        dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: ORG_ID }] });
        dbState.selectQueue.push({ table: 'mchd', rows: [okMchd] });

        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
        const res = await app.inject({
            method: 'POST',
            url: `/api/transport-documents/${DOC_ID}/sign`,
            headers: authHdrs(token),
            payload: { provider: 'gosklyuch', titleType: 'T01', mchdId: MCHD_ID, signerInn: '7707083893' },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.success).toBe(true);
        expect(typeof body.data.externalId).toBe('string');
        expect(body.data.externalId.length).toBeGreaterThan(10);
        // deeplink — gosuslugi://… (либо от мок-адаптера, либо fallback)
        expect(typeof body.data.deeplink).toBe('string');

        // Должен быть ровно один UPDATE на transport_documents с pendingSignatures
        expect(dbState.updates).toHaveLength(1);
        const u = dbState.updates[0]!.values as {
            metadata: Record<string, unknown>;
            externalId: string;
        };
        const pending = (u.metadata.pendingSignatures as Record<string, Record<string, unknown>>);
        expect(pending[body.data.externalId]).toMatchObject({
            titleType: 'T01',
            mchdId: MCHD_ID,
            signerInn: '7707083893',
            provider: 'gosklyuch',
            signerUserId: USER_ID,
        });
        const state = u.metadata.signatureState as Record<string, unknown>;
        expect(state.status).toBe('awaiting');
        expect(state.externalId).toBe(body.data.externalId);
        // externalId на самой строке тоже обновился
        expect(u.externalId).toBe(body.data.externalId);
    });
});

// =========================================================================
// GET /api/transport-documents/:id
// =========================================================================
describe('GET /api/transport-documents/:id — sanitization', () => {
    it('returns 200 and strips signedXml → signedXmlBytes', async () => {
        const xmlBody = '<x>some signed payload</x>';
        dbState.selectQueue.push({
            table: 'transportDocuments',
            rows: [makeDoc({
                metadata: {
                    signatures: [
                        { provider: 'gosklyuch', signedXml: xmlBody, signedAt: '2026-05-23T10:00:00Z' },
                    ],
                },
            })],
        });
        dbState.selectQueue.push({ table: 'trips', rows: [{ organizationId: ORG_ID }] });

        const token = signJwt({ userId: USER_ID, roles: ['admin'], organizationId: ORG_ID });
        const res = await app.inject({
            method: 'GET',
            url: `/api/transport-documents/${DOC_ID}`,
            headers: authHdrs(token),
        });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        const sigs = body.data.metadata.signatures;
        expect(sigs).toHaveLength(1);
        expect(sigs[0].signedXml).toBeUndefined();
        expect(sigs[0].signedXmlBytes).toBe(xmlBody.length);
        // другие поля сохраняются
        expect(sigs[0].provider).toBe('gosklyuch');
    });

    it('returns 401 without auth', async () => {
        const res = await app.inject({
            method: 'GET',
            url: `/api/transport-documents/${DOC_ID}`,
        });
        expect(res.statusCode).toBe(401);
    });
});
