/**
 * Role priority for mobile home-screen selection.
 *
 * Mirrors apps/web/src/app/login/page.tsx ROLE_PRIORITY so a multi-role user
 * (e.g. mechanic + driver) lands on the mechanic home, not the driver home.
 *
 * Extracted to its own module so the logic is unit-testable without
 * rendering the React Navigation tree.
 */
export const ROLE_PRIORITY: readonly string[] = [
    'admin',
    'manager',
    'dispatcher',
    'logist',
    'accountant',
    'mechanic',
    'medic',
    'repair_service',
    'client',
    'driver',
];

export function pickPrimaryRole(roles: string[] | undefined): string | null {
    if (!roles || roles.length === 0) return null;
    for (const role of ROLE_PRIORITY) {
        if (roles.includes(role)) return role;
    }
    // Unknown role — fall through to whatever the API returned first.
    return roles[0] ?? null;
}
