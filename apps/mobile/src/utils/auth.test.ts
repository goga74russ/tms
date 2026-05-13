import { normalizeUser } from './auth';

describe('normalizeUser', () => {
    it('passes through a fully-shaped payload with roles[]', () => {
        const u = normalizeUser({
            id: 'u1',
            email: 'a@b.test',
            fullName: 'Иван',
            roles: ['driver', 'mechanic'],
            driverId: 'd-1',
        });
        expect(u).toMatchObject({
            id: 'u1',
            email: 'a@b.test',
            fullName: 'Иван',
            roles: ['driver', 'mechanic'],
            role: 'driver',
            driverId: 'd-1',
        });
    });

    it('promotes a singular `role` field to a roles[] array', () => {
        const u = normalizeUser({ id: 'u2', email: 'x@y', role: 'dispatcher' });
        expect(u.roles).toEqual(['dispatcher']);
        expect(u.role).toBe('dispatcher');
    });

    it('falls back to role="driver" when neither role nor roles is present', () => {
        const u = normalizeUser({ id: 'u3', email: 'no@role' });
        expect(u.roles).toEqual([]);
        expect(u.role).toBe('driver');
    });

    it('prefers roles[] when both roles and role are set', () => {
        const u = normalizeUser({ id: 'u4', email: 'a@b', roles: ['admin'], role: 'driver' });
        expect(u.roles).toEqual(['admin']);
        expect(u.role).toBe('admin');
    });

    it('handles null input without throwing (defensive)', () => {
        const u = normalizeUser(null);
        expect(u.roles).toEqual([]);
        expect(u.role).toBe('driver');
    });

    it('handles undefined input without throwing', () => {
        const u = normalizeUser(undefined);
        expect(u.roles).toEqual([]);
        expect(u.role).toBe('driver');
    });

    it('does not mutate the input object', () => {
        const raw = { id: 'u5', email: 'a@b', role: 'admin' };
        const snapshot = JSON.stringify(raw);
        normalizeUser(raw);
        expect(JSON.stringify(raw)).toBe(snapshot);
    });

    it('non-array roles value is treated like missing roles', () => {
        // API contract is array; but real responses can drift. Make sure
        // we don't blindly trust a string as `roles` (otherwise role[0]
        // would be a single character).
        const u = normalizeUser({ id: 'u6', email: 'a@b', roles: 'admin', role: 'admin' });
        expect(u.roles).toEqual(['admin']);
        expect(u.role).toBe('admin');
    });
});
