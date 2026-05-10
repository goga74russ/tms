// ============================================================
// Mock telematics provider — wraps the existing wialon-track-generator
// to produce plausible positions for demo/dev.
// ============================================================
import { simulateTrack, type TrackSample, type TrackWaypoint } from '../../integrations/mocks/wialon-track-generator.js';
import { nowIso, type ProviderHealth } from '../base.js';
import type {
    TelematicsCredentials, TelematicsPosition, TelematicsProvider, TelematicsVehicle,
} from './interface.js';

const DEMO_WAYPOINTS: TrackWaypoint[] = [
    { lat: 55.7558, lon: 37.6176 }, // Москва
    { lat: 55.6500, lon: 37.4500 },
    { lat: 55.5800, lon: 37.5200 },
];

export class MockTelematicsProvider implements TelematicsProvider {
    readonly name = 'mock';
    readonly providerType = 'telematics' as const;
    readonly mode = 'mock' as const;

    async healthCheck(): Promise<ProviderHealth> {
        return { ok: true, mode: 'mock', detail: 'mock telematics provider', checkedAt: nowIso() };
    }

    async execute(): Promise<unknown> {
        return { ok: true };
    }

    async listVehicles(_creds: TelematicsCredentials): Promise<TelematicsVehicle[]> {
        return [
            { externalId: 'mock-veh-1', name: 'Демо ТС 1', plateNumber: 'А001АА777', deviceImei: '861234567890001' },
            { externalId: 'mock-veh-2', name: 'Демо ТС 2', plateNumber: 'В002ВВ777', deviceImei: '861234567890002' },
            { externalId: 'mock-veh-3', name: 'Демо ТС 3', plateNumber: 'С003СС777', deviceImei: '861234567890003' },
        ];
    }

    async getPositions(vehicleIds: string[], since: Date): Promise<TelematicsPosition[]> {
        const out: TelematicsPosition[] = [];
        for (const vid of vehicleIds) {
            const samples: TrackSample[] = simulateTrack(DEMO_WAYPOINTS, {
                startedAt: since,
                maxSamples: 30,
                seed: vid.length,
            });
            for (const s of samples) {
                out.push({
                    vehicleExternalId: vid,
                    recordedAt: s.timestamp,
                    latitude: s.latitude,
                    longitude: s.longitude,
                    speedKmh: s.speedKmh,
                    headingDeg: s.headingDeg,
                });
            }
        }
        return out;
    }

    async startTracking(_vehicleId: string): Promise<void> { /* no-op */ }
    async stopTracking(_vehicleId: string): Promise<void> { /* no-op */ }
}

export const mockTelematicsProvider = new MockTelematicsProvider();
