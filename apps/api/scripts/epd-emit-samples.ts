// Выгрузка образцов ЭПД для НЕЗАВИСИМОЙ проверки QA официальным xmllint (libxml2).
// Пишет 14 XML (UTF-8) + UTF-8-копии соответствующих XSD в папку, печатает команды.
// Запуск: cd apps/api && npx tsx scripts/epd-emit-samples.ts [выходная_папка]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateETrN } from '../src/modules/waybills/etrn-generator.js';
import {
    generateETrNTitle2, generateETrNTitle3, generateETrNTitle4,
    generateETrNTitle5, generateETrNTitle6, SIGNATURE_PLACEHOLDER as SIG,
} from '../src/modules/waybills/etrn-titles-generator.js';
import { generateEZZShipper, generateEZZCarrier } from '../src/modules/waybills/ezz-generator.js';
import { generateEPL } from '../src/modules/waybills/epl-generator.js';
import {
    generateEPLPreTripMed, generateEPLPostTripMed, generateEPLVehicleControl,
    generateEPLOdometerOut, generateEPLOdometerIn, SIGNATURE_PLACEHOLDER as ESIG,
} from '../src/modules/waybills/epl-subdocs-generator.js';
import { ETRN_SCHEMA_FILE } from '../src/lib/xsd-schema-validator.js';

const outDir = process.argv[2] || 'qa-epd-samples';
const schemaSrc = fileURLToPath(new URL('../src/assets/etrn-schemas/', import.meta.url));
mkdirSync(`${outDir}/schemas`, { recursive: true });

const I = '2026-06-23T09:00:00.000Z';
const prior = { fileId: 'ON_PREV_7709876543_20260623_x', formedAt: '2026-06-23T05:00:00.000Z', signature: ESIG };
const uid = '550e8400-e29b-41d4-a716-446655440000';
const lic = { seria: 'ЛО-77', number: '01-000123', issueDate: '2020-03-15T00:00:00.000Z', expiryDate: '2030-03-15T00:00:00.000Z' };
const med = { waybillUid: uid, issuedAt: I, carrierInn: '7709876543', prior, examAt: I, medOrgName: 'ООО Медцентр', medicFullName: 'Иванова Мария Петровна', medicPosition: 'Фельдшер', license: lic, driverFullName: 'Петров Иван Сергеевич', driverInn: '771234567890', signatoryFullName: 'Сидоров Алексей Николаевич' };

