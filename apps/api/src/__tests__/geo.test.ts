// ============================================================
// Geocoding & Distance — Unit Tests
// ============================================================
import { describe, it, expect } from 'vitest';
import { geocodeAddress, geocodeBatch, reverseGeocode } from '../modules/geo/geocoding.service.js';
import {
    haversineDistance,
    calculateDistanceMatrix,
    calculateRouteDistance,
    findNearest,
    estimateDrivingDistance,
} from '../modules/geo/distance.service.js';

// ================================================================
// Geocoding Tests
// ================================================================
describe('Geocoding Service', () => {
    it('should geocode known address "Москва, Тверская 1"', () => {
        const result = geocodeAddress('Москва, Тверская 1');
        expect(result.source).toBe('dictionary');
        expect(result.confidence).toBe(1.0);
        expect(result.lat).toBeCloseTo(55.7578, 2);
        expect(result.lon).toBeCloseTo(37.6137, 2);
    });

    it('should geocode case-insensitively', () => {
        const result = geocodeAddress('МОСКВА, ТВЕРСКАЯ 1');
        expect(result.source).toBe('dictionary');
    });

    it('should fall back to mock geocoder for unknown addresses', () => {
        const result = geocodeAddress('Село Кукуево, ул. Неизвестная 99');
        expect(result.source).toBe('mock');
        expect(result.confidence).toBe(0.3);
        // Should still produce valid coordinates near Moscow region
        expect(result.lat).toBeGreaterThan(50);
        expect(result.lat).toBeLessThan(60);
    });

    it('should mock geocode deterministically (same input → same output)', () => {
        const r1 = geocodeAddress('Тестовый адрес');
        const r2 = geocodeAddress('Тестовый адрес');
        expect(r1.lat).toBe(r2.lat);
        expect(r1.lon).toBe(r2.lon);
    });

    it('should batch geocode multiple addresses', () => {
        const results = geocodeBatch([
            'Москва, Тверская 1',
            'Москва, Красная Площадь 1',
            'Неизвестный адрес',
        ]);
        expect(results).toHaveLength(3);
        expect(results[0].source).toBe('dictionary');
        expect(results[2].source).toBe('mock');
    });

    it('should reverse geocode near known address', () => {
        const address = reverseGeocode(55.7578, 37.6137);
        expect(address).toContain('москва');
        expect(address).toContain('тверская');
    });
});

// ================================================================
// Distance Tests
// ================================================================
describe('Distance Service', () => {
    const MOSCOW = { lat: 55.7558, lon: 37.6173 };
    const SPB = { lat: 59.9343, lon: 30.3351 };
    const KAZAN = { lat: 55.7887, lon: 49.1221 };

    describe('haversineDistance', () => {
        it('Moscow → SPb ≈ 634 km', () => {
            const dist = haversineDistance(MOSCOW, SPB);
            expect(dist).toBeGreaterThan(625);
            expect(dist).toBeLessThan(640);
        });

        it('same point → 0 km', () => {
            const dist = haversineDistance(MOSCOW, MOSCOW);
            expect(dist).toBe(0);
        });

        it('Moscow → Kazan ≈ 723 km', () => {
            const dist = haversineDistance(MOSCOW, KAZAN);
            expect(dist).toBeGreaterThan(715);
            expect(dist).toBeLessThan(730);
        });

        it('should be symmetric (A→B = B→A)', () => {
            const ab = haversineDistance(MOSCOW, SPB);
            const ba = haversineDistance(SPB, MOSCOW);
            expect(ab).toBeCloseTo(ba, 6);
        });
    });

    describe('calculateDistanceMatrix', () => {
        it('should return NxN matrix', () => {
            const matrix = calculateDistanceMatrix([MOSCOW, SPB, KAZAN]);
            expect(matrix).toHaveLength(3);
            expect(matrix[0]).toHaveLength(3);
        });

        it('diagonal should be zeros', () => {
            const matrix = calculateDistanceMatrix([MOSCOW, SPB]);
            expect(matrix[0][0]).toBe(0);
            expect(matrix[1][1]).toBe(0);
        });

        it('should be symmetric', () => {
            const matrix = calculateDistanceMatrix([MOSCOW, SPB, KAZAN]);
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    expect(matrix[i][j]).toBeCloseTo(matrix[j][i], 2);
                }
            }
        });
    });

    describe('calculateRouteDistance', () => {
        it('should sum distances along route', () => {
            const routeDist = calculateRouteDistance([MOSCOW, SPB]);
            const directDist = haversineDistance(MOSCOW, SPB);
            expect(routeDist).toBeCloseTo(directDist, 0);
        });

        it('should return 0 for single point', () => {
            expect(calculateRouteDistance([MOSCOW])).toBe(0);
        });

        it('should return 0 for empty array', () => {
            expect(calculateRouteDistance([])).toBe(0);
        });

        it('route through 3 cities should be longer than direct', () => {
            const direct = haversineDistance(MOSCOW, KAZAN);
            const viaSpb = calculateRouteDistance([MOSCOW, SPB, KAZAN]);
            expect(viaSpb).toBeGreaterThan(direct);
        });
    });

    describe('findNearest', () => {
        it('should find SPb as nearest to a point near SPb', () => {
            const nearSpb = { lat: 59.9, lon: 30.3 };
            const result = findNearest(nearSpb, [MOSCOW, SPB, KAZAN]);
            expect(result).not.toBeNull();
            expect(result!.index).toBe(1); // SPB
        });

        it('should return null for empty candidates', () => {
            expect(findNearest(MOSCOW, [])).toBeNull();
        });
    });

    describe('estimateDrivingDistance', () => {
        it('should apply 1.3x detour factor', () => {
            const straight = 100;
            const driving = estimateDrivingDistance(straight);
            expect(driving).toBe(130);
        });
    });
});
