// ============================================================
// Test Setup — Global mocks and helpers
// ============================================================

// CRITICAL: Set JWT_SECRET BEFORE any module imports that might trigger auth.ts
// auth.ts calls process.exit(1) at module level if JWT_SECRET is not set
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// --- Mock DB connection ---
// All tests use an in-memory mock of the db object.
// For integration tests that need a real DB, use a separate
// docker-compose.test.yml with a throwaway Postgres.

export const mockDb = {
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
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (cb: any) => cb(mockDb)),
    query: {
        trips: { findFirst: vi.fn(), findMany: vi.fn() },
        orders: { findFirst: vi.fn(), findMany: vi.fn() },
        vehicles: { findFirst: vi.fn(), findMany: vi.fn() },
        routePoints: { findFirst: vi.fn(), findMany: vi.fn() },
        techInspections: { findFirst: vi.fn(), findMany: vi.fn() },
        medInspections: { findFirst: vi.fn(), findMany: vi.fn() },
        waybills: { findFirst: vi.fn(), findMany: vi.fn() },
        invoices: { findFirst: vi.fn(), findMany: vi.fn() },
    },
} as any;

// Mock the connection module
vi.mock('../db/connection.js', () => ({
    db: mockDb,
}));

// Mock the event journal
vi.mock('../events/journal.js', () => ({
    recordEvent: vi.fn().mockResolvedValue({ id: 'event-uuid' }),
}));

// Mock @fastify/cookie (not installed in test env, but imported by auth.ts)
vi.mock('@fastify/cookie', () => ({
    default: vi.fn(),
}));

// --- Test helpers ---
export const TEST_USER = {
    userId: '00000000-0000-0000-0000-000000000001',
    role: 'logist',
    roles: ['logist'],
};

export const TEST_ADMIN = {
    userId: '00000000-0000-0000-0000-000000000099',
    role: 'admin',
    roles: ['admin'],
};

export const TEST_DRIVER = {
    userId: '00000000-0000-0000-0000-000000000010',
    role: 'driver',
    roles: ['driver'],
};

export const TEST_MECHANIC = {
    userId: '00000000-0000-0000-0000-000000000020',
    role: 'mechanic',
    roles: ['mechanic'],
};

export const TEST_MEDIC = {
    userId: '00000000-0000-0000-0000-000000000030',
    role: 'medic',
    roles: ['medic'],
};

beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
});

afterEach(() => {
    vi.clearAllMocks();
});
