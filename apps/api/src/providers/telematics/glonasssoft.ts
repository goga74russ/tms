// ============================================================
// ГЛОНАССsoft telematics — REAL skeleton.
// Docs: https://hosting.glonasssoft.ru/api/
// Auth: POST /v3/auth/login {login, password} → token in `token` field.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    TelematicsCredentials, TelematicsPosition, TelematicsProvider, TelematicsVehicle,
} from './interface.js';

export const GLONASSSOFT_API_URL = 'https://hosting.glonasssoft.ru/api/v3';

export interface GlonasssoftCredentials extends TelematicsCredentials {
    user: string;
    password: string;
    apiUrl?: string;
}

export class GlonasssoftTelematicsProvider implements TelematicsProvider {
    readonly name = 'glonasssoft';
    readonly providerType = 'telematics' as const;
    readonly mode = 'production' as const;

    private token?: string;

    constructor(private readonly creds: GlonasssoftCredentials) { }

    private get apiUrl(): string {
        return this.creds.apiUrl ?? GLONASSSOFT_API_URL;
    }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.user && this.creds.password),
            mode: 'production',
            detail: 'glonasssoft credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> {
        return { ok: true };
    }

    private async ensureToken(): Promise<string> {
        if (this.token) return this.token;
        // POST {apiUrl}/auth/login  body: { login, password }
        // Response: { token, expiresAt }
        // TODO(real-impl).
        throw new Error('Glonasssoft login not yet implemented.');
    }

    async listVehicles(_creds: TelematicsCredentials): Promise<TelematicsVehicle[]> {
        // GET {apiUrl}/vehicles  Headers: X-Auth: <token>
        // Response: [{ id, name, plate, imei }]
        // TODO(real-impl).
        await this.ensureToken();
        return [];
    }

    async getPositions(_vehicleIds: string[], _since: Date): Promise<TelematicsPosition[]> {
        // GET {apiUrl}/vehicles/{id}/positions?from=<iso>&to=<iso>
        // TODO(real-impl).
        await this.ensureToken();
        return [];
    }

    async startTracking(_vehicleId: string): Promise<void> { /* poll-based */ }
    async stopTracking(_vehicleId: string): Promise<void> { /* poll-based */ }
}
