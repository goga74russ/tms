// Инструмент цикла сертификации: прогон вывода генераторов ЭТрН через РЕАЛЬНЫЕ XSD ФНС.
// Печатает valid/errors по каждому титулу. Запуск: cd apps/api && npx tsx scripts/xsd-delta.ts
import { generateETrN, type ETrNInput } from '../src/modules/waybills/etrn-generator.js';
import {
    generateETrNTitle2,
    generateETrNTitle5,
    generateETrNTitle6,
    SIGNATURE_PLACEHOLDER,
} from '../src/modules/waybills/etrn-titles-generator.js';
import {
    validateEtrnAgainstXsd,
    validateXmlAgainstSchema,
    EZZ_SCHEMA_FILE,
    EPL_SCHEMA_FILE,
    type EtrnSchemaTitle,
} from '../src/lib/xsd-schema-validator.js';
import { generateEZZ } from '../src/modules/waybills/ezz-generator.js';
import { generateEPL } from '../src/modules/waybills/epl-generator.js';

const t01: ETrNInput = {
    waybillNumber: 'ТН-2026-001',
    issuedAt: '2026-06-23T09:00:00.000Z',
    tripNumber: 'TRIP-001',
    vehicleMake: 'КАМАЗ',
    vehicleModel: '5490',
    vehiclePlateNumber: 'А123ВС777',
    vehicleVin: 'X9F5490ABCD123456',
    driverFullName: 'Иванов Иван Иванович',
    driverLicenseNumber: '7700 123456',
    shipperName: 'ООО Поставщик',
    shipperInn: '7701234567',
    shipperKpp: '770101001',
    shipperAddress: 'г. Москва, ул. Складская, д. 1',
    carrierName: 'ООО ТрансПульт',
    carrierInn: '7709876543',
    carrierKpp: '770901001',
    carrierAddress: 'г. Москва, ул. Логистов, д. 5',
    consigneeName: 'ООО Получатель',
    consigneeInn: '5012345678',
    consigneeKpp: '501201001',
    consigneeAddress: 'г. Подольск, ул. Приёмная, д. 9',
    shipperPhone: '+74951234567',
    carrierPhone: '+74959998877',
    consigneePhone: '+74957654321',
    driverPhone: '+79161112233',
    cargoDescription: 'Паллеты с товаром',
    cargoWeight: 12000,
    cargoVolume: 40,
    cargoPackages: 20,
    cargoState: 'В упаковке',
    cargoPackaging: 'Паллеты',
    loadingAddress: 'г. Москва, ул. Складская, д. 1',
    unloadingAddress: 'г. Подольск, ул. Приёмная, д. 9',
    loadingRequestedAt: '2026-06-23T05:00:00.000Z',
    loadingArrivalAt: '2026-06-23T05:15:00.000Z',
    loadingDepartureAt: '2026-06-23T07:30:00.000Z',
    vehicleCapacityTons: 20,
    vehicleVolumeM3: 80,
    driverLicenseSeries: '7700',
    driverLicenseIssueDate: '2020-03-15T00:00:00.000Z',
    signatoryFullName: 'Петров Пётр Петрович',
    orderNumber: 'ЗАК-2026-045',
    orderDate: '2026-06-20T00:00:00.000Z',
    odometerOut: 150000,
    odometerIn: 150420,
};

