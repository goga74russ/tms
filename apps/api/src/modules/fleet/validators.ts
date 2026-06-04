// ============================================================
// Fleet Validators — INN, Plate, VIN, deadline traffic light
// ============================================================
import { findByInn as dadataFindByInn } from '../../integrations/mocks/dadata.mock.js';

/**
 * Validate Russian INN checksum (10 or 12 digits)
 */
export function validateInn(inn: string): { valid: boolean; error?: string } {
    if (!/^\d{10}(\d{2})?$/.test(inn)) {
        return { valid: false, error: 'ИНН должен содержать 10 или 12 цифр' };
    }

    const digits = inn.split('').map(Number);

    if (digits.length === 10) {
        const weights = [2, 4, 10, 3, 5, 9, 4, 6, 8];
        const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
        const check = (sum % 11) % 10;
        if (check !== digits[9]) {
            return { valid: false, error: 'Неверная контрольная сумма ИНН (10 цифр)' };
        }
    }

    if (digits.length === 12) {
        const weights1 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
        const sum1 = weights1.reduce((acc, w, i) => acc + w * digits[i], 0);
        const check1 = (sum1 % 11) % 10;

        const weights2 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
        const sum2 = weights2.reduce((acc, w, i) => acc + w * digits[i], 0);
        const check2 = (sum2 % 11) % 10;

        if (check1 !== digits[10] || check2 !== digits[11]) {
            return { valid: false, error: 'Неверная контрольная сумма ИНН (12 цифр)' };
        }
    }

    return { valid: true };
}

/**
 * Latin → Cyrillic map for visually identical plate letters.
 * Russian plates use only the 12 letters with Latin look-alikes (А В Е К М Н О Р С Т У Х).
 * Drivers/operators often type the Latin equivalent (A B E K M H O P C T Y X), producing
 * a different string for a visually identical plate. We canonicalise to Cyrillic.
 */
const PLATE_LATIN_TO_CYRILLIC: Record<string, string> = {
    A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н',
    O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х',
};

/**
 * Normalise a plate to its canonical Cyrillic, upper-case form:
 * trims surrounding/inner whitespace, upper-cases, then maps Latin look-alikes to Cyrillic.
 * Visually identical plates ('A000АА77' and 'А000АА77') collapse to the same string.
 */
export function normalizePlateNumber(plate: string): string {
    return plate
        .replace(/\s+/g, '')
        .toUpperCase()
        .split('')
        .map(ch => PLATE_LATIN_TO_CYRILLIC[ch] ?? ch)
        .join('');
}

/**
 * Validate Russian vehicle plate number format: А000АА00 or А000АА000
 * Input is normalised to canonical Cyrillic before validation; the canonical
 * form is returned so callers can persist a single visual representation.
 */
export function validatePlateNumber(plate: string): { valid: boolean; error?: string; normalized?: string } {
    const normalized = normalizePlateNumber(plate);
    // After normalisation only Cyrillic plate letters remain.
    const regex = /^[АВЕКМНОРСТУХ]\d{3}[АВЕКМНОРСТУХ]{2}\d{2,3}$/;
    if (!regex.test(normalized)) {
        return { valid: false, error: 'Формат госномера: А000АА00 или А000АА000' };
    }
    return { valid: true, normalized };
}

/**
 * Validate VIN (17 characters, no I/O/Q)
 */
export function validateVin(vin: string): { valid: boolean; error?: string } {
    if (vin.length !== 17) {
        return { valid: false, error: 'VIN должен содержать ровно 17 символов' };
    }
    if (/[IOQ]/i.test(vin)) {
        return { valid: false, error: 'VIN не может содержать буквы I, O, Q' };
    }
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) {
        return { valid: false, error: 'VIN содержит недопустимые символы' };
    }
    return { valid: true };
}

/**
 * Document deadline "traffic light"
 * >30 days = green, 7-30 = yellow, <7 = red, expired = blocked
 */
export type DeadlineColor = 'green' | 'yellow' | 'red' | 'blocked';

export function getDeadlineColor(expiryDate: Date | string | null | undefined): DeadlineColor | null {
    if (!expiryDate) return null;

    const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate;
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays < 0) return 'blocked';
    if (diffDays < 7) return 'red';
    if (diffDays <= 30) return 'yellow';
    return 'green';
}

/**
 * Compute traffic light colors for all vehicle document deadlines
 */
export function getVehicleDeadlines(vehicle: {
    techInspectionExpiry?: Date | string | null;
    osagoExpiry?: Date | string | null;
    maintenanceNextDate?: Date | string | null;
    tachographCalibrationExpiry?: Date | string | null;
}) {
    return {
        techInspection: getDeadlineColor(vehicle.techInspectionExpiry),
        osago: getDeadlineColor(vehicle.osagoExpiry),
        maintenance: getDeadlineColor(vehicle.maintenanceNextDate),
        tachograph: getDeadlineColor(vehicle.tachographCalibrationExpiry),
    };
}

/**
 * Check if any vehicle document is expired (blocked)
 */
export function hasExpiredDocuments(vehicle: {
    techInspectionExpiry?: Date | string | null;
    osagoExpiry?: Date | string | null;
    maintenanceNextDate?: Date | string | null;
    tachographCalibrationExpiry?: Date | string | null;
}): boolean {
    const deadlines = getVehicleDeadlines(vehicle);
    return Object.values(deadlines).some(color => color === 'blocked');
}

/**
 * DaData INN lookup — uses mock service (replace with real API in production).
 * POST https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party
 */
export async function lookupByInn(inn: string): Promise<{
    name?: string;
    kpp?: string;
    legalAddress?: string;
} | null> {
    const company = await dadataFindByInn(inn);
    if (!company) return null;
    return {
        name: company.name,
        kpp: company.kpp,
        legalAddress: company.legalAddress,
    };
}

/**
 * Validate driver license number format
 * Format: 2 digits + 2 digits + space + 6 digits, or just 10 digits
 */
export function validateLicenseNumber(license: string): { valid: boolean; error?: string } {
    const cleaned = license.replace(/\s/g, '');
    if (!/^\d{10}$/.test(cleaned)) {
        return { valid: false, error: 'Номер ВУ должен содержать 10 цифр' };
    }
    return { valid: true };
}
