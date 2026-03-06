import { vi, describe, it, expect, beforeEach } from 'vitest';
import { tarificationService } from './tarification.service.js';
import { db } from '../../db/connection.js';

// Mock DB
vi.mock('../../db/connection.js', () => {
    const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ fuelNormPer100Km: 30 }]),
    };
    return {
        db: {
            select: vi.fn(() => selectChain),
            query: {
                trips: { findFirst: vi.fn() },
                routePoints: { findMany: vi.fn() }
            }
        }
    };
});

const baseTariff = {
    type: 'per_km',
    ratePerKm: 100,
    ratePerTon: 0,
    ratePerHour: 0,
    fixedRate: 0,
    combinedKmThreshold: 0,
    combinedFixedRate: 0,
    combinedRatePerKm: 0,
    idleFreeLimitMinutes: 60,
    idleRatePerHour: 500,
    extraPointRate: 1000,
    nightMultiplier: 1.5,
    urgentMultiplier: 1.3,
    weekendMultiplier: 1.2,
    cancellationFee: 3000,
    minTripCost: 0,
    roundingPrecision: 1,
    vatIncluded: false,
    vatRate: 20,
};

// 2026-03-02 is a MONDAY (weekday, daytime — no modifiers trigger)
const MONDAY_10AM = new Date('2026-03-02T10:00:00Z');
const MONDAY_2PM = new Date('2026-03-02T14:00:00Z');
const MONDAY_2_30PM = new Date('2026-03-02T14:30:00Z');

function makeMockTrip(overrides: any = {}) {
    return {
        id: 'trip-1',
        status: 'completed',
        actualDistanceKm: 150,
        plannedDistanceKm: 150,
        actualDepartureAt: MONDAY_10AM,
        actualCompletionAt: MONDAY_2PM,
        plannedCompletionAt: new Date('2026-03-02T16:00:00Z'),
        vehicleId: 'v1',
        fuelStart: 100,
        fuelEnd: 60,
        order: {
            cargoWeightKg: 5000,
            createdAt: new Date('2026-03-02T08:00:00Z'), // 8h before planned — not urgent
            returnRequired: false,
            contract: {
                tariffs: [{ ...baseTariff, ...overrides.tariff }]
            },
            ...(overrides.order || {}),
        },
        ...overrides,
    };
}

