// ============================================================
// Fuel-card provider interface — Лукойл / Роснефть / Газпромнефть / CSV.
// ============================================================
import type { ProviderAdapter, ProviderType } from '../base.js';

export interface FuelTransaction {
    transactionId: string;
    cardNumber: string;
    timestamp: string;
    stationName: string;
    stationAddress?: string;
    fuelType: string;
    liters: number;
    pricePerLiter: number;
    totalCost: number;
    odometerKm?: number;
    /** Optional vehicle id if mapping by card → vehicle is provided. */
    vehicleId?: string;
}

export interface FuelCardStatus {
    cardId: string;
    active: boolean;
    balance?: number;
    blockedReason?: string;
}

export interface FuelCardCredentials {
    apiKey?: string;
    /** Some processors require organization/contract id alongside token. */
    contractId?: string;
    user?: string;
    password?: string;
}

export interface FuelCardProvider extends ProviderAdapter {
    readonly providerType: Extract<ProviderType, 'fuel_card'>;
    syncTransactions(creds: FuelCardCredentials, vehicleId: string, from: Date, to: Date): Promise<FuelTransaction[]>;
    getCardStatus(cardId: string): Promise<FuelCardStatus>;
}
