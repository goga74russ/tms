'use client';

import { createContext, useContext, useEffect, useMemo, useState, ReactNode, useCallback } from 'react';
import { api } from '@/lib/api';

// ================================================================
// User Context — provides current user to all components
// ================================================================
export interface CurrentUser {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
    phone?: string;
    driverId?: string;
    /** Organization the user belongs to. `null`/missing = platform super-admin
     *  (owner of the SaaS — sees all tenants). */
    organizationId?: string | null;
    /** Convenience flag derived server-side: role=admin AND no organizationId.
     *  Frontend uses this to hide cross-tenant admin views from tenant admins. */
    isSuperAdmin?: boolean;
}

interface UserContextValue {
    user: CurrentUser | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    logout: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
    user: null,
    loading: true,
    error: null,
    refetch: async () => { },
    logout: async () => { },
});

export function useUser() {
    return useContext(UserContext);
}

export function UserProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchUser = useCallback(async () => {
        try {
            setLoading(true);
            const result = await api.me();
            if (result.success) {
                setUser(result.data as CurrentUser);
                setError(null);
            }
        } catch (err: any) {
            setError(err.message);
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        await api.logout();
        setUser(null);
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const value = useMemo<UserContextValue>(
        () => ({ user, loading, error, refetch: fetchUser, logout }),
        [user, loading, error, fetchUser, logout],
    );

    return (
        <UserContext.Provider value={value}>
            {children}
        </UserContext.Provider>
    );
}
