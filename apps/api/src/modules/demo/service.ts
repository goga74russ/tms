// ============================================================
// Round 3B — D8: Demo data generator
// On-demand creation of a demo dataset for an organization so a
// freshly onboarded customer can immediately see what the product
// can do (analytics, map, cold-chain). Idempotent: detects existing
// demo objects by the [DEMO] naming-convention prefix.
// ============================================================
import { and, eq, like, inArray } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import {
    contractors, contracts, tariffs,
    vehicles, drivers, trailers,
    orders, trips, tripOrders,
    users, events,
} from '../../db/schema.js';
import { hashPassword } from '../../auth/auth.js';
import { randomBytes } from 'crypto';

export const DEMO_PREFIX = '[ДЕМО]';

export interface DemoDataResult {
    contractorIds: string[];
    contractIds: string[];
    tariffIds: string[];
    vehicleIds: string[];
    trailerIds: string[];
    driverIds: string[];
    tripIds: string[];
    orderIds: string[];
}

interface ExistingDemo {
    contractors: { id: string }[];
    contracts: { id: string; contractorId: string }[];
    tariffs: { id: string; contractId: string }[];
    vehicles: { id: string }[];
    trailers: { id: string }[];
    drivers: { id: string; userId: string }[];
    orders: { id: string }[];
    trips: { id: string }[];
}

async function findExisting(organizationId: string): Promise<ExistingDemo> {
    const [demoContractors, demoVehicles, demoTrailers, demoDrivers, demoOrders, demoTrips] = await Promise.all([
        db.select({ id: contractors.id })
            .from(contractors)
            .where(and(
                eq(contractors.organizationId, organizationId),
                like(contractors.name, `${DEMO_PREFIX}%`),
            )),
        db.select({ id: vehicles.id })
            .from(vehicles)
            .where(and(
                eq(vehicles.organizationId, organizationId),
                like(vehicles.make, `${DEMO_PREFIX}%`),
            )),
        db.select({ id: trailers.id })
            .from(trailers)
            .where(and(
                eq(trailers.organizationId, organizationId),
                like(trailers.plateNumber, `ДМО%`),
            )),
        db.select({ id: drivers.id, userId: drivers.userId })
            .from(drivers)
            .where(and(
                eq(drivers.organizationId, organizationId),
                like(drivers.fullName, `${DEMO_PREFIX}%`),
            )),
        db.select({ id: orders.id })
            .from(orders)
            .where(and(
                eq(orders.organizationId, organizationId),
                like(orders.number, `DEMO-%`),
            )),
        db.select({ id: trips.id })
            .from(trips)
            .where(and(
                eq(trips.organizationId, organizationId),
                like(trips.number, `DEMO-T-%`),
            )),
    ]);

    const contractorIds = demoContractors.map((c) => c.id);
    let demoContracts: { id: string; contractorId: string }[] = [];
    let demoTariffs: { id: string; contractId: string }[] = [];
    if (contractorIds.length > 0) {
        demoContracts = await db.select({ id: contracts.id, contractorId: contracts.contractorId })
            .from(contracts)
            .where(inArray(contracts.contractorId, contractorIds));
        const contractIds = demoContracts.map((c) => c.id);
        if (contractIds.length > 0) {
            demoTariffs = await db.select({ id: tariffs.id, contractId: tariffs.contractId })
                .from(tariffs)
                .where(inArray(tariffs.contractId, contractIds));
        }
    }

    return {
        contractors: demoContractors,
        contracts: demoContracts,
        tariffs: demoTariffs,
        vehicles: demoVehicles,
        trailers: demoTrailers,
        drivers: demoDrivers,
        orders: demoOrders,
        trips: demoTrips,
    };
}

function rndPlate(): string {
    // letter+3digits+letter+letter for visual uniqueness
    const letters = 'АВЕКМНОРСТУХ';
    const l = () => letters[Math.floor(Math.random() * letters.length)];
    const digits = String(Math.floor(100 + Math.random() * 900));
    return `${l()}${digits}${l()}${l()}77`;
}

function rndVin(): string {
    return 'XTA' + randomBytes(7).toString('hex').toUpperCase().slice(0, 14);
}

/**
 * Idempotent: if any demo objects already exist for this org, returns them
 * without creating duplicates.
 */
