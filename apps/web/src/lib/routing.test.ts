import { describe, it, expect } from 'vitest';
import { pickRouteForRoles, ROLE_PRIORITY, ROLE_ROUTES } from './routing';

describe('pickRouteForRoles', () => {
    it('admin wins over manager', () => {
        expect(pickRouteForRoles(['manager', 'admin'])).toBe('/admin/users');
    });

    it('manager wins over dispatcher', () => {
        expect(pickRouteForRoles(['dispatcher', 'manager'])).toBe('/kpi');
    });

    it('dispatcher wins over driver', () => {
        expect(pickRouteForRoles(['driver', 'dispatcher'])).toBe('/dispatcher');
    });

    it('single driver role -> /trips', () => {
        expect(pickRouteForRoles(['driver'])).toBe('/trips');
    });

    it('logist -> /logist', () => {
        expect(pickRouteForRoles(['logist'])).toBe('/logist');
    });

    it('client -> /client', () => {
        expect(pickRouteForRoles(['client'])).toBe('/client');
    });

    it('empty roles -> /', () => {
        expect(pickRouteForRoles([])).toBe('/');
    });

    it('null/undefined input -> /', () => {
        expect(pickRouteForRoles(null)).toBe('/');
        expect(pickRouteForRoles(undefined)).toBe('/');
    });

    it('unknown role -> /', () => {
        expect(pickRouteForRoles(['guest'])).toBe('/');
    });

    it('respects full ROLE_PRIORITY ordering', () => {
        // Sanity check: every role in ROLE_PRIORITY has a route mapping.
        for (const role of ROLE_PRIORITY) {
            expect(ROLE_ROUTES[role]).toBeTruthy();
        }
    });
});
