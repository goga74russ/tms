// ============================================================
// Mock ГИБДД Fines Lookup Service (§3.15)
// Имитирует API агрегатора штрафов по госномеру ТС
// ============================================================

export interface GibddFine {
    resolutionNumber: string;  // Номер постановления (уникальный)
    plateNumber: string;
    violationDate: string;
    violationType: string;
    amount: number;            // Рубли
    discountedAmount: number;  // Со скидкой 50% (первые 20 дней)
    photoUrl: string | null;
    isPaid: boolean;
}

const VIOLATION_TYPES = [
    'Превышение скорости на 20-40 км/ч',
    'Превышение скорости на 40-60 км/ч',
    'Превышение скорости на 60-80 км/ч',
    'Проезд на запрещающий сигнал светофора',
    'Нарушение правил парковки',
    'Выезд на полосу встречного движения',
    'Непредоставление преимущества пешеходу',
    'Нарушение правил перевозки грузов',
    'Нарушение весовых и габаритных ограничений',
    'Несоблюдение требований дорожных знаков',
];

const AMOUNTS = [500, 1000, 1500, 2000, 2500, 3000, 5000, 10000, 15000, 20000];

function hashString(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
    }
    return hash;
}

/**
 * Generate a resolution number from plate + seed.
 * Format: 18810XXXXXXXXXXXXXXX (like real Russian format)
 */
function generateResolutionNumber(plate: string, seed: number): string {
    const h = hashString(plate + String(seed));
    const num = String(h).padStart(15, '0').slice(0, 15);
    return `18810${num}`;
}

/**
 * Lookup fines for a vehicle by plate number.
 * Returns 0–3 fines deterministically based on plate hash.
 */
export function lookupFines(plateNumber: string): GibddFine[] {
    const h = hashString(plateNumber);
    const fineCount = h % 4; // 0–3 fines

    if (fineCount === 0) return [];

    const fines: GibddFine[] = [];
    const now = new Date();

    for (let i = 0; i < fineCount; i++) {
        const seed = h + i * 1000;
        const daysAgo = 1 + (seed % 60); // 1–60 days ago
        const violationDate = new Date(now.getTime() - daysAgo * 86400000);
        const amount = AMOUNTS[seed % AMOUNTS.length];
        const violationType = VIOLATION_TYPES[seed % VIOLATION_TYPES.length];

        fines.push({
            resolutionNumber: generateResolutionNumber(plateNumber, i),
            plateNumber,
            violationDate: violationDate.toISOString(),
            violationType,
            amount,
            discountedAmount: daysAgo <= 20 ? amount / 2 : amount,
            photoUrl: daysAgo <= 30 ? `https://gibdd-mock.example.com/photos/${generateResolutionNumber(plateNumber, i)}.jpg` : null,
            isPaid: false,
        });
    }

    return fines;
}

/**
 * Batch lookup — query fines for multiple plates at once.
 */
export function batchLookupFines(plateNumbers: string[]): Record<string, GibddFine[]> {
    const result: Record<string, GibddFine[]> = {};
    for (const plate of plateNumbers) {
        result[plate] = lookupFines(plate);
    }
    return result;
}
