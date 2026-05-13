// ============================================================
// Telematics provider interface — Wialon / Omnicomm / GLONASSsoft.
// ============================================================
import type { ProviderAdapter, ProviderType } from '../base.js';

export interface TelematicsVehicle {
    externalId: string;
    name: string;
    plateNumber?: string;
    deviceImei?: string;
}

export interface TelematicsPosition {
    vehicleExternalId: string;
    recordedAt: string;
    latitude: number;
    longitude: number;
    speedKmh: number;
    headingDeg: number;
}

export interface TelematicsCredentials {
    /** Token returned by provider auth endpoint, or static API key. */
    token?: string;
    /** Provider-specific user identifier (Wialon login, Omnicomm user, …). */
    user?: string;
    password?: string;
    /** Override default endpoint, useful for self-hosted deployments. */
    apiUrl?: string;
}

export interface TelematicsProvider extends ProviderAdapter {
    readonly providerType: Extract<ProviderType, 'telematics'>;
    listVehicles(creds: TelematicsCredentials): Promise<TelematicsVehicle[]>;
    getPositions(vehicleIds: string[], since: Date): Promise<TelematicsPosition[]>;
    startTracking(vehicleId: string): Promise<void>;
    stopTracking(vehicleId: string): Promise<void>;
}
