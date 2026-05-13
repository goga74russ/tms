// ============================================================
// Integration test infrastructure.
//
// Boots a real Fastify instance wired to the test Postgres (port
// 15432) + Redis (port 16379) brought up by docker-compose.test.yml.
//
// Test ordering: vitest is configured for `singleFork` so the suite
// runs sequentially against ONE shared DB. Per-test isolation comes
// from `truncateAllTables()` in beforeEach hooks — slower than
// transactions but bullet-proof against handlers that swallow
// their own transactions.
//
// **CRITICAL**: every integration test MUST import this file
// FIRST (it sets process.env.DATABASE_URL before any module
// imports the connection singleton).
// ============================================================
import 'dotenv/config';
import postgres from 'postgres';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// -- Test env --------------------------------------------------------
// These MUST be set before any import that pulls in db/connection.js
// or auth/auth.js (both validate env at module load time).
const TEST_DB_URL = process.env.TEST_DATABASE_URL
    ?? 'postgres://tms_test:tms_test@localhost:15432/tms_test';
const TEST_REDIS_URL = process.env.TEST_REDIS_URL
    ?? 'redis://localhost:16379';

process.env.DATABASE_URL = TEST_DB_URL;
process.env.REDIS_URL = TEST_REDIS_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'integration-test-jwt-secret-32b';
process.env.CREDENTIALS_KEY = process.env.CREDENTIALS_KEY ?? 'integration-test-creds-key-32-byt';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.RATE_LIMIT_MAX = '10000';
process.env.LOGIN_RATE_LIMIT_MAX = '10000';
process.env.SEED_PASSWORD = 'IntegrationTest1!';

// -- Migration runner -------------------------------------------------
const MIGRATIONS_DIR = resolve(__dirname, '../../drizzle');

/**
 * Manual migrator: reads _journal.json, executes each migration's SQL,
 * BOM-stripped and split on `--> statement-breakpoint`.
 *
 * Why not `drizzle-orm/postgres-js/migrator`? It treats migration files
 * as opaque bytes and Postgres rejects the first statement if the file
 * carries a UTF-8 BOM (0003_waybill_first.sql does). Strip-on-load
 * here keeps the production migration files untouched.
 *
 * State is tracked in the same `drizzle.__drizzle_migrations` table the
 * official migrator uses, so subsequent `pnpm db:migrate` runs see
 * the same applied set.
 */
async function applyMigrationsRaw(client: ReturnType<typeof postgres>): Promise<void> {
    const fs = await import('node:fs/promises');

    // Create state table (matches drizzle's internal schema).
    await client.unsafe(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.unsafe(`
        CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
        )
    `);

    // Don't trust the drizzle journal (it lags behind the sql files —
    // 0026/0027/0028 ship in apps/api/drizzle/ but aren't in
    // meta/_journal.json). Pick up every NNNN_*.sql in lex order.
    const allFiles = (await fs.readdir(MIGRATIONS_DIR))
        .filter(f => /^\d{4}_.+\.sql$/.test(f))
        .sort();

    // Already-applied hashes
    const appliedRows = await client<{ hash: string }[]>`
        SELECT hash FROM "drizzle"."__drizzle_migrations"
    `;
    const applied = new Set(appliedRows.map(r => r.hash));

    for (const file of allFiles) {
        const tag = file.replace(/\.sql$/, '');
        if (applied.has(tag)) continue;

        const sqlPath = resolve(MIGRATIONS_DIR, file);
        let body = await fs.readFile(sqlPath, 'utf-8');
        // Strip UTF-8 BOM if present.
        if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1);

        // Each migration is split on the drizzle breakpoint marker.
        const statements = body
            .split('--> statement-breakpoint')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const stmt of statements) {
            await client.unsafe(stmt);
        }

        await client`
            INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
            VALUES (${tag}, ${Date.now()})
        `;
    }
}

let bootstrapped = false;
let migrationClient: ReturnType<typeof postgres> | null = null;

