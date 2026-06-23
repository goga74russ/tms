// Инструмент цикла сертификации: прогон вывода generateETrN через РЕАЛЬНУЮ XSD ФНС.
// Печатает список ошибок libxml2 — правь генератор, гоняй снова, пока valid:true.
// Запуск: cd apps/api && npx tsx scripts/xsd-delta.ts
import { generateETrN, type ETrNInput } from '../src/modules/waybills/etrn-generator.js';
import { validateEtrnAgainstXsd } from '../src/lib/xsd-schema-validator.js';

const sampleInput: ETrNInput = {
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
    cargoDescription: 'Паллеты с товаром',
    cargoWeight: 12000,
    cargoVolume: 40,
    cargoPackages: 20,
    loadingAddress: 'г. Москва, ул. Складская, д. 1',
    unloadingAddress: 'г. Подольск, ул. Приёмная, д. 9',
    odometerOut: 150000,
    odometerIn: 150420,
};

const xml = generateETrN(sampleInput);
const result = await validateEtrnAgainstXsd(xml, 'T01');

console.log('=== ЭТрН Титул 1 против ON_TRNACLGROT_1_973_01_05_01_02.xsd ===');
console.log('valid:', result.valid);
console.log('errors:', result.errors.length);
for (const e of result.errors) console.log('  •', e);
