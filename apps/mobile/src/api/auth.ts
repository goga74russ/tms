import * as SecureStore from 'expo-secure-store';
import { clearQueue } from './offlineQueue';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'tms_jwt_token';

export async function login(email: string, password: string): Promise<string> {
    const response = await fetch(`${API_URL}/auth/mobile/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || 'Failed to login');
    }

    const data = await response.json();
    const token = data.data?.token || data.token;

    if (!token) {
        throw new Error('No token provided in response');
    }

    await SecureStore.setItemAsync(TOKEN_KEY, token);
    return token;
}

export async function logout(): Promise<void> {
    await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY),
        clearQueue(),
    ]);
}

export async function getToken(): Promise<string | null> {
    return await SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getMe(token: string) {
    const response = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch user data');
    }

    return response.json();
}

