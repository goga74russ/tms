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
