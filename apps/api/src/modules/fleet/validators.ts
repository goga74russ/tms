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
 * Validate Russian vehicle plate number format: А000АА00 or А000АА000
 * Accepts both Cyrillic and Latin chars common on plates
 */
export function validatePlateNumber(plate: string): { valid: boolean; error?: string } {
    // Acceptable letters on Russian plates (Cyrillic + Latin equivalents)
    const regex = /^[АВЕКМНОРСТУХABEKMHOPCTYX]\d{3}[АВЕКМНОРСТУХABEKMHOPCTYX]{2}\d{2,3}$/i;
    if (!regex.test(plate)) {
        return { valid: false, error: 'Формат госномера: А000АА00 или А000АА000' };
    }
    return { valid: true };
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
    const company = dadataFindByInn(inn);
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
