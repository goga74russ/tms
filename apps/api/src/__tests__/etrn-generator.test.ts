// ============================================================
// ЭТрН Generator Tests — XML generation and validation
// ============================================================

import { describe, it, expect } from 'vitest';
import { generateETrN, generateETrNTitle4, type ETrNInput } from '../modules/waybills/etrn-generator.js';

const SAMPLE_INPUT: ETrNInput = {
    waybillNumber: 'WB-2026-00042',
    issuedAt: '2026-03-04T10:00:00Z',
    tripNumber: 'TR-2026-00015',
    vehicleMake: 'КАМАЗ',
    vehicleModel: '5490',
    vehiclePlateNumber: 'А001АА77',
    vehicleVin: 'XTC54901A62000001',
    driverFullName: 'Иванов Иван Иванович',
    driverLicenseNumber: '7700123456',
    shipperName: 'ООО "ТрансГруз"',
    shipperInn: '7701234567',
    shipperKpp: '770101001',
    shipperAddress: 'г. Москва, ул. Ленина, д. 1',
    carrierName: 'ООО "ТМС Логистик"',
    carrierInn: '7702345678',
    carrierKpp: '770201001',
    carrierAddress: 'г. Москва, ул. Мира, д. 10',
    consigneeName: 'ООО "Получатель"',
    consigneeInn: '7803456789',
    consigneeKpp: '780301001',
    consigneeAddress: 'г. Санкт-Петербург, пр-кт Невский, д. 100',
    cargoDescription: 'Стройматериалы (кирпич, цемент)',
    cargoWeight: 15000,
    cargoVolume: 45,
    cargoPackages: 150,
    loadingAddress: 'г. Москва, ул. Складская, д. 5',
    unloadingAddress: 'г. Санкт-Петербург, ул. Портовая, д. 12',
    odometerOut: 125000,
    odometerIn: 125750,
};

describe('ЭТрН XML Generator', () => {

    describe('generateETrN (Титул 1)', () => {
        it('should generate valid XML', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toBeTruthy();
            expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        });

        it('should contain XML declaration and root element', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('<?xml');
            expect(xml).toContain('<Файл');
            expect(xml).toContain('</Файл>');
            expect(xml).toContain('ВерсФорм="5.01"');
            expect(xml).toContain('ВерсПрог="TMS-1.0"');
        });

        it('should contain shipper data', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('<Отправитель>');
            expect(xml).toContain('НаимОрг="ООО &quot;ТрансГруз&quot;"');
            expect(xml).toContain('ИНН="7701234567"');
            expect(xml).toContain('КПП="770101001"');
        });

        it('should contain consignee data', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('<Получатель>');
            expect(xml).toContain('ООО &quot;Получатель&quot;');
            expect(xml).toContain('ИНН="7803456789"');
        });

        it('should contain carrier data', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('<Перевозчик>');
            expect(xml).toContain('ООО &quot;ТМС Логистик&quot;');
            expect(xml).toContain('ИНН="7702345678"');
        });

        it('should contain cargo data', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('<СвГруз>');
            expect(xml).toContain('Наим="Стройматериалы');
            expect(xml).toContain('МассаГруз="15000"');
            expect(xml).toContain('ОбъемГруз="45"');
            expect(xml).toContain('КолМест="150"');
        });

        it('should contain vehicle data', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('<СвТС>');
            expect(xml).toContain('Марка="КАМАЗ 5490"');
            expect(xml).toContain('ГосНом="А001АА77"');
            expect(xml).toContain('VIN="XTC54901A62000001"');
        });

        it('should contain driver data', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('<СвВодит');
            expect(xml).toContain('ФИО="Иванов Иван Иванович"');
            expect(xml).toContain('ВУ="7700123456"');
        });

        it('should contain route data', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('<Маршрут>');
            expect(xml).toContain('<ПунктПогрузки');
            expect(xml).toContain('г. Москва, ул. Складская, д. 5');
            expect(xml).toContain('<ПунктРазгрузки');
            expect(xml).toContain('г. Санкт-Петербург, ул. Портовая, д. 12');
        });

        it('should contain waybill data with odometer', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('<ПутЛист');
            expect(xml).toContain('Номер="WB-2026-00042"');
            expect(xml).toContain('ПоказОдомВыезд="125000"');
        });

        it('should contain document date in DD.MM.YYYY format', () => {
            const xml = generateETrN(SAMPLE_INPUT);

            expect(xml).toContain('ДатаДок="04.03.2026"');
        });

        it('should escape XML special characters', () => {
            const input: ETrNInput = {
                ...SAMPLE_INPUT,
                shipperName: 'ООО "Тест & Ко" <Москва>',
            };
            const xml = generateETrN(input);

            expect(xml).toContain('&amp;');
            expect(xml).toContain('&lt;');
            expect(xml).toContain('&gt;');
            expect(xml).not.toContain('& Ко');
        });

        it('should handle missing optional fields', () => {
            const input: ETrNInput = {
                ...SAMPLE_INPUT,
                vehicleVin: undefined,
                cargoWeight: undefined,
                cargoVolume: undefined,
                cargoPackages: undefined,
                odometerOut: undefined,
                shipperKpp: undefined,
            };
            const xml = generateETrN(input);

            expect(xml).not.toContain('VIN=');
            expect(xml).not.toContain('МассаГруз=');
            expect(xml).not.toContain('ОбъемГруз=');
            expect(xml).not.toContain('КолМест=');
            expect(xml).not.toContain('ПоказОдомВыезд=');
            // Should still be valid
            expect(xml).toContain('<Файл');
            expect(xml).toContain('</Файл>');
        });
    });

    describe('generateETrNTitle4 (Титул 4 — Доставка)', () => {
        it('should generate valid XML', () => {
            const xml = generateETrNTitle4(SAMPLE_INPUT);

            expect(xml).toBeTruthy();
            expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        });

        it('should contain delivery status', () => {
            const xml = generateETrNTitle4(SAMPLE_INPUT);

            expect(xml).toContain('<РезДоставки Статус="доставлено"');
        });

        it('should contain return odometer', () => {
            const xml = generateETrNTitle4(SAMPLE_INPUT);

            expect(xml).toContain('ПоказОдомВозвр="125750"');
        });

        it('should contain carrier and driver data', () => {
            const xml = generateETrNTitle4(SAMPLE_INPUT);

            expect(xml).toContain('ООО &quot;ТМС Логистик&quot;');
            expect(xml).toContain('ФИО="Иванов Иван Иванович"');
        });

        it('should contain delivery address', () => {
            const xml = generateETrNTitle4(SAMPLE_INPUT);

            expect(xml).toContain('<ПунктДоставки');
            expect(xml).toContain('г. Санкт-Петербург, ул. Портовая, д. 12');
        });
    });
});
