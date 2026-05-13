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

// A-P1-24: Glonasssoft tokens are per-token (no documented hard TTL); we
// refresh hourly by default and re-login on any 401.
const GLONASSSOFT_TOKEN_TTL_MS = 60 * 60_000;
const TOKEN_REFRESH_SKEW_MS = 30_000;

export class GlonasssoftTelematicsProvider implements TelematicsProvider {
    readonly name = 'glonasssoft';
    readonly providerType = 'telematics' as const;
    readonly mode = 'production' as const;

    private token?: string;
    private tokenExpiresAt: number | null = null;

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
        if (this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
            return this.token;
        }
        // POST {apiUrl}/auth/login  body: { login, password }
        // Response: { token, expiresAt }
        // TODO(real-impl).
        // this.token = data.token;
        // this.tokenExpiresAt = Date.now() + GLONASSSOFT_TOKEN_TTL_MS;
        throw new Error('Glonasssoft login not yet implemented.');
    }

    /** A-P1-24: refresh token before expiry (default 1h). */
    private async ensureFreshToken(): Promise<void> {
        if (!this.token || !this.tokenExpiresAt || Date.now() > this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
            this.token = undefined;
            this.tokenExpiresAt = null;
            await this.ensureToken();
        }
    }

    async listVehicles(_creds: TelematicsCredentials): Promise<TelematicsVehicle[]> {
        await this.ensureFreshToken();
        // GET {apiUrl}/vehicles  Headers: X-Auth: <token>
        // Response: [{ id, name, plate, imei }]
        // TODO(real-impl).
        return [];
    }

    async getPositions(_vehicleIds: string[], _since: Date): Promise<TelematicsPosition[]> {
        await this.ensureFreshToken();
        // GET {apiUrl}/vehicles/{id}/positions?from=<iso>&to=<iso>
        // TODO(real-impl).
        return [];
    }

    async startTracking(_vehicleId: string): Promise<void> { /* poll-based */ }
    async stopTracking(_vehicleId: string): Promise<void> { /* poll-based */ }
}
