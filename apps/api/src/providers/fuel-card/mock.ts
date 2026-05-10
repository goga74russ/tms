// ============================================================
// Mock fuel-card provider — wraps the existing fuel-card.mock helpers.
// ============================================================
import { generateTransactionsInRange } from '../../integrations/mocks/fuel-card.mock.js';
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    FuelCardCredentials, FuelCardProvider, FuelCardStatus, FuelTransaction,
} from './interface.js';

export class MockFuelCardProvider implements FuelCardProvider {
    readonly name = 'mock';
    readonly providerType = 'fuel_card' as const;
    readonly mode = 'mock' as const;

    async healthCheck(): Promise<ProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'mock fuel-card provider', checkedAt: nowIso() };
    }

    async execute(): Promise<unknown> {
        return { ok: true };
    }

    async syncTransactions(_creds: FuelCardCredentials, vehicleId: string, from: Date, to: Date): Promise<FuelTransaction[]> {
        const txs = generateTransactionsInRange(vehicleId, from, to);
        return txs.map((t, idx) => ({
            transactionId: `mock-${vehicleId.slice(0, 6)}-${idx}-${new Date(t.timestamp).getTime()}`,
            cardNumber: `7002${vehicleId.slice(0, 12).padEnd(12, '0')}`,
            timestamp: t.timestamp,
            stationName: t.stationName,
            stationAddress: t.locationCity,
            fuelType: t.fuelType,
            liters: t.liters,
            pricePerLiter: t.pricePerLiter,
            totalCost: t.totalCost,
            vehicleId,
        }));
    }

    async getCardStatus(cardId: string): Promise<FuelCardStatus> {
        return { cardId, active: true, balance: 50_000 };
    }
}

export const mockFuelCardProvider = new MockFuelCardProvider();
