'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { api } from '@/lib/api';

// ================================================================
// User Context — provides current user to all components
// ================================================================
export interface CurrentUser {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
}

interface UserContextValue {
    user: CurrentUser | null;
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    logout: () => void;
}

const UserContext = createContext<UserContextValue>({
    user: null,
    loading: true,
    error: null,
    refetch: async () => { },
    logout: () => { },
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

    const logout = useCallback(() => {
        api.logout();
        setUser(null);
    }, []);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    return (
        <UserContext.Provider value={{ user, loading, error, refetch: fetchUser, logout }}>
            {children}
        </UserContext.Provider>
    );
}
