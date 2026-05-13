import { pickPrimaryRole, ROLE_PRIORITY } from './rolePriority';

describe('pickPrimaryRole', () => {
    it('returns null for undefined roles', () => {
        expect(pickPrimaryRole(undefined)).toBeNull();
    });

    it('returns null for empty roles array', () => {
        expect(pickPrimaryRole([])).toBeNull();
    });

    it('returns mechanic when user has both driver and mechanic (mechanic wins by priority)', () => {
        expect(pickPrimaryRole(['driver', 'mechanic'])).toBe('mechanic');
    });

    it('returns driver when that is the only role', () => {
        expect(pickPrimaryRole(['driver'])).toBe('driver');
    });

    it('falls back to first returned role when the list contains no known roles', () => {
        // pickPrimaryRole gracefully degrades to whatever the API returned first.
        // Intentionally NOT returning null — keeps unknown deployments routable.
        expect(pickPrimaryRole(['unknown_role'])).toBe('unknown_role');
    });

    it('prefers admin over every other role', () => {
        expect(pickPrimaryRole(['driver', 'mechanic', 'admin'])).toBe('admin');
    });

    it('keeps ROLE_PRIORITY ordering stable (regression guard)', () => {
        // The mechanic-vs-driver routing decision depends on this exact order.
        // If someone reshuffles the array, this test fails and they have to
        // rethink the home-screen routing decision.
        expect(ROLE_PRIORITY.indexOf('mechanic')).toBeLessThan(ROLE_PRIORITY.indexOf('driver'));
        expect(ROLE_PRIORITY.indexOf('admin')).toBe(0);
        expect(ROLE_PRIORITY[ROLE_PRIORITY.length - 1]).toBe('driver');
    });
});
