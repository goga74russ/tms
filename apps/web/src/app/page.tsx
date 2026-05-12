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

// Priority — a user with multiple roles lands on the most privileged dashboard.
const ROLE_PRIORITY: string[] = [
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
            let route = '';
            for (const role of ROLE_PRIORITY) {
                if (user.roles.includes(role) && ROLE_ROUTES[role]) {
                    route = ROLE_ROUTES[role];
                    break;
                }
            }
            router.replace(route || '/logist');
            return;
        }
        router.replace('/landing');
    }, [user, loading, router]);

    return null;
}
