// ============================================================
// Газпромнефть «Опти-24» — REAL skeleton.
// Docs: https://www.opti-24.com (партнёрский раздел)
// Auth: token via portal, signature header per request.
// ============================================================
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    FuelCardCredentials, FuelCardProvider, FuelCardStatus, FuelTransaction,
} from './interface.js';

export const GAZPROMNEFT_API_URL = 'https://api.opti-24.com/v2';

export interface GazpromneftCredentials extends FuelCardCredentials {
    apiKey: string;
    contractId: string;
}

export class GazpromneftFuelCardProvider implements FuelCardProvider {
    readonly name = 'gazpromneft';
    readonly providerType = 'fuel_card' as const;
    readonly mode = 'production' as const;

    constructor(private readonly creds: GazpromneftCredentials) { }

    async healthCheck(): Promise<ProviderHealth> {
        return {
            ok: Boolean(this.creds.apiKey && this.creds.contractId),
            mode: 'production',
            detail: 'gazpromneft credentials present',
            checkedAt: nowIso(),
        };
    }

    async execute(): Promise<unknown> { return { ok: true }; }

    async syncTransactions(_creds: FuelCardCredentials, _vehicleId: string, _from: Date, _to: Date): Promise<FuelTransaction[]> {
        // GET {GAZPROMNEFT_API_URL}/transactions
        //   ?contractId=<id>&dateFrom=<iso>&dateTo=<iso>
        //   Headers: X-Api-Key: <apiKey>
        // Response: { items: [{ trnId, cardNo, dateTime, station, fuel, qty, price, sum, mileage }] }
        // TODO(real-impl).
        throw new Error('Gazpromneft syncTransactions() not yet implemented — awaiting credentials.');
    }

    async getCardStatus(_cardId: string): Promise<FuelCardStatus> {
        // GET {GAZPROMNEFT_API_URL}/cards/{cardNo}
        // TODO(real-impl).
        throw new Error('Gazpromneft getCardStatus() not yet implemented.');
    }
}
