import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { getToken, login as apiLogin, logout as apiLogout, getMe, AuthError } from '../api/auth';
import { AUTH_LOGOUT_EVENT } from '../api/client';
import { syncDatabase } from '../api/sync';
import { database } from '../database';
import { normalizeUser } from '../utils/auth';

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
            const storedToken = await getToken();
            if (!storedToken) {
                setIsLoading(false);
                return;
            }
            try {
                const hydratedUser = await hydrateUser(storedToken);
                setUser(hydratedUser);
                setToken(storedToken);
                void syncDatabase(storedToken);
            } catch (err) {
                // Only treat real auth failures (401/403) as a reason to wipe the
                // session. Network blips, 5xx, timeouts etc. must NOT log the
                // driver out — they need to keep working offline against cached
                // data. In those cases we keep the token; the next API call will
                // retry naturally.
                const isAuthFailure =
                    err instanceof AuthError && (err.status === 401 || err.status === 403);
                if (isAuthFailure) {
                    await apiLogout();
                } else {
                    // Surface the cached token so the rest of the app can still
                    // make authenticated requests once connectivity returns.
                    setToken(storedToken);
                }
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
        try {
            await database.write(async () => {
                await database.unsafeResetDatabase();
            });
        } catch {
            // Reset failure shouldn't block sign-out — the next session will sync fresh data.
        }
        setUser(null);
        setToken(null);
    };

    // B6.2: подписка на централизованный auth-logout event от api/client.ts.
    // Любой authFetch с 401 испускает событие, водитель видит login-screen
    // без необходимости ждать следующего ручного запроса.
    const logoutRef = useRef(logout);
    logoutRef.current = logout;
    useEffect(() => {
        const sub = DeviceEventEmitter.addListener(AUTH_LOGOUT_EVENT, () => {
            void logoutRef.current();
        });
        return () => sub.remove();
    }, []);

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
