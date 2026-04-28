// ============================================================
// Mock Wialon Telemetry Service (§3.14)
// Имитирует ответ Wialon API: GPS, одометр, скорость, топливо
// ============================================================

export interface WialonTelemetry {
    plateNumber: string;
    timestamp: string;
    lat: number;
    lon: number;
    speed: number;          // km/h
    odometerKm: number;     // total odometer
    fuelLevelLiters: number;
    engineOn: boolean;
}

/**
 * Deterministic hash from string — reproducible across calls
 */
function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
    }
    return hash;
}

/**
 * Get current telemetry for a single vehicle.
 * Uses plate number hash + current hour for deterministic but varying data.
 */
export function getVehicleTelemetry(plateNumber: string, currentOdometerKm: number): WialonTelemetry {
    const h = hashString(plateNumber);
    const hourSeed = new Date().getHours();

    // GPS near Moscow: 55.5–56.0 lat, 37.2–38.0 lon
    const lat = 55.5 + ((h % 500) / 1000);
    const lon = 37.2 + (((h * 7) % 800) / 1000);

    // Odometer: increment by 5–50 km from current value
    const increment = 5 + ((h + hourSeed) % 46);
    const odometerKm = currentOdometerKm + increment;

    // Speed: 0–90 km/h
    const speed = (h + hourSeed * 3) % 91;

    // Fuel: 10–80 liters
    const fuelLevelLiters = 10 + ((h * 3 + hourSeed) % 71);

    const engineOn = speed > 0;

    return {
        plateNumber,
        timestamp: new Date().toISOString(),
        lat: Number(lat.toFixed(4)),
        lon: Number(lon.toFixed(4)),
        speed,
        odometerKm,
        fuelLevelLiters,
        engineOn,
    };
}

/**
 * Batch telemetry for multiple vehicles.
 * Simulates a Wialon `avl_evts` group call.
 */
export function getBatchTelemetry(
    vehicles: Array<{ plateNumber: string; currentOdometerKm: number }>,
): WialonTelemetry[] {
    return vehicles.map(v => getVehicleTelemetry(v.plateNumber, v.currentOdometerKm));
}