export async function generateDemoData(
    organizationId: string,
    creatorUserId: string,
): Promise<DemoDataResult & { alreadyExisted: boolean }> {
    const existing = await findExisting(organizationId);
    const existsAlready = existing.contractors.length > 0
        && existing.vehicles.length > 0
        && existing.drivers.length > 0;

    if (existsAlready) {
        return {
            alreadyExisted: true,
            contractorIds: existing.contractors.map((c) => c.id),
            contractIds: existing.contracts.map((c) => c.id),
            tariffIds: existing.tariffs.map((t) => t.id),
            vehicleIds: existing.vehicles.map((v) => v.id),
            trailerIds: existing.trailers.map((t) => t.id),
            driverIds: existing.drivers.map((d) => d.id),
            tripIds: existing.trips.map((t) => t.id),
            orderIds: existing.orders.map((o) => o.id),
        };
    }

    const result: DemoDataResult = {
        contractorIds: [], contractIds: [], tariffIds: [],
        vehicleIds: [], trailerIds: [], driverIds: [],
        tripIds: [], orderIds: [],
    };

    // 1. Contractor
    const [contractor] = await db.insert(contractors).values({
        name: `${DEMO_PREFIX} ООО Тестовый клиент`,
        // ИНН-mock — 10 digits, marked clearly as demo
        inn: '7700' + Math.floor(100000 + Math.random() * 899999).toString(),
        kpp: '770001001',
        legalAddress: 'г. Москва, ул. Демонстрационная, д. 1',
        phone: '+74951230000',
        email: 'demo@example.ru',
        organizationId,
    }).returning({ id: contractors.id });
    result.contractorIds.push(contractor.id);

    // 2. Contract + tariff
    const now = new Date();
    const [contract] = await db.insert(contracts).values({
        contractorId: contractor.id,
        number: `${DEMO_PREFIX} Договор-001`,
        startDate: new Date(now.getFullYear(), 0, 1),
        endDate: new Date(now.getFullYear() + 2, 11, 31),
        isActive: true,
    }).returning({ id: contracts.id });
    result.contractIds.push(contract.id);

    const [tariff] = await db.insert(tariffs).values({
        contractId: contract.id,
        type: 'per_km',
        ratePerKm: 25,
    }).returning({ id: tariffs.id });
    result.tariffIds.push(tariff.id);

    // 3. Vehicles (тент + рефрижератор)
    const [tent] = await db.insert(vehicles).values({
        plateNumber: rndPlate(),
        vin: rndVin(),
        make: `${DEMO_PREFIX} ГАЗ`,
        model: 'Газель NEXT',
        year: 2023,
        bodyType: 'тент',
        payloadCapacityKg: 1500,
        payloadVolumeM3: 14,
        fuelTankLiters: 80,
        fuelNormPer100Km: 14,
        currentOdometerKm: 12500,
        organizationId,
    }).returning({ id: vehicles.id });
    result.vehicleIds.push(tent.id);

    const [reefer] = await db.insert(vehicles).values({
        plateNumber: rndPlate(),
        vin: rndVin(),
        make: `${DEMO_PREFIX} Volvo`,
        model: 'FH 460',
        year: 2022,
        bodyType: 'рефрижератор',
        payloadCapacityKg: 20000,
        payloadVolumeM3: 86,
        fuelTankLiters: 600,
        fuelNormPer100Km: 32,
        currentOdometerKm: 154200,
        organizationId,
    }).returning({ id: vehicles.id });
    result.vehicleIds.push(reefer.id);

    // 4. Trailer
    const [trailer] = await db.insert(trailers).values({
        plateNumber: 'ДМО' + Math.floor(1000 + Math.random() * 8999).toString() + '77',
        vin: rndVin(),
        type: 'tent',
        make: 'Schmitz',
        model: 'Cargobull',
        year: 2022,
        payloadCapacityKg: 24000,
        payloadVolumeM3: 92,
        organizationId,
    }).returning({ id: trailers.id });
    result.trailerIds.push(trailer.id);

    // 5. Drivers — auto-create user accounts
    for (let i = 0; i < 2; i++) {
        const tempPassword = randomBytes(12).toString('hex');
        const passwordHash = await hashPassword(tempPassword);
        const fullName = i === 0 ? 'Демидов Иван Петрович' : 'Морозов Сергей Александрович';
        const [user] = await db.insert(users).values({
            email: `demo_driver_${Date.now()}_${i}@demo.local`,
            passwordHash,
            fullName: `${DEMO_PREFIX} ${fullName}`,
            roles: ['driver'],
            organizationId,
        }).returning({ id: users.id });

        const [driver] = await db.insert(drivers).values({
            userId: user.id,
            fullName: `${DEMO_PREFIX} ${fullName}`,
            birthDate: new Date(1985, 5, 15 + i),
            licenseNumber: `7799${String(100000 + i).padStart(6, '0')}`,
            licenseCategories: ['B', 'C', 'CE'],
            licenseExpiry: new Date(now.getFullYear() + 4, 5, 1),
            medCertificateExpiry: new Date(now.getFullYear() + 1, 11, 1),
            organizationId,
        }).returning({ id: drivers.id });
        result.driverIds.push(driver.id);
    }

    // 6. Completed trip (Москва → Тверь, ~170 km) — for analytics demo
    const completedDeparture = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const completedArrival = new Date(completedDeparture.getTime() + 4 * 60 * 60 * 1000);

    const [completedOrder] = await db.insert(orders).values({
        number: `DEMO-${Date.now().toString().slice(-6)}-1`,
        contractorId: contractor.id,
        contractId: contract.id,
        status: 'delivered',
        cargoDescription: 'Демо-груз: палеты с товарами',
        cargoWeightKg: 1200,
        cargoVolumeM3: 8,
        cargoPlaces: 6,
        loadingAddress: 'г. Москва, Ленинградское ш., 18',
        loadingLat: 55.8421,
        loadingLon: 37.4830,
        loadingDate: completedDeparture,
        unloadingAddress: 'г. Тверь, ул. Советская, 25',
        unloadingLat: 56.8587,
        unloadingLon: 35.9176,
        unloadingDate: completedArrival,
        organizationId,
        createdBy: creatorUserId,
    }).returning({ id: orders.id });
    result.orderIds.push(completedOrder.id);

    const [completedTrip] = await db.insert(trips).values({
        number: `DEMO-T-${Date.now().toString().slice(-6)}-1`,
        status: 'completed',
        vehicleId: tent.id,
        trailerId: trailer.id,
        driverId: result.driverIds[0],
        plannedDistanceKm: 170,
        actualDistanceKm: 173.2,
        plannedDepartureAt: completedDeparture,
        actualDepartureAt: completedDeparture,
        actualCompletionAt: completedArrival,
        odometerStart: 12000,
        odometerEnd: 12173,
        fuelStart: 70,
        fuelEnd: 35,
        organizationId,
        createdBy: creatorUserId,
    }).returning({ id: trips.id });
    result.tripIds.push(completedTrip.id);

    await db.insert(tripOrders).values({ tripId: completedTrip.id, orderId: completedOrder.id });

    // 7. Active trip (in_transit) — for live map demo, near Khimki
    const inTransitDeparture = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const [activeOrder] = await db.insert(orders).values({
        number: `DEMO-${Date.now().toString().slice(-6)}-2`,
        contractorId: contractor.id,
        contractId: contract.id,
        status: 'in_transit',
        cargoDescription: 'Демо-груз: оборудование',
        cargoWeightKg: 8500,
        cargoVolumeM3: 30,
        cargoPlaces: 12,
        loadingAddress: 'г. Москва, МКАД 84-й км',
        loadingLat: 55.9019,
        loadingLon: 37.4291,
        loadingDate: inTransitDeparture,
        unloadingAddress: 'г. Санкт-Петербург, Пулковское ш., 41',
        unloadingLat: 59.7993,
        unloadingLon: 30.2710,
        unloadingDate: new Date(inTransitDeparture.getTime() + 10 * 60 * 60 * 1000),
        organizationId,
        createdBy: creatorUserId,
    }).returning({ id: orders.id });
    result.orderIds.push(activeOrder.id);

    const [activeTrip] = await db.insert(trips).values({
        number: `DEMO-T-${Date.now().toString().slice(-6)}-2`,
        status: 'in_transit',
        vehicleId: reefer.id,
        trailerId: trailer.id,
        driverId: result.driverIds[1],
        plannedDistanceKm: 700,
        plannedDepartureAt: inTransitDeparture,
        actualDepartureAt: inTransitDeparture,
        odometerStart: 154200,
        fuelStart: 580,
        organizationId,
        createdBy: creatorUserId,
    }).returning({ id: trips.id });
    result.tripIds.push(activeTrip.id);

    await db.insert(tripOrders).values({ tripId: activeTrip.id, orderId: activeOrder.id });

    // 8. Planning order with cold-chain — for cold-chain demo
    const [planningOrder] = await db.insert(orders).values({
        number: `DEMO-${Date.now().toString().slice(-6)}-3`,
        contractorId: contractor.id,
        contractId: contract.id,
        status: 'draft',
        cargoDescription: 'Демо-груз: молочная продукция (рефрижератор)',
        cargoWeightKg: 5000,
        cargoVolumeM3: 25,
        cargoPlaces: 20,
        coldChainRequired: true,
        temperatureMinC: 2,
        temperatureMaxC: 6,
        loadingAddress: 'г. Москва, Дмитровское ш., 100',
        loadingLat: 55.9000,
        loadingLon: 37.5400,
        loadingDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        unloadingAddress: 'г. Нижний Новгород, ул. Ванеева, 12',
        unloadingLat: 56.3287,
        unloadingLon: 44.0020,
        unloadingDate: new Date(now.getTime() + 36 * 60 * 60 * 1000),
        organizationId,
        createdBy: creatorUserId,
    }).returning({ id: orders.id });
    result.orderIds.push(planningOrder.id);

    // 9. Audit event
    // P2 (код-аудит 2026-06-14): organizationId обязателен, иначе demo-событие
    // невидимо в журнале аудита (фильтруется по org, 152-ФЗ scope).
    await db.insert(events).values({
        organizationId,
        authorId: creatorUserId,
        authorRole: 'admin',
        eventType: 'demo.generated',
        entityType: 'Organization',
        entityId: organizationId,
        data: {
            contractorIds: result.contractorIds.length,
            vehicleIds: result.vehicleIds.length,
            driverIds: result.driverIds.length,
            tripIds: result.tripIds.length,
            orderIds: result.orderIds.length,
        },
    }).onConflictDoNothing();

    return { ...result, alreadyExisted: false };
}

