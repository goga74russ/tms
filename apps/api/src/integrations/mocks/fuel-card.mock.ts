// ============================================================
// Mock Fuel Card Processor Service (§3.9)
// Имитирует API процессинга АЗС (Газпромнефть / Роснефть)
// Для план-фактного анализа расхода ГСМ
// ============================================================

export interface FuelTransaction {
    transactionId: string;
    cardNumber: string;
    plateNumber: string;
    timestamp: string;
    stationName: string;
    stationAddress: string;
    fuelType: 'ДТ' | 'АИ-92' | 'АИ-95' | 'АИ-100';
    liters: number;
    pricePerLiter: number;
    totalCost: number;
    odometerKm: number;
}

const STATION_NAMES = [
    'Газпромнефть №1245', 'Газпромнефть №987', 'Роснефть №456',
    'Роснефть №112', 'Лукойл №334', 'Лукойл №778',
    'Shell №55', 'BP №23', 'Татнефть №89',
];

const STATION_ADDRESSES = [
    'МО, Ленинградское шоссе, 45 км', 'Москва, ул. Перерва, 62',
    'МО, Каширское шоссе, 30 км', 'Москва, Варшавское шоссе, 130',
    'МО, Ярославское шоссе, 22 км', 'Москва, пр-кт Мира, 188',
    'МО, Щёлковское шоссе, 15 км', 'МО, Новорижское шоссе, 50 км',
    'Москва, МКАД 56-й км', 'МО, Минское шоссе, 40 км',
];

const FUEL_PRICES: Record<string, number> = {
    'ДТ': 62.5,
    'АИ-92': 52.8,
    'АИ-95': 57.3,
    'АИ-100': 68.9,
};

function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
    }
    return hash;
}

/**
 * Generate a fuel card number from plate.
 */
function generateCardNumber(plate: string): string {
    const h = hashString(plate);
    return `7002${String(h).padStart(12, '0').slice(0, 12)}`;
}

/**
 * Get fuel transactions for a vehicle over the last N days.
 * Returns 2–5 transactions deterministically based on plate hash.
 */
export function getTransactions(
    plateNumber: string,
    currentOdometerKm: number,
    daysBack: number = 30,
): FuelTransaction[] {
    const h = hashString(plateNumber);
    const txCount = 2 + (h % 4); // 2–5 transactions
    const transactions: FuelTransaction[] = [];
    const cardNumber = generateCardNumber(plateNumber);
    const now = Date.now();

    // Most trucks use diesel
    const fuelType = h % 5 === 0 ? 'АИ-92' as const : 'ДТ' as const;
    const pricePerLiter = FUEL_PRICES[fuelType];

    for (let i = 0; i < txCount; i++) {
        const seed = h + i * 777;
        const daysAgo = 1 + (seed % daysBack);
        const timestamp = new Date(now - daysAgo * 86400000);

        const liters = 30 + (seed % 120); // 30–150 liters
        const odometerAtFill = currentOdometerKm - (daysAgo * 150); // rough daily mileage

        const station = STATION_NAMES[seed % STATION_NAMES.length];
        const address = STATION_ADDRESSES[seed % STATION_ADDRESSES.length];

        transactions.push({
            transactionId: `TX-${seed.toString(16).toUpperCase().slice(0, 10)}`,
            cardNumber,
            plateNumber,
            timestamp: timestamp.toISOString(),
            stationName: station,
            stationAddress: address,
            fuelType,
            liters,
            pricePerLiter,
            totalCost: Number((liters * pricePerLiter).toFixed(2)),
            odometerKm: Math.max(0, odometerAtFill),
        });
    }

    // Sort by date descending
    transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return transactions;
}

// ============================================================
// Wave 6: realistic synthetic transactions for /sync endpoint
// ============================================================

export interface SyntheticFuelTransaction {
    timestamp: string;          // ISO
    stationChain: string;       // 'Лукойл' | 'Роснефть' | ...
    stationName: string;        // pretty label "{chain} АЗС №NN, г. {City}"
    fuelType: 'ДТ' | 'АИ-92' | 'АИ-95' | 'АИ-100';
    liters: number;
    pricePerLiter: number;
    totalCost: number;
    locationCity: string;
    lat: number;
    lon: number;
}

const STATION_CHAINS = ['Лукойл', 'Роснефть', 'Газпромнефть', 'Татнефть', 'Shell'];

const CITY_LOCATIONS: { city: string; lat: number; lon: number }[] = [
    { city: 'Москва', lat: 55.7558, lon: 37.6176 },
    { city: 'Санкт-Петербург', lat: 59.9343, lon: 30.3351 },
    { city: 'Нижний Новгород', lat: 56.2965, lon: 43.9361 },
    { city: 'Казань', lat: 55.7887, lon: 49.1221 },
    { city: 'Екатеринбург', lat: 56.8389, lon: 60.6057 },
    { city: 'Воронеж', lat: 51.6720, lon: 39.1843 },
    { city: 'Ростов-на-Дону', lat: 47.2357, lon: 39.7015 },
    { city: 'Краснодар', lat: 45.0355, lon: 38.9753 },
    { city: 'Самара', lat: 53.1959, lon: 50.1002 },
    { city: 'Тула', lat: 54.1920, lon: 37.6175 },
    { city: 'Ярославль', lat: 57.6261, lon: 39.8845 },
    { city: 'Новосибирск', lat: 55.0084, lon: 82.9357 },
];

