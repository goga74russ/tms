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

export class OmnicommTelematicsProvider implements TelematicsProvider {
    readonly name = 'omnicomm';
    readonly providerType = 'telematics' as const;
    readonly mode = 'production' as const;

    private token?: string;

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
        if (this.token) return this.token;
        // POST {apiUrl}/auth/login  body: { login, password }
        // Response: { token, expiresAt }
        // TODO(real-impl).
        throw new Error('Omnicomm login not yet implemented.');
    }

    async listVehicles(_creds: TelematicsCredentials): Promise<TelematicsVehicle[]> {
        // GET {apiUrl}/objects?token=<token>
        // Response: { objects: [{ id, name, regNumber, imei }] }
        // TODO(real-impl).
        await this.ensureToken();
        return [];
    }

    async getPositions(_vehicleIds: string[], _since: Date): Promise<TelematicsPosition[]> {
        // GET {apiUrl}/objects/{id}/track?from=<unix>&to=<unix>&token=<token>
        // Response: [{ time, lat, lon, speed, course }]
        // TODO(real-impl).
        await this.ensureToken();
        return [];
    }

    async startTracking(_vehicleId: string): Promise<void> { /* poll-based */ }
    async stopTracking(_vehicleId: string): Promise<void> { /* poll-based */ }
}
