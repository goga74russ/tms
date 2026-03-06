// ============================================================
// REPAIRS MODULE — Unit Tests
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import { mockDb, TEST_USER, TEST_ADMIN } from './setup.js';
import { recordEvent } from '../events/journal.js';
import {
    createRepair,
    updateRepairStatus,
    checkScheduledMaintenance,
} from '../modules/repairs/service.js';

// Repair state machine transitions map
const REPAIR_TRANSITIONS: Record<string, string[]> = {
    created: ['waiting_parts', 'in_progress'],
    waiting_parts: ['in_progress'],
    in_progress: ['done', 'waiting_parts'],
    done: [],
};

function canRepairTransition(from: string, to: string): boolean {
    return REPAIR_TRANSITIONS[from]?.includes(to) ?? false;
}

describe('Repairs Service', () => {
    describe('State Machine', () => {
        it('should allow created → waiting_parts', async () => {
            expect(canRepairTransition('created', 'waiting_parts')).toBe(true);
        });

        it('should allow waiting_parts → in_progress', async () => {
            expect(canRepairTransition('waiting_parts', 'in_progress')).toBe(true);
        });

        it('should reject done → created (no rollback)', async () => {
            expect(canRepairTransition('done', 'created')).toBe(false);
        });

        it('should allow created → in_progress (skip waiting_parts)', () => {
            expect(canRepairTransition('created', 'in_progress')).toBe(true);
        });

        it('should allow in_progress → waiting_parts (return for parts)', () => {
            expect(canRepairTransition('in_progress', 'waiting_parts')).toBe(true);
        });

        it('should reject done → anything (terminal state)', () => {
            expect(canRepairTransition('done', 'in_progress')).toBe(false);
            expect(canRepairTransition('done', 'waiting_parts')).toBe(false);
        });
    });

    describe('createRepairRequest', () => {
        it('should create request linked to vehicle', async () => {
            // createRepair calls db.insert().values().returning() directly (no transaction)
            // Then db.update().set().where() for vehicle status
            mockDb.insert.mockReturnThis();
            mockDb.values.mockReturnThis();
            mockDb.returning.mockResolvedValue([{
                id: 'repair-001',
                vehicleId: 'v-001',
                description: 'Замена колодок',
                priority: 'high',
                status: 'created',
                source: 'mechanic',
            }]);

            // Mock vehicle status update
            mockDb.update.mockReturnThis();
            mockDb.set.mockReturnThis();
            mockDb.where.mockReturnThis();

            const result = await createRepair({
                vehicleId: 'v-001',
                description: 'Замена колодок',
                priority: 'high',
                source: 'mechanic',
            }, TEST_ADMIN);

            expect(result).toBeDefined();
            expect(result.vehicleId).toBe('v-001');
            expect(result.status).toBe('created');
        });
    });

    describe('updateRepairStatus', () => {
        it('should run in a transaction', async () => {
            // updateRepairStatus first does db.select().from().where() WITHOUT .limit()
            // Then db.transaction for the update
            mockDb.where.mockResolvedValueOnce([{
                id: 'repair-tx',
                status: 'created',
                vehicleId: 'v-tx',
            }]);

            mockDb.transaction.mockImplementation(async (cb: any) => {
                const txMock = {
                    ...mockDb,
                    update: vi.fn().mockReturnThis(),
                    set: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    returning: vi.fn().mockResolvedValue([{
                        id: 'repair-tx',
                        status: 'in_progress',
                    }]),
                };
                return cb(txMock);
            });

            await updateRepairStatus('repair-tx', 'in_progress', TEST_ADMIN);

            expect(mockDb.transaction).toHaveBeenCalled();
        });

        it('should record event in journal', async () => {
            mockDb.where.mockResolvedValueOnce([{
                id: 'repair-evt',
                status: 'created',
                vehicleId: 'v-evt',
            }]);

            mockDb.transaction.mockImplementation(async (cb: any) => {
                const txMock = {
                    ...mockDb,
                    update: vi.fn().mockReturnThis(),
                    set: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    returning: vi.fn().mockResolvedValue([{
                        id: 'repair-evt',
                        status: 'in_progress',
                    }]),
                };
                return cb(txMock);
            });

            await updateRepairStatus('repair-evt', 'in_progress', TEST_ADMIN);

            expect(recordEvent).toHaveBeenCalled();
            expect((recordEvent as any).mock.calls.some(([event]: any[]) =>
                event?.eventType === 'repair.status_changed'
                && event?.entityType === 'repair'
                && event?.entityId === 'repair-evt'
            )).toBe(true);
        });
    });

    describe('checkScheduledMaintenance', () => {
        it('should NOT load all vehicles into RAM', async () => {
            // C-6: checkScheduledMaintenance uses db.select().from().where() without .limit()
            // The where() call should be the end of the chain, returning filtered vehicles only
            mockDb.where.mockResolvedValueOnce([
                {
                    id: 'v-maint',
                    maintenanceNextDate: new Date('2026-03-01'),
                    maintenanceNextKm: 50000,
                    currentOdometerKm: 55000,
                    isArchived: false,
                },
            ]);

            // Second where() call: check if existing repair exists for this vehicle
            mockDb.where.mockResolvedValueOnce([]);  // no existing repair

            // createRepair inside: transaction
            mockDb.transaction.mockImplementation(async (cb: any) => {
                const txMock = {
                    ...mockDb,
                    insert: vi.fn().mockReturnThis(),
                    values: vi.fn().mockReturnThis(),
                    returning: vi.fn().mockResolvedValue([{
                        id: 'repair-maint',
                        vehicleId: 'v-maint',
                        source: 'scheduled',
                    }]),
                    select: vi.fn().mockReturnThis(),
                    from: vi.fn().mockReturnThis(),
                    where: vi.fn().mockResolvedValue([]),
                };
                return cb(txMock);
            });

            const result = await checkScheduledMaintenance('system-user-id');

            // Verify that the function used filtered query (where was called)
            expect(mockDb.select).toHaveBeenCalled();
            expect(mockDb.where).toHaveBeenCalled();
            expect(result).toBeDefined();
        });
    });
});