interface SyntheticRangeOptions {
    /** Vehicle tank size — caps single fill if provided. */
    tankLiters?: number | null;
    /** Optional deterministic seed (defaults to vehicleId hash + range). */
    seed?: number;
    /** Override fuel type (default 'ДТ' — most trucks are diesel). */
    fuelType?: 'ДТ' | 'АИ-92' | 'АИ-95' | 'АИ-100';
}

/**
 * Generate synthetic fuel-card transactions over an arbitrary [from, to]
 * range with 1–3 fill-ups per week. Deterministic for a given
 * (vehicleId, fromDate, toDate, seed) tuple so a re-run of the sync is
 * idempotent if the caller dedupes on timestamp.
 */
export function generateTransactionsInRange(
    vehicleId: string,
    fromDate: Date,
    toDate: Date,
    options: SyntheticRangeOptions = {},
): SyntheticFuelTransaction[] {
    if (toDate.getTime() <= fromDate.getTime()) return [];

    const seed = options.seed ?? hashString(`${vehicleId}|${fromDate.toISOString()}|${toDate.toISOString()}`);
    const fuelType = options.fuelType ?? 'ДТ';
    const tank = options.tankLiters && options.tankLiters > 0 ? options.tankLiters : null;

    const ms = toDate.getTime() - fromDate.getTime();
    const weeks = Math.max(1, Math.round(ms / (7 * 86400000)));
    const out: SyntheticFuelTransaction[] = [];

    for (let w = 0; w < weeks; w++) {
        const weekSeed = seed + w * 9173;
        const fillsThisWeek = 1 + (weekSeed % 3); // 1..3
        for (let f = 0; f < fillsThisWeek; f++) {
            const fillSeed = weekSeed + f * 1117;
            // place fill somewhere inside this week
            const weekStart = fromDate.getTime() + w * 7 * 86400000;
            const weekEnd = Math.min(toDate.getTime(), weekStart + 7 * 86400000);
            const span = weekEnd - weekStart;
            if (span <= 0) continue;
            const offset = (fillSeed % 1000) / 1000 * span;
            const ts = new Date(weekStart + offset);
            if (ts < fromDate || ts > toDate) continue;

            const chain = STATION_CHAINS[fillSeed % STATION_CHAINS.length];
            const loc = CITY_LOCATIONS[(fillSeed >> 3) % CITY_LOCATIONS.length];
            const stationNum = 100 + ((fillSeed >> 5) % 900);

            // liters 50..300, capped by tank if known.
            let liters = 50 + ((fillSeed >> 7) % 251); // 50..300
            if (tank !== null) {
                liters = Math.min(liters, Math.floor(tank));
            }
            // price 55..75 RUB, with 0.1-step granularity
            const priceTenths = 550 + ((fillSeed >> 11) % 200); // 550..749
            const pricePerLiter = priceTenths / 10;

            const latJitter = (((fillSeed >> 13) % 1000) - 500) / 50_000; // ~±0.01
            const lonJitter = (((fillSeed >> 17) % 1000) - 500) / 50_000;

            out.push({
                timestamp: ts.toISOString(),
                stationChain: chain,
                stationName: `${chain} АЗС №${stationNum}, г. ${loc.city}`,
                fuelType,
                liters,
                pricePerLiter,
                totalCost: Number((liters * pricePerLiter).toFixed(2)),
                locationCity: loc.city,
                lat: Number((loc.lat + latJitter).toFixed(6)),
                lon: Number((loc.lon + lonJitter).toFixed(6)),
            });
        }
    }

    out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return out;
}

/**
 * Map ru-locale fuel type label to the fuel_type enum used in fuel_records.
 */
export function mapFuelTypeToEnum(label: 'ДТ' | 'АИ-92' | 'АИ-95' | 'АИ-100'):
    'diesel' | 'petrol' {
    return label === 'ДТ' ? 'diesel' : 'petrol';
}

/**
 * Get summary for fuel spend analysis.
 */
export function getFuelSummary(
    plateNumber: string,
    currentOdometerKm: number,
    daysBack: number = 30,
): {
    totalLiters: number;
    totalCost: number;
    transactions: number;
    avgPricePerLiter: number;
    fuelType: string;
} {
    const txns = getTransactions(plateNumber, currentOdometerKm, daysBack);
    const totalLiters = txns.reduce((s, t) => s + t.liters, 0);
    const totalCost = txns.reduce((s, t) => s + t.totalCost, 0);

    return {
        totalLiters,
        totalCost: Number(totalCost.toFixed(2)),
        transactions: txns.length,
        avgPricePerLiter: txns.length > 0 ? Number((totalCost / totalLiters).toFixed(2)) : 0,
        fuelType: txns[0]?.fuelType ?? 'ДТ',
    };
}
