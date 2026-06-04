import { describe, it, expect } from 'vitest';
import { VehicleCreateSchema } from '@tms/shared';

// C9 anchor: plateNumber regex имел `\\d` (литерал backslash+d) вместо `\d` →
// отвергал ВСЕ валидные госномера РФ, ломая POST /fleet/vehicles целиком.
const baseVehicle = (plate: string) => ({
    plateNumber: plate,
    vin: 'XTA210990Y2000000', // 17 символов
    make: 'КамАЗ',
    model: '5490',
    year: 2020,
    bodyType: 'тент',
    payloadCapacityKg: 20000,
});

describe('VehicleCreateSchema.plateNumber', () => {
    it.each([
        'А123ВС77',
        'В456ОР199',
        'у001кх96',   // lowercase (флаг /i)
        'O777OO777',  // латиница (флаг /i допускает A-Z)
    ])('принимает валидный госномер РФ: %s', (plate) => {
        const r = VehicleCreateSchema.safeParse(baseVehicle(plate));
        expect(r.success).toBe(true);
    });

    it.each([
        '123АВС77',    // начинается с цифр
        'АА123ВС77',   // две буквы в начале
        'А12ВС77',     // 2 цифры в серии
        'А123В77',     // одна буква
        '',            // пусто
    ])('отвергает невалидный госномер: %s', (plate) => {
        const r = VehicleCreateSchema.safeParse(baseVehicle(plate));
        expect(r.success).toBe(false);
    });
});
