// ============================================================
// Seed Data — тестовые данные для разработки
// ============================================================
import { db, sql } from './connection.js';
import {
    users, contractors, contracts, vehicles, drivers,
    checklistTemplates, restrictionZones,
} from './schema.js';
import { hashPassword } from '../auth/auth.js';
import { APPEND_ONLY_TRIGGER_SQL } from './triggers.js';

async function seed() {
    console.log('🌱 Seeding database...');

    // --- Применяем триггеры append-only ---
    console.log('  → Creating append-only triggers...');
    await sql.unsafe(APPEND_ONLY_TRIGGER_SQL);

    // --- Users ---
    console.log('  → Creating users...');
    // M-5 FIX: SEED_PASSWORD is required — no fallback in production
    const seedPassword = process.env.SEED_PASSWORD;
    if (!seedPassword) {
        console.error('❌ SEED_PASSWORD environment variable is required');
        process.exit(1);
    }
    const passwordHash = await hashPassword(seedPassword);

    const [admin] = await db.insert(users).values({
        email: 'admin@tms.local',
        passwordHash,
        fullName: 'Администратор',
        roles: ['admin'],
    }).returning();

    const [logist] = await db.insert(users).values({
        email: 'logist@tms.local',
        passwordHash,
        fullName: 'Иванов Пётр Сергеевич',
        roles: ['logist'],
    }).returning();

    const [dispatcher] = await db.insert(users).values({
        email: 'dispatcher@tms.local',
        passwordHash,
        fullName: 'Сидорова Мария Александровна',
        roles: ['dispatcher'],
    }).returning();

    const [mechanic] = await db.insert(users).values({
        email: 'mechanic@tms.local',
        passwordHash,
        fullName: 'Козлов Андрей Иванович',
        roles: ['mechanic'],
    }).returning();

    const [medic] = await db.insert(users).values({
        email: 'medic@tms.local',
        passwordHash,
        fullName: 'Белова Елена Викторовна',
        roles: ['medic'],
    }).returning();

    const [manager] = await db.insert(users).values({
        email: 'manager@tms.local',
        passwordHash,
        fullName: 'Петров Алексей Павлович',
        roles: ['manager'],
    }).returning();

    const [accountant] = await db.insert(users).values({
        email: 'accountant@tms.local',
        passwordHash,
        fullName: 'Кузнецова Ольга Дмитриевна',
        roles: ['accountant'],
    }).returning();

    const [repairUser] = await db.insert(users).values({
        email: 'repair@tms.local',
        passwordHash,
        fullName: 'Смирнов Дмитрий Анатольевич',
        roles: ['repair_service'],
    }).returning();

    // Driver users
    const driverUsers = await db.insert(users).values([
        { email: 'driver1@tms.local', passwordHash, fullName: 'Морозов Сергей Николаевич', roles: ['driver'] },
        { email: 'driver2@tms.local', passwordHash, fullName: 'Волков Артём Дмитриевич', roles: ['driver'] },
        { email: 'driver3@tms.local', passwordHash, fullName: 'Соколов Игорь Петрович', roles: ['driver'] },
    ]).returning();

    // --- Contractors ---
    console.log('  → Creating contractors...');
    const [client1] = await db.insert(contractors).values({
        name: 'ООО "Строй Альянс"',
        inn: '7701234567',
        kpp: '770101001',
        legalAddress: 'г. Москва, ул. Ленина, 1',
        phone: '+7 (495) 123-45-67',
        email: 'info@stroyalliance.ru',
    }).returning();

    const [client2] = await db.insert(contractors).values({
        name: 'ООО "ПродТорг"',
        inn: '7709876543',
        kpp: '770901001',
        legalAddress: 'г. Москва, ул. Тверская, 15',
        phone: '+7 (495) 987-65-43',
        email: 'orders@prodtorg.ru',
    }).returning();

    const [client3] = await db.insert(contractors).values({
        name: 'ИП Никитин А.С.',
        inn: '771234567890',
        legalAddress: 'г. Москва, ул. Мира, 42',
        phone: '+7 (926) 555-11-22',
    }).returning();

    // --- Contracts ---
    console.log('  → Creating contracts...');
    await db.insert(contracts).values([
        {
            contractorId: client1.id,
            number: 'ДГ-2026/001',
            startDate: new Date('2026-01-01'),
            endDate: new Date('2026-12-31'),
        },
        {
            contractorId: client2.id,
            number: 'ДГ-2026/002',
            startDate: new Date('2026-02-01'),
            endDate: new Date('2026-12-31'),
        },
    ]);

    // --- Vehicles ---
    console.log('  → Creating vehicles...');
    const vehicleData = [
        { plateNumber: 'А123БВ77', vin: 'XTA21700080000001', make: 'ГАЗ', model: 'ГАЗон NEXT', year: 2023, bodyType: 'тент', payloadCapacityKg: 5000, payloadVolumeM3: 22, fuelTankLiters: 120, fuelNormPer100Km: 18 },
        { plateNumber: 'В456ГД50', vin: 'XTA21700080000002', make: 'КАМАЗ', model: '65207', year: 2022, bodyType: 'борт', payloadCapacityKg: 15000, payloadVolumeM3: 45, fuelTankLiters: 350, fuelNormPer100Km: 32 },
        { plateNumber: 'Е789ЖЗ99', vin: 'XTA21700080000003', make: 'MAN', model: 'TGX 18.510', year: 2024, bodyType: 'рефрижератор', payloadCapacityKg: 20000, payloadVolumeM3: 86, fuelTankLiters: 400, fuelNormPer100Km: 28 },
        { plateNumber: 'К012ЛМ77', vin: 'XTA21700080000004', make: 'Hyundai', model: 'HD78', year: 2023, bodyType: 'фургон', payloadCapacityKg: 4500, payloadVolumeM3: 18, fuelTankLiters: 100, fuelNormPer100Km: 14 },
        { plateNumber: 'Н345ОП50', vin: 'XTA21700080000005', make: 'ISUZU', model: 'ELF 7.5', year: 2024, bodyType: 'тент', payloadCapacityKg: 4200, payloadVolumeM3: 20, fuelTankLiters: 100, fuelNormPer100Km: 13 },
    ];
    await db.insert(vehicles).values(vehicleData);

    // --- Drivers ---
    console.log('  → Creating drivers...');
    await db.insert(drivers).values([
        {
            userId: driverUsers[0].id,
            fullName: 'Морозов Сергей Николаевич',
            birthDate: new Date('1985-03-15'),
            licenseNumber: '7700123456',
            licenseCategories: ['B', 'C', 'CE'],
            licenseExpiry: new Date('2028-03-15'),
            medCertificateExpiry: new Date('2027-01-10'),
            personalDataConsent: true,
            personalDataConsentDate: new Date('2026-01-01'),
        },
        {
            userId: driverUsers[1].id,
            fullName: 'Волков Артём Дмитриевич',
            birthDate: new Date('1990-07-22'),
            licenseNumber: '5000987654',
            licenseCategories: ['B', 'C'],
            licenseExpiry: new Date('2029-07-22'),
            medCertificateExpiry: new Date('2027-06-01'),
            personalDataConsent: true,
            personalDataConsentDate: new Date('2026-01-01'),
        },
        {
            userId: driverUsers[2].id,
            fullName: 'Соколов Игорь Петрович',
            birthDate: new Date('1982-11-03'),
            licenseNumber: '9900456789',
            licenseCategories: ['B', 'C', 'CE', 'D'],
            licenseExpiry: new Date('2027-11-03'),
            medCertificateExpiry: new Date('2026-12-01'),
            personalDataConsent: true,
            personalDataConsentDate: new Date('2026-01-01'),
        },
    ]);

    // --- Checklist Templates ---
    console.log('  → Creating checklist templates...');
    await db.insert(checklistTemplates).values([
        {
            type: 'tech',
            version: '1.0',
            name: 'Предрейсовый техосмотр (стандартный)',
            items: [
                { name: 'Тормозная система', responseType: 'ok_fault', required: true },
                { name: 'Рулевое управление', responseType: 'ok_fault', required: true },
                { name: 'Шины (состояние, давление)', responseType: 'ok_fault', required: true },
                { name: 'Внешние световые приборы', responseType: 'ok_fault', required: true },
                { name: 'Стеклоочистители', responseType: 'ok_fault', required: true },
                { name: 'Уровень масла', responseType: 'ok_fault', required: true },
                { name: 'Охлаждающая жидкость', responseType: 'ok_fault', required: true },
                { name: 'Состояние кузова/тента', responseType: 'ok_fault', required: true },
                { name: 'Огнетушитель', responseType: 'ok_fault', required: true },
                { name: 'Аптечка', responseType: 'ok_fault', required: true },
                { name: 'Знак аварийной остановки', responseType: 'ok_fault', required: true },
                { name: 'Тахограф', responseType: 'ok_fault', required: true },
                { name: 'Показания одометра', responseType: 'number', required: true },
            ],
        },
        {
            type: 'med',
            version: '1.0',
            name: 'Предрейсовый медосмотр (стандартный)',
            items: [
                { name: 'АД систолическое (мм рт.ст.)', responseType: 'number', required: true },
                { name: 'АД диастолическое (мм рт.ст.)', responseType: 'number', required: true },
                { name: 'Пульс (уд/мин)', responseType: 'number', required: true },
                { name: 'Температура (°C)', responseType: 'number', required: true },
                { name: 'Общее состояние', responseType: 'text', required: true },
                { name: 'Признаки опьянения', responseType: 'ok_fault', required: true },
                { name: 'Жалобы', responseType: 'text', required: false },
            ],
        },
    ]);

    // --- Restriction Zones ---
    console.log('  → Creating restriction zones...');
    await db.insert(restrictionZones).values([
        {
            name: 'МКАД',
            type: 'mkad',
            geoJson: { type: 'Polygon', coordinates: [] }, // Упрощённый GeoJSON
        },
        {
            name: 'ТТК',
            type: 'ttk',
            geoJson: { type: 'Polygon', coordinates: [] },
        },
    ]);

    console.log('✅ Seed completed!');
    console.log('');
    console.log(`📋 Тестовые аккаунты (пароль: ${seedPassword}):`);
    console.log('   admin@tms.local      — Администратор');
    console.log('   logist@tms.local     — Логист');
    console.log('   dispatcher@tms.local — Диспетчер');
    console.log('   mechanic@tms.local   — Механик');
    console.log('   medic@tms.local      — Медик');
    console.log('   manager@tms.local    — Руководитель');
    console.log('   accountant@tms.local — Бухгалтер');
    console.log('   repair@tms.local     — Ремонтная служба');
    console.log('   driver1@tms.local    — Водитель 1');
    console.log('   driver2@tms.local    — Водитель 2');
    console.log('   driver3@tms.local    — Водитель 3');

    await sql.end();
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
