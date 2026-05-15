import { describe, it, expect } from 'vitest';
import { validateETrNXml } from './xsd-validator.js';
import {
    generateETrNTitle2,
    generateETrNTitle5,
    generateETrNTitle6,
} from '../modules/waybills/etrn-titles-generator.js';

describe('validateETrNXml — T02 (приём перевозчиком)', () => {
    const validT02 = generateETrNTitle2({
        docId: 'doc-1',
        waybillId: 'WB-001',
        carrierInn: '7700000001',
        carrierName: 'ООО Перевозчик',
        shipperInn: '7700000002',
        shipperName: 'ООО Отправитель',
        actualCargo: { description: 'Тестовый груз', weightKg: 1234.5 },
        loadingDateTime: '2026-09-01T10:00:00Z',
        loadingAddress: 'г. Москва, ул. Складская, 1',
    });

    it('валидный T02 → valid:true, errors:[]', () => {
        const result = validateETrNXml(validT02, 'T02');
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('отсутствует ВерсФорм → valid:false с понятной ошибкой', () => {
        const broken = validT02.replace(' ВерсФорм="5.01"', '');
        const result = validateETrNXml(broken, 'T02');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('ВерсФорм'))).toBe(true);
    });

    it('неверное значение ВерсФорм → valid:false', () => {
        const broken = validT02.replace('ВерсФорм="5.01"', 'ВерсФорм="4.00"');
        const result = validateETrNXml(broken, 'T02');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('5.01'))).toBe(true);
    });

    it('неправильный root → valid:false', () => {
        const wrongRoot = '<?xml version="1.0"?><WrongRoot/>';
        const result = validateETrNXml(wrongRoot, 'T02');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Файл'))).toBe(true);
    });

    it('пустая строка → valid:false', () => {
        const result = validateETrNXml('', 'T02');
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it('некорректный XML → valid:false', () => {
        const result = validateETrNXml('<Файл ВерсФорм="5.01"', 'T02');
        expect(result.valid).toBe(false);
    });
});

describe('validateETrNXml — T05/T06 ссылки на предыдущие титулы', () => {
    const validT05 = generateETrNTitle5({
        docId: 'doc-5',
        waybillId: 'WB-001',
        referencedT01Id: 'doc-1',
        carrierInn: '7700000001',
        carrierName: 'ООО Перевозчик',
        consigneeInn: '7700000003',
        consigneeName: 'ООО Получатель',
        actualCargo: { description: 'Груз', weightKg: 100 },
        deliveryDateTime: '2026-09-02T15:00:00Z',
        deliveryAddress: 'г. Тверь, ул. Получатель, 5',
        hasDiscrepancies: false,
    });

    const validT06 = generateETrNTitle6({
        docId: 'doc-6',
        waybillId: 'WB-001',
        referencedT05Id: 'doc-5',
        carrierInn: '7700000001',
        carrierName: 'ООО Перевозчик',
        consigneeInn: '7700000003',
        consigneeName: 'ООО Получатель',
        completionDateTime: '2026-09-02T18:00:00Z',
    });

    it('валидный T05 → valid:true', () => {
        const result = validateETrNXml(validT05, 'T05');
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('T05 без СсылкаНаТитул1 → ошибка', () => {
        const broken = validT05.replace(/<СсылкаНаТитул1[^/]*\/>/, '');
        const result = validateETrNXml(broken, 'T05');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('СсылкаНаТитул1'))).toBe(true);
    });

    it('валидный T06 → valid:true', () => {
        const result = validateETrNXml(validT06, 'T06');
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('T06 без СсылкаНаТитул5 → ошибка', () => {
        const broken = validT06.replace(/<СсылкаНаТитул5[^/]*\/>/, '');
        const result = validateETrNXml(broken, 'T06');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('СсылкаНаТитул5'))).toBe(true);
    });
});