const docs: Array<{ name: string; xml: string; schema: string }> = [
    { name: 'etrn-t01', schema: ETRN_SCHEMA_FILE.T01, xml: generateETrN({
        waybillNumber: 'ТН-2026-001', issuedAt: I, tripNumber: 'TRIP-001', vehicleMake: 'КАМАЗ', vehicleModel: '5490',
        vehiclePlateNumber: 'А123ВС777', driverFullName: 'Иванов Иван Иванович', driverLicenseNumber: '7700 123456',
        driverLicenseSeries: '7700', driverLicenseIssueDate: '2020-03-15T00:00:00.000Z', driverPhone: '+79161112233',
        shipperName: 'ООО Поставщик', shipperInn: '7701234567', shipperKpp: '770101001', shipperAddress: 'г. Москва, ул. Складская, д. 1', shipperPhone: '+74951234567',
        carrierName: 'ООО ТрансПульт', carrierInn: '7709876543', carrierKpp: '770901001', carrierAddress: 'г. Москва, ул. Логистов, д. 5',
        consigneeName: 'ООО Получатель', consigneeInn: '5012345678', consigneeKpp: '501201001', consigneeAddress: 'г. Подольск, ул. Приёмная, д. 9', consigneePhone: '+74957654321',
        cargoDescription: 'Паллеты с товаром', cargoWeight: 12000, cargoPackages: 20, loadingAddress: 'г. Москва, ул. Складская, д. 1', unloadingAddress: 'г. Подольск, ул. Приёмная, д. 9',
        loadingRequestedAt: '2026-06-23T05:00:00.000Z', loadingArrivalAt: '2026-06-23T05:15:00.000Z', loadingDepartureAt: '2026-06-23T07:30:00.000Z',
        vehicleCapacityTons: 20, vehicleVolumeM3: 80, signatoryFullName: 'Петров Пётр Петрович', orderNumber: 'ЗАК-2026-045', orderDate: '2026-06-20T00:00:00.000Z' }) },
    { name: 'etrn-t02', schema: ETRN_SCHEMA_FILE.T02, xml: generateETrNTitle2({ uidTrN: uid, issuedAt: I, priorFileId: 'ON_TRNACLGROT_x', priorFileFormedAt: I, priorSignature: SIG, carrierInn: '7709876543', shipperInn: '7701234567', signatoryFullName: 'Сидоров Сергей Иванович', signatoryPosition: 'Водитель-экспедитор' }) },
    { name: 'etrn-t03', schema: ETRN_SCHEMA_FILE.T03, xml: generateETrNTitle3({ uidTrN: uid, issuedAt: I, priorFileId: 'ON_TRNACLPPRIN_x', priorFileFormedAt: I, priorSignature: SIG, carrierInn: '7709876543', shipperInn: '7701234567', redirectedAt: I, reasonDocName: 'Заявка на переадресовку', reasonDocNumber: '45-ПА', reasonDocDate: I, reasonIssuerInn: '7701234567', newUnloadingAddress: 'г. Москва, Шоссе Энтузиастов, д. 56', newConsigneeName: 'ООО Северный Склад', newConsigneeInn: '7727563778', signatoryFullName: 'Иванов Пётр Сергеевич' }) },
    { name: 'etrn-t04', schema: ETRN_SCHEMA_FILE.T04, xml: generateETrNTitle4({ uidTrN: uid, issuedAt: I, priorFileId: 'ON_TRNACLPPRIN_x', priorFileFormedAt: I, priorSignature: SIG, carrierInn: '7709876543', shipperInn: '7701234567', replacedAt: I, reason: 'Поломка тягача', newDriver: { fullName: 'Иванов Пётр Сергеевич', licenseNumber: '123456', licenseSeries: '9912', licenseIssueDate: '2021-03-15T00:00:00.000Z', inn: '771234567890', phone: '+79161234567' }, newVehicle: { plateNumber: 'А123ВС797', make: 'КАМАЗ 54901', capacityTons: 20, volumeM3: 0 }, signatoryFullName: 'Петров Алексей Николаевич' }) },
    { name: 'etrn-t05', schema: ETRN_SCHEMA_FILE.T05, xml: generateETrNTitle5({ uidTrN: uid, issuedAt: I, priorFileId: 'ON_TRNACLPPRIN_x', priorFileFormedAt: I, priorSignature: SIG, consigneeInn: '5012345678', consigneeName: 'ООО Получатель', shipperInn: '7701234567', actualCargo: { description: 'Паллеты', weightKg: 12000 }, deliveryArrivalAt: I, deliveryDepartureAt: I, deliveryRequestedAt: I, deliveryAddress: 'г. Подольск, ул. Приёмная, д. 9', packagesAccepted: 20, overallCondition: 'Расхождений не выявлено', signatoryFullName: 'Кузнецов Иван Сергеевич' }) },
    { name: 'etrn-t06', schema: ETRN_SCHEMA_FILE.T06, xml: generateETrNTitle6({ uidTrN: uid, issuedAt: I, priorFileId: 'ON_TRNACLGRPO_x', priorFileFormedAt: I, priorSignature: SIG, carrierInn: '7709876543', consigneeInn: '5012345678', signatoryFullName: 'Сидоров Сергей Иванович' }) },
    { name: 'ezz-shipper', schema: 'ON_ZAKZVGO_1_969_01_05_01_01.xsd', xml: generateEZZShipper({ orderNumber: 'ЗЗ-2026-001', issuedAt: I, shipperName: 'ООО Поставщик', shipperInn: '7707083893', shipperKpp: '770701001', shipperPhone: '+74951234567', carrierName: 'ООО ТрансПульт', carrierInn: '7728168971', carrierKpp: '772801001', carrierPhone: '+74957654321', dispatchAt: I, dispatchAddress: 'г. Москва, ул. Тверская, д. 1', loadingAddress: 'г. Москва, ул. Тверская, д. 1', unloadingAddress: 'г. Санкт-Петербург, Невский пр., д. 10', cargoDescription: 'Товары', cargoGrossWeightKg: 5000, cargoPackages: 100, cargoVolumeM3: 25.5, cargoHeightM: 2, cargoLengthM: 3, cargoWidthM: 2, vehicleCapacityTons: 20, vehicleVolumeM3: 86, signatoryFullName: 'Иванов Иван Иванович', signatoryPosition: 'Генеральный директор' }) },
    { name: 'ezz-carrier', schema: 'ON_ZAKZVPER_1_969_02_05_01_03.xsd', xml: generateEZZCarrier({ orderNumber: 'ZAK-001', issuedAt: I, carrierName: 'ООО ТрансПульт', carrierInn: '7709876543', shipperInn: '7701234567', shipperFileId: 'ON_ZAKZVGO_x', shipperFileFormedAt: I, shipperSignature: 'PH', contactFullName: 'Петров Пётр Петрович', contactPhone: '+74951234567', driverFullName: 'Сидоров Иван Васильевич', driverLicenseNumber: '123456', driverLicenseSeries: '9900', driverLicenseIssueDate: '2020-05-15T00:00:00.000Z', driverInn: '500100732259', driverPhone: '+79161112233', vehiclePlateNumber: 'А123ВС777', vehicleMake: 'Volvo', vehicleModel: 'FH', vehicleCapacityTons: 20, vehicleVolumeM3: 86, carrierCost: 50000, carrierCostWithVat: 60000, vatRate: '20%', signatoryFullName: 'Петров Пётр Петрович', signatoryPosition: 'Директор' }) },
    { name: 'epl-main', schema: 'ON_PTLSSOBTS_1_968_01_05_01_01.xsd', xml: generateEPL({ waybillNumber: 'ПЛ-2026-000123', issuedAt: I, carrierName: 'ООО ТрансПульт', carrierInn: '7709876543', carrierKpp: '770901001', carrierOgrn: '1027700132195', carrierAddress: '119991, г. Москва, ул. Тверская, д. 1', carrierPhone: '+74951234567', vehicleMake: 'КАМАЗ', vehicleModel: '5490-S5', vehiclePlateNumber: 'А123ВС77', driverFullName: 'Иванов Иван Иванович', driverLicenseNumber: '123456', driverLicenseSeries: '7799', driverLicenseIssueDate: '2020-03-15T00:00:00.000Z', signatoryFullName: 'Петров Пётр Петрович', signatoryPosition: 'Механик' }) },
    { name: 'epl-02-pretrip-med', schema: 'ON_PTLSPRMO_1_968_02_05_01_01.xsd', xml: generateEPLPreTripMed(med) },
    { name: 'epl-03-vehicle-control', schema: 'ON_PTLSVIPTS_1_968_03_05_01_01.xsd', xml: generateEPLVehicleControl({ waybillUid: uid, issuedAt: I, carrierInn: '7709876543', prior, controlAt: I, releaseAt: I, serviceable: true, vehicleType: 'Грузовой тягач седельный', vehicleMake: 'КАМАЗ', vehicleModel: '5490-S5', vehiclePlateNumber: 'А123ВС77', controllerFullName: 'Петров Михаил Андреевич', signatoryFullName: 'Кузнецов Андрей Владимирович' }) },
    { name: 'epl-04-odometer-out', schema: 'ON_PTLSODVZD_1_968_04_05_01_01.xsd', xml: generateEPLOdometerOut({ waybillUid: uid, issuedAt: I, carrierInn: '7709876543', prior, departureAt: I, odometer: 152340, responsibleFullName: 'Иванов Пётр Сергеевич', signatoryFullName: 'Иванов Пётр Сергеевич' }) },
    { name: 'epl-05-odometer-in', schema: 'ON_PTLSODPARK_1_968_05_05_01_01.xsd', xml: generateEPLOdometerIn({ waybillUid: uid, issuedAt: I, carrierInn: '7709876543', prior, returnAt: I, odometer: 152600, responsibleFullName: 'Смирнов Алексей Николаевич', signatoryFullName: 'Смирнов Алексей Николаевич' }) },
    { name: 'epl-06-posttrip-med', schema: 'ON_PTLSPOSMO_1_968_06_05_01_01.xsd', xml: generateEPLPostTripMed(med) },
];

const schemasNeeded = new Set<string>();
for (const d of docs) {
    // XML в UTF-8 (для xmllint удобнее единая кодировка; декларацию переписываем).
    const xmlUtf8 = d.xml.replace('encoding="windows-1251"', 'encoding="UTF-8"');
    writeFileSync(`${outDir}/${d.name}.xml`, xmlUtf8, 'utf8');
    schemasNeeded.add(d.schema);
}
// UTF-8-копии нужных XSD рядом (оригиналы в windows-1251).
for (const s of schemasNeeded) {
    const utf8 = new TextDecoder('windows-1251').decode(readFileSync(schemaSrc + s)).replace('encoding="windows-1251"', 'encoding="UTF-8"');
    writeFileSync(`${outDir}/schemas/${s}`, utf8, 'utf8');
}

console.log(`\nВыгружено ${docs.length} XML в ./${outDir}/ + ${schemasNeeded.size} XSD (UTF-8) в ./${outDir}/schemas/\n`);
console.log('Независимая проверка официальным xmllint (libxml2):');
for (const d of docs) {
    console.log(`  xmllint --noout --schema ${outDir}/schemas/${d.schema} ${outDir}/${d.name}.xml`);
}
console.log('\nОжидаемо для каждого: "<файл> validates"');
