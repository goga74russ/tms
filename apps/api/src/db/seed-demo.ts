// ============================================================
// DEMO Seed Data — полные данные для всех вкладок
// ============================================================
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, sql } from './connection.js';
import {
    users, organizations, contractors, contracts, vehicles, drivers, orders, trips, tripOrders,
    routePoints, waybills, techInspections, medInspections, repairRequests,
    fines, invoices, invoiceTrips, permits, tariffs, trailers, incidents, claims,
    tachographRecords, checklistTemplates, restrictionZones, events,
    deliveryConfirmations, documentReturns, mchd,
} from './schema.js';
import crypto from 'node:crypto';
import { hashPassword } from '../auth/auth.js';
import { APPEND_ONLY_TRIGGER_SQL } from './triggers.js';

async function seedDemo() {
    console.log('🌱 Seeding FULL demo data...');

    const seedPassword = process.env.SEED_PASSWORD;
    if (!seedPassword) {
        console.error('❌ SEED_PASSWORD environment variable is required');
        process.exit(1);
    }

    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
        console.error('❌ seed-demo creates a super-user with all roles and is not allowed in production. Set ALLOW_DEMO_SEED=true to override.');
        process.exit(1);
    }

    const passwordHash = await hashPassword(seedPassword);

    // === Apply triggers ===
    console.log('  → Triggers...');
    await sql.unsafe(APPEND_ONLY_TRIGGER_SQL);

    // ================================================================
    // 0) ORGANIZATIONS (F1 — для cross-org-leak тестов нужно 2 org)
    // ================================================================
    console.log('  → Organizations...');
    const [orgA] = await db.insert(organizations).values({
        name: 'ООО «ТрансПульт Демо» (Org-A)',
        inn: '7700000001',
        kpp: '770001001',
        ogrn: '1027700000001',
        legalAddress: 'г. Москва, ул. Тверская, 1',
        // T-9: выпуск счетов требует tax_regime !== 'unspecified'. Org-A — ОСНО (с НДС),
        // основная орг для QA-сценариев бухгалтера (accountant@tms.local в этой орг).
        taxRegime: 'osno',
    }).returning();
    const [orgB] = await db.insert(organizations).values({
        name: 'ИП Тестов А.А. (Org-B)',
        inn: '770000000002',
        legalAddress: 'г. Санкт-Петербург, Невский пр-т, 2',
        // ИП обычно на УСН; non-unspecified → тоже способна выпускать счета (для cross-org тестов).
        taxRegime: 'usn_income',
    }).returning();

    // ================================================================
    // 1) USERS — включая суперпользователя со всеми ролями
    // ================================================================
    console.log('  → Users (Org-A)...');
    await db.insert(users).values({
        id: '00000000-0000-0000-0000-000000000000',
        email: 'system@tms.internal',
        passwordHash,
        fullName: 'Система (BullMQ)',
        roles: ['admin'],
        // system-user — без org, кросс-tenant операционный
    }).onConflictDoNothing();

    // ★ СУПЕРПОЛЬЗОВАТЕЛЬ — БЕЗ org (super-admin) для кросс-tenant аудита
    const [superUser] = await db.insert(users).values({
        email: 'super@tms.local',
        passwordHash,
        fullName: 'Суперпользователь',
        roles: ['admin', 'logist', 'dispatcher', 'manager', 'mechanic', 'medic', 'repair_service', 'accountant', 'driver'],
        // organizationId не задан — super-admin (см. isSuperAdmin = admin && !org)
    }).returning();

    const [admin] = await db.insert(users).values({
        email: 'admin@tms.local', passwordHash, fullName: 'Администратор', roles: ['admin'],
        organizationId: orgA.id,
    }).returning();

    const [logist] = await db.insert(users).values({
        email: 'logist@tms.local', passwordHash, fullName: 'Иванов Пётр Сергеевич', roles: ['logist'],
        organizationId: orgA.id,
    }).returning();

    const [dispatcher] = await db.insert(users).values({
        email: 'dispatcher@tms.local', passwordHash, fullName: 'Сидорова Мария Александровна', roles: ['dispatcher'],
        organizationId: orgA.id,
    }).returning();

    const [mechanic] = await db.insert(users).values({
        email: 'mechanic@tms.local', passwordHash, fullName: 'Козлов Андрей Иванович', roles: ['mechanic'],
        organizationId: orgA.id,
    }).returning();

    const [medic] = await db.insert(users).values({
        email: 'medic@tms.local', passwordHash, fullName: 'Белова Елена Викторовна', roles: ['medic'],
        organizationId: orgA.id,
    }).returning();

    const [manager] = await db.insert(users).values({
        email: 'manager@tms.local', passwordHash, fullName: 'Петров Алексей Павлович', roles: ['manager'],
        organizationId: orgA.id,
    }).returning();

    const [accountant] = await db.insert(users).values({
        email: 'accountant@tms.local', passwordHash, fullName: 'Кузнецова Ольга Дмитриевна', roles: ['accountant'],
        organizationId: orgA.id,
    }).returning();

    const [repairUser] = await db.insert(users).values({
        email: 'repair@tms.local', passwordHash, fullName: 'Смирнов Дмитрий Анатольевич', roles: ['repair_service'],
        organizationId: orgA.id,
    }).returning();

    const driverUsers = await db.insert(users).values([
        { email: 'driver1@tms.local', passwordHash, fullName: 'Морозов Сергей Николаевич', roles: ['driver'], organizationId: orgA.id },
        { email: 'driver2@tms.local', passwordHash, fullName: 'Волков Артём Дмитриевич', roles: ['driver'], organizationId: orgA.id },
        { email: 'driver3@tms.local', passwordHash, fullName: 'Соколов Игорь Петрович', roles: ['driver'], organizationId: orgA.id },
    ]).returning();

    // ================================================================
    // 2) CONTRACTORS
    // ================================================================
    console.log('  → Contractors...');
    const [client1] = await db.insert(contractors).values({
        name: 'ООО "Строй Альянс"', inn: '7701234567', kpp: '770101001',
        legalAddress: 'г. Москва, ул. Ленина, 1', phone: '+7 (495) 123-45-67', email: 'info@stroyalliance.ru',
        organizationId: orgA.id,
    }).returning();

    const [client2] = await db.insert(contractors).values({
        name: 'ООО "ПродТорг"', inn: '7709876543', kpp: '770901001',
        legalAddress: 'г. Москва, ул. Тверская, 15', phone: '+7 (495) 987-65-43', email: 'orders@prodtorg.ru',
        organizationId: orgA.id,
    }).returning();

    const [client3] = await db.insert(contractors).values({
        name: 'ИП Никитин А.С.', inn: '771234567890',
        legalAddress: 'г. Москва, ул. Мира, 42', phone: '+7 (926) 555-11-22',
        organizationId: orgA.id,
    }).returning();

    // ================================================================
    // 3) CONTRACTS + TARIFFS
    // ================================================================
    console.log('  → Contracts & Tariffs...');
    const [contract1] = await db.insert(contracts).values({
        contractorId: client1.id, number: 'ДГ-2026/001',
        startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
    }).returning();

    const [contract2] = await db.insert(contracts).values({
        contractorId: client2.id, number: 'ДГ-2026/002',
        startDate: new Date('2026-02-01'), endDate: new Date('2026-12-31'),
    }).returning();

    const [contract3] = await db.insert(contracts).values({
        contractorId: client3.id, number: 'ДГ-2026/003',
        startDate: new Date('2026-03-01'), endDate: new Date('2026-12-31'),
    }).returning();

    // Tariffs
    await db.insert(tariffs).values([
        {
            contractId: contract1.id, type: 'per_km', ratePerKm: 45,
            idleRatePerHour: 500, extraPointRate: 1500, nightCoefficient: 1.3,
            urgentCoefficient: 1.5, minTripCost: 5000,
        },
        {
            contractId: contract2.id, type: 'fixed_route', fixedRate: 25000,
            idleRatePerHour: 600, nightCoefficient: 1.2, weekendCoefficient: 1.4,
        },
        {
            contractId: contract3.id, type: 'per_ton', ratePerTon: 800,
            idleRatePerHour: 400, minTripCost: 3000,
        },
    ]);

    // ================================================================
    // 4) VEHICLES
    // ================================================================
    console.log('  → Vehicles...');
    const vehicleRows = await db.insert(vehicles).values([
        { plateNumber: 'А123БВ77', vin: 'XTA21700080000001', make: 'ГАЗ', model: 'ГАЗон NEXT', year: 2023, bodyType: 'тент', payloadCapacityKg: 5000, payloadVolumeM3: 22, fuelTankLiters: 120, fuelNormPer100Km: 18, currentOdometerKm: 45230, techInspectionExpiry: new Date('2026-09-15'), osagoExpiry: new Date('2026-11-20'), organizationId: orgA.id },
        { plateNumber: 'В456ГД50', vin: 'XTA21700080000002', make: 'КАМАЗ', model: '65207', year: 2022, bodyType: 'борт', payloadCapacityKg: 15000, payloadVolumeM3: 45, fuelTankLiters: 350, fuelNormPer100Km: 32, currentOdometerKm: 128400, techInspectionExpiry: new Date('2026-06-01'), osagoExpiry: new Date('2026-08-15'), organizationId: orgA.id },
        { plateNumber: 'Е789ЖЗ99', vin: 'XTA21700080000003', make: 'MAN', model: 'TGX 18.510', year: 2024, bodyType: 'рефрижератор', payloadCapacityKg: 20000, payloadVolumeM3: 86, fuelTankLiters: 400, fuelNormPer100Km: 28, currentOdometerKm: 12750, techInspectionExpiry: new Date('2027-01-10'), osagoExpiry: new Date('2027-03-20'), organizationId: orgA.id },
        { plateNumber: 'К012ЛМ77', vin: 'XTA21700080000004', make: 'Hyundai', model: 'HD78', year: 2023, bodyType: 'фургон', payloadCapacityKg: 4500, payloadVolumeM3: 18, fuelTankLiters: 100, fuelNormPer100Km: 14, currentOdometerKm: 67890, status: 'maintenance', techInspectionExpiry: new Date('2026-04-10'), osagoExpiry: new Date('2026-07-05'), organizationId: orgA.id },
        { plateNumber: 'Н345ОП50', vin: 'XTA21700080000005', make: 'ISUZU', model: 'ELF 7.5', year: 2024, bodyType: 'тент', payloadCapacityKg: 4200, payloadVolumeM3: 20, fuelTankLiters: 100, fuelNormPer100Km: 13, currentOdometerKm: 5430, techInspectionExpiry: new Date('2027-05-01'), osagoExpiry: new Date('2027-06-15'), organizationId: orgA.id },
    ]).returning();

    // ================================================================
    // 5) TRAILERS
    // ================================================================
    console.log('  → Trailers...');
    const trailerRows = await db.insert(trailers).values([
        { plateNumber: 'АП1234 77', type: 'tent', make: 'СЗАП', model: '83053', year: 2022, payloadCapacityKg: 20000, payloadVolumeM3: 82, currentVehicleId: vehicleRows[1].id, organizationId: orgA.id },
        { plateNumber: 'АП5678 50', type: 'refrigerator', make: 'Krone', model: 'Cool Liner', year: 2023, payloadCapacityKg: 22000, payloadVolumeM3: 90, currentVehicleId: vehicleRows[2].id, organizationId: orgA.id },
        { plateNumber: 'АП9012 99', type: 'flatbed', make: 'Wielton', model: 'NS 34', year: 2021, payloadCapacityKg: 28000, organizationId: orgA.id },
    ]).returning();

    // ================================================================
    // 6) DRIVERS
    // ================================================================
    console.log('  → Drivers...');
    const driverRows = await db.insert(drivers).values([
        {
            userId: driverUsers[0].id, fullName: 'Морозов Сергей Николаевич',
            birthDate: new Date('1985-03-15'), licenseNumber: '7700123456',
            licenseCategories: ['B', 'C', 'CE'], licenseExpiry: new Date('2028-03-15'),
            medCertificateExpiry: new Date('2027-01-10'), snils: '123-456-789 01',
            personalDataConsent: true, personalDataConsentDate: new Date('2026-01-01'),
            organizationId: orgA.id,
        },
        {
            userId: driverUsers[1].id, fullName: 'Волков Артём Дмитриевич',
            birthDate: new Date('1990-07-22'), licenseNumber: '5000987654',
            licenseCategories: ['B', 'C'], licenseExpiry: new Date('2029-07-22'),
            medCertificateExpiry: new Date('2027-06-01'), snils: '987-654-321 09',
            personalDataConsent: true, personalDataConsentDate: new Date('2026-01-01'),
            organizationId: orgA.id,
        },
        {
            userId: driverUsers[2].id, fullName: 'Соколов Игорь Петрович',
            birthDate: new Date('1982-11-03'), licenseNumber: '9900456789',
            licenseCategories: ['B', 'C', 'CE', 'D'], licenseExpiry: new Date('2027-11-03'),
            medCertificateExpiry: new Date('2026-12-01'), snils: '456-789-012 34',
            personalDataConsent: true, personalDataConsentDate: new Date('2026-01-01'),
            organizationId: orgA.id,
        },
    ]).returning();

    // ================================================================
    // 7) ORDERS (разные статусы)
    // ================================================================
    console.log('  → Orders...');
    const orderRows = await db.insert(orders).values([
        {
            number: 'ORD-2026-00001', contractorId: client1.id, contractId: contract1.id,
            status: 'confirmed', cargoDescription: 'Кирпич М150, паллеты', cargoWeightKg: 5000, cargoVolumeM3: 12,
            cargoPlaces: 10, cargoType: 'стройматериалы',
            loadingAddress: 'г. Москва, ул. Складская, 5', loadingLat: 55.7522, loadingLon: 37.6156,
            loadingDate: new Date('2026-03-22T08:00:00Z'),
            unloadingAddress: 'г. Тула, ул. Промышленная, 12', unloadingLat: 54.1961, unloadingLon: 37.6182,
            unloadingDate: new Date('2026-03-22T14:00:00Z'),
            createdBy: logist.id, organizationId: orgA.id,
        },
        {
            number: 'ORD-2026-00002', contractorId: client2.id, contractId: contract2.id,
            status: 'in_transit', cargoDescription: 'Продукты питания (молочная продукция)', cargoWeightKg: 8000, cargoVolumeM3: 30,
            cargoPlaces: 25, cargoType: 'скоропортящиеся', temperatureMin: 2, temperatureMax: 6,
            loadingAddress: 'г. Москва, Каширское шоссе, 61', loadingLat: 55.6544, loadingLon: 37.6526,
            loadingDate: new Date('2026-03-23T06:00:00Z'),
            unloadingAddress: 'г. Рязань, ул. Новая, 80', unloadingLat: 54.6296, unloadingLon: 39.7421,
            unloadingDate: new Date('2026-03-23T12:00:00Z'),
            confirmationMode: 'required',
            createdBy: logist.id, organizationId: orgA.id,
        },
        {
            number: 'ORD-2026-00003', contractorId: client1.id, contractId: contract1.id,
            status: 'delivered', cargoDescription: 'Песок строительный', cargoWeightKg: 15000, cargoVolumeM3: 10,
            cargoPlaces: 1, cargoType: 'навалочный',
            loadingAddress: 'г. Москва, Варшавское шоссе, 170', loadingLat: 55.5963, loadingLon: 37.6152,
            loadingDate: new Date('2026-03-20T07:00:00Z'),
            unloadingAddress: 'г. Серпухов, ул. Ворошилова, 28', unloadingLat: 54.9159, unloadingLon: 37.4046,
            unloadingDate: new Date('2026-03-20T13:00:00Z'),
            createdBy: logist.id, organizationId: orgA.id,
        },
        {
            number: 'ORD-2026-00004', contractorId: client3.id, contractId: contract3.id,
            status: 'draft', cargoDescription: 'Мебель офисная (столы, кресла)', cargoWeightKg: 2000, cargoVolumeM3: 15,
            cargoPlaces: 30,
            loadingAddress: 'г. Москва, ул. Авиамоторная, 8', loadingLat: 55.7507, loadingLon: 37.7153,
            loadingDate: new Date('2026-03-25T09:00:00Z'),
            unloadingAddress: 'г. Москва, Ленинский пр-т, 119', unloadingLat: 55.6614, unloadingLon: 37.5059,
            unloadingDate: new Date('2026-03-25T15:00:00Z'),
            createdBy: logist.id, organizationId: orgA.id,
        },
        {
            number: 'ORD-2026-00005', contractorId: client2.id, contractId: contract2.id,
            status: 'assigned', cargoDescription: 'Напитки (вода, соки) в ПЭТ', cargoWeightKg: 12000, cargoVolumeM3: 40,
            cargoPlaces: 600, cargoType: 'напитки',
            loadingAddress: 'г. Москва, ул. Иловайская, 2', loadingLat: 55.6373, loadingLon: 37.6829,
            loadingDate: new Date('2026-03-24T07:00:00Z'),
            unloadingAddress: 'г. Калуга, ул. Московская, 234', unloadingLat: 54.5293, unloadingLon: 36.2754,
            unloadingDate: new Date('2026-03-24T15:00:00Z'),
            createdBy: dispatcher.id, organizationId: orgA.id,
        },
    ]).returning();

    // ================================================================
    // 8) TRIPS (разные статусы)
    // ================================================================
    console.log('  → Trips...');
    const tripRows = await db.insert(trips).values([
        // Trip 1: Completed — с заявкой ORD-0003
        {
            number: 'TRP-2026-00001', status: 'completed',
            vehicleId: vehicleRows[0].id, driverId: driverRows[0].id,
            plannedDistanceKm: 110, actualDistanceKm: 115,
            plannedDepartureAt: new Date('2026-03-20T07:00:00Z'),
            actualDepartureAt: new Date('2026-03-20T07:15:00Z'),
            actualCompletionAt: new Date('2026-03-20T14:30:00Z'),
            odometerStart: 45000, odometerEnd: 45115,
            fuelStart: 80, fuelEnd: 50,
            originalDocumentsReceived: true,
            createdBy: dispatcher.id, organizationId: orgA.id,
        },
        // Trip 2: In transit — с заявкой ORD-0002
        {
            number: 'TRP-2026-00002', status: 'in_transit',
            vehicleId: vehicleRows[2].id, trailerId: trailerRows[1].id, driverId: driverRows[1].id,
            plannedDistanceKm: 200,
            plannedDepartureAt: new Date('2026-03-23T06:00:00Z'),
            actualDepartureAt: new Date('2026-03-23T06:10:00Z'),
            odometerStart: 12750, fuelStart: 320,
            createdBy: dispatcher.id, organizationId: orgA.id,
        },
        // Trip 3: Assigned — с заявкой ORD-0001
        {
            number: 'TRP-2026-00003', status: 'assigned',
            vehicleId: vehicleRows[1].id, trailerId: trailerRows[0].id, driverId: driverRows[2].id,
            plannedDistanceKm: 180,
            plannedDepartureAt: new Date('2026-03-22T08:00:00Z'),
            createdBy: dispatcher.id, organizationId: orgA.id,
        },
        // Trip 4: Planning — для ORD-0005
        {
            number: 'TRP-2026-00004', status: 'planning',
            vehicleId: vehicleRows[4].id, driverId: driverRows[0].id,
            plannedDistanceKm: 190,
            plannedDepartureAt: new Date('2026-03-24T07:00:00Z'),
            createdBy: dispatcher.id, organizationId: orgA.id,
        },
        // Trip 5: Billed (завершён + выставлен счёт)
        {
            number: 'TRP-2026-00005', status: 'billed',
            vehicleId: vehicleRows[0].id, driverId: driverRows[2].id,
            plannedDistanceKm: 90, actualDistanceKm: 88,
            plannedDepartureAt: new Date('2026-03-18T08:00:00Z'),
            actualDepartureAt: new Date('2026-03-18T08:20:00Z'),
            actualCompletionAt: new Date('2026-03-18T13:00:00Z'),
            odometerStart: 44850, odometerEnd: 44938,
            fuelStart: 100, fuelEnd: 72,
            originalDocumentsReceived: true,
            createdBy: dispatcher.id, organizationId: orgA.id,
        },
    ]).returning();

    // Link orders to trips
    await db.insert(tripOrders).values([
        { tripId: tripRows[0].id, orderId: orderRows[2].id },
        { tripId: tripRows[1].id, orderId: orderRows[1].id },
        { tripId: tripRows[2].id, orderId: orderRows[0].id },
        { tripId: tripRows[3].id, orderId: orderRows[4].id },
    ]);

    // Update order.tripId
    for (const [orderIdx, tripIdx] of [[2, 0], [1, 1], [0, 2], [4, 3]] as [number, number][]) {
        await db.update(orders).set({ tripId: tripRows[tripIdx].id }).where(eq(orders.id, orderRows[orderIdx].id));
    }

    // ================================================================
    // 9) ROUTE POINTS
    // ================================================================
    console.log('  → Route points...');
    await db.insert(routePoints).values([
        // Trip 1 (completed)
        { tripId: tripRows[0].id, orderId: orderRows[2].id, type: 'loading', status: 'completed', sequenceNumber: 1, address: 'г. Москва, Варшавское шоссе, 170', lat: 55.5963, lon: 37.6152, arrivedAt: new Date('2026-03-20T07:20:00Z'), completedAt: new Date('2026-03-20T08:30:00Z') },
        { tripId: tripRows[0].id, orderId: orderRows[2].id, type: 'unloading', status: 'completed', sequenceNumber: 2, address: 'г. Серпухов, ул. Ворошилова, 28', lat: 54.9159, lon: 37.4046, arrivedAt: new Date('2026-03-20T12:00:00Z'), completedAt: new Date('2026-03-20T13:30:00Z') },
        // Trip 2 (in transit)
        { tripId: tripRows[1].id, orderId: orderRows[1].id, type: 'loading', status: 'completed', sequenceNumber: 1, address: 'г. Москва, Каширское шоссе, 61', lat: 55.6544, lon: 37.6526, arrivedAt: new Date('2026-03-23T06:15:00Z'), completedAt: new Date('2026-03-23T07:30:00Z') },
        { tripId: tripRows[1].id, orderId: orderRows[1].id, type: 'unloading', status: 'pending', sequenceNumber: 2, address: 'г. Рязань, ул. Новая, 80', lat: 54.6296, lon: 39.7421 },
        // Trip 3 (assigned)
        { tripId: tripRows[2].id, orderId: orderRows[0].id, type: 'loading', status: 'pending', sequenceNumber: 1, address: 'г. Москва, ул. Складская, 5', lat: 55.7522, lon: 37.6156 },
        { tripId: tripRows[2].id, orderId: orderRows[0].id, type: 'unloading', status: 'pending', sequenceNumber: 2, address: 'г. Тула, ул. Промышленная, 12', lat: 54.1961, lon: 37.6182 },
    ]);

    // ================================================================
    // 10) TECH INSPECTIONS
    // ================================================================
    console.log('  → Tech inspections...');
    const techInspRows = await db.insert(techInspections).values([
        {
            vehicleId: vehicleRows[0].id, mechanicId: mechanic.id, tripId: tripRows[0].id,
            inspectionType: 'pre_trip', checklistVersion: '1.0',
            items: [
                { name: 'Тормозная система', result: 'ok' },
                { name: 'Рулевое управление', result: 'ok' },
                { name: 'Шины', result: 'ok' },
                { name: 'Внешние световые приборы', result: 'ok' },
                { name: 'Уровень масла', result: 'ok' },
                { name: 'Огнетушитель', result: 'ok' },
            ],
            decision: 'approved', signature: 'mechanic-sig-1',
            createdAt: new Date('2026-03-20T06:30:00Z'),
        },
        {
            vehicleId: vehicleRows[2].id, mechanicId: mechanic.id, tripId: tripRows[1].id,
            inspectionType: 'pre_trip', checklistVersion: '1.0',
            items: [
                { name: 'Тормозная система', result: 'ok' },
                { name: 'Рулевое управление', result: 'ok' },
                { name: 'Шины', result: 'ok' },
                { name: 'Внешние световые приборы', result: 'ok' },
                { name: 'Рефрижератор (работоспособность)', result: 'ok' },
                { name: 'Уровень масла', result: 'ok' },
            ],
            decision: 'approved', signature: 'mechanic-sig-2',
            createdAt: new Date('2026-03-23T05:45:00Z'),
        },
        {
            vehicleId: vehicleRows[3].id, mechanicId: mechanic.id,
            inspectionType: 'pre_trip', checklistVersion: '1.0',
            items: [
                { name: 'Тормозная система', result: 'ok' },
                { name: 'Рулевое управление', result: 'ok' },
                { name: 'Шины', result: 'fault', comment: 'Правое заднее — давление ниже нормы, трещина на боковине' },
                { name: 'Внешние световые приборы', result: 'fault', comment: 'Левый указатель поворота — не работает' },
            ],
            decision: 'rejected', comment: 'ТС не допущено. Требуется замена шины и ремонт электрики.',
            signature: 'mechanic-sig-3',
            createdAt: new Date('2026-03-22T06:00:00Z'),
        },
    ]).returning();

    // ================================================================
    // 11) MED INSPECTIONS
    // ================================================================
    console.log('  → Med inspections...');
    const medInspRows = await db.insert(medInspections).values([
        {
            driverId: driverRows[0].id, medicId: medic.id, tripId: tripRows[0].id,
            inspectionType: 'pre_trip', checklistVersion: '1.0',
            systolicBp: 125, diastolicBp: 80, heartRate: 72, temperature: 36.6,
            condition: 'Удовлетворительное', alcoholTest: 'отриц.',
            decision: 'approved', signature: 'medic-sig-1',
            createdAt: new Date('2026-03-20T06:15:00Z'),
        },
        {
            driverId: driverRows[1].id, medicId: medic.id, tripId: tripRows[1].id,
            inspectionType: 'pre_trip', checklistVersion: '1.0',
            systolicBp: 130, diastolicBp: 85, heartRate: 68, temperature: 36.5,
            condition: 'Удовлетворительное', alcoholTest: 'отриц.',
            decision: 'approved', signature: 'medic-sig-2',
            createdAt: new Date('2026-03-23T05:30:00Z'),
        },
        {
            driverId: driverRows[2].id, medicId: medic.id,
            inspectionType: 'pre_trip', checklistVersion: '1.0',
            systolicBp: 155, diastolicBp: 100, heartRate: 95, temperature: 37.2,
            condition: 'Повышенное давление, учащённый пульс', alcoholTest: 'отриц.',
            complaints: 'Головная боль',
            decision: 'rejected', comment: 'Водитель не допущен. Рекомендация: обратиться к терапевту.',
            signature: 'medic-sig-3',
            createdAt: new Date('2026-03-21T06:00:00Z'),
        },
    ]).returning();

    // ================================================================
    // 12) WAYBILLS
    // ================================================================
    console.log('  → Waybills...');
    // Closed waybill for completed trip
    await db.insert(waybills).values({
        number: 'WB-2026-00001', tripId: tripRows[0].id,
        vehicleId: vehicleRows[0].id, driverId: driverRows[0].id,
        status: 'closed',
        techInspectionId: techInspRows[0].id, medInspectionId: medInspRows[0].id,
        mechanicSignature: 'mechanic-sig-1', medicSignature: 'medic-sig-1',
        odometerOut: 45000, odometerIn: 45115,
        fuelOut: 80, fuelIn: 50,
        departureAt: new Date('2026-03-20T07:15:00Z'),
        returnAt: new Date('2026-03-20T14:30:00Z'),
        issuedAt: new Date('2026-03-20T07:00:00Z'),
        closedAt: new Date('2026-03-20T15:00:00Z'),
        issuedByName: 'Сидорова Мария Александровна', issuedByPosition: 'Диспетчер',
        validFrom: new Date('2026-03-20T07:00:00Z'), validTo: new Date('2026-03-21T07:00:00Z'),
        transportServiceType: 'коммерческие', transportMode: 'междугородное',
    });

    // Issued waybill for in-transit trip
    await db.insert(waybills).values({
        number: 'WB-2026-00002', tripId: tripRows[1].id,
        vehicleId: vehicleRows[2].id, trailerId: trailerRows[1].id, driverId: driverRows[1].id,
        status: 'issued',
        techInspectionId: techInspRows[1].id, medInspectionId: medInspRows[1].id,
        mechanicSignature: 'mechanic-sig-2', medicSignature: 'medic-sig-2',
        odometerOut: 12750, fuelOut: 320,
        departureAt: new Date('2026-03-23T06:10:00Z'),
        issuedAt: new Date('2026-03-23T06:00:00Z'),
        issuedByName: 'Сидорова Мария Александровна', issuedByPosition: 'Диспетчер',
        validFrom: new Date('2026-03-23T06:00:00Z'), validTo: new Date('2026-03-24T06:00:00Z'),
        transportServiceType: 'коммерческие', transportMode: 'междугородное',
    });

    // Closed waybill for billed trip
    await db.insert(waybills).values({
        number: 'WB-2026-00003', tripId: tripRows[4].id,
        vehicleId: vehicleRows[0].id, driverId: driverRows[2].id,
        status: 'closed',
        odometerOut: 44850, odometerIn: 44938,
        fuelOut: 100, fuelIn: 72,
        departureAt: new Date('2026-03-18T08:20:00Z'),
        returnAt: new Date('2026-03-18T13:00:00Z'),
        issuedAt: new Date('2026-03-18T08:00:00Z'),
        closedAt: new Date('2026-03-18T14:00:00Z'),
        issuedByName: 'Сидорова Мария Александровна', issuedByPosition: 'Диспетчер',
        validFrom: new Date('2026-03-18T08:00:00Z'), validTo: new Date('2026-03-19T08:00:00Z'),
        transportServiceType: 'коммерческие', transportMode: 'пригородное',
    });

    // ================================================================
    // 13) REPAIR REQUESTS
    // ================================================================
    console.log('  → Repairs...');
    await db.insert(repairRequests).values([
        {
            vehicleId: vehicleRows[3].id, status: 'in_progress', priority: 'high', source: 'auto_inspection',
            description: 'Замена правой задней шины + ремонт левого указателя поворота',
            inspectionId: techInspRows[2].id,
            assignedTo: 'Смирнов Д.А.',
            workDescription: 'Шина заказана, электрик диагностирует проводку.',
            odometerAtRepair: 67890,
            createdAt: new Date('2026-03-22T07:00:00Z'),
        },
        {
            vehicleId: vehicleRows[1].id, status: 'done', priority: 'medium', source: 'scheduled',
            description: 'Плановое ТО-2 (замена масла, фильтров, тормозных колодок)',
            assignedTo: 'Смирнов Д.А.',
            workDescription: 'ТО-2 выполнено в полном объёме.',
            partsUsed: [
                { name: 'Масло моторное 10W-40 (10л)', quantity: 1, cost: 4500 },
                { name: 'Фильтр масляный', quantity: 1, cost: 850 },
                { name: 'Фильтр воздушный', quantity: 1, cost: 1200 },
                { name: 'Колодки тормозные (компл.)', quantity: 2, cost: 6000 },
            ],
            totalCost: 12550,
            odometerAtRepair: 125000,
            completedAt: new Date('2026-03-19T16:00:00Z'),
            createdAt: new Date('2026-03-17T09:00:00Z'),
        },
        {
            vehicleId: vehicleRows[0].id, status: 'created', priority: 'low', source: 'driver',
            description: 'Скрип при торможении (задняя ось). Водитель Морозов С.Н. обратил внимание.',
            createdAt: new Date('2026-03-23T04:00:00Z'),
        },
    ]);

    // ================================================================
    // 14) FINES
    // ================================================================
    console.log('  → Fines...');
    await db.insert(fines).values([
        {
            vehicleId: vehicleRows[0].id, driverId: driverRows[0].id, status: 'paid',
            violationDate: new Date('2026-03-10T14:23:00Z'), violationType: 'Превышение скорости (20-40 км/ч)',
            amount: 500, resolutionNumber: '18810177260310001234',
            paidAt: new Date('2026-03-15T10:00:00Z'),
        },
        {
            vehicleId: vehicleRows[1].id, driverId: driverRows[2].id, status: 'new',
            violationDate: new Date('2026-03-18T09:15:00Z'), violationType: 'Проезд на запрещающий сигнал светофора',
            amount: 1000, resolutionNumber: '18810150260318004567',
        },
        {
            vehicleId: vehicleRows[2].id, driverId: driverRows[1].id, status: 'confirmed',
            violationDate: new Date('2026-03-21T16:45:00Z'), violationType: 'Нарушение требований дорожных знаков (грузовое ограничение)',
            amount: 5000, resolutionNumber: '18810199260321007890',
        },
    ]);

    // ================================================================
    // 15) PERMITS
    // ================================================================
    console.log('  → Permits...');
    await db.insert(permits).values([
        {
            vehicleId: vehicleRows[0].id, zoneType: 'mkad', zoneName: 'МКАД',
            permitNumber: 'ПР-77-2026-001', validFrom: new Date('2026-01-01'), validUntil: new Date('2026-12-31'),
        },
        {
            vehicleId: vehicleRows[1].id, zoneType: 'mkad', zoneName: 'МКАД',
            permitNumber: 'ПР-77-2026-002', validFrom: new Date('2026-01-01'), validUntil: new Date('2026-06-30'),
        },
        {
            vehicleId: vehicleRows[2].id, zoneType: 'ttk', zoneName: 'ТТК',
            permitNumber: 'ПР-77-2026-003', validFrom: new Date('2026-03-01'), validUntil: new Date('2026-09-30'),
        },
    ]);

    // ================================================================
    // 16) INVOICES
    // ================================================================
    console.log('  → Invoices...');
    // invoices: scope via contractor (нет колонки organization_id).
    const invoiceSeed: typeof invoices.$inferInsert[] = [
        {
            number: 'СЧ-2026-00001', contractorId: client1.id, contractId: contract1.id,
            type: 'payment', status: 'paid_full', tripIds: [tripRows[4].id],
            subtotal: 8250, vatAmount: 1650, total: 9900,
            periodStart: new Date('2026-03-18'), periodEnd: new Date('2026-03-18'),
            paidAt: new Date('2026-03-22T14:00:00Z'),
        },
        {
            number: 'СЧ-2026-00002', contractorId: client2.id, contractId: contract2.id,
            type: 'payment', status: 'issued', tripIds: [],
            subtotal: 25000, vatAmount: 5000, total: 30000,
            periodStart: new Date('2026-03-23'), periodEnd: new Date('2026-03-23'),
        },
        {
            number: 'СЧ-2026-00003', contractorId: client1.id, contractId: contract1.id,
            type: 'act', status: 'draft', tripIds: [tripRows[0].id],
            subtotal: 5175, vatAmount: 1035, total: 6210,
            periodStart: new Date('2026-03-20'), periodEnd: new Date('2026-03-20'),
        },
    ];
    const invoiceRows = await db.insert(invoices).values(invoiceSeed).returning();

    await db.insert(invoiceTrips).values([
        { invoiceId: invoiceRows[0].id, tripId: tripRows[4].id },
        { invoiceId: invoiceRows[2].id, tripId: tripRows[0].id },
    ]);

    // ================================================================
    // 17) INCIDENTS
    // ================================================================
    console.log('  → Incidents...');
    const incidentSeed: typeof incidents.$inferInsert[] = [
        {
            type: 'tech_inspection', severity: 'medium', status: 'open',
            description: 'Неисправность шины и указателя поворота (Hyundai HD78 К012ЛМ77)',
            vehicleId: vehicleRows[3].id, techInspectionId: techInspRows[2].id,
            blocksRelease: true, createdBy: mechanic.id,
            createdAt: new Date('2026-03-22T06:30:00Z'),
            // incidents: нет колонки organization_id — scope via vehicle/driver/trip.
        },
        {
            type: 'med_inspection', severity: 'low', status: 'resolved',
            description: 'Водитель Соколов И.П. не прошёл медосмотр (повышенное АД)',
            driverId: driverRows[2].id, medInspectionId: medInspRows[2].id,
            resolution: 'Водитель прошёл повторный осмотр на следующий день — допущен.',
            resolvedAt: new Date('2026-03-22T07:00:00Z'), resolvedBy: medic.id,
            createdBy: medic.id,
            createdAt: new Date('2026-03-21T06:30:00Z'),
        },
        {
            type: 'road', severity: 'critical', status: 'investigating',
            description: 'МАН (Е789ЖЗ99) — пробой колеса на трассе М4 Дон (км 150). Водитель Волков А.Д. ожидает помощь.',
            vehicleId: vehicleRows[2].id, driverId: driverRows[1].id, tripId: tripRows[1].id,
            blocksRelease: false, createdBy: dispatcher.id,
            createdAt: new Date('2026-03-23T08:30:00Z'),
            // scope via vehicle/driver/trip
        },
    ];
    await db.insert(incidents).values(incidentSeed);

    // ================================================================
    // 18) CLAIMS
    // ================================================================
    console.log('  → Claims...');
    const claimRows: typeof claims.$inferInsert[] = [
        {
            tripId: tripRows[0].id, orderId: orderRows[2].id, contractorId: client1.id,
            type: 'delay', status: 'open', amount: '3000',
            description: 'Опоздание на выгрузку на 1.5 часа, простой крана на стройплощадке.',
            createdBy: logist.id,
            // claims не имеет колонки organization_id — scope via contractorId.
        },
        {
            contractorId: client2.id, type: 'damage', status: 'resolved',
            amount: '15000', resolvedAmount: '10000',
            description: 'Повреждение упаковки 3 паллет с молочной продукцией из-за нарушения температурного режима.',
            resolution: 'Компенсация 10 000 ₽ вычтена из следующего счёта.',
            resolvedBy: manager.id, resolvedAt: new Date('2026-03-19T12:00:00Z'),
            createdBy: logist.id,
        },
    ];
    await db.insert(claims).values(claimRows);

    // ================================================================
    // 19) TACHOGRAPH RECORDS
    // ================================================================
    console.log('  → Tachograph records...');
    await db.insert(tachographRecords).values([
        { driverId: driverRows[0].id, date: new Date('2026-03-20'), drivingMinutes: 420, restMinutes: 150, continuousDrivingMinutes: 240, weeklyRestMinutes: 2880 },
        { driverId: driverRows[0].id, date: new Date('2026-03-21'), drivingMinutes: 380, restMinutes: 200, continuousDrivingMinutes: 200, weeklyRestMinutes: 2880 },
        { driverId: driverRows[1].id, date: new Date('2026-03-23'), drivingMinutes: 300, restMinutes: 60, continuousDrivingMinutes: 270 },
        { driverId: driverRows[2].id, date: new Date('2026-03-18'), drivingMinutes: 350, restMinutes: 120, continuousDrivingMinutes: 210, weeklyRestMinutes: 2880 },
    ]);

    // ================================================================
    // 20) DELIVERY CONFIRMATIONS
    // ================================================================
    console.log('  → Delivery confirmations...');
    await db.insert(deliveryConfirmations).values({
        tripId: tripRows[0].id, orderId: orderRows[2].id,
        recipientName: 'Петров Василий Иванович',
        recipientPosition: 'Прораб',
        recipientDocument: 'Паспорт 4515 123456',
        photos: [],
        cargoCondition: 'intact',
        gpsLat: 54.9159, gpsLng: 37.4046,
        createdBy: driverUsers[0].id,
        confirmedAt: new Date('2026-03-20T13:30:00Z'),
    });

    // ================================================================
    // 21) DOCUMENT RETURNS
    // ================================================================
    console.log('  → Document returns...');
    await db.insert(documentReturns).values([
        { tripId: tripRows[0].id, docType: 'ttn', status: 'received', receivedAt: new Date('2026-03-21T10:00:00Z') },
        { tripId: tripRows[0].id, docType: 'upd', status: 'received', receivedAt: new Date('2026-03-21T10:00:00Z') },
        { tripId: tripRows[4].id, docType: 'ttn', status: 'received', receivedAt: new Date('2026-03-19T09:00:00Z') },
        { tripId: tripRows[4].id, docType: 'act', status: 'pending' },
    ]);

    // ================================================================
    // 22) CHECKLIST TEMPLATES + RESTRICTION ZONES
    // ================================================================
    console.log('  → Templates & zones...');
    await db.insert(checklistTemplates).values([
        {
            type: 'tech', version: '1.0', name: 'Предрейсовый техосмотр (стандартный)',
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
            type: 'med', version: '1.0', name: 'Предрейсовый медосмотр (стандартный)',
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

    await db.insert(restrictionZones).values([
        { name: 'МКАД', type: 'mkad', geoJson: { type: 'Polygon', coordinates: [] } },
        { name: 'ТТК', type: 'ttk', geoJson: { type: 'Polygon', coordinates: [] } },
    ]);

    // ================================================================
    // 22.5) МЧД (Машиночитаемые Доверенности) — T-13 W3
    // ================================================================
    // 1 active + 1 expired для демонстрации обоих статусов в /admin/mchd.
    // granter = Org-A (наша демо-организация), grantee = логист (Иванов).
    // certificate_xml — placeholder XML с подписью ФНС. Реальная МЧД
    // подгружается через UI оператором; здесь — только для пилотной
    // демонстрации flow + smoke test'ов.
    console.log('  → МЧД (реестр для подписания ЭТрН)...');
    // orgA.inn и orgA.ogrn nullable в schema, но в seed мы их задаём явно —
    // assert через `??` чтобы TS не ругался и runtime был защищён от багов
    // в будущих сидах.
    const orgAInn = orgA.inn ?? '7700000001';
    const orgAOgrn = orgA.ogrn ?? '1027700000001';
    const mchdXmlActive = '<?xml version="1.0" encoding="UTF-8"?>\n<МЧД><Номер>МЧД-2026-000001</Номер><Доверитель ИНН="' + orgAInn + '" ОГРН="' + orgAOgrn + '"/><Поверенный ФИО="Иванов Иван Иванович" ИНН="500100732259"/><Полномочия>Подписание ЭТрН (Титулы 2, 6), универсального передаточного документа (УПД), счетов-фактур, заказ-нарядов, актов оказанных услуг.</Полномочия><СрокДействия С="2026-01-01" По="2027-01-01"/></МЧД>';
    const mchdXmlExpired = '<?xml version="1.0" encoding="UTF-8"?>\n<МЧД><Номер>МЧД-2025-000042</Номер><Доверитель ИНН="' + orgAInn + '" ОГРН="' + orgAOgrn + '"/><Поверенный ФИО="Петров Пётр Петрович" ИНН="500100888312"/><Полномочия>Подписание ЭТрН и УПД (исторический пример — срок истёк).</Полномочия><СрокДействия С="2025-01-01" По="2025-12-31"/></МЧД>';
    await db.insert(mchd).values([
        {
            organizationId: orgA.id,
            mchdNumber: 'МЧД-2026-000001',
            granterInn: orgAInn,
            granterName: orgA.name,
            granterOgrn: orgAOgrn,
            granteeFullName: 'Иванов Иван Иванович',
            granteeInn: '500100732259',
            granteePassport: '4509 123456',
            scope: 'Подписание ЭТрН (Титулы 2, 6), УПД, счетов-фактур, заказ-нарядов, актов оказанных услуг от имени Организации в связке с личной КЭП физлица поверенного.',
            issuedAt: new Date('2026-01-01T09:00:00Z'),
            expiresAt: new Date('2027-01-01T00:00:00Z'),
            status: 'active',
            certificateXml: mchdXmlActive,
            certificateXmlHash: crypto.createHash('sha256').update(mchdXmlActive).digest('hex'),
            uploadedByUserId: admin.id,
            notes: 'Демо-МЧД (пилот). Реальный документ загружается через /admin/mchd → Добавить.',
        },
        {
            organizationId: orgA.id,
            mchdNumber: 'МЧД-2025-000042',
            granterInn: orgAInn,
            granterName: orgA.name,
            granterOgrn: orgAOgrn,
            granteeFullName: 'Петров Пётр Петрович',
            granteeInn: '500100888312',
            granteePassport: '4509 765432',
            scope: 'Подписание ЭТрН и УПД. Исторический пример — для демонстрации статуса "Истёкшие" в UI.',
            issuedAt: new Date('2025-01-01T09:00:00Z'),
            expiresAt: new Date('2025-12-31T23:59:59Z'),
            status: 'expired',
            certificateXml: mchdXmlExpired,
            certificateXmlHash: crypto.createHash('sha256').update(mchdXmlExpired).digest('hex'),
            uploadedByUserId: admin.id,
            notes: 'Истёкшая МЧД (демо). Используется для проверки UI-фильтров и баннеров «истекает скоро».',
        },
    ]);

    // ================================================================
    // 23) EVENTS (журнал)
    // ================================================================
    console.log('  → Events...');
    await db.insert(events).values([
        { authorId: dispatcher.id, authorRole: 'dispatcher', eventType: 'trip.created', entityType: 'trip', entityId: tripRows[0].id, data: { number: 'TRP-2026-00001' }, timestamp: new Date('2026-03-20T06:00:00Z'), organizationId: orgA.id },
        { authorId: dispatcher.id, authorRole: 'dispatcher', eventType: 'trip.status_changed', entityType: 'trip', entityId: tripRows[0].id, data: { from: 'planning', to: 'completed' }, timestamp: new Date('2026-03-20T14:30:00Z'), organizationId: orgA.id },
        { authorId: mechanic.id, authorRole: 'mechanic', eventType: 'inspection.completed', entityType: 'tech_inspection', entityId: techInspRows[0].id, data: { decision: 'approved', vehiclePlate: 'А123БВ77' }, timestamp: new Date('2026-03-20T06:30:00Z'), organizationId: orgA.id },
        { authorId: medic.id, authorRole: 'medic', eventType: 'inspection.completed', entityType: 'med_inspection', entityId: medInspRows[0].id, data: { decision: 'approved', driverName: 'Морозов С.Н.' }, timestamp: new Date('2026-03-20T06:15:00Z'), organizationId: orgA.id },
        { authorId: logist.id, authorRole: 'logist', eventType: 'order.created', entityType: 'order', entityId: orderRows[0].id, data: { number: 'ORD-2026-00001' }, timestamp: new Date('2026-03-22T07:00:00Z'), organizationId: orgA.id },
    ]);

    // ================================================================
    // 24) Org-B — минимальный набор для cross-org-leak QA-тестов (F1)
    // ================================================================
    // Без второй организации тесты на multi-tenancy (driver leak, IDOR,
    // updateOrder mass-assignment FK, etc) невозможны — все данные в одной
    // org и не дают подтверждения изоляции. Создаём admin/logist/driver +
    // 1 contractor + 1 vehicle + 1 driver + 1 order + 1 trip.
    console.log('  → Org-B (test tenant for cross-org-leak tests)...');
    const [adminB] = await db.insert(users).values({
        email: 'admin@org-b.local', passwordHash, fullName: 'Admin Org-B', roles: ['admin'],
        organizationId: orgB.id,
    }).returning();
    const [logistB] = await db.insert(users).values({
        email: 'logist@org-b.local', passwordHash, fullName: 'Logist Org-B', roles: ['logist'],
        organizationId: orgB.id,
    }).returning();
    const [dispatcherB] = await db.insert(users).values({
        email: 'dispatcher@org-b.local', passwordHash, fullName: 'Dispatcher Org-B', roles: ['dispatcher'],
        organizationId: orgB.id,
    }).returning();
    const [driverUserB] = await db.insert(users).values({
        email: 'driver@org-b.local', passwordHash, fullName: 'Driver Org-B', roles: ['driver'],
        organizationId: orgB.id,
    }).returning();

    const [contractorB] = await db.insert(contractors).values({
        name: 'ООО «Контрагент Org-B»', inn: '7800000003', kpp: '780001001',
        legalAddress: 'г. Санкт-Петербург, Малая Конюшенная, 5',
        organizationId: orgB.id,
    }).returning();
    const [contractB] = await db.insert(contracts).values({
        contractorId: contractorB.id, number: 'ДГ-B-2026/001',
        startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
    }).returning();
    const [vehicleB] = await db.insert(vehicles).values({
        plateNumber: 'X777YZ78', vin: 'XTA21700099900001', make: 'Volvo', model: 'FH16', year: 2024,
        bodyType: 'тент', payloadCapacityKg: 20000, payloadVolumeM3: 85, fuelTankLiters: 600,
        fuelNormPer100Km: 30, currentOdometerKm: 1500,
        techInspectionExpiry: new Date('2027-12-31'), osagoExpiry: new Date('2027-12-31'),
        organizationId: orgB.id,
    }).returning();
    const [driverB] = await db.insert(drivers).values({
        userId: driverUserB.id, fullName: 'Driver Org-B', birthDate: new Date('1988-04-04'),
        licenseNumber: '7800000003', licenseCategories: ['B', 'C', 'CE'],
        licenseExpiry: new Date('2029-04-04'), snils: '111-111-111 11',
        personalDataConsent: true, personalDataConsentDate: new Date('2026-01-01'),
        organizationId: orgB.id,
    }).returning();
    const [orderB] = await db.insert(orders).values({
        number: 'ORD-B-2026-0001', contractorId: contractorB.id, contractId: contractB.id,
        status: 'confirmed', cargoDescription: 'Груз Org-B (тестовый)', cargoWeightKg: 5000,
        loadingAddress: 'г. Санкт-Петербург, склад A',
        loadingDate: new Date('2026-04-01T08:00:00Z'),
        unloadingAddress: 'г. Санкт-Петербург, склад B',
        unloadingDate: new Date('2026-04-01T15:00:00Z'),
        createdBy: logistB.id, organizationId: orgB.id,
    }).returning();
    const [tripB] = await db.insert(trips).values({
        number: 'TR-B-2026-0001', status: 'planning',
        vehicleId: vehicleB.id, driverId: driverB.id,
        plannedDistanceKm: 50,
        plannedDepartureAt: new Date('2026-04-01T08:00:00Z'),
        createdBy: dispatcherB.id, organizationId: orgB.id,
    }).returning();
    await db.insert(tripOrders).values({ tripId: tripB.id, orderId: orderB.id });

    // ================================================================
    // DONE
    // ================================================================
    console.log('');
    console.log('✅ FULL demo seed completed!');
    console.log('');
    console.log(`📋 Аккаунты (пароль: ${seedPassword}):`);
    console.log('   ★ super@tms.local      — СУПЕРПОЛЬЗОВАТЕЛЬ (org=NULL, кросс-tenant)');
    console.log('   admin@tms.local       — Администратор (Org-A)');
    console.log('   logist@tms.local      — Логист (Org-A)');
    console.log('   dispatcher@tms.local  — Диспетчер (Org-A)');
    console.log('   mechanic@tms.local    — Механик (Org-A)');
    console.log('   medic@tms.local       — Медик (Org-A)');
    console.log('   manager@tms.local     — Руководитель (Org-A)');
    console.log('   accountant@tms.local  — Бухгалтер (Org-A)');
    console.log('   repair@tms.local      — Ремонтная служба (Org-A)');
    console.log('   driver1/2/3@tms.local — Водители (Org-A)');
    console.log('');
    console.log('   ★ Org-B (для cross-org-leak тестов):');
    console.log('   admin@org-b.local       — Admin Org-B');
    console.log('   logist@org-b.local      — Logist Org-B');
    console.log('   dispatcher@org-b.local  — Dispatcher Org-B');
    console.log('   driver@org-b.local      — Driver Org-B');
    console.log('');
    console.log('📊 Org-A: 5 заявок, 5 рейсов, 3 путевых листа, 3 техосмотра, 3 медосмотра,');
    console.log('         3 ремонта, 3 штрафа, 3 пропуска, 3 счёта, 3 тарифа,');
    console.log('         3 прицепа, 3 инцидента, 2 претензии, 4 тахографа.');
    console.log('📊 Org-B: 1 contractor, 1 vehicle, 1 driver, 1 order, 1 trip.');

    await sql.end();
    process.exit(0);
}

seedDemo().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
