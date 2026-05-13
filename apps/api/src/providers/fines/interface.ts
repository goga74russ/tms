// ============================================================
// Fines provider interface — АвтоКод / ФССП / ГИБДД.
// ============================================================
import type { ProviderAdapter, ProviderType } from '../base.js';

export type FineSource = 'autocode' | 'fssp' | 'gibdd' | 'mock';

export interface FineLookupResult {
    source: FineSource;
    externalId: string;
    issuedAt: string;
    article: string;
    description: string;
    amountRub: number;
    discountUntil?: string;
    paymentDeadline?: string;
    /** Driver passport / FIO if returned by source. */
    driverInfo?: { fio?: string; passport?: string };
    /** Vehicle plate / VIN. */
    vehicleInfo?: { plate?: string; vin?: string };
}

export interface FinesCredentials {
    apiKey?: string;
    user?: string;
    password?: string;
    /** Some providers require region code (e.g. ГИБДД by region). */
    regionCode?: string;
}

export interface FinesProvider extends ProviderAdapter {
    readonly providerType: Extract<ProviderType, 'fines'>;
    lookupByPlate(creds: FinesCredentials, plate: string, vin?: string): Promise<FineLookupResult[]>;
    lookupByDriverPassport(creds: FinesCredentials, passport: string): Promise<FineLookupResult[]>;
}