/**
 * Cleanup all demo objects for an organization. Order matters — we delete
 * children before parents to satisfy FK constraints.
 */
export async function cleanupDemoData(
    organizationId: string,
    creatorUserId: string,
): Promise<{ deleted: Record<string, number> }> {
    const existing = await findExisting(organizationId);

    const counts: Record<string, number> = {
        tripOrders: 0, trips: 0, orders: 0, trailers: 0,
        vehicles: 0, drivers: 0, users: 0,
        tariffs: 0, contracts: 0, contractors: 0,
    };

    const tripIds = existing.trips.map((t) => t.id);
    if (tripIds.length > 0) {
        const deletedLinks = await db.delete(tripOrders)
            .where(inArray(tripOrders.tripId, tripIds))
            .returning({ id: tripOrders.id });
        counts.tripOrders = deletedLinks.length;
        const deletedTrips = await db.delete(trips)
            .where(inArray(trips.id, tripIds))
            .returning({ id: trips.id });
        counts.trips = deletedTrips.length;
    }

    const orderIds = existing.orders.map((o) => o.id);
    if (orderIds.length > 0) {
        const deletedOrders = await db.delete(orders)
            .where(inArray(orders.id, orderIds))
            .returning({ id: orders.id });
        counts.orders = deletedOrders.length;
    }

    const trailerIds = existing.trailers.map((t) => t.id);
    if (trailerIds.length > 0) {
        const deletedTrailers = await db.delete(trailers)
            .where(inArray(trailers.id, trailerIds))
            .returning({ id: trailers.id });
        counts.trailers = deletedTrailers.length;
    }

    const driverUserIds = existing.drivers.map((d) => d.userId);
    const driverIds = existing.drivers.map((d) => d.id);
    if (driverIds.length > 0) {
        const deletedDrivers = await db.delete(drivers)
            .where(inArray(drivers.id, driverIds))
            .returning({ id: drivers.id });
        counts.drivers = deletedDrivers.length;
    }
    if (driverUserIds.length > 0) {
        const deletedUsers = await db.delete(users)
            .where(inArray(users.id, driverUserIds))
            .returning({ id: users.id });
        counts.users = deletedUsers.length;
    }

    const vehicleIds = existing.vehicles.map((v) => v.id);
    if (vehicleIds.length > 0) {
        const deletedVehicles = await db.delete(vehicles)
            .where(inArray(vehicles.id, vehicleIds))
            .returning({ id: vehicles.id });
        counts.vehicles = deletedVehicles.length;
    }

    const tariffIds = existing.tariffs.map((t) => t.id);
    if (tariffIds.length > 0) {
        const deletedTariffs = await db.delete(tariffs)
            .where(inArray(tariffs.id, tariffIds))
            .returning({ id: tariffs.id });
        counts.tariffs = deletedTariffs.length;
    }

    const contractIds = existing.contracts.map((c) => c.id);
    if (contractIds.length > 0) {
        const deletedContracts = await db.delete(contracts)
            .where(inArray(contracts.id, contractIds))
            .returning({ id: contracts.id });
        counts.contracts = deletedContracts.length;
    }

    const contractorIds = existing.contractors.map((c) => c.id);
    if (contractorIds.length > 0) {
        const deletedContractors = await db.delete(contractors)
            .where(inArray(contractors.id, contractorIds))
            .returning({ id: contractors.id });
        counts.contractors = deletedContractors.length;
    }

    await db.insert(events).values({
        authorId: creatorUserId,
        authorRole: 'admin',
        eventType: 'demo.cleanup',
        entityType: 'Organization',
        entityId: organizationId,
        data: counts,
    }).onConflictDoNothing();

    return { deleted: counts };
}
