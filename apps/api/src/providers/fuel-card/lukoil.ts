// ============================================================
// Лукойл-Интер-Кард — REAL skeleton.
// Docs: https://www.licard.ru/integration (B2B portal, account-gated)
// Auth: HMAC-signed requests with apiKey + contractId.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    FuelCardCredentials, FuelCardProvider, FuelCardStatus, FuelTransaction,
} from './interface.js';

export const LICARD_API_URL = 'https://api.licard.ru/v1';

export interface LukoilCredentials extends FuelCardCredentials {
    apiKey: string;
    contractId: string;
}

export class LukoilFuelCardProvider implements FuelCardProvider {
    readonly name = 'lukoil';
    readonly providerType = 'fuel_card' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: LukoilCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey && this.creds.contractId),
            mode: 'production',
            detail: 'lukoil licard credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    async syncTransactions(_creds: FuelCardCredentials, _vehicleId: string, _from: Date, _to: Date): Promise<FuelTransaction[]> {
        // GET {LICARD_API_URL}/transactions?contractId=<id>&from=<iso>&to=<iso>
        //   Headers: X-Api-Key: <apiKey>, X-Signature: <hmac-sha256>
        // Response: { transactions: [{ id, cardNumber, datetime, station: { name, address },
        //              fuelType, liters, pricePerLiter, total, odometer }] }
        // TODO(real-impl): wire fetch.
        throw new Error('Lukoil syncTransactions() not yet implemented — awaiting credentials.');
    }

    async getCardStatus(_cardId: string): Promise<FuelCardStatus> {
        // GET {LICARD_API_URL}/cards/{cardId}/status
        // TODO(real-impl).
        throw new Error('Lukoil getCardStatus() not yet implemented.');
    }
}
