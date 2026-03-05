// ============================================================
// RBAC MODULE — Unit Tests (Sprint 5)
// ============================================================
import { describe, it, expect, vi } from 'vitest';
import { defineAbilitiesFor, requireAbility } from '../auth/rbac.js';

describe('RBAC — defineAbilitiesFor', () => {
    // ==========================================================
    // Logist
    // ==========================================================
    describe('logist', () => {
        const ability = defineAbilitiesFor(['logist'], 'user-logist');

        it('should manage Orders', () => {
            expect(ability.can('create', 'Order')).toBe(true);
            expect(ability.can('read', 'Order')).toBe(true);
            expect(ability.can('update', 'Order')).toBe(true);
            expect(ability.can('delete', 'Order')).toBe(true);
        });

        it('should read Trips, Vehicles, Drivers, Contractors', () => {
            expect(ability.can('read', 'Trip')).toBe(true);
            expect(ability.can('read', 'Vehicle')).toBe(true);
            expect(ability.can('read', 'Driver')).toBe(true);
            expect(ability.can('read', 'Contractor')).toBe(true);
        });

        it('should read Waybill/Permit/Tariff/Invoice', () => {
            expect(ability.can('read', 'Waybill')).toBe(true);
            expect(ability.can('read', 'Permit')).toBe(true);
            expect(ability.can('read', 'Tariff')).toBe(true);
            expect(ability.can('read', 'Invoice')).toBe(true);
        });

        it('should NOT manage Trips', () => {
            expect(ability.can('create', 'Trip')).toBe(false);
            expect(ability.can('update', 'Trip')).toBe(false);
        });

        it('should NOT access RepairRequests or TechInspection', () => {
            expect(ability.can('create', 'RepairRequest')).toBe(false);
            expect(ability.can('create', 'TechInspection')).toBe(false);
        });
    });

    // ==========================================================
    // Dispatcher
    // ==========================================================
    describe('dispatcher', () => {
        const ability = defineAbilitiesFor(['dispatcher'], 'user-disp');

        it('should manage Trips and Waybills', () => {
            expect(ability.can('create', 'Trip')).toBe(true);
            expect(ability.can('update', 'Trip')).toBe(true);
            expect(ability.can('manage', 'Waybill')).toBe(true);
        });

        it('should read Orders but NOT manage', () => {
            expect(ability.can('read', 'Order')).toBe(true);
            expect(ability.can('create', 'Order')).toBe(false);
        });

        it('should read TechInspection, MedInspection', () => {
            expect(ability.can('read', 'TechInspection')).toBe(true);
            expect(ability.can('read', 'MedInspection')).toBe(true);
        });

        it('should NOT read MedInspectionDetails (152-ФЗ §А.2)', () => {
            expect(ability.can('read', 'MedInspectionDetails')).toBe(false);
        });

        it('should NOT access finance (Tariff, Invoice, KPI)', () => {
            expect(ability.can('read', 'Tariff')).toBe(false);
            expect(ability.can('read', 'Invoice')).toBe(false);
            expect(ability.can('read', 'KPI')).toBe(false);
        });
    });

    // ==========================================================
    // Manager (read-only analytics)
    // ==========================================================
    describe('manager', () => {
        const ability = defineAbilitiesFor(['manager'], 'user-mgr');

        it('should read everything for analytics', () => {
            expect(ability.can('read', 'Order')).toBe(true);
            expect(ability.can('read', 'Trip')).toBe(true);
            expect(ability.can('read', 'Vehicle')).toBe(true);
            expect(ability.can('read', 'Tariff')).toBe(true);
            expect(ability.can('read', 'Invoice')).toBe(true);
            expect(ability.can('read', 'KPI')).toBe(true);
        });

        it('should NOT create or update Orders/Trips', () => {
            expect(ability.can('create', 'Order')).toBe(false);
            expect(ability.can('update', 'Trip')).toBe(false);
        });
    });

    // ==========================================================
    // Mechanic
    // ==========================================================
    describe('mechanic', () => {
        const ability = defineAbilitiesFor(['mechanic'], 'user-mech');

        it('should manage TechInspection and RepairRequest', () => {
            expect(ability.can('manage', 'TechInspection')).toBe(true);
            expect(ability.can('manage', 'RepairRequest')).toBe(true);
        });

        it('should read and update Vehicle', () => {
            expect(ability.can('read', 'Vehicle')).toBe(true);
            expect(ability.can('update', 'Vehicle')).toBe(true);
        });

        it('should NOT access finance (Tariff, Invoice)', () => {
            expect(ability.can('read', 'Tariff')).toBe(false);
            expect(ability.can('read', 'Invoice')).toBe(false);
        });

        it('should NOT manage Orders', () => {
            expect(ability.can('create', 'Order')).toBe(false);
        });

        it('should NOT access MedInspection', () => {
            expect(ability.can('read', 'MedInspection')).toBe(false);
        });
    });

    // ==========================================================
    // Medic
    // ==========================================================
    describe('medic', () => {
        const ability = defineAbilitiesFor(['medic'], 'user-medic');

        it('should manage MedInspection', () => {
            expect(ability.can('manage', 'MedInspection')).toBe(true);
        });

        it('should read MedInspectionDetails (vital signs)', () => {
            expect(ability.can('read', 'MedInspectionDetails')).toBe(true);
        });

        it('should read Driver (for inspections)', () => {
            expect(ability.can('read', 'Driver')).toBe(true);
        });

        it('should NOT read finance, orders, trips, vehicles', () => {
            expect(ability.can('read', 'Order')).toBe(false);
            expect(ability.can('read', 'Trip')).toBe(false);
            expect(ability.can('read', 'Vehicle')).toBe(false);
            expect(ability.can('read', 'Tariff')).toBe(false);
            expect(ability.can('read', 'Invoice')).toBe(false);
            expect(ability.can('read', 'RepairRequest')).toBe(false);
        });
    });

    // ==========================================================
    // Driver
    // ==========================================================
    describe('driver', () => {
        const ability = defineAbilitiesFor(['driver'], 'user-driver');

        it('should read Trip, Order, Waybill, Vehicle, Driver', () => {
            expect(ability.can('read', 'Trip')).toBe(true);
            expect(ability.can('read', 'Order')).toBe(true);
            expect(ability.can('read', 'Waybill')).toBe(true);
            expect(ability.can('read', 'Vehicle')).toBe(true);
            expect(ability.can('read', 'Driver')).toBe(true);
        });

        it('should create RepairRequest (report vehicle issues)', () => {
            expect(ability.can('create', 'RepairRequest')).toBe(true);
        });

        it('should NOT manage anything (cannot create/update trips)', () => {
            expect(ability.can('create', 'Trip')).toBe(false);
            expect(ability.can('update', 'Trip')).toBe(false);
            expect(ability.can('create', 'Order')).toBe(false);
            expect(ability.can('update', 'Order')).toBe(false);
        });

        it('should NOT access finance endpoints', () => {
            expect(ability.can('read', 'Tariff')).toBe(false);
            expect(ability.can('read', 'Invoice')).toBe(false);
            expect(ability.can('read', 'KPI')).toBe(false);
            expect(ability.can('read', 'Contract')).toBe(false);
        });

        it('should NOT manage RepairRequests (only create)', () => {
            expect(ability.can('update', 'RepairRequest')).toBe(false);
            expect(ability.can('delete', 'RepairRequest')).toBe(false);
        });
    });

    // ==========================================================
    // Accountant
    // ==========================================================
    describe('accountant', () => {
        const ability = defineAbilitiesFor(['accountant'], 'user-acc');

        it('should manage Tariff, Contract, Invoice, Fine', () => {
            expect(ability.can('manage', 'Tariff')).toBe(true);
            expect(ability.can('manage', 'Contract')).toBe(true);
            expect(ability.can('manage', 'Invoice')).toBe(true);
            expect(ability.can('manage', 'Fine')).toBe(true);
        });

        it('should manage Contractor', () => {
            expect(ability.can('manage', 'Contractor')).toBe(true);
        });

        it('should read Orders, Trips, Vehicles, Drivers', () => {
            expect(ability.can('read', 'Order')).toBe(true);
            expect(ability.can('read', 'Trip')).toBe(true);
            expect(ability.can('read', 'Vehicle')).toBe(true);
        });

        it('should NOT create Orders or Trips', () => {
            expect(ability.can('create', 'Order')).toBe(false);
            expect(ability.can('create', 'Trip')).toBe(false);
        });
    });

    // ==========================================================
    // Admin
    // ==========================================================
    describe('admin', () => {
        const ability = defineAbilitiesFor(['admin'], 'user-admin');

        it('should manage Settings and ChecklistTemplate', () => {
            expect(ability.can('manage', 'Settings')).toBe(true);
            expect(ability.can('manage', 'ChecklistTemplate')).toBe(true);
        });

        it('should read all subjects', () => {
            expect(ability.can('read', 'Order')).toBe(true);
            expect(ability.can('read', 'Trip')).toBe(true);
            expect(ability.can('read', 'Vehicle')).toBe(true);
            expect(ability.can('read', 'Waybill')).toBe(true);
            expect(ability.can('read', 'RepairRequest')).toBe(true);
        });

        it('should NOT read MedInspectionDetails (§А.3)', () => {
            expect(ability.can('read', 'MedInspectionDetails')).toBe(false);
        });

        it('should NOT read KPI (§А.3)', () => {
            expect(ability.can('read', 'KPI')).toBe(false);
        });
    });

    // ==========================================================
    // Client
    // ==========================================================
    describe('client', () => {
        const ability = defineAbilitiesFor(['client'], 'user-client');

        it('should manage own Orders', () => {
            expect(ability.can('manage', 'Order')).toBe(true);
        });

        it('should read Trip, Invoice, Contract, Tariff', () => {
            expect(ability.can('read', 'Trip')).toBe(true);
            expect(ability.can('read', 'Invoice')).toBe(true);
            expect(ability.can('read', 'Contract')).toBe(true);
            expect(ability.can('read', 'Tariff')).toBe(true);
        });

        it('should NOT access vehicles, drivers, inspections', () => {
            expect(ability.can('read', 'Vehicle')).toBe(false);
            expect(ability.can('read', 'Driver')).toBe(false);
            expect(ability.can('read', 'TechInspection')).toBe(false);
            expect(ability.can('read', 'MedInspection')).toBe(false);
        });
    });

    // ==========================================================
    // Repair Service
    // ==========================================================
    describe('repair_service', () => {
        const ability = defineAbilitiesFor(['repair_service'], 'user-repair');

        it('should manage RepairRequest', () => {
            expect(ability.can('manage', 'RepairRequest')).toBe(true);
        });

        it('should read and update Vehicle', () => {
            expect(ability.can('read', 'Vehicle')).toBe(true);
            expect(ability.can('update', 'Vehicle')).toBe(true);
        });

        it('should read TechInspection', () => {
            expect(ability.can('read', 'TechInspection')).toBe(true);
        });

        it('should NOT access Orders, Trips, Finance', () => {
            expect(ability.can('read', 'Order')).toBe(false);
            expect(ability.can('read', 'Trip')).toBe(false);
            expect(ability.can('read', 'Invoice')).toBe(false);
        });
    });

    // ==========================================================
    // Multi-role
    // ==========================================================
    describe('multi-role user', () => {
        it('should combine permissions from all roles', () => {
            const ability = defineAbilitiesFor(['logist', 'dispatcher'], 'user-multi');

            // logist: manage Order
            expect(ability.can('manage', 'Order')).toBe(true);
            // dispatcher: manage Trip
            expect(ability.can('manage', 'Trip')).toBe(true);
        });
    });

    // ==========================================================
    // Unknown role
    // ==========================================================
    describe('unknown role', () => {
        it('should have no permissions', () => {
            const ability = defineAbilitiesFor(['unknown_role'], 'user-unknown');

            expect(ability.can('read', 'Order')).toBe(false);
            expect(ability.can('read', 'Trip')).toBe(false);
            expect(ability.can('read', 'Vehicle')).toBe(false);
        });
    });
});

// ==========================================================
// requireAbility middleware
// ==========================================================
describe('RBAC — requireAbility middleware', () => {
    it('should return 403 when role lacks permission', async () => {
        const middleware = requireAbility('create', 'Trip');

        const mockRequest = {
            user: { userId: 'logist-1', roles: ['logist'] },
        } as any;
        const mockReply = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
        } as any;

        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(403);
        expect(mockReply.send).toHaveBeenCalledWith(
            expect.objectContaining({ success: false }),
        );
    });

    it('should pass through when role has permission', async () => {
        const middleware = requireAbility('read', 'Order');

        const mockRequest = {
            user: { userId: 'logist-1', roles: ['logist'] },
        } as any;
        const mockReply = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
        } as any;

        await middleware(mockRequest, mockReply);

        // Should NOT call reply.status(403)
        expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', async () => {
        const middleware = requireAbility('read', 'Order');

        const mockRequest = { user: null } as any;
        const mockReply = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn(),
        } as any;

        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(401);
    });
});
