// ============================================================
// Роснефть BP/Card — REAL skeleton.
// Docs: https://bpc.rosneft.com (закрытый ЛК, контракт через ИНН)
// Auth: OAuth2 client_credentials.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    FuelCardCredentials, FuelCardProvider, FuelCardStatus, FuelTransaction,
} from './interface.js';

export const ROSNEFT_API_URL = 'https://api.bpc.rosneft.com/api/v1';

export interface RosneftCredentials extends FuelCardCredentials {
    clientId: string;
    clientSecret: string;
    contractId: string;
}

// A-P1-24: Rosneft OAuth2 access tokens expire per-token (typically 1h).
// Re-acquire via client_credentials before expiry.
const ROSNEFT_TOKEN_TTL_MS = 60 * 60_000;
const TOKEN_REFRESH_SKEW_MS = 30_000;

export class RosneftFuelCardProvider implements FuelCardProvider {
    readonly name = 'rosneft';
    readonly providerType = 'fuel_card' as const;
    readonly mode = 'production' as const;

    private accessToken?: string;
    private tokenExpiresAt: number | null = null;

    constructor(private readonly creds: RosneftCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.clientId && this.creds.clientSecret),
            mode: 'production',
            detail: 'rosneft credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    private async ensureToken(): Promise<string> {
        if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
            return this.accessToken;
        }
        // POST {ROSNEFT_API_URL}/oauth/token  (client_credentials grant)
        // Body: grant_type=client_credentials&client_id=...&client_secret=...
        // Response: { access_token, expires_in }
        // TODO(real-impl).
        // this.accessToken = data.access_token;
        // this.tokenExpiresAt = Date.now() + (data.expires_in ? data.expires_in * 1000 : ROSNEFT_TOKEN_TTL_MS);
        throw new Error('Rosneft OAuth not yet implemented.');
    }

    /** A-P1-24: refresh access_token before per-token expiry (default 1h). */
    private async ensureFreshToken(): Promise<void> {
        if (!this.accessToken || !this.tokenExpiresAt || Date.now() > this.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
            this.accessToken = undefined;
            this.tokenExpiresAt = null;
            await this.ensureToken();
        }
    }

    async syncTransactions(_creds: FuelCardCredentials, _vehicleId: string, _from: Date, _to: Date): Promise<FuelTransaction[]> {
        await this.ensureFreshToken();
        // GET {ROSNEFT_API_URL}/contracts/{contractId}/transactions?from=<iso>&to=<iso>
        // Headers: Authorization: Bearer <accessToken>
        // TODO(real-impl).
        return [];
    }

    async getCardStatus(_cardId: string): Promise<FuelCardStatus> {
        await this.ensureFreshToken();
        // GET {ROSNEFT_API_URL}/cards/{cardId}
        // TODO(real-impl).
        throw new Error('Rosneft getCardStatus() not yet implemented.');
    }
}
