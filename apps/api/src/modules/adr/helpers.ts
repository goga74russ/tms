// ============================================================
// ADR / опасные грузы — pure helpers for class + UN validation.
// Service-layer eligibility check (DB-bound) is in service.ts.
// ============================================================

/**
 * The nine ADR classes (1..9 with sub-divisions). We accept the
 * top-level class label here — sub-classes (e.g. `1.4`) are passed
 * through as long as they begin with a known top-level digit.
 */
export const ADR_CLASSES = [
    '1', '2', '3', '4', '5', '6', '7', '8', '9',
] as const;
export type AdrClass = typeof ADR_CLASSES[number];

const ADR_CLASS_NAMES_RU: Record<AdrClass, string> = {
    '1': 'Взрывчатые вещества и изделия',
    '2': 'Газы',
    '3': 'Легковоспламеняющиеся жидкости',
    '4': 'Легковоспламеняющиеся твёрдые вещества',
    '5': 'Окисляющие вещества',
    '6': 'Токсичные вещества',
    '7': 'Радиоактивные материалы',
    '8': 'Коррозионные вещества',
    '9': 'Прочие опасные вещества и изделия',
};

/**
 * Classify an ADR class string. Returns the top-level class character
 * if the input is recognisable (e.g. "1", "1.4", "3 ", "  9") or null.
 */
export function classifyAdrClass(input: string | null | undefined): AdrClass | null {
    if (input === null || input === undefined) return null;
    const trimmed = String(input).trim();
    if (trimmed.length === 0) return null;
    const head = trimmed[0];
    return (ADR_CLASSES as ReadonlyArray<string>).includes(head)
        ? (head as AdrClass)
        : null;
}

/** Human-readable RU label for an ADR class. Unknown class → null. */
export function getAdrClassNameRu(input: string | null | undefined): string | null {
    const cls = classifyAdrClass(input);
    return cls ? ADR_CLASS_NAMES_RU[cls] : null;
}

/**
 * UN-number validator. Canonical form is "UN" followed by 4 digits
 * (e.g. UN1203 for petrol). We accept "UN1203" or "1203" — but
 * reject any other shape.
 */
export function isValidUnNumber(input: string | null | undefined): boolean {
    if (!input) return false;
    const trimmed = String(input).trim().toUpperCase();
    return /^(UN)?\d{4}$/.test(trimmed);
}

/** Normalise a UN number to the canonical "UNNNNN" form, or null. */
export function normalizeUnNumber(input: string | null | undefined): string | null {
    if (!isValidUnNumber(input)) return null;
    const trimmed = String(input).trim().toUpperCase();
    return trimmed.startsWith('UN') ? trimmed : `UN${trimmed}`;
}

/**
 * Driver + vehicle eligibility check (PURE — no DB).
 *
 * Mirrors `service.ts::validateAdrCompatibility` but operates on
 * already-fetched rows so it can be unit-tested in isolation.
 * Returns the same RU error strings.
 */
export interface EligibilityInput {
    driver: { adrCertificateExpiry?: Date | string | null } | null;
    vehicle: { adrEquipped?: boolean | null } | null;
    now: Date;
}

export interface EligibilityResult {
    ok: boolean;
    errors: string[];
}

export function checkAdrEligibility(input: EligibilityInput): EligibilityResult {
    const errors: string[] = [];

    if (!input.driver) {
        errors.push('Водитель не найден');
    } else if (!input.driver.adrCertificateExpiry) {
        errors.push('Водитель не имеет действующего ADR-свидетельства');
    } else {
        const expiry = new Date(input.driver.adrCertificateExpiry);
        if (Number.isNaN(expiry.getTime()) || expiry < input.now) {
            errors.push('ADR-сертификат водителя истёк');
        }
    }

    if (!input.vehicle) {
        errors.push('ТС не найдено');
    } else if (!input.vehicle.adrEquipped) {
        errors.push('ТС не оборудовано для ADR-перевозок');
    }

    return { ok: errors.length === 0, errors };
}
