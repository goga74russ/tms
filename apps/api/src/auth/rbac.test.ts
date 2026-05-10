import { describe, it, expect } from 'vitest';
import { defineAbilitiesFor } from './rbac.js';

const USER = 'user-1';

describe('defineAbilitiesFor — medic', () => {
    const ability = defineAbilitiesFor(['medic'], USER);

    it('can read MedInspectionDetails (§А.2 — медик видит показатели)', () => {
        expect(ability.can('read', 'MedInspectionDetails')).toBe(true);
    });

    it('can manage MedInspection', () => {
        expect(ability.can('manage', 'MedInspection')).toBe(true);
    });

    it('cannot read finances/repairs (no Invoice/RepairRequest access)', () => {
        expect(ability.can('read', 'Invoice')).toBe(false);
        expect(ability.can('read', 'RepairRequest')).toBe(false);
        expect(ability.can('manage', 'Order')).toBe(false);
    });
});

describe('defineAbilitiesFor — admin', () => {
    const ability = defineAbilitiesFor(['admin'], USER);

    it('can manage Order, Vehicle, etc. (full access via "all")', () => {
        expect(ability.can('manage', 'Order')).toBe(true);
        expect(ability.can('manage', 'Vehicle')).toBe(true);
        expect(ability.can('delete', 'Contract')).toBe(true);
    });

    it('cannot read MedInspectionDetails (§А.3 restriction)', () => {
        expect(ability.can('read', 'MedInspectionDetails')).toBe(false);
    });

    it('cannot read KPI (§А.3 restriction)', () => {
        expect(ability.can('read', 'KPI')).toBe(false);
    });
});

describe('defineAbilitiesFor — dispatcher', () => {
    const ability = defineAbilitiesFor(['dispatcher'], USER);

    it('cannot read MedInspectionDetails (§А.2 — только факт допуска)', () => {
        expect(ability.can('read', 'MedInspectionDetails')).toBe(false);
    });

    it('can read MedInspection (fact of clearance only)', () => {
        expect(ability.can('read', 'MedInspection')).toBe(true);
    });

    it('can manage Trip and Waybill', () => {
        expect(ability.can('manage', 'Trip')).toBe(true);
        expect(ability.can('manage', 'Waybill')).toBe(true);
    });

    it('cannot manage Order (read-only)', () => {
        expect(ability.can('read', 'Order')).toBe(true);
        expect(ability.can('manage', 'Order')).toBe(false);
        expect(ability.can('update', 'Order')).toBe(false);
    });
});

describe('defineAbilitiesFor — driver', () => {
    const ability = defineAbilitiesFor(['driver'], USER);

    it('can create RepairRequest', () => {
        expect(ability.can('create', 'RepairRequest')).toBe(true);
    });

    it('cannot manage Order', () => {
        expect(ability.can('manage', 'Order')).toBe(false);
        expect(ability.can('update', 'Order')).toBe(false);
        expect(ability.can('read', 'Order')).toBe(true);
    });

    it('can create DeliveryConfirmation but not manage it', () => {
        expect(ability.can('create', 'DeliveryConfirmation')).toBe(true);
        expect(ability.can('delete', 'DeliveryConfirmation')).toBe(false);
    });

    it('cannot read MedInspectionDetails or Invoice', () => {
        expect(ability.can('read', 'MedInspectionDetails')).toBe(false);
        expect(ability.can('read', 'Invoice')).toBe(false);
    });
});

describe('defineAbilitiesFor — client', () => {
    const ability = defineAbilitiesFor(['client'], USER);

    it('can read Order, Trip, Invoice, Contract, Tariff, Claim (own scope)', () => {
        expect(ability.can('read', 'Order')).toBe(true);
        expect(ability.can('read', 'Trip')).toBe(true);
        expect(ability.can('read', 'Invoice')).toBe(true);
        expect(ability.can('read', 'Contract')).toBe(true);
        expect(ability.can('read', 'Tariff')).toBe(true);
        expect(ability.can('read', 'Claim')).toBe(true);
    });

    it('cannot manage/update/delete any resource', () => {
        expect(ability.can('manage', 'Order')).toBe(false);
        expect(ability.can('update', 'Invoice')).toBe(false);
        expect(ability.can('delete', 'Contract')).toBe(false);
        expect(ability.can('create', 'Trip')).toBe(false);
    });

    it('cannot read internal-only resources', () => {
        expect(ability.can('read', 'Vehicle')).toBe(false);
        expect(ability.can('read', 'Driver')).toBe(false);
        expect(ability.can('read', 'MedInspection')).toBe(false);
        expect(ability.can('read', 'MedInspectionDetails')).toBe(false);
        expect(ability.can('read', 'KPI')).toBe(false);
    });
});

describe('defineAbilitiesFor — multi-role and unknown', () => {
    it('unknown role grants no abilities', () => {
        const ability = defineAbilitiesFor(['nonexistent_role'], USER);
        expect(ability.can('read', 'Order')).toBe(false);
        expect(ability.can('manage', 'all')).toBe(false);
    });

    it('combining medic + dispatcher: medic adds MedInspectionDetails read', () => {
        // dispatcher explicitly cannot, but medic CAN — CASL rule order: later
        // rules override. Medic role is processed second here, so its `can`
        // should win.
        const ability = defineAbilitiesFor(['dispatcher', 'medic'], USER);
        expect(ability.can('read', 'MedInspectionDetails')).toBe(true);
        expect(ability.can('manage', 'Trip')).toBe(true);
    });
});
