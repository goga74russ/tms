'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/user-context';

const ROLE_ROUTES: Record<string, string> = {
    logist: '/logist',
    dispatcher: '/dispatcher',
    mechanic: '/mechanic',
    medic: '/medic',
    manager: '/kpi',
    accountant: '/finance',
    repair_service: '/repair',
    admin: '/admin/users',
    client: '/client',
    driver: '/trips',
};

/**
 * Root entrypoint:
 *  - authenticated  -> role-specific dashboard
 *  - unauthenticated -> /landing (public marketing)
 *
 * Auth detection uses the same useUser context as the rest of the app.
 * Unauthenticated visitors land on /landing instead of /login so the public
 * marketing page is the first impression.
 */
export default function RootPage() {
    const { user, loading } = useUser();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (user) {
            const route =
                user.roles.reduce<string>((acc, role) => acc || (ROLE_ROUTES[role] ?? ''), '') ||
                '/logist';
            router.replace(route);
            return;
        }
        router.replace('/landing');
    }, [user, loading, router]);

    return null;
}
