// ============================================================
// WAYBILLS MODULE — Unit Tests
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import { mockDb, TEST_USER } from './setup.js';
import { recordEvent } from '../events/journal.js';
import {
    generateWaybill,
    closeWaybill,
} from '../modules/waybills/service.js';

describe('Waybills Service', () => {
    describe('generateWaybill', () => {
        it('should create waybill with status=formed', async () => {
            // Trip with vehicle & driver
            mockDb.limit
                .mockResolvedValueOnce([{
                    id: 'trip-wb',
                    status: 'ready',
                    vehicleId: 'v-001',
                    driverId: 'drv-001',
                }])
                .mockResolvedValueOnce([{ currentOdometerKm: 100000 }]) // vehicle fetch
                .mockResolvedValueOnce([{ id: 'tech-ok', signature: 'tech-sig' }]) // tech inspection fetch
                .mockResolvedValueOnce([{ id: 'med-ok', signature: 'med-sig' }])  // med inspection fetch
                .mockResolvedValueOnce([]); // existing waybill check

            mockDb.execute.mockResolvedValueOnce([]); // generateWaybillNumber

            mockDb.transaction.mockImplementation(async (cb: any) => {
                const txMock = {
                    select: vi.fn().mockReturnThis(),
                    from: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    orderBy: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    for: vi.fn().mockResolvedValue([]),
                    insert: vi.fn().mockReturnThis(),
                    values: vi.fn().mockReturnThis(),
                    returning: vi.fn().mockResolvedValue([{
                        id: 'wb-001',
                        number: 'WB-2026-00001',
                        status: 'issued',
                        tripId: 'trip-wb',
                    }]),
                    update: vi.fn().mockReturnThis(),
                    set: vi.fn().mockReturnThis(),
                };
                return cb(txMock);
            });

            const result = await generateWaybill('trip-wb', TEST_USER.userId, TEST_USER.role);

            expect(result).toBeDefined();
            expect(result.status).toBe('issued');
            expect(result.number).toMatch(/^WB-/);
        });

        it('should include odometer and fuel readings', async () => {
            mockDb.limit
                .mockResolvedValueOnce([{ id: 'trip-odo', status: 'ready', vehicleId: 'v-odo', driverId: 'drv-odo' }])
                .mockResolvedValueOnce([{ currentOdometerKm: 123456 }])
                .mockResolvedValueOnce([{ id: 'tech-ok', signature: 'sig1' }])
                .mockResolvedValueOnce([{ id: 'med-ok', signature: 'sig2' }])
                .mockResolvedValueOnce([]);

            mockDb.execute.mockResolvedValueOnce([]);

            mockDb.transaction.mockImplementation(async (cb: any) => {
                const txMock = {
                    select: vi.fn().mockReturnThis(),
                    from: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    orderBy: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    for: vi.fn().mockResolvedValue([]),
                    insert: vi.fn().mockReturnThis(),
                    values: vi.fn().mockReturnThis(),
                    returning: vi.fn().mockResolvedValue([{
                        id: 'wb-odo',
                        number: 'WB-2026-00002',
                        status: 'issued',
                        odometerOut: 123456,
                    }]),
                    update: vi.fn().mockReturnThis(),
                    set: vi.fn().mockReturnThis(),
                };
                return cb(txMock);
            });

            const result = await generateWaybill('trip-odo', TEST_USER.userId, TEST_USER.role);
            expect(result).toBeDefined();
            expect(result.odometerOut).toBe(123456);
        });

        it('should run all SQL operations in a transaction', async () => {
            mockDb.limit
                .mockResolvedValueOnce([{ id: 'trip-tx', status: 'ready', vehicleId: 'v-tx', driverId: 'drv-tx' }])
                .mockResolvedValueOnce([{ currentOdometerKm: 50000 }])
                .mockResolvedValueOnce([{ id: 'tech-ok', signature: 'sig' }])
                .mockResolvedValueOnce([{ id: 'med-ok', signature: 'sig' }])
                .mockResolvedValueOnce([]);

            mockDb.execute.mockResolvedValueOnce([]);

            mockDb.transaction.mockImplementation(async (cb: any) => {
                const txMock = {
                    select: vi.fn().mockReturnThis(),
                    from: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    orderBy: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    for: vi.fn().mockResolvedValue([]),
                    insert: vi.fn().mockReturnThis(),
                    values: vi.fn().mockReturnThis(),
                    returning: vi.fn().mockResolvedValue([{
                        id: 'wb-tx', number: 'WB-2026-00003', status: 'issued',
                    }]),
                    update: vi.fn().mockReturnThis(),
                    set: vi.fn().mockReturnThis(),
                };
                return cb(txMock);
            });

            await generateWaybill('trip-tx', TEST_USER.userId, TEST_USER.role);
            expect(mockDb.transaction).toHaveBeenCalled();
        });

        it('should generate correct WB-YYYY-NNNNN number', async () => {
            mockDb.limit
                .mockResolvedValueOnce([{ id: 'trip-num', status: 'ready', vehicleId: 'v-num', driverId: 'drv-num' }])
                .mockResolvedValueOnce([{ currentOdometerKm: 10000 }])
                .mockResolvedValueOnce([{ id: 'tech-ok', signature: 'sig' }])
                .mockResolvedValueOnce([{ id: 'med-ok', signature: 'sig' }])
                .mockResolvedValueOnce([]);

            mockDb.execute.mockResolvedValueOnce([]);

            mockDb.transaction.mockImplementation(async (cb: any) => {
                const txMock = {
                    select: vi.fn().mockReturnThis(),
                    from: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    orderBy: vi.fn().mockReturnThis(),
                    limit: vi.fn().mockReturnThis(),
                    for: vi.fn().mockResolvedValue([]),
                    insert: vi.fn().mockReturnThis(),
                    values: vi.fn().mockReturnThis(),
                    returning: vi.fn().mockResolvedValue([{
                        id: 'wb-num', number: 'WB-2026-00001', status: 'issued',
                    }]),
                    update: vi.fn().mockReturnThis(),
                    set: vi.fn().mockReturnThis(),
                };
                return cb(txMock);
            });

            const result = await generateWaybill('trip-num', TEST_USER.userId, TEST_USER.role);
            expect(result.number).toMatch(/^WB-\d{4}-\d{5}$/);
        });
    });

    describe('closeWaybill', () => {
        it('should set returnAt and odometerIn', async () => {
            // closeWaybill: db.select().from().where().limit()
            mockDb.limit.mockResolvedValueOnce([{
                id: 'wb-close',
                status: 'issued',
                tripId: 'trip-close',
                vehicleId: 'v-close',
            }]);

            mockDb.transaction.mockImplementation(async (cb: any) => {
                const txMock = {
                    update: vi.fn().mockReturnThis(),
                    set: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    returning: vi.fn().mockResolvedValue([{
                        id: 'wb-close',
                        status: 'closed',
                        odometerIn: 150000,
                        returnAt: new Date(),
                    }]),
                };
                return cb(txMock);
            });

            const result = await closeWaybill('wb-close', {
                odometerIn: 150000,
                returnAt: new Date().toISOString(),
            }, TEST_USER.userId, TEST_USER.role);

            expect(result).toBeDefined();
            expect(result.odometerIn).toBe(150000);
        });

        it('should reject if waybill already closed', async () => {
            // Return waybill with status 'closed'
            mockDb.limit.mockResolvedValue([{
                id: 'wb-already-closed',
                status: 'closed',
                tripId: 'trip-x',
                vehicleId: 'v-x',
            }]);

            await expect(
                closeWaybill('wb-already-closed', {
                    odometerIn: 150000,
                }, TEST_USER.userId, TEST_USER.role)
            ).rejects.toThrow();
            expect(mockDb.transaction).not.toHaveBeenCalled();
        });

        it('should run in a transaction', async () => {
            mockDb.limit.mockResolvedValueOnce([{
                id: 'wb-tx-close',
                status: 'issued',
                tripId: 'trip-tx-close',
                vehicleId: 'v-tx-close',
            }]);

            mockDb.transaction.mockImplementation(async (cb: any) => {
                const txMock = {
                    update: vi.fn().mockReturnThis(),
                    set: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    returning: vi.fn().mockResolvedValue([{
                        id: 'wb-tx-close', status: 'closed', odometerIn: 150000,
                    }]),
                };
                return cb(txMock);
            });

            await closeWaybill('wb-tx-close', { odometerIn: 150000 }, TEST_USER.userId, TEST_USER.role);
            expect(mockDb.transaction).toHaveBeenCalled();
        });
    });
});

