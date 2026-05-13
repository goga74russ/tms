// ============================================================
// Auth helpers — pure, no React, no native deps.
// Extracted from context/AuthContext.tsx so it can be unit-tested
// without rendering a component tree.
// ============================================================

export type NormalizedUser = {
    id: string;
    email: string;
    fullName?: string;
    roles: string[];
    role: string;
    driverId?: string;
};

/**
 * Normalise the API /me payload to the shape the app consumes.
 *  - Accepts either `roles: string[]` or `role: string` (singular).
 *  - Picks the first role as the convenience `role` field.
 *  - Falls back to 'driver' if the user has no roles at all.
 *  - Returns a brand-new object so callers can safely mutate.
 */
export function normalizeUser(raw: any): NormalizedUser {
    const roles = Array.isArray(raw?.roles) ? raw.roles : raw?.role ? [raw.role] : [];
    return {
        ...raw,
        roles,
        role: roles[0] ?? raw?.role ?? 'driver',
    };
}
