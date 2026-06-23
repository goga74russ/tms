import { describe, it, expect } from 'vitest';
import { validateETrNXml } from './xsd-validator.js';
import {
    validateEtrnAgainstXsd,
    validateXmlAgainstSchema,
    EZZ_SCHEMA_FILE,
    EZZ_SHIPPER_SCHEMA_FILE,
    EPL_SCHEMA_FILE,
} from './xsd-schema-validator.js';
import { generateEZZCarrier, generateEZZShipper } from '../modules/waybills/ezz-generator.js';
import { generateEPL } from '../modules/waybills/epl-generator.js';
import {
    generateEPLPreTripMed, generateEPLPostTripMed, generateEPLVehicleControl,
    generateEPLOdometerOut, generateEPLOdometerIn,
    SIGNATURE_PLACEHOLDER as EPL_SIG,
} from '../modules/waybills/epl-subdocs-generator.js';
import {
    validateXmlAgainstSchema as valSchema,
    EPL_PRETRIP_MED_SCHEMA_FILE, EPL_VEHICLE_CONTROL_SCHEMA_FILE,
    EPL_ODOMETER_OUT_SCHEMA_FILE, EPL_ODOMETER_IN_SCHEMA_FILE, EPL_POSTTRIP_MED_SCHEMA_FILE,
} from './xsd-schema-validator.js';
import { generateETrN, type ETrNInput } from '../modules/waybills/etrn-generator.js';
import {
    generateETrNTitle2,
    generateETrNTitle3,
    generateETrNTitle4,
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

const t03 = generateETrNTitle3({
    uidTrN: 'b7e6d4c2-1111-4222-8333-444455556666',
    issuedAt: '2026-06-23T12:00:00.000Z',
    priorFileId: 'ON_TRNACLPPRIN_7709876543_7701234567_20260623_bbbb',
    priorFileFormedAt: '2026-06-23T10:00:00.000Z',
    priorSignature: SIGNATURE_PLACEHOLDER,
    carrierInn: '7709876543',
    shipperInn: '7701234567',
    redirectedAt: '2026-06-23T12:00:00.000Z',
    reasonDocName: 'Заявка на переадресовку',
    reasonDocNumber: '45-ПА',
    reasonDocDate: '2026-06-23T00:00:00.000Z',
    reasonIssuerInn: '7701234567',
    newUnloadingAddress: 'г. Москва, Шоссе Энтузиастов, д. 56',
    newConsigneeName: 'ООО Северный Склад',
    newConsigneeInn: '7727563778',
    signatoryFullName: 'Иванов Пётр Сергеевич',
});

const t04 = generateETrNTitle4({
    uidTrN: 'b7e6d4c2-1111-4222-8333-444455556666',
    issuedAt: '2026-06-23T13:00:00.000Z',
    priorFileId: 'ON_TRNACLPPRIN_7709876543_7701234567_20260623_bbbb',
    priorFileFormedAt: '2026-06-23T10:00:00.000Z',
    priorSignature: SIGNATURE_PLACEHOLDER,
    carrierInn: '7709876543',
    shipperInn: '7701234567',
    replacedAt: '2026-06-23T13:00:00.000Z',
    reason: 'Поломка тягача в пути следования',
    newDriver: { fullName: 'Иванов Пётр Сергеевич', licenseNumber: '123456', licenseSeries: '9912', licenseIssueDate: '2021-03-15T00:00:00.000Z', inn: '771234567890', phone: '+79161234567' },
    newVehicle: { plateNumber: 'А123ВС797', make: 'КАМАЗ 54901', capacityTons: 20, volumeM3: 0 },
    signatoryFullName: 'Петров Алексей Николаевич',
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

    // BUG-EPD-01 (QA): УчастникТрНТип требует <Контакт> всегда; без телефона участника
    // генератор обязан отказать (422), а не выдавать невалидный XML с <Адрес>-фолбэком.
    it('Титул 1 без телефона перевозчика → EtrnIncompleteError, а не невалидный XML', () => {
        expect(() => generateETrN({ ...t01Input, carrierPhone: undefined })).toThrow(/перевозчик: телефон/);
    });
    it('Титул 1 без телефона грузоотправителя → EtrnIncompleteError', () => {
        expect(() => generateETrN({ ...t01Input, shipperPhone: undefined })).toThrow(/телефон/);
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

    it('Титул 3 (переадресовка) проходит XSD', async () => {
        const result = await validateEtrnAgainstXsd(t03, 'T03');
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('Титул 4 (замена водителя/ТС) проходит XSD', async () => {
        const result = await validateEtrnAgainstXsd(t04, 'T04');
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('Титул 6 проходит XSD', async () => {
        const result = await validateEtrnAgainstXsd(t06, 'T06');
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });
});

describe('ЭЗЗ / ЭПЛ — реальная XSD ФНС (приказы 108@ / 116@)', () => {
    it('ЭЗЗ грузоотправителя (первичная заявка, 969_01) проходит XSD', async () => {
        const xml = generateEZZShipper({
            orderNumber: 'ЗЗ-2026-001',
            issuedAt: '2026-06-23T11:00:00.000Z',
            shipperName: 'ООО Поставщик',
            shipperInn: '7707083893',
            shipperKpp: '770701001',
            shipperPhone: '+74951234567',
            carrierName: 'ООО ТрансПульт',
            carrierInn: '7728168971',
            carrierKpp: '772801001',
            carrierPhone: '+74957654321',
            dispatchAt: '2026-06-23T06:00:00.000Z',
            dispatchAddress: 'г. Москва, ул. Тверская, д. 1',
            loadingAddress: 'г. Москва, ул. Тверская, д. 1',
            unloadingAddress: 'г. Санкт-Петербург, Невский пр., д. 10',
            cargoDescription: 'Товары народного потребления',
            cargoGrossWeightKg: 5000,
            cargoPackages: 100,
            cargoVolumeM3: 25.5,
            cargoHeightM: 2,
            cargoLengthM: 3,
            cargoWidthM: 2,
            vehicleCapacityTons: 20,
            vehicleVolumeM3: 86,
            signatoryFullName: 'Иванов Иван Иванович',
            signatoryPosition: 'Генеральный директор',
        });
        const result = await validateXmlAgainstSchema(xml, EZZ_SHIPPER_SCHEMA_FILE);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('ЭЗЗ (информация перевозчика, 969_02) проходит XSD', async () => {
        const xml = generateEZZCarrier({
            orderNumber: 'ZAK-2026-000123',
            issuedAt: '2026-06-23T11:00:00.000Z',
            carrierName: 'ООО ТрансПульт',
            carrierInn: '7709876543',
            shipperInn: '7701234567',
            shipperFileId: 'ON_ZAKZVGO_7701234567_7709876543_20260623_aaaa',
            shipperFileFormedAt: '2026-06-23T09:00:00.000Z',
            shipperSignature: 'PLACEHOLDER',
            contactFullName: 'Петров Пётр Петрович',
            contactPhone: '+74951234567',
            driverFullName: 'Сидоров Иван Васильевич',
            driverLicenseNumber: '123456',
            driverLicenseSeries: '9900',
            driverLicenseIssueDate: '2020-05-15T00:00:00.000Z',
            driverInn: '500100732259',
            driverPhone: '+79161112233',
            vehiclePlateNumber: 'А123ВС777',
            vehicleMake: 'Volvo',
            vehicleModel: 'FH',
            vehicleCapacityTons: 20,
            vehicleVolumeM3: 86,
            carrierCost: 50000,
            carrierCostWithVat: 60000,
            vatRate: '20%',
            signatoryFullName: 'Петров Пётр Петрович',
            signatoryPosition: 'Директор',
        });
        const result = await validateXmlAgainstSchema(xml, EZZ_SCHEMA_FILE);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('ЭПЛ (главный путевой лист, 968_01) проходит XSD', async () => {
        const xml = generateEPL({
            waybillNumber: 'ПЛ-2026-000123',
            issuedAt: '2026-06-23T05:30:00.000Z',
            carrierName: 'ООО ТрансПульт',
            carrierInn: '7709876543',
            carrierKpp: '770901001',
            carrierOgrn: '1027700132195',
            carrierAddress: '119991, г. Москва, ул. Тверская, д. 1',
            carrierPhone: '+74951234567',
            vehicleMake: 'КАМАЗ',
            vehicleModel: '5490-S5',
            vehiclePlateNumber: 'А123ВС77',
            driverFullName: 'Иванов Иван Иванович',
            driverLicenseNumber: '123456',
            driverLicenseSeries: '7799',
            driverLicenseIssueDate: '2020-03-15T00:00:00.000Z',
            signatoryFullName: 'Петров Пётр Петрович',
            signatoryPosition: 'Механик',
        });
        const result = await validateXmlAgainstSchema(xml, EPL_SCHEMA_FILE);
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });

    it('генератор отказывает (422) при отсутствии обязательного поля', async () => {
        expect(() => generateEPL({
            waybillNumber: 'ПЛ-1', issuedAt: '2026-06-23T05:30:00.000Z',
            carrierName: 'ООО ТрансПульт', carrierInn: '7709876543',
            carrierOgrn: '', // пусто → EtrnIncompleteError
            carrierAddress: 'Москва',
            vehicleMake: 'КАМАЗ', vehicleModel: '5490', vehiclePlateNumber: 'А123ВС77',
            driverFullName: 'Иванов Иван Иванович', signatoryFullName: 'Петров Пётр Петрович',
        })).toThrow(/ОГРН/);
    });
});

describe('ЭПЛ суб-документы — реальная XSD ФНС (приказ 116@, часть 968)', () => {
    const prior = { fileId: 'ON_PREV_7709876543_20260623_x', formedAt: '2026-06-23T05:00:00.000Z', signature: EPL_SIG };
    const uid = '550e8400-e29b-41d4-a716-446655440000';
    const license = { seria: 'ЛО-77', number: '01-000123', issueDate: '2020-03-15T00:00:00.000Z', expiryDate: '2030-03-15T00:00:00.000Z' };
    const med = {
        waybillUid: uid, issuedAt: '2026-06-23T06:30:00.000Z', carrierInn: '7709876543', prior,
        examAt: '2026-06-23T06:20:00.000Z', medOrgName: 'ООО Медцентр', medicFullName: 'Иванова Мария Петровна',
        medicPosition: 'Фельдшер', license, driverFullName: 'Петров Иван Сергеевич', driverInn: '771234567890',
        signatoryFullName: 'Сидоров Алексей Николаевич',
    };

    it('предрейсовый медосмотр (968_02) проходит XSD', async () => {
        const r = await valSchema(generateEPLPreTripMed(med), EPL_PRETRIP_MED_SCHEMA_FILE);
        expect(r.errors).toEqual([]); expect(r.valid).toBe(true);
    });
    it('послерейсовый медосмотр (968_06) проходит XSD', async () => {
        const r = await valSchema(generateEPLPostTripMed(med), EPL_POSTTRIP_MED_SCHEMA_FILE);
        expect(r.errors).toEqual([]); expect(r.valid).toBe(true);
    });
    it('контроль/выпуск ТС (968_03) проходит XSD', async () => {
        const r = await valSchema(generateEPLVehicleControl({
            waybillUid: uid, issuedAt: '2026-06-23T08:15:00.000Z', carrierInn: '7709876543', prior,
            controlAt: '2026-06-23T07:45:00.000Z', releaseAt: '2026-06-23T08:00:00.000Z', serviceable: true,
            vehicleType: 'Грузовой тягач седельный', vehicleMake: 'КАМАЗ', vehicleModel: '5490-S5', vehiclePlateNumber: 'А123ВС77',
            controllerFullName: 'Петров Михаил Андреевич', signatoryFullName: 'Кузнецов Андрей Владимирович',
        }), EPL_VEHICLE_CONTROL_SCHEMA_FILE);
        expect(r.errors).toEqual([]); expect(r.valid).toBe(true);
    });
    it('одометр выезд (968_04) проходит XSD', async () => {
        const r = await valSchema(generateEPLOdometerOut({
            waybillUid: uid, issuedAt: '2026-06-23T08:30:00.000Z', carrierInn: '7709876543', prior,
            departureAt: '2026-06-23T08:30:00.000Z', odometer: 152340,
            responsibleFullName: 'Иванов Пётр Сергеевич', signatoryFullName: 'Иванов Пётр Сергеевич',
        }), EPL_ODOMETER_OUT_SCHEMA_FILE);
        expect(r.errors).toEqual([]); expect(r.valid).toBe(true);
    });
    it('одометр заезд (968_05) проходит XSD', async () => {
        const r = await valSchema(generateEPLOdometerIn({
            waybillUid: uid, issuedAt: '2026-06-23T18:45:00.000Z', carrierInn: '7709876543', prior,
            returnAt: '2026-06-23T18:35:00.000Z', odometer: 152600,
            responsibleFullName: 'Смирнов Алексей Николаевич', signatoryFullName: 'Смирнов Алексей Николаевич',
        }), EPL_ODOMETER_IN_SCHEMA_FILE);
        expect(r.errors).toEqual([]); expect(r.valid).toBe(true);
    });
});
