import { describe, it, expect } from 'vitest';
import { validateETrNXml } from './xsd-validator.js';
import { validateEtrnAgainstXsd } from './xsd-schema-validator.js';
import { generateETrN, type ETrNInput } from '../modules/waybills/etrn-generator.js';
import {
    generateETrNTitle2,
    generateETrNTitle5,
    generateETrNTitle6,
    SIGNATURE_PLACEHOLDER,
} from '../modules/waybills/etrn-titles-generator.js';

const t01Input: ETrNInput = {
    waybillNumber: 'ТН-2026-001',
    issuedAt: '2026-06-23T09:00:00.000Z',
    tripNumber: 'TRIP-001',
    vehicleMake: 'КАМАЗ',
    vehicleModel: '5490',
    vehiclePlateNumber: 'А123ВС777',
    driverFullName: 'Иванов Иван Иванович',
    driverLicenseNumber: '7700 123456',
    shipperName: 'ООО Поставщик',
    shipperInn: '7701234567',
    shipperKpp: '770101001',
    shipperAddress: 'г. Москва, ул. Складская, д. 1',
    shipperPhone: '+74951234567',
    carrierName: 'ООО ТрансПульт',
    carrierInn: '7709876543',
    carrierKpp: '770901001',
    carrierAddress: 'г. Москва, ул. Логистов, д. 5',
    carrierPhone: '+74959998877',
    consigneeName: 'ООО Получатель',
    consigneeInn: '5012345678',
    consigneeKpp: '501201001',
    consigneeAddress: 'г. Подольск, ул. Приёмная, д. 9',
    consigneePhone: '+74957654321',
    driverPhone: '+79161112233',
    cargoDescription: 'Паллеты с товаром',
    cargoWeight: 12000,
    cargoPackages: 20,
    loadingAddress: 'г. Москва, ул. Складская, д. 1',
    unloadingAddress: 'г. Подольск, ул. Приёмная, д. 9',
    loadingRequestedAt: '2026-06-23T05:00:00.000Z',
    loadingArrivalAt: '2026-06-23T05:15:00.000Z',
    loadingDepartureAt: '2026-06-23T07:30:00.000Z',
    vehicleCapacityTons: 20,
    vehicleVolumeM3: 80,
    signatoryFullName: 'Петров Пётр Петрович',
    orderNumber: 'ЗАК-2026-045',
    orderDate: '2026-06-20T00:00:00.000Z',
};

const t02 = generateETrNTitle2({
    uidTrN: 'b7e6d4c2-1111-4222-8333-444455556666',
    issuedAt: '2026-06-23T10:00:00.000Z',
    priorFileId: 'ON_TRNACLGROT_5012345678_7701234567_20260623_aaaa',
    priorFileFormedAt: '2026-06-23T09:00:00.000Z',
    priorSignature: SIGNATURE_PLACEHOLDER,
    carrierInn: '7709876543',
    shipperInn: '7701234567',
    signatoryFullName: 'Сидоров Сергей Иванович',
    signatoryPosition: 'Водитель-экспедитор',
});

const t05 = generateETrNTitle5({
    uidTrN: 'b7e6d4c2-1111-4222-8333-444455556666',
    issuedAt: '2026-06-23T15:00:00.000Z',
    priorFileId: 'ON_TRNACLPPRIN_7709876543_7701234567_20260623_bbbb',
    priorFileFormedAt: '2026-06-23T10:00:00.000Z',
    priorSignature: SIGNATURE_PLACEHOLDER,
    consigneeInn: '5012345678',
    consigneeName: 'ООО Получатель',
    shipperInn: '7701234567',
    actualCargo: { description: 'Паллеты с товаром', weightKg: 12000 },
    deliveryArrivalAt: '2026-06-23T13:50:00.000Z',
    deliveryDepartureAt: '2026-06-23T14:30:00.000Z',
    deliveryRequestedAt: '2026-06-23T13:00:00.000Z',
    deliveryAddress: 'г. Подольск, ул. Приёмная, д. 9',
    packagesAccepted: 20,
    overallCondition: 'Расхождений не выявлено',
    signatoryFullName: 'Кузнецов Иван Сергеевич',
});

const t06 = generateETrNTitle6({
    uidTrN: 'b7e6d4c2-1111-4222-8333-444455556666',
    issuedAt: '2026-06-23T15:30:00.000Z',
    priorFileId: 'ON_TRNACLGRPO_5012345678_7701234567_20260623_cccc',
    priorFileFormedAt: '2026-06-23T15:00:00.000Z',
    priorSignature: SIGNATURE_PLACEHOLDER,
    carrierInn: '7709876543',
    consigneeInn: '5012345678',
    signatoryFullName: 'Сидоров Сергей Иванович',
});

describe('validateETrNXml — быстрая структурная проверка', () => {
    it('валидный T02 → valid:true', () => {
        const result = validateETrNXml(t02, 'T02');
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
    });

    it('валидный T05 → valid:true', () => {
        expect(validateETrNXml(t05, 'T05').valid).toBe(true);
    });

    it('валидный T06 → valid:true', () => {
        expect(validateETrNXml(t06, 'T06').valid).toBe(true);
    });

    it('отсутствует ВерсФорм → valid:false', () => {
        const broken = t02.replace(' ВерсФорм="5.01"', '');
        const result = validateETrNXml(broken, 'T02');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('ВерсФорм'))).toBe(true);
    });

    it('неверный КНД → valid:false', () => {
        const broken = t02.replace('КНД="1110340"', 'КНД="9999999"');
        const result = validateETrNXml(broken, 'T02');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('КНД'))).toBe(true);
    });

    it('T05 без ссылки на файл Титула 2 → ошибка', () => {
        const broken = t05.replace(/<ИдИнфПрвПрием[^/]*\/>/, '');
        const result = validateETrNXml(broken, 'T05');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('ИдИнфПрвПрием'))).toBe(true);
    });

    it('T06 без ссылки на файл Титула 5 → ошибка', () => {
        const broken = t06.replace(/<ИдИнфГП[^/]*\/>/, '');
        const result = validateETrNXml(broken, 'T06');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('ИдИнфГП'))).toBe(true);
    });

    it('неправильный root → valid:false', () => {
        const result = validateETrNXml('<?xml version="1.0"?><WrongRoot/>', 'T02');
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Файл'))).toBe(true);
    });

    it('пустая строка → valid:false', () => {
        expect(validateETrNXml('', 'T02').valid).toBe(false);
    });
});

// Сертификация: реальная XSD-валидация ФНС (xmllint-wasm) против завендоренных
// схем 973_*. Это «зелёный XSD» из дорожной карты — фиксируем в CI, чтобы
// будущие правки генераторов не сломали соответствие формату 1065@.
describe('validateEtrnAgainstXsd — реальная XSD ФНС (приказ 1065@)', () => {
    it('Титул 1 проходит XSD', async () => {
        const result = await validateEtrnAgainstXsd(generateETrN(t01Input), 'T01');
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('Титул 2 проходит XSD', async () => {
        const result = await validateEtrnAgainstXsd(t02, 'T02');
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('Титул 5 проходит XSD', async () => {
        const result = await validateEtrnAgainstXsd(t05, 'T05');
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('Титул 6 проходит XSD', async () => {
        const result = await validateEtrnAgainstXsd(t06, 'T06');
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });
});
