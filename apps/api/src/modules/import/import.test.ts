// ============================================================
// Bulk-import validators + PG error mapper unit tests.
// No DB — imports validators.ts directly.
// ============================================================
import { describe, it, expect } from 'vitest';
import {
    validate,
    validateOrder,
    validateContractor,
    validateVehicle,
    validateDriver,
    mapPgErrorToFriendlyRu,
} from './validators.js';

describe('validateOrder', () => {
    const fullValid = {
        number: 'Z-1',
        contractorInn: '1234567890',
        cargoDescription: 'X',
        cargoWeightKg: 1000,
        loadingAddress: 'addr-from',
        unloadingAddress: 'addr-to',
    };

    it('returns no errors for a fully-populated valid order', () => {
        expect(validateOrder(fullValid)).toEqual([]);
    });

    it.each([
        ['number', 'Номер заявки обязателен'],
        ['contractorInn', 'ИНН контрагента обязателен'],
        ['cargoDescription', 'Описание груза обязательно'],
        ['cargoWeightKg', 'Вес груза обязателен'],
        ['loadingAddress', 'Адрес погрузки обязателен'],
        ['unloadingAddress', 'Адрес выгрузки обязателен'],
    ])('flags missing %s with RU message', (field, message) => {
        const item: Record<string, unknown> = { ...fullValid };
        delete item[field];
        expect(validateOrder(item)).toContain(message);
    });

    it('returns multiple errors when several fields are missing', () => {
        const errs = validateOrder({});
        // 6 required fields → 6 RU messages.
        expect(errs.length).toBe(6);
        // Every message is Cyrillic (sanity — confirms localisation).
        expect(errs.every((e) => /[А-Яа-я]/.test(e))).toBe(true);
    });

    it('treats cargoWeightKg=0 as missing (falsy)', () => {
        // Current contract: weight must be truthy. 0 kg is meaningless anyway.
        const errs = validateOrder({ ...fullValid, cargoWeightKg: 0 });
        expect(errs).toContain('Вес груза обязателен');
    });
});

describe('validateContractor', () => {
    it('accepts a 10-digit ИНН', () => {
        expect(validateContractor({ name: 'ООО Х', inn: '1234567890' })).toEqual([]);
    });

    it('accepts a 12-digit ИНН', () => {
        expect(validateContractor({ name: 'ИП Y', inn: '123456789012' })).toEqual([]);
    });

    it('rejects an 11-digit ИНН with RU error', () => {
        const errs = validateContractor({ name: 'X', inn: '12345678901' });
        expect(errs).toContain('ИНН должен содержать 10 или 12 цифр');
    });

    it('flags missing name and missing inn separately', () => {
        const errs = validateContractor({});
        expect(errs).toContain('Название обязательно');
        expect(errs).toContain('ИНН обязателен');
    });
});

describe('validateVehicle and validateDriver', () => {
    it('vehicle requires plateNumber, vin, make, model', () => {
        const errs = validateVehicle({});
        expect(errs).toHaveLength(4);
        expect(errs).toEqual(expect.arrayContaining([
            'Госномер обязателен',
            'VIN обязателен',
            'Марка обязательна',
            'Модель обязательна',
        ]));
    });

    it('driver requires fullName and licenseNumber', () => {
        const errs = validateDriver({});
        expect(errs).toEqual(expect.arrayContaining([
            'ФИО обязательно',
            'Номер ВУ обязателен',
        ]));
    });
});

describe('validate(type, item) dispatch', () => {
    it('routes to validateOrder for type=orders', () => {
        const errs = validate('orders', {});
        expect(errs).toContain('Номер заявки обязателен');
    });

    it('routes to validateContractor for type=contractors', () => {
        const errs = validate('contractors', { name: 'X', inn: 'abc' });
        expect(errs).toContain('ИНН должен содержать 10 или 12 цифр');
    });
});

describe('mapPgErrorToFriendlyRu (A-P0-5)', () => {
    it('maps 23505 to per-context duplicate wording', () => {
        expect(mapPgErrorToFriendlyRu('23505', 'vehicles')).toBe('дубликат (уже существует ТС с такими данными)');
        expect(mapPgErrorToFriendlyRu('23505', 'orders')).toBe('дубликат номера заявки');
        expect(mapPgErrorToFriendlyRu('23505', 'contractors')).toBe('дубликат ИНН');
    });

    it('maps 23503 to per-context FK wording', () => {
        expect(mapPgErrorToFriendlyRu('23503', 'orders')).toBe('нарушена связь (контрагент не найден)');
        expect(mapPgErrorToFriendlyRu('23503', 'vehicles')).toBe('нарушена связь с другой таблицей');
        expect(mapPgErrorToFriendlyRu('23503', 'contractors')).toBe('нарушена связь');
    });

    it('falls back to generic message for unknown codes', () => {
        expect(mapPgErrorToFriendlyRu('42703', 'orders')).toBe('ошибка вставки');
        expect(mapPgErrorToFriendlyRu(undefined, 'vehicles')).toBe('ошибка вставки');
        expect(mapPgErrorToFriendlyRu(null, 'orders')).toBe('ошибка вставки');
    });

    it('never echoes raw constraint text — output is fixed Russian string', () => {
        // Sanity: no English, no constraint names, no SQL fragments.
        for (const code of ['23505', '23503', '42P01']) {
            for (const ctx of ['vehicles', 'orders', 'contractors', 'generic'] as const) {
                const msg = mapPgErrorToFriendlyRu(code, ctx);
                expect(msg).not.toMatch(/CONSTRAINT|INSERT|TABLE|pkey|fkey/i);
                expect(/[А-Яа-я]/.test(msg)).toBe(true);
            }
        }
    });
});
