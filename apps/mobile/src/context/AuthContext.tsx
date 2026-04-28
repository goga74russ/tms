import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, login as apiLogin, logout as apiLogout, getMe } from '../api/auth';

type User = {
    id: string;
    email: string;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        async function initAuth() {
            try {
                const storedToken = await getToken();
                if (storedToken) {
                    const meResponse = await getMe(storedToken);
                    setUser(meResponse.data);
                    setToken(storedToken);
                }
            } catch (err) {
                await apiLogout();
            } finally {
                setIsLoading(false);
            }
        }
        initAuth();
    }, []);

    const login = async (email: string, pass: string) => {
        const token = await apiLogin(email, pass);
        const meResponse = await getMe(token);
        setUser(meResponse.data);
        setToken(token);
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

