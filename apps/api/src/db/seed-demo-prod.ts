// ============================================================
// PROD DEMO SEED — изолированная [ДЕМО]-организация для продаж/демо.
// Безопасно для прода: НЕ создаёт super-admin (org=NULL), всё помечено
// [ДЕМО], идемпотентно (повторный generate пропускается), есть cleanup.
//
//   node dist/db/seed-demo-prod.js            # сгенерировать
//   node dist/db/seed-demo-prod.js cleanup    # удалить всю [ДЕМО]-орг
//
// Требует SEED_PASSWORD (пароль демо-аккаунтов). Покрывает все вкладки и
// статусы + формирует рейтинг водителей (несколько завершённых рейсов с
// точками маршрута, штрафами, нарушениями холодовой цепи).
// ============================================================
import 'dotenv/config';
import { and, eq, inArray } from 'drizzle-orm';
import { db, sql } from './connection.js';
import {
    users, organizations, contractors, contracts, vehicles, drivers, orders, trips, tripOrders,
    routePoints, waybills, techInspections, medInspections, repairRequests,
    fines, invoices, invoiceTrips, permits, tariffs, trailers, incidents, claims,
    tachographRecords, events, deliveryConfirmations, documentReturns, mchd, temperatureReadings,
} from './schema.js';
import crypto from 'node:crypto';
import { hashPassword } from '../auth/auth.js';

const DEMO = '[ДЕМО]';
const ORG_NAME = `${DEMO} ТрансПульт (демо-стенд)`;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const now = Date.now();
const ago = (d: number) => new Date(now - d * DAY);

async function findDemoOrg() {
    const [org] = await db.select().from(organizations).where(eq(organizations.name, ORG_NAME)).limit(1);
    return org ?? null;
}

// =================================================================
// CLEANUP — удаляет всю [ДЕМО]-орг (дети → родители)
// =================================================================
async function cleanup() {
    const org = await findDemoOrg();
    if (!org) { console.log('Нет [ДЕМО]-орг — чистить нечего.'); return; }
    const orgId = org.id;
    console.log(`🧹 Удаляю [ДЕМО]-орг ${orgId}...`);

    const tripIds = (await db.select({ id: trips.id }).from(trips).where(eq(trips.organizationId, orgId))).map((r) => r.id);
    const orderIds = (await db.select({ id: orders.id }).from(orders).where(eq(orders.organizationId, orgId))).map((r) => r.id);
    const driverRows = await db.select({ id: drivers.id, userId: drivers.userId }).from(drivers).where(eq(drivers.organizationId, orgId));
    const contractorIds = (await db.select({ id: contractors.id }).from(contractors).where(eq(contractors.organizationId, orgId))).map((r) => r.id);
    const vehicleIds = (await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, orgId))).map((r) => r.id);
    const userIds = (await db.select({ id: users.id }).from(users).where(eq(users.organizationId, orgId))).map((r) => r.id);
    const contractIds = contractorIds.length ? (await db.select({ id: contracts.id }).from(contracts).where(inArray(contracts.contractorId, contractorIds))).map((r) => r.id) : [];
    const invoiceIds = contractorIds.length ? (await db.select({ id: invoices.id }).from(invoices).where(inArray(invoices.contractorId, contractorIds))).map((r) => r.id) : [];

    const del = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { console.warn(`  ⚠ ${label}: ${(e as Error).message}`); } };

    if (tripIds.length) {
        await del('temperature_readings', () => db.delete(temperatureReadings).where(inArray(temperatureReadings.tripId, tripIds)));
        await del('delivery_confirmations', () => db.delete(deliveryConfirmations).where(inArray(deliveryConfirmations.tripId, tripIds)));
        await del('document_returns', () => db.delete(documentReturns).where(inArray(documentReturns.tripId, tripIds)));
        await del('route_points', () => db.delete(routePoints).where(inArray(routePoints.tripId, tripIds)));
        await del('waybills', () => db.delete(waybills).where(inArray(waybills.tripId, tripIds)));
        await del('trip_orders', () => db.delete(tripOrders).where(inArray(tripOrders.tripId, tripIds)));
        await del('invoice_trips', () => db.delete(invoiceTrips).where(inArray(invoiceTrips.tripId, tripIds)));
    }
    await del('events', () => db.delete(events).where(eq(events.organizationId, orgId)));
    await del('tech_inspections', () => db.delete(techInspections).where(inArray(techInspections.vehicleId, vehicleIds.length ? vehicleIds : ['00000000-0000-0000-0000-000000000000'])));
    if (driverRows.length) await del('med_inspections', () => db.delete(medInspections).where(inArray(medInspections.driverId, driverRows.map((d) => d.id))));
    if (vehicleIds.length) { await del('repairs', () => db.delete(repairRequests).where(inArray(repairRequests.vehicleId, vehicleIds))); await del('permits', () => db.delete(permits).where(inArray(permits.vehicleId, vehicleIds))); await del('fines', () => db.delete(fines).where(inArray(fines.vehicleId, vehicleIds))); }
    await del('incidents', () => db.delete(incidents).where(eq(incidents.vehicleId, vehicleIds[0] ?? '00000000-0000-0000-0000-000000000000')));
    if (vehicleIds.length) await del('incidents2', () => db.delete(incidents).where(inArray(incidents.vehicleId, vehicleIds)));
    if (contractorIds.length) await del('claims', () => db.delete(claims).where(inArray(claims.contractorId, contractorIds)));
    if (driverRows.length) await del('tachograph', () => db.delete(tachographRecords).where(inArray(tachographRecords.driverId, driverRows.map((d) => d.id))));
    await del('mchd', () => db.delete(mchd).where(eq(mchd.organizationId, orgId)));
    if (invoiceIds.length) await del('invoices', () => db.delete(invoices).where(inArray(invoices.id, invoiceIds)));
    if (tripIds.length) await del('trips', () => db.delete(trips).where(inArray(trips.id, tripIds)));
    if (orderIds.length) await del('orders', () => db.delete(orders).where(inArray(orders.id, orderIds)));
    if (contractIds.length) await del('tariffs', () => db.delete(tariffs).where(inArray(tariffs.contractId, contractIds)));
    if (contractIds.length) await del('contracts', () => db.delete(contracts).where(inArray(contracts.id, contractIds)));
    await del('trailers', () => db.delete(trailers).where(eq(trailers.organizationId, orgId)));
    if (driverRows.length) await del('drivers', () => db.delete(drivers).where(inArray(drivers.id, driverRows.map((d) => d.id))));
    await del('vehicles', () => db.delete(vehicles).where(eq(vehicles.organizationId, orgId)));
    await del('contractors', () => db.delete(contractors).where(eq(contractors.organizationId, orgId)));
    if (userIds.length) await del('users', () => db.delete(users).where(inArray(users.id, userIds)));
    await del('organization', () => db.delete(organizations).where(eq(organizations.id, orgId)));
    console.log('✅ [ДЕМО]-орг удалена.');
}

