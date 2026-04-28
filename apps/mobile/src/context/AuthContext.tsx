import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, login as apiLogin, logout as apiLogout, getMe } from '../api/auth';
import { syncDatabase } from '../api/sync';

type User = {
    id: string;
    email: string;
    fullName?: string;
    roles: string[];
    role: string;
    driverId?: string;
};

type AuthContextType = {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, pass: string) => Promise<void>;
    logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(raw: any): User {
    const roles = Array.isArray(raw?.roles) ? raw.roles : raw?.role ? [raw.role] : [];
    return {
        ...raw,
        roles,
        role: roles[0] ?? raw?.role ?? 'driver',
    };
}

async function hydrateUser(token: string): Promise<User> {
    const meResponse = await getMe(token);
    return normalizeUser(meResponse.data);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function initAuth() {
            try {
                const storedToken = await getToken();
                if (storedToken) {
                    const hydratedUser = await hydrateUser(storedToken);
                    setUser(hydratedUser);
                    setToken(storedToken);
                    void syncDatabase(storedToken);
                }
            } catch {
                await apiLogout();
            } finally {
                setIsLoading(false);
            }
        }
        void initAuth();
    }, []);

    const login = async (email: string, pass: string) => {
        const nextToken = await apiLogin(email, pass);
        const hydratedUser = await hydrateUser(nextToken);
        setUser(hydratedUser);
        setToken(nextToken);
        void syncDatabase(nextToken);
    };

    const logout = async () => {
        await apiLogout();
        setUser(null);
        setToken(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
