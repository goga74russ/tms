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

export class RosneftFuelCardProvider implements FuelCardProvider {
    readonly name = 'rosneft';
    readonly providerType = 'fuel_card' as const;
    readonly mode = 'production' as const;

    private accessToken?: string;

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
        if (this.accessToken) return this.accessToken;
        // POST {ROSNEFT_API_URL}/oauth/token  (client_credentials grant)
        // Body: grant_type=client_credentials&client_id=...&client_secret=...
        // TODO(real-impl).
        throw new Error('Rosneft OAuth not yet implemented.');
    }

    async syncTransactions(_creds: FuelCardCredentials, _vehicleId: string, _from: Date, _to: Date): Promise<FuelTransaction[]> {
        // GET {ROSNEFT_API_URL}/contracts/{contractId}/transactions?from=<iso>&to=<iso>
        // Headers: Authorization: Bearer <accessToken>
        // TODO(real-impl).
        await this.ensureToken();
        return [];
    }

    async getCardStatus(_cardId: string): Promise<FuelCardStatus> {
        // GET {ROSNEFT_API_URL}/cards/{cardId}
        // TODO(real-impl).
        await this.ensureToken();
        throw new Error('Rosneft getCardStatus() not yet implemented.');
    }
}