export async function isTestDbReachable(): Promise<boolean> {
    try {
        const probe = postgres(TEST_DB_URL, { max: 1, connect_timeout: 2, idle_timeout: 1 });
        await probe`SELECT 1`;
        await probe.end({ timeout: 1 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Boots the test stack:
 *   1. probe Postgres on port 15432
 *   2. run migrations (idempotent — drizzle tracks state)
 *   3. apply append-only triggers
 *
 * Called once per worker via `globalSetup` or via beforeAll().
 */
export async function ensureTestDbReady(): Promise<void> {
    if (bootstrapped) return;
    bootstrapped = true;

    const reachable = await isTestDbReachable();
    if (!reachable) {
        throw new Error(
            `Test Postgres unreachable at ${TEST_DB_URL}.\n` +
            `Start it with: pnpm --filter @tms/api test:integration:up`,
        );
    }

    // onnotice noop suppresses harmless "already exists" NOTICEs.
    migrationClient = postgres(TEST_DB_URL, { max: 1, onnotice: () => { /* silence */ } });

    // -- Strip BOMs from migration files in-memory.
    // 0003_waybill_first.sql ships with a UTF-8 BOM that drizzle's migrator
    // does NOT strip, which makes Postgres choke ("syntax error at or near
    // ALTER"). Rather than rewrite the file (history change), we apply the
    // migrations manually and clean each SQL chunk.
    await applyMigrationsRaw(migrationClient);

    // Apply append-only triggers (server.ts does this at boot; we mirror it).
    const { APPEND_ONLY_TRIGGER_SQL } = await import('../../src/db/triggers.js');
    await migrationClient.unsafe(APPEND_ONLY_TRIGGER_SQL);

    await migrationClient.end({ timeout: 1 });
    migrationClient = null;
}

// -- DB handles -------------------------------------------------------
// Lazy because db/connection.js reads DATABASE_URL at module load.
let _db: typeof import('../../src/db/connection.js')['db'] | null = null;
let _sql: typeof import('../../src/db/connection.js')['sql'] | null = null;

export async function getTestDb() {
    if (!_db) {
        const mod = await import('../../src/db/connection.js');
        _db = mod.db;
        _sql = mod.sql;
    }
    return _db!;
}

export async function getTestSql() {
    if (!_sql) await getTestDb();
    return _sql!;
}

/**
 * Truncate every user table — fast clean slate between tests.
 * Preserves schema + enums + triggers. Skips drizzle's migration
 * journal so we don't re-run migrations next call.
 */
export async function truncateAllTables(): Promise<void> {
    const sql = await getTestSql();
    // Discover all base tables in the public schema, skip drizzle's bookkeeping.
    const rows = await sql<{ tablename: string }[]>`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename NOT LIKE '__drizzle%'
          AND tablename NOT IN ('drizzle_migrations', '__drizzle_migrations')
    `;
    if (rows.length === 0) return;
    const list = rows.map(r => `"public"."${r.tablename}"`).join(', ');
    // RESTART IDENTITY resets sequences; CASCADE drops FK rows.
    // session_replication_role = replica disables triggers (needed because
    // events.append-only trigger blocks DELETE on the events table).
    await sql.unsafe(`SET session_replication_role = replica`);
    await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    await sql.unsafe(`SET session_replication_role = DEFAULT`);
}

// -- Fastify test-app builder ----------------------------------------
// We build a fresh Fastify each test (or each describe block) so plugin
// state and route registrations stay clean. We do NOT load workers,
// websockets, swagger, etc. — only the route module(s) the test cares
// about + auth + cookie + multipart.
import type { FastifyInstance } from 'fastify';

export interface TestAppOptions {
    /** route plugins to register under /api */
    routes?: Array<(app: FastifyInstance) => Promise<void> | void>;
}

export async function buildTestApp(opts: TestAppOptions = {}): Promise<FastifyInstance> {
    // Make sure DB is up + migrated before building any app.
    await ensureTestDbReady();
    // Touch the connection so it's eagerly created with the test URL.
    await getTestDb();

    const Fastify = (await import('fastify')).default;
    const multipart = (await import('@fastify/multipart')).default;

    const app = Fastify({
        logger: false,
        genReqId: () => Math.random().toString(36).slice(2),
    });

    // Cookie is registered by registerAuthRoutes — don't double-register here.
    await app.register(multipart, {
        limits: { fileSize: 15 * 1024 * 1024, files: 5 },
    });

    // Mirror the prod 500 handler (hides PG details). Keeps test assertions
    // honest — if a route throws we get a structured 500, not Fastify default.
    app.setErrorHandler((error: import('fastify').FastifyError, _request, reply) => {
        const status = typeof error.statusCode === 'number' ? error.statusCode : 500;
        if (status >= 500) {
            // Surface in test runner — silenced logger swallows otherwise.
            // eslint-disable-next-line no-console
            console.error('[test-app 500]', error.message, error.stack);
        }
        return reply.status(status).send({
            success: false,
            error: error.message ?? 'Internal',
        });
    });

    // Auth — registers /api/auth/* + decorates `authenticate`.
    const { registerAuthRoutes } = await import('../../src/auth/auth.js');
    registerAuthRoutes(app);

    // Each test picks the route plugins it wants.
    for (const plugin of opts.routes ?? []) {
        await plugin(app);
    }

    await app.ready();
    return app;
}

// -- JWT helper -------------------------------------------------------
// Sign via the Fastify app instance — `@fastify/jwt` decorates `app.jwt`
// with `sign()` using the configured secret. This avoids depending on
// fast-jwt directly (which lives behind pnpm's strict resolution).

export interface TestTokenPayload {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

/**
 * Mint a JWT identical to /auth/login output. Use either as
 *   - cookie:  `tms_token=${token}` (web flow)
 *   - header:  `Authorization: Bearer ${token}` (mobile flow)
 *
 * Requires an app built via `buildTestApp()` so @fastify/jwt has been
 * registered. The signed token is interchangeable across test apps
 * (same JWT_SECRET).
 */
export function signTestToken(
    app: FastifyInstance,
    payload: TestTokenPayload,
    expiresIn: string | number = '24h',
): string {
    return (app as any).jwt.sign(
        {
            userId: payload.userId,
            roles: payload.roles,
            organizationId: payload.organizationId ?? undefined,
        },
        { expiresIn },
    );
}

export function authHeaders(token: string): Record<string, string> {
    return {
        cookie: `tms_token=${token}`,
        authorization: `Bearer ${token}`,
    };
}

// -- Fixture builder --------------------------------------------------
// hashPassword is imported dynamically inside the function — the static
// import would force `db/connection.ts` to evaluate before the test env
// is set up.

export interface BaseFixture {
    organizationId: string;
    /** admin user (roles=['admin']) — use for most positive-path tests */
    adminUserId: string;
    /** driver user + linked driver record */
    driverUserId: string;
    driverId: string;
    /** dispatcher user (no driver linkage) */
    dispatcherUserId: string;
    /** logist user */
    logistUserId: string;
    /** vehicle owned by the org */
    vehicleId: string;
    /** contractor + contract + tariff so finance/orders tests have something to attach */
    contractorId: string;
    contractId: string;
    tariffId: string;
    /** plaintext password for the fixture users — useful for login tests */
    password: string;
}

/**
 * Seed the bare-minimum fixture every test relies on. Idempotent only
 * in the sense that the test runner calls `truncateAllTables()` before
 * it — do NOT call twice in the same test without truncating first.
 */
export async function seedBaseFixture(): Promise<BaseFixture> {
    const db = await getTestDb();
    const { hashPassword } = await import('../../src/auth/auth.js');
    const password = 'IntegrationTest1!';
    const passwordHash = await hashPassword(password);

    const schema = await import('../../src/db/schema.js');

    const [org] = await db.insert(schema.organizations).values({
        name: 'Test Org',
    }).returning();

    const [admin] = await db.insert(schema.users).values({
        email: 'admin@test.local',
        passwordHash,
        fullName: 'Test Admin',
        roles: ['admin'],
        organizationId: org!.id,
        isActive: true,
        emailVerifiedAt: new Date(),
    }).returning();

    const [driverUser] = await db.insert(schema.users).values({
        email: 'driver@test.local',
        passwordHash,
        fullName: 'Test Driver',
        roles: ['driver'],
        organizationId: org!.id,
        isActive: true,
        emailVerifiedAt: new Date(),
    }).returning();

    const [dispatcherUser] = await db.insert(schema.users).values({
        email: 'dispatcher@test.local',
        passwordHash,
        fullName: 'Test Dispatcher',
        roles: ['dispatcher'],
        organizationId: org!.id,
        isActive: true,
        emailVerifiedAt: new Date(),
    }).returning();

    const [logistUser] = await db.insert(schema.users).values({
        email: 'logist@test.local',
        passwordHash,
        fullName: 'Test Logist',
        roles: ['logist'],
        organizationId: org!.id,
        isActive: true,
        emailVerifiedAt: new Date(),
    }).returning();

    const [driver] = await db.insert(schema.drivers).values({
        userId: driverUser!.id,
        fullName: 'Test Driver',
        birthDate: new Date('1985-01-01T00:00:00Z'),
        licenseNumber: 'AB12345678',
        licenseCategories: ['B', 'C'],
        licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        organizationId: org!.id,
    }).returning();

    const [vehicle] = await db.insert(schema.vehicles).values({
        plateNumber: 'A001AA77',
        vin: 'TESTVIN0000000001',
        make: 'KAMAZ',
        model: 'Test Truck',
        year: 2024,
        bodyType: 'tent',
        payloadCapacityKg: 20000,
        status: 'available',
        organizationId: org!.id,
    }).returning();

    const [contractor] = await db.insert(schema.contractors).values({
        name: 'Test Contractor',
        inn: '1234567890',
        legalAddress: 'Test Address',
        organizationId: org!.id,
    }).returning();

    const [contract] = await db.insert(schema.contracts).values({
        number: 'TEST-001',
        contractorId: contractor!.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    }).returning();

    const [tariff] = await db.insert(schema.tariffs).values({
        contractId: contract!.id,
        type: 'per_km',
        ratePerKm: 50,
        vatIncluded: true,
        vatRate: 20,
    }).returning();

    return {
        organizationId: org!.id,
        adminUserId: admin!.id,
        driverUserId: driverUser!.id,
        driverId: driver!.id,
        dispatcherUserId: dispatcherUser!.id,
        logistUserId: logistUser!.id,
        vehicleId: vehicle!.id,
        contractorId: contractor!.id,
        contractId: contract!.id,
        tariffId: tariff!.id,
        password,
    };
}

// -- describe.skipIf helper -------------------------------------------
// Use as: `(await skipIfNoTestDb()) ? describe.skip : describe`(...)
// or simply guard the top-level beforeAll with a probe + .skip().
export async function skipIfNoTestDb(): Promise<boolean> {
    return !(await isTestDbReachable());
}