const cases: Array<{ title: EtrnSchemaTitle; xml: string }> = [
    { title: 'T01', xml: generateETrN(t01) },
    {
        title: 'T02',
        xml: generateETrNTitle2({
            uidTrN: 'b7e6d4c2-1111-4222-8333-444455556666',
            issuedAt: '2026-06-23T10:00:00.000Z',
            priorFileId: 'ON_TRNACLGROT_5012345678_7701234567_20260623_aaaa',
            priorFileFormedAt: '2026-06-23T09:00:00.000Z',
            priorSignature: SIGNATURE_PLACEHOLDER,
            carrierInn: '7709876543',
            shipperInn: '7701234567',
            signatoryFullName: 'Сидоров Сергей Иванович',
            signatoryPosition: 'Водитель-экспедитор',
            acceptanceNote: 'Груз принят без видимых повреждений, тара целостна',
        }),
    },
    {
        title: 'T05',
        xml: generateETrNTitle5({
            uidTrN: 'b7e6d4c2-1111-4222-8333-444455556666',
            issuedAt: '2026-06-23T15:00:00.000Z',
            priorFileId: 'ON_TRNACLPPRIN_7709876543_7701234567_20260623_bbbb',
            priorFileFormedAt: '2026-06-23T10:00:00.000Z',
            priorSignature: SIGNATURE_PLACEHOLDER,
            consigneeInn: '5012345678',
            consigneeName: 'ООО Получатель',
            shipperInn: '7701234567',
            actualCargo: { description: 'Паллеты с товаром', weightKg: 12000, packageType: 'Без повреждений' },
            deliveryArrivalAt: '2026-06-23T13:50:00.000Z',
            deliveryDepartureAt: '2026-06-23T14:30:00.000Z',
            deliveryRequestedAt: '2026-06-23T13:00:00.000Z',
            deliveryAddress: 'г. Подольск, ул. Приёмная, д. 9',
            packagesAccepted: 20,
            overallCondition: 'Груз, тара, упаковка и пломбы в исправном состоянии, расхождений не выявлено',
            signatoryFullName: 'Кузнецов Иван Сергеевич',
            signatoryPosition: 'Кладовщик',
        }),
    },
    {
        title: 'T06',
        xml: generateETrNTitle6({
            uidTrN: 'b7e6d4c2-1111-4222-8333-444455556666',
            issuedAt: '2026-06-23T15:30:00.000Z',
            priorFileId: 'ON_TRNACLGRPO_5012345678_7701234567_20260623_cccc',
            priorFileFormedAt: '2026-06-23T15:00:00.000Z',
            priorSignature: SIGNATURE_PLACEHOLDER,
            carrierInn: '7709876543',
            consigneeInn: '5012345678',
            signatoryFullName: 'Сидоров Сергей Иванович',
            signatoryPosition: 'Водитель-экспедитор',
        }),
    },
];

let allGreen = true;
for (const { title, xml } of cases) {
    const result = await validateEtrnAgainstXsd(xml, title);
    console.log(`\n=== ЭТрН ${title} ===`);
    console.log('valid:', result.valid, '| errors:', result.errors.length);
    for (const e of result.errors) console.log('  •', e);
    if (!result.valid) allGreen = false;
}
// --- ЭЗЗ (969_02, информация перевозчика) ---
const ezzXml = generateEZZ({
    orderNumber: 'ZAK-2026-000123',
    issuedAt: '2026-06-23T11:00:00.000Z',
    carrierName: 'ООО ТрансПульт',
    carrierInn: '7709876543',
    shipperInn: '7701234567',
    shipperFileId: 'ON_ZAKZVGO_7701234567_7709876543_20260623_aaaa',
    shipperFileFormedAt: '2026-06-23T09:00:00.000Z',
    shipperSignature: 'PLACEHOLDER_ЭП',
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
const ezzRes = await validateXmlAgainstSchema(ezzXml, EZZ_SCHEMA_FILE);
console.log(`\n=== ЭЗЗ (информация перевозчика, 969_02) ===`);
console.log('valid:', ezzRes.valid, '| errors:', ezzRes.errors.length);
for (const e of ezzRes.errors) console.log('  •', e);
if (!ezzRes.valid) allGreen = false;

// --- ЭПЛ (968_01, главный путевой лист) ---
const eplXml = generateEPL({
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
const eplRes = await validateXmlAgainstSchema(eplXml, EPL_SCHEMA_FILE);
console.log(`\n=== ЭПЛ (главный путевой лист, 968_01) ===`);
console.log('valid:', eplRes.valid, '| errors:', eplRes.errors.length);
for (const e of eplRes.errors) console.log('  •', e);
if (!eplRes.valid) allGreen = false;

console.log(`\n${allGreen ? '✅ Все документы (ЭТрН ×4 + ЭЗЗ + ЭПЛ) проходят XSD ФНС' : '❌ Есть ошибки валидации'}`);
