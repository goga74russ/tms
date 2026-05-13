// ============================================================
// Bulk-import validators — extracted from routes.ts so unit tests
// can exercise them without booting a DB connection.
// Keep these in sync with `routes.ts` (it imports from here).
// ============================================================
import type { TemplateType } from './templates.js';

export function validateContractor(item: Record<string, unknown>): string[] {
    const errs: string[] = [];
    if (!item.name) errs.push('Название обязательно');
    if (!item.inn) errs.push('ИНН обязателен');
    else if (!/^\d{10}(\d{2})?$/.test(String(item.inn))) errs.push('ИНН должен содержать 10 или 12 цифр');
    return errs;
}

export function validateVehicle(item: Record<string, unknown>): string[] {
    const errs: string[] = [];
    if (!item.plateNumber) errs.push('Госномер обязателен');
    if (!item.vin) errs.push('VIN обязателен');
    if (!item.make) errs.push('Марка обязательна');
    if (!item.model) errs.push('Модель обязательна');
    return errs;
}

export function validateDriver(item: Record<string, unknown>): string[] {
    const errs: string[] = [];
    if (!item.fullName) errs.push('ФИО обязательно');
    if (!item.licenseNumber) errs.push('Номер ВУ обязателен');
    return errs;
}

export function validateOrder(item: Record<string, unknown>): string[] {
    const errs: string[] = [];
    if (!item.number) errs.push('Номер заявки обязателен');
    if (!item.contractorInn) errs.push('ИНН контрагента обязателен');
    if (!item.cargoDescription) errs.push('Описание груза обязательно');
    if (!item.cargoWeightKg) errs.push('Вес груза обязателен');
    if (!item.loadingAddress) errs.push('Адрес погрузки обязателен');
    if (!item.unloadingAddress) errs.push('Адрес выгрузки обязателен');
    return errs;
}

export function validate(type: TemplateType, item: Record<string, unknown>): string[] {
    switch (type) {
        case 'contractors': return validateContractor(item);
        case 'vehicles': return validateVehicle(item);
        case 'drivers': return validateDriver(item);
        case 'orders': return validateOrder(item);
    }
}

/**
 * A-P0-5: map known PG error codes to friendly RU messages so we never
 * echo raw constraint text back (would leak index/column names).
 *
 * The `context` parameter tailors the "duplicate" wording per resource
 * (e.g. "дубликат ИНН" vs "дубликат номера заявки").
 */
export type ImportPgContext = 'vehicles' | 'orders' | 'contractors' | 'generic';

export function mapPgErrorToFriendlyRu(code: unknown, context: ImportPgContext = 'generic'): string {
    if (code === '23505') {
        switch (context) {
            case 'vehicles': return 'дубликат (уже существует ТС с такими данными)';
            case 'orders': return 'дубликат номера заявки';
            case 'contractors': return 'дубликат ИНН';
            default: return 'дубликат';
        }
    }
    if (code === '23503') {
        switch (context) {
            case 'orders': return 'нарушена связь (контрагент не найден)';
            case 'vehicles': return 'нарушена связь с другой таблицей';
            default: return 'нарушена связь';
        }
    }
    return 'ошибка вставки';
}