describe('Tarification Service', () => {

    beforeEach(() => {
        (db.query.routePoints.findMany as any).mockResolvedValue([]);
    });

    // --- Base cost tests ---

    it('should calculate per_km base cost without VAT', async () => {
        (db.query.trips.findFirst as any).mockResolvedValue(makeMockTrip());

        const result = await tarificationService.calculateTripCost('trip-1');

        expect(result.baseCost).toBe(15000); // 150 km × 100
        expect(result.subtotal).toBe(15000); // no modifiers on Monday daytime
        expect(result.vatAmount).toBe(3000); // 20% of 15000
        expect(result.total).toBe(18000);   // 15000 + 3000
    });

    it('should calculate per_hour with VAT included', async () => {
        (db.query.trips.findFirst as any).mockResolvedValue(
            makeMockTrip({
                actualDepartureAt: MONDAY_10AM,
                actualCompletionAt: MONDAY_2_30PM, // 4.5h
                tariff: { type: 'per_hour', ratePerHour: 2000, vatIncluded: true }
            })
        );

        const result = await tarificationService.calculateTripCost('trip-1');

        expect(result.baseCost).toBe(9000); // 4.5h × 2000
        expect(result.total).toBe(9000);    // VAT included → total = subtotal before extraction
        expect(result.vatAmount).toBe(1500); // 9000 × 20/120
        expect(result.subtotal).toBe(7500);  // 9000 - 1500
    });

    it('should enforce minTripCost', async () => {
        (db.query.trips.findFirst as any).mockResolvedValue(
            makeMockTrip({
                actualDistanceKm: 10,
                tariff: { ratePerKm: 50, vatIncluded: true, minTripCost: 5000 }
            })
        );

        const result = await tarificationService.calculateTripCost('trip-1');
        expect(result.total).toBe(5000);
    });

    // --- Modifier tests ---

    it('should apply night modifier for trips during 22:00-06:00', async () => {
        // Trip runs entirely at night: 23:00 - 03:00 (4h, all night)
        (db.query.trips.findFirst as any).mockResolvedValue(
            makeMockTrip({
                actualDepartureAt: new Date('2026-03-02T23:00:00Z'), // Monday night
                actualCompletionAt: new Date('2026-03-03T03:00:00Z'),
            })
        );

        const result = await tarificationService.calculateTripCost('trip-1');

        // Night fraction ≈ 1.0, nightCost = 15000 × 1.0 × 0.5 = 7500
        expect(result.modifiers.nightCost).toBe(7500);
    });

    it('should apply weekend modifier', async () => {
        // Saturday
        (db.query.trips.findFirst as any).mockResolvedValue(
            makeMockTrip({
                actualDepartureAt: new Date('2026-03-07T10:00:00Z'), // Saturday
                actualCompletionAt: new Date('2026-03-07T14:00:00Z'),
            })
        );

        const result = await tarificationService.calculateTripCost('trip-1');

        // weekendCost = 15000 × (1.2 - 1) = 3000 (allow floating point)
        expect(result.modifiers.weekendCost).toBeCloseTo(3000, 0);
    });

    it('should apply urgent modifier when lead time < 4h', async () => {
        (db.query.trips.findFirst as any).mockResolvedValue(
            makeMockTrip({
                order: {
                    cargoWeightKg: 5000,
                    createdAt: new Date('2026-03-02T09:00:00Z'),
                    returnRequired: false,
                    contract: { tariffs: [baseTariff] }
                },
                plannedCompletionAt: new Date('2026-03-02T11:00:00Z'), // 2h lead time
            })
        );

        const result = await tarificationService.calculateTripCost('trip-1');

        // urgentCost = 15000 × (1.3 - 1) = 4500
        expect(result.modifiers.urgentCost).toBeCloseTo(4500, 0);
    });

    it('should apply idle cost for waiting beyond limit', async () => {
        (db.query.trips.findFirst as any).mockResolvedValue(makeMockTrip());
        (db.query.routePoints.findMany as any).mockResolvedValue([
            { arrivedAt: new Date('2026-03-02T10:00:00Z'), completedAt: new Date('2026-03-02T12:30:00Z') }, // 150min, 90min over
        ]);

        const result = await tarificationService.calculateTripCost('trip-1');
        // 90min / 60 = 1.5h × 500 = 750
        expect(result.modifiers.idleCost).toBe(750);
    });

    it('should apply extra point cost for > 2 points', async () => {
        (db.query.trips.findFirst as any).mockResolvedValue(makeMockTrip());
        (db.query.routePoints.findMany as any).mockResolvedValue([
            { arrivedAt: null, completedAt: null },
            { arrivedAt: null, completedAt: null },
            { arrivedAt: null, completedAt: null },
            { arrivedAt: null, completedAt: null },
        ]);

        const result = await tarificationService.calculateTripCost('trip-1');
        // 4 - 2 = 2 extra × 1000 = 2000
        expect(result.modifiers.extraPointsCost).toBe(2000);
    });

    // --- Rounding & structure tests ---

    it('should round amount with precision 10', async () => {
        (db.query.trips.findFirst as any).mockResolvedValue(
            makeMockTrip({
                actualDistanceKm: 153, // 153 × 100 = 15300
                tariff: { ratePerKm: 100, vatIncluded: true, roundingPrecision: 10 }
            })
        );

        const result = await tarificationService.calculateTripCost('trip-1');
        // 15300 rounded to 10 = 15300 (already aligned). total = 15300 (VAT included)
        expect(result.total).toBe(15300);
    });

    it('should include cost breakdown and margin', async () => {
        (db.query.trips.findFirst as any).mockResolvedValue(makeMockTrip());

        const result = await tarificationService.calculateTripCost('trip-1');

        expect(result.costComponents).toBeDefined();
        expect(result.costComponents.fuelCost).toBeGreaterThan(0);
        expect(result.costComponents.driverSalary).toBeGreaterThan(0);
        expect(typeof result.margin).toBe('number');
        expect(typeof result.marginPercent).toBe('number');
    });
});