// =================================================================
// GENERATE
// =================================================================
async function generate() {
    const seedPassword = process.env.SEED_PASSWORD;
    if (!seedPassword) { console.error('❌ SEED_PASSWORD обязателен'); process.exit(1); }

    if (await findDemoOrg()) {
        console.log('ℹ️ [ДЕМО]-орг уже существует — пропускаю (идемпотентно). Для пересоздания: cleanup, затем generate.');
        return;
    }
    const pwd = await hashPassword(seedPassword);
    console.log(`🌱 Создаю изолированную ${ORG_NAME}...`);

    const [org] = await db.insert(organizations).values({
        name: ORG_NAME, inn: '7700000099', kpp: '770001001', ogrn: '1027700000099',
        legalAddress: 'г. Москва, ул. Демонстрационная, 1', taxRegime: 'osno',
    }).returning();
    const orgId = org.id;

    // --- Users (все роли, [ДЕМО]) ---
    console.log('  → Пользователи...');
    const mk = async (email: string, fullName: string, roles: string[]) =>
        (await db.insert(users).values({ email, passwordHash: pwd, fullName: `${DEMO} ${fullName}`, roles: roles as never, organizationId: orgId }).returning())[0];
    const admin = await mk('demo-admin@transpult.ru', 'Администратор демо', ['admin']);
    const logist = await mk('demo-logist@transpult.ru', 'Иванов Пётр Сергеевич', ['logist']);
    const dispatcher = await mk('demo-dispatcher@transpult.ru', 'Сидорова Мария Александровна', ['dispatcher']);
    const mechanic = await mk('demo-mechanic@transpult.ru', 'Козлов Андрей Иванович', ['mechanic']);
    const medic = await mk('demo-medic@transpult.ru', 'Белова Елена Викторовна', ['medic']);
    const manager = await mk('demo-manager@transpult.ru', 'Петров Алексей Павлович', ['manager']);
    const accountant = await mk('demo-accountant@transpult.ru', 'Кузнецова Ольга Дмитриевна', ['accountant']);
    await mk('demo-repair@transpult.ru', 'Смирнов Дмитрий Анатольевич', ['repair_service']);
    const driverUsers = await db.insert(users).values([
        { email: 'demo-driver1@transpult.ru', passwordHash: pwd, fullName: `${DEMO} Морозов Сергей Николаевич`, roles: ['driver'] as never, organizationId: orgId },
        { email: 'demo-driver2@transpult.ru', passwordHash: pwd, fullName: `${DEMO} Волков Артём Дмитриевич`, roles: ['driver'] as never, organizationId: orgId },
        { email: 'demo-driver3@transpult.ru', passwordHash: pwd, fullName: `${DEMO} Соколов Игорь Петрович`, roles: ['driver'] as never, organizationId: orgId },
        { email: 'demo-driver4@transpult.ru', passwordHash: pwd, fullName: `${DEMO} Кузьмин Олег Викторович`, roles: ['driver'] as never, organizationId: orgId },
    ]).returning();

    // --- Contractors / contracts / tariffs ---
    console.log('  → Контрагенты, договоры, тарифы...');
    const ctr = await db.insert(contractors).values([
        { name: `${DEMO} ООО «Строй Альянс»`, inn: '7701234567', kpp: '770101001', legalAddress: 'г. Москва, ул. Ленина, 1', phone: '+7 (495) 123-45-67', email: 'demo1@example.ru', organizationId: orgId },
        { name: `${DEMO} ООО «ПродТорг»`, inn: '7709876543', kpp: '770901001', legalAddress: 'г. Москва, ул. Тверская, 15', phone: '+7 (495) 987-65-43', email: 'demo2@example.ru', organizationId: orgId },
        { name: `${DEMO} ИП Никитин А.С.`, inn: '771234567890', legalAddress: 'г. Москва, ул. Мира, 42', phone: '+7 (926) 555-11-22', organizationId: orgId },
    ]).returning();
    const con = await db.insert(contracts).values([
        { contractorId: ctr[0].id, number: `${DEMO} ДГ-2026/001`, startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31') },
        { contractorId: ctr[1].id, number: `${DEMO} ДГ-2026/002`, startDate: new Date('2026-02-01'), endDate: new Date('2026-12-31') },
        { contractorId: ctr[2].id, number: `${DEMO} ДГ-2026/003`, startDate: new Date('2026-03-01'), endDate: new Date('2026-12-31') },
    ]).returning();
    await db.insert(tariffs).values([
        { contractId: con[0].id, type: 'per_km', ratePerKm: 45, idleRatePerHour: 500, extraPointRate: 1500, nightCoefficient: 1.3, urgentCoefficient: 1.5, minTripCost: 5000 },
        { contractId: con[1].id, type: 'fixed_route', fixedRate: 25000, idleRatePerHour: 600, nightCoefficient: 1.2, weekendCoefficient: 1.4 },
        { contractId: con[2].id, type: 'per_ton', ratePerTon: 800, idleRatePerHour: 400, minTripCost: 3000 },
    ]);

    // --- Vehicles (разные статусы) + trailers ---
    console.log('  → ТС и прицепы...');
    const veh = await db.insert(vehicles).values([
        { plateNumber: 'Д001ЕМ77', vin: 'XTADEMO000000001', make: `${DEMO} ГАЗ`, model: 'ГАЗон NEXT', year: 2023, bodyType: 'тент', payloadCapacityKg: 5000, payloadVolumeM3: 22, fuelTankLiters: 120, fuelNormPer100Km: 18, currentOdometerKm: 45230, status: 'available', techInspectionExpiry: new Date('2026-09-15'), osagoExpiry: new Date('2026-11-20'), organizationId: orgId },
        { plateNumber: 'Д002ЕМ50', vin: 'XTADEMO000000002', make: `${DEMO} КАМАЗ`, model: '65207', year: 2022, bodyType: 'борт', payloadCapacityKg: 15000, payloadVolumeM3: 45, fuelTankLiters: 350, fuelNormPer100Km: 32, currentOdometerKm: 128400, status: 'in_trip', techInspectionExpiry: new Date('2026-06-01'), osagoExpiry: new Date('2026-08-15'), organizationId: orgId },
        { plateNumber: 'Д003ЕМ99', vin: 'XTADEMO000000003', make: `${DEMO} MAN`, model: 'TGX 18.510', year: 2024, bodyType: 'рефрижератор', payloadCapacityKg: 20000, payloadVolumeM3: 86, fuelTankLiters: 400, fuelNormPer100Km: 28, currentOdometerKm: 12750, status: 'available', techInspectionExpiry: new Date('2027-01-10'), osagoExpiry: new Date('2027-03-20'), organizationId: orgId },
        { plateNumber: 'Д004ЕМ77', vin: 'XTADEMO000000004', make: `${DEMO} Hyundai`, model: 'HD78', year: 2023, bodyType: 'фургон', payloadCapacityKg: 4500, payloadVolumeM3: 18, fuelTankLiters: 100, fuelNormPer100Km: 14, currentOdometerKm: 67890, status: 'maintenance', techInspectionExpiry: new Date('2026-04-10'), osagoExpiry: new Date('2026-07-05'), organizationId: orgId },
        { plateNumber: 'Д005ЕМ50', vin: 'XTADEMO000000005', make: `${DEMO} ISUZU`, model: 'ELF 7.5', year: 2024, bodyType: 'тент', payloadCapacityKg: 4200, payloadVolumeM3: 20, fuelTankLiters: 100, fuelNormPer100Km: 13, currentOdometerKm: 5430, status: 'broken', techInspectionExpiry: new Date('2027-05-01'), osagoExpiry: new Date('2027-06-15'), organizationId: orgId },
        { plateNumber: 'Д006ЕМ77', vin: 'XTADEMO000000006', make: `${DEMO} Volvo`, model: 'FH16', year: 2024, bodyType: 'рефрижератор', payloadCapacityKg: 22000, payloadVolumeM3: 90, fuelTankLiters: 600, fuelNormPer100Km: 30, currentOdometerKm: 33000, status: 'available', techInspectionExpiry: new Date('2027-02-01'), osagoExpiry: new Date('2027-04-10'), organizationId: orgId },
    ]).returning();
    const trl = await db.insert(trailers).values([
        { plateNumber: 'ДМО1234 77', type: 'tent', make: 'СЗАП', model: '83053', year: 2022, payloadCapacityKg: 20000, payloadVolumeM3: 82, currentVehicleId: veh[1].id, organizationId: orgId },
        { plateNumber: 'ДМО5678 50', type: 'refrigerator', make: 'Krone', model: 'Cool Liner', year: 2023, payloadCapacityKg: 22000, payloadVolumeM3: 90, currentVehicleId: veh[2].id, organizationId: orgId },
        { plateNumber: 'ДМО9012 99', type: 'flatbed', make: 'Wielton', model: 'NS 34', year: 2021, payloadCapacityKg: 28000, organizationId: orgId },
    ]).returning();

    // --- Drivers ---
    console.log('  → Водители...');
    const drv = await db.insert(drivers).values([
        { userId: driverUsers[0].id, fullName: `${DEMO} Морозов Сергей Николаевич`, birthDate: new Date('1985-03-15'), licenseNumber: '7700123456', licenseCategories: ['B', 'C', 'CE'], licenseExpiry: new Date('2028-03-15'), medCertificateExpiry: new Date('2027-01-10'), snils: '123-456-789 01', personalDataConsent: true, personalDataConsentDate: new Date('2026-01-01'), organizationId: orgId },
        { userId: driverUsers[1].id, fullName: `${DEMO} Волков Артём Дмитриевич`, birthDate: new Date('1990-07-22'), licenseNumber: '5000987654', licenseCategories: ['B', 'C'], licenseExpiry: new Date('2029-07-22'), medCertificateExpiry: new Date('2027-06-01'), snils: '987-654-321 09', personalDataConsent: true, personalDataConsentDate: new Date('2026-01-01'), organizationId: orgId },
        { userId: driverUsers[2].id, fullName: `${DEMO} Соколов Игорь Петрович`, birthDate: new Date('1982-11-03'), licenseNumber: '9900456789', licenseCategories: ['B', 'C', 'CE', 'D'], licenseExpiry: new Date('2027-11-03'), medCertificateExpiry: new Date('2026-12-01'), snils: '456-789-012 34', personalDataConsent: true, personalDataConsentDate: new Date('2026-01-01'), organizationId: orgId },
        { userId: driverUsers[3].id, fullName: `${DEMO} Кузьмин Олег Викторович`, birthDate: new Date('1988-05-19'), licenseNumber: '7700777888', licenseCategories: ['B', 'C', 'CE'], licenseExpiry: new Date('2028-05-19'), medCertificateExpiry: new Date('2027-03-01'), snils: '777-888-999 00', personalDataConsent: true, personalDataConsentDate: new Date('2026-01-01'), organizationId: orgId },
    ]).returning();

    // ============================================================
    // Рейтинг-формирующие ЗАВЕРШЁННЫЕ рейсы: по несколько на водителя.
    // on-time = route_point.completedAt <= windowEnd. Разный профиль →
    // разный рейтинг (отличник / средний / штрафник).
    // ============================================================
    console.log('  → Завершённые рейсы (для рейтинга)...');
    let tripSeq = 0, orderSeq = 0, wbSeq = 0;
    const routes = [
        ['г. Москва, Варшавское ш., 170', 55.5963, 37.6152, 'г. Серпухов, ул. Ворошилова, 28', 54.9159, 37.4046, 110],
        ['г. Москва, Каширское ш., 61', 55.6544, 37.6526, 'г. Рязань, ул. Новая, 80', 54.6296, 39.7421, 200],
        ['г. Москва, Ленинградское ш., 18', 55.8421, 37.4830, 'г. Тверь, ул. Советская, 25', 56.8587, 35.9176, 170],
        ['г. Москва, ул. Складская, 5', 55.7522, 37.6156, 'г. Тула, ул. Промышленная, 12', 54.1961, 37.6182, 180],
        ['г. Москва, Дмитровское ш., 100', 55.9000, 37.5400, 'г. Калуга, ул. Московская, 234', 54.5293, 36.2754, 190],
    ] as const;
    // профиль: [driverIdx, vehicleIdx, completedCount, lateCount, coldChain]
    const profiles: [number, number, number, number, boolean][] = [
        [0, 0, 4, 0, false], // Морозов — отличник
        [1, 2, 4, 1, true],  // Волков — рефрижератор, 1 опоздание + нарушение холодовой цепи
        [2, 1, 3, 2, false], // Соколов — штрафник
        [3, 5, 3, 0, false], // Кузьмин — крепкий середняк
    ];
    for (const [di, vi, cnt, late, cold] of profiles) {
        for (let k = 0; k < cnt; k++) {
            const r = routes[(orderSeq) % routes.length];
            const dep = ago(30 - orderSeq); // разнесём по времени
            const arr = new Date(dep.getTime() + 6 * HOUR);
            const isLate = k < late;
            const windowEnd = new Date(arr.getTime() + (isLate ? -1 : 1) * HOUR); // опоздал → completedAt > windowEnd
            const [ord] = await db.insert(orders).values({
                number: `DEMO-${String(++orderSeq).padStart(5, '0')}`, contractorId: ctr[orderSeq % 3].id, contractId: con[orderSeq % 3].id,
                status: 'delivered', cargoDescription: cold ? `${DEMO} Молочная продукция` : `${DEMO} Генеральный груз`, cargoWeightKg: 5000 + k * 1000, cargoVolumeM3: 20,
                cargoPlaces: 10, ...(cold ? { coldChainRequired: true, temperatureMinC: 2, temperatureMaxC: 6 } : {}),
                loadingAddress: r[0] as string, loadingLat: r[1] as number, loadingLon: r[2] as number, loadingDate: dep,
                unloadingAddress: r[3] as string, unloadingLat: r[4] as number, unloadingLon: r[5] as number, unloadingDate: arr,
                createdBy: logist.id, organizationId: orgId,
            }).returning();
            const [trp] = await db.insert(trips).values({
                number: `DEMO-T-${String(++tripSeq).padStart(5, '0')}`, status: 'completed',
                vehicleId: veh[vi].id, driverId: drv[di].id, plannedDistanceKm: r[6] as number, actualDistanceKm: (r[6] as number) + 5,
                plannedDepartureAt: dep, actualDepartureAt: dep, actualCompletionAt: arr,
                odometerStart: 40000 + tripSeq * 200, odometerEnd: 40000 + tripSeq * 200 + (r[6] as number), fuelStart: 90, fuelEnd: 55,
                originalDocumentsReceived: true, createdBy: dispatcher.id, organizationId: orgId,
            }).returning();
            await db.insert(tripOrders).values({ tripId: trp.id, orderId: ord.id });
            await db.update(orders).set({ tripId: trp.id }).where(eq(orders.id, ord.id));
            await db.insert(routePoints).values([
                { tripId: trp.id, orderId: ord.id, type: 'loading', status: 'completed', sequenceNumber: 1, address: r[0] as string, lat: r[1] as number, lon: r[2] as number, arrivedAt: dep, completedAt: new Date(dep.getTime() + HOUR) },
                { tripId: trp.id, orderId: ord.id, type: 'unloading', status: 'completed', sequenceNumber: 2, address: r[3] as string, lat: r[4] as number, lon: r[5] as number, windowEnd, arrivedAt: arr, completedAt: arr },
            ]);
            // temperature readings для рефрижератора (+нарушение)
            if (cold) {
                const temps = [4.5, 5.0, 5.8, 8.5, 7.2, 4.0]; // 8.5 — нарушение (>6)
                await db.insert(temperatureReadings).values(temps.map((t, idx) => ({
                    tripId: trp.id, orderId: ord.id, organizationId: orgId,
                    recordedAt: new Date(dep.getTime() + idx * HOUR), tempC: t,
                    sensorId: 'DEMO-SENSOR-1', source: 'mock' as const,
                    breach: t > 6, ...(t > 6 ? { breachMaxC: 6 } : {}),
                })));
            }
        }
    }

    // ============================================================
    // Остальные рейсы (все прочие статусы) + связанные заявки
    // ============================================================
    console.log('  → Рейсы прочих статусов...');
    const otherTrips: { status: string; orderStatus: string; vi: number; di: number }[] = [
        { status: 'planning', orderStatus: 'draft', vi: 4, di: 0 },
        { status: 'assigned', orderStatus: 'assigned', vi: 1, di: 2 },
        { status: 'in_transit', orderStatus: 'in_transit', vi: 2, di: 1 },
        { status: 'billed', orderStatus: 'delivered', vi: 0, di: 3 },
        { status: 'cancelled', orderStatus: 'cancelled', vi: 5, di: 0 },
    ];
    const otherTripRows: { id: string; status: string }[] = [];
    for (const ot of otherTrips) {
        const r = routes[orderSeq % routes.length];
        const dep = new Date(now + (ot.status === 'planning' || ot.status === 'assigned' ? 2 : -3) * DAY);
        const [ord] = await db.insert(orders).values({
            number: `DEMO-${String(++orderSeq).padStart(5, '0')}`, contractorId: ctr[orderSeq % 3].id, contractId: con[orderSeq % 3].id,
            status: ot.orderStatus as never, cargoDescription: `${DEMO} Груз (${ot.orderStatus})`, cargoWeightKg: 8000, cargoVolumeM3: 30, cargoPlaces: 15,
            loadingAddress: r[0] as string, loadingLat: r[1] as number, loadingLon: r[2] as number, loadingDate: dep,
            unloadingAddress: r[3] as string, unloadingLat: r[4] as number, unloadingLon: r[5] as number, unloadingDate: new Date(dep.getTime() + 6 * HOUR),
            createdBy: logist.id, organizationId: orgId,
        }).returning();
        const [trp] = await db.insert(trips).values({
            number: `DEMO-T-${String(++tripSeq).padStart(5, '0')}`, status: ot.status as never,
            vehicleId: veh[ot.vi].id, driverId: drv[ot.di].id, plannedDistanceKm: r[6] as number,
            ...(ot.status === 'in_transit' ? { actualDepartureAt: new Date(now - 3 * HOUR), odometerStart: 13000, fuelStart: 380 } : {}),
            plannedDepartureAt: dep, createdBy: dispatcher.id, organizationId: orgId,
        }).returning();
        await db.insert(tripOrders).values({ tripId: trp.id, orderId: ord.id });
        await db.update(orders).set({ tripId: trp.id }).where(eq(orders.id, ord.id));
        otherTripRows.push({ id: trp.id, status: ot.status });
    }
    // одна returned-заявка без рейса (статус returned)
    await db.insert(orders).values({
        number: `DEMO-${String(++orderSeq).padStart(5, '0')}`, contractorId: ctr[0].id, contractId: con[0].id,
        status: 'returned', cargoDescription: `${DEMO} Груз возвращён грузоотправителю`, cargoWeightKg: 3000, cargoVolumeM3: 12, cargoPlaces: 8,
        loadingAddress: 'г. Москва, ул. Складская, 5', loadingDate: ago(5), unloadingAddress: 'г. Тула, ул. Промышленная, 12', unloadingDate: ago(5), createdBy: logist.id, organizationId: orgId,
    });
    // confirmed-заявка без рейса
    await db.insert(orders).values({
        number: `DEMO-${String(++orderSeq).padStart(5, '0')}`, contractorId: ctr[1].id, contractId: con[1].id,
        status: 'confirmed', cargoDescription: `${DEMO} Напитки в ПЭТ`, cargoWeightKg: 12000, cargoVolumeM3: 40, cargoPlaces: 600,
        loadingAddress: 'г. Москва, ул. Иловайская, 2', loadingDate: new Date(now + 1 * DAY), unloadingAddress: 'г. Калуга, ул. Московская, 234', unloadingDate: new Date(now + 1 * DAY + 8 * HOUR), createdBy: dispatcher.id, organizationId: orgId,
    });

    const firstCompleted = (await db.select({ id: trips.id }).from(trips).where(and(eq(trips.organizationId, orgId), eq(trips.status, 'completed'))).limit(1))[0];
    const billedTrip = otherTripRows.find((t) => t.status === 'billed')!;
    const inTransitTrip = otherTripRows.find((t) => t.status === 'in_transit')!;

    // --- Inspections (approved + rejected) ---
    console.log('  → Осмотры (тех + мед)...');
    const tech = await db.insert(techInspections).values([
        { vehicleId: veh[0].id, mechanicId: mechanic.id, tripId: firstCompleted.id, inspectionType: 'pre_trip', checklistVersion: '1.0', items: [{ name: 'Тормозная система', result: 'ok' }, { name: 'Шины', result: 'ok' }, { name: 'Световые приборы', result: 'ok' }], decision: 'approved', signature: 'demo-mech-1', createdAt: ago(20) },
        { vehicleId: veh[3].id, mechanicId: mechanic.id, inspectionType: 'pre_trip', checklistVersion: '1.0', items: [{ name: 'Тормозная система', result: 'ok' }, { name: 'Шины', result: 'fault', comment: 'Правое заднее — трещина' }, { name: 'Световые приборы', result: 'fault', comment: 'Левый поворотник не работает' }], decision: 'rejected', comment: 'ТС не допущено.', signature: 'demo-mech-2', createdAt: ago(2) },
    ]).returning();
    const med = await db.insert(medInspections).values([
        { driverId: drv[0].id, medicId: medic.id, tripId: firstCompleted.id, inspectionType: 'pre_trip', checklistVersion: '1.0', systolicBp: 125, diastolicBp: 80, heartRate: 72, temperature: 36.6, condition: 'Удовлетворительное', alcoholTest: 'отриц.', decision: 'approved', signature: 'demo-med-1', createdAt: ago(20) },
        { driverId: drv[2].id, medicId: medic.id, inspectionType: 'pre_trip', checklistVersion: '1.0', systolicBp: 155, diastolicBp: 100, heartRate: 95, temperature: 37.2, condition: 'Повышенное АД', alcoholTest: 'отриц.', complaints: 'Головная боль', decision: 'rejected', comment: 'Не допущен.', signature: 'demo-med-2', createdAt: ago(3) },
    ]).returning();

    // --- Waybills (issued + closed) ---
    console.log('  → Путевые листы...');
    await db.insert(waybills).values([
        { number: `DEMO-WB-${String(++wbSeq).padStart(3, '0')}`, tripId: firstCompleted.id, vehicleId: veh[0].id, driverId: drv[0].id, status: 'closed', techInspectionId: tech[0].id, medInspectionId: med[0].id, mechanicSignature: 'demo-mech-1', medicSignature: 'demo-med-1', odometerOut: 45000, odometerIn: 45115, fuelOut: 80, fuelIn: 50, departureAt: ago(20), returnAt: new Date(ago(20).getTime() + 7 * HOUR), issuedAt: ago(20), closedAt: new Date(ago(20).getTime() + 8 * HOUR), issuedByName: `${DEMO} Сидорова М.А.`, issuedByPosition: 'Диспетчер', validFrom: ago(20), validTo: ago(19), transportServiceType: 'коммерческие', transportMode: 'междугородное' },
        { number: `DEMO-WB-${String(++wbSeq).padStart(3, '0')}`, tripId: inTransitTrip.id, vehicleId: veh[2].id, trailerId: trl[1].id, driverId: drv[1].id, status: 'issued', odometerOut: 12750, fuelOut: 320, departureAt: new Date(now - 3 * HOUR), issuedAt: new Date(now - 4 * HOUR), issuedByName: `${DEMO} Сидорова М.А.`, issuedByPosition: 'Диспетчер', validFrom: new Date(now - 4 * HOUR), validTo: new Date(now + 20 * HOUR), transportServiceType: 'коммерческие', transportMode: 'междугородное' },
    ]);

    // --- Repairs (все статусы) ---
    console.log('  → Ремонты...');
    await db.insert(repairRequests).values([
        { vehicleId: veh[3].id, status: 'in_progress', priority: 'high', source: 'auto_inspection', description: 'Замена шины + ремонт поворотника', inspectionId: tech[1].id, assignedTo: 'Смирнов Д.А.', workDescription: 'Шина заказана.', odometerAtRepair: 67890, createdAt: ago(2) },
        { vehicleId: veh[1].id, status: 'done', priority: 'medium', source: 'scheduled', description: 'Плановое ТО-2', assignedTo: 'Смирнов Д.А.', workDescription: 'ТО-2 выполнено.', partsUsed: [{ name: 'Масло 10W-40', quantity: 1, cost: 4500 }, { name: 'Фильтры', quantity: 3, cost: 3250 }], totalCost: 12550, odometerAtRepair: 125000, completedAt: ago(7), createdAt: ago(9) },
        { vehicleId: veh[4].id, status: 'waiting_parts', priority: 'high', source: 'driver', description: 'Отказ сцепления — ожидание запчастей', assignedTo: 'Смирнов Д.А.', createdAt: ago(1) },
        { vehicleId: veh[0].id, status: 'created', priority: 'low', source: 'driver', description: 'Скрип при торможении (задняя ось)', createdAt: new Date(now - 6 * HOUR) },
    ]);

    // --- Fines (все статусы, распределены для разброса рейтинга) ---
    console.log('  → Штрафы...');
    await db.insert(fines).values([
        { vehicleId: veh[0].id, driverId: drv[0].id, status: 'paid', violationDate: ago(15), violationType: 'Превышение скорости (20-40 км/ч)', amount: 500, resolutionNumber: '18810177260310001234', paidAt: ago(10) },
        { vehicleId: veh[1].id, driverId: drv[2].id, status: 'new', violationDate: ago(6), violationType: 'Проезд на запрещающий сигнал', amount: 1000, resolutionNumber: '18810150260318004567' },
        { vehicleId: veh[1].id, driverId: drv[2].id, status: 'confirmed', violationDate: ago(4), violationType: 'Нарушение знаков (грузовое ограничение)', amount: 5000, resolutionNumber: '18810199260321007890' },
        { vehicleId: veh[2].id, driverId: drv[1].id, status: 'appealed', violationDate: ago(8), violationType: 'Стоянка в неположенном месте', amount: 1500, resolutionNumber: '18810177260308001111' },
    ]);

    // --- Permits ---
    await db.insert(permits).values([
        { vehicleId: veh[0].id, zoneType: 'mkad', zoneName: 'МКАД', permitNumber: `${DEMO} ПР-77-001`, validFrom: new Date('2026-01-01'), validUntil: new Date('2026-12-31') },
        { vehicleId: veh[1].id, zoneType: 'ttk', zoneName: 'ТТК', permitNumber: `${DEMO} ПР-77-002`, validFrom: new Date('2026-01-01'), validUntil: new Date('2026-06-30') },
    ]);

    // --- Invoices (draft/issued/paid) ---
    console.log('  → Счета...');
    await db.insert(invoices).values([
        { number: `DEMO-СЧ-001`, contractorId: ctr[0].id, contractId: con[0].id, type: 'payment', status: 'paid_full', tripIds: [billedTrip.id], subtotal: 8250, vatAmount: 1650, total: 9900, periodStart: ago(10), periodEnd: ago(10), paidAt: ago(5) },
        { number: `DEMO-СЧ-002`, contractorId: ctr[1].id, contractId: con[1].id, type: 'payment', status: 'issued', tripIds: [], subtotal: 25000, vatAmount: 5000, total: 30000, periodStart: ago(3), periodEnd: ago(3) },
        { number: `DEMO-СЧ-003`, contractorId: ctr[0].id, contractId: con[0].id, type: 'act', status: 'draft', tripIds: [firstCompleted.id], subtotal: 5175, vatAmount: 1035, total: 6210, periodStart: ago(20), periodEnd: ago(20) },
    ]);

    // --- Incidents / claims ---
    console.log('  → Инциденты и претензии...');
    await db.insert(incidents).values([
        { type: 'tech_inspection', severity: 'medium', status: 'open', description: `${DEMO} Неисправность шины (Hyundai HD78)`, vehicleId: veh[3].id, techInspectionId: tech[1].id, blocksRelease: true, createdBy: mechanic.id, createdAt: ago(2) },
        { type: 'med_inspection', severity: 'low', status: 'resolved', description: `${DEMO} Водитель не прошёл медосмотр (АД)`, driverId: drv[2].id, medInspectionId: med[1].id, resolution: 'Повторный осмотр — допущен.', resolvedAt: ago(2), resolvedBy: medic.id, createdBy: medic.id, createdAt: ago(3) },
        { type: 'road', severity: 'critical', status: 'investigating', description: `${DEMO} Пробой колеса на трассе М4 (км 150)`, vehicleId: veh[2].id, driverId: drv[1].id, tripId: inTransitTrip.id, blocksRelease: false, createdBy: dispatcher.id, createdAt: new Date(now - 2 * HOUR) },
    ]);
    await db.insert(claims).values([
        { tripId: firstCompleted.id, contractorId: ctr[0].id, type: 'delay', status: 'open', amount: '3000', description: `${DEMO} Опоздание на выгрузку 1.5 ч`, createdBy: logist.id },
        { contractorId: ctr[1].id, type: 'damage', status: 'resolved', amount: '15000', resolvedAmount: '10000', description: `${DEMO} Повреждение упаковки (нарушение темп.режима)`, resolution: 'Компенсация 10 000 ₽.', resolvedBy: manager.id, resolvedAt: ago(8), createdBy: logist.id },
    ]);

    // --- Tachograph (РТО, на каждого водителя) ---
    console.log('  → Тахограф (РТО)...');
    const tacho = [];
    for (let d = 0; d < 4; d++) for (let day = 1; day <= 5; day++) tacho.push({ driverId: drv[d].id, date: ago(day), drivingMinutes: 300 + d * 40 + day * 10, restMinutes: 120 + day * 5, continuousDrivingMinutes: 200 + d * 20, weeklyRestMinutes: 2880 });
    await db.insert(tachographRecords).values(tacho);

    // --- Delivery confirmation / document returns ---
    await db.insert(deliveryConfirmations).values({ tripId: firstCompleted.id, recipientName: `${DEMO} Петров В.И.`, recipientPosition: 'Прораб', recipientDocument: 'Паспорт 4515 123456', photos: [], cargoCondition: 'intact', gpsLat: 54.9159, gpsLng: 37.4046, createdBy: driverUsers[0].id, confirmedAt: ago(20) });
    await db.insert(documentReturns).values([
        { tripId: firstCompleted.id, docType: 'ttn', status: 'received', receivedAt: ago(19) },
        { tripId: firstCompleted.id, docType: 'upd', status: 'pending' },
        { tripId: billedTrip.id, docType: 'act', status: 'overdue' },
    ]);

    // --- МЧД (active + expired) ---
    console.log('  → МЧД...');
    const xmlA = `<?xml version="1.0" encoding="UTF-8"?><МЧД><Номер>${DEMO} МЧД-2026-001</Номер></МЧД>`;
    const xmlB = `<?xml version="1.0" encoding="UTF-8"?><МЧД><Номер>${DEMO} МЧД-2025-042</Номер></МЧД>`;
    await db.insert(mchd).values([
        { organizationId: orgId, mchdNumber: `${DEMO} МЧД-2026-001`, granterInn: '7700000099', granterName: ORG_NAME, granterOgrn: '1027700000099', granteeFullName: `${DEMO} Иванов И.И.`, granteeInn: '500100732259', granteePassport: '4509 123456', scope: 'Подписание ЭТрН, УПД, СФ.', issuedAt: new Date('2026-01-01'), expiresAt: new Date('2027-01-01'), status: 'active', certificateXml: xmlA, certificateXmlHash: crypto.createHash('sha256').update(xmlA).digest('hex'), uploadedByUserId: admin.id, notes: 'Демо-МЧД.' },
        { organizationId: orgId, mchdNumber: `${DEMO} МЧД-2025-042`, granterInn: '7700000099', granterName: ORG_NAME, granterOgrn: '1027700000099', granteeFullName: `${DEMO} Петров П.П.`, granteeInn: '500100888312', granteePassport: '4509 765432', scope: 'Подписание ЭТрН (истёкшая).', issuedAt: new Date('2025-01-01'), expiresAt: new Date('2025-12-31'), status: 'expired', certificateXml: xmlB, certificateXmlHash: crypto.createHash('sha256').update(xmlB).digest('hex'), uploadedByUserId: admin.id, notes: 'Истёкшая демо-МЧД.' },
    ]);

    // --- Events (журнал) ---
    await db.insert(events).values([
        { authorId: dispatcher.id, authorRole: 'dispatcher', eventType: 'trip.created', entityType: 'trip', entityId: firstCompleted.id, data: { demo: true }, timestamp: ago(20), organizationId: orgId },
        { authorId: mechanic.id, authorRole: 'mechanic', eventType: 'inspection.completed', entityType: 'tech_inspection', entityId: tech[0].id, data: { decision: 'approved' }, timestamp: ago(20), organizationId: orgId },
        { authorId: logist.id, authorRole: 'logist', eventType: 'order.created', entityType: 'order', entityId: firstCompleted.id, data: { demo: true }, timestamp: ago(20), organizationId: orgId },
    ]);

    const totalTrips = await db.select({ id: trips.id }).from(trips).where(eq(trips.organizationId, orgId));
    console.log('\n✅ [ДЕМО]-стенд готов!');
    console.log(`📋 Логин (пароль = SEED_PASSWORD): demo-admin@transpult.ru (+ demo-logist/dispatcher/mechanic/medic/manager/accountant/repair/driver1..4@transpult.ru)`);
    console.log(`📊 Орг: ${ORG_NAME}`);
    console.log(`📊 ${totalTrips.length} рейсов (14 завершённых для рейтинга + planning/assigned/in_transit/billed/cancelled), заявки во всех 7 статусах, 6 ТС, 4 водителя, осмотры, путевые, ремонты, штрафы, счета, инциденты, претензии, тахограф, температура, МЧД.`);
}

async function main() {
    const mode = process.argv[2];
    if (mode === 'cleanup') await cleanup();
    else await generate();
    await sql.end();
    process.exit(0);
}
main().catch((err) => { console.error('❌ Ошибка:', err); process.exit(1); });
