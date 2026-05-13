// ============================================================
// Omnicomm telematics — REAL skeleton.
// Docs: https://api.omnicomm.ru/api/api.html
// Auth: POST /auth/login → token; tokens expire after 24h.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    TelematicsCredentials, TelematicsPosition, TelematicsProvider, TelematicsVehicle,
} from './interface.js';

export const OMNICOMM_API_URL = 'https://online.omnicomm.ru/api/v1';

export interface OmnicommCredentials extends TelematicsCredentials {
    user: string;
    password: string;
    apiUrl?: string;
}

// A-P1-24: Omnicomm tokens are valid for ~24h. Re-login proactively.
const OMNICOMM_TOKEN_TTL_MS = 24 * 3600_000;
const TOKEN_REFRESH_SKEW_MS = 30_000;

export class OmnicommTelematicsProvider implements TelematicsProvider {
    readonly name = 'omnicomm';
    readonly providerType = 'telematics' as const;
    readonly mode = 'production' as const;

    private token?: string;
    private tokenExpiresAt: number | null = null;

    constructor(private readonly creds: OmnicommCredentials) { }

    private get apiUrl(): string {
        return this.creds.apiUrl ?? OMNICOMM_API_URL;
    }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.user && this.creds.password),
            mode: 'production',
            detail: 'omnicomm credentials present',
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
        // this.tokenExpiresAt = Date.now() + OMNICOMM_TOKEN_TTL_MS;
        throw new Error('Omnicomm login not yet implemented.');
    }

    /** A-P1-24: refresh token before expiry (24h TTL). */
    private async ensureFreshToken(): Promise<void> {
        if (!this.token || !this.tokenExpiresAt || Date.now() > this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
            this.token = undefined;
            this.tokenExpiresAt = null;
            await this.ensureToken();
        }
    }

    async listVehicles(_creds: TelematicsCredentials): Promise<TelematicsVehicle[]> {
        await this.ensureFreshToken();
        // GET {apiUrl}/objects?token=<token>
        // Response: { objects: [{ id, name, regNumber, imei }] }
        // TODO(real-impl).
        return [];
    }

    async getPositions(_vehicleIds: string[], _since: Date): Promise<TelematicsPosition[]> {
        await this.ensureFreshToken();
        // GET {apiUrl}/objects/{id}/track?from=<unix>&to=<unix>&token=<token>
        // Response: [{ time, lat, lon, speed, course }]
        // TODO(real-impl).
        return [];
    }

    async startTracking(_vehicleId: string): Promise<void> { /* poll-based */ }
    async stopTracking(_vehicleId: string): Promise<void> { /* poll-based */ }
}
