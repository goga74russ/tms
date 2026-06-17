// ============================================================
// Role-based routing helpers
// Mirrors the inline maps in `app/page.tsx` and `app/login/page.tsx`.
// Extracted so the logic is testable in isolation and can be
// reused if/when those two pages are deduplicated.
// ============================================================

export const ROLE_ROUTES: Record<string, string> = {
    logist: '/logist',
    dispatcher: '/dispatcher',
    mechanic: '/mechanic',
    medic: '/medic',
    manager: '/kpi',
    accountant: '/finance',
    repair_service: '/repair',
    admin: '/admin/users',
    client: '/client',
    // Водитель работает в мобильном приложении — веб ведёт его на экран
    // установки (/driver-app), а не в /trips (куда middleware его и не пускал).
    driver: '/driver-app',
};

// Priority — a user with multiple roles lands on the most privileged dashboard.
export const ROLE_PRIORITY: string[] = [
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

/**
 * Resolve the dashboard route for the given roles, picking the most-privileged
 * one present. Returns '/' when nothing matches (caller decides fallback).
 */
export function pickRouteForRoles(roles: string[] | null | undefined): string {
    if (!Array.isArray(roles) || roles.length === 0) return '/';
    for (const role of ROLE_PRIORITY) {
        if (roles.includes(role) && ROLE_ROUTES[role]) return ROLE_ROUTES[role];
    }
    return '/';
}
