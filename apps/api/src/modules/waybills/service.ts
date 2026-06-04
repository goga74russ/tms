// ============================================================
// Waybills Service - lifecycle before inspections (Sprint 9)
// ============================================================
import { db } from '../../db/connection.js';
import { waybills, trips, vehicles, drivers, techInspections, medInspections, incidents, routePoints, users, orders } from '../../db/schema.js';
import { recordEvent } from '../../events/journal.js';
import { eq, and, gte, lte, desc, count, sql, inArray, ilike, like } from 'drizzle-orm';
import { OrderStatus, TripStatus, WaybillStatus } from '@tms/shared';
import { getBusinessDayBounds } from '../../utils/timezone.js';
import { getBlockingIncidents, getIncompleteRoutePoints, lockRowForUpdate } from '../../utils/db-helpers.js';
import { containsLikePattern } from '../../utils/search.js';
import { buildReadinessSnapshot } from '../trips/service.js';
import { validateOdometerReadings } from './lifecycle.js';

type WaybillVehicleProfile = 'passenger' | 'cargo' | 'special';

interface WaybillDomainProfile {
    profile: WaybillVehicleProfile;
    profileLabel: string;
    transportServiceType: string;
    transportMode: string;
    markers: string[];
    requiredFields: string[];
    warnings: string[];
    readinessLabel: string;
}

function buildWaybillDomainSnapshot(params: {
    trip?: { plannedDistanceKm?: number | null; trailerId?: string | null; number?: string | null } | null;
    vehicle?: { bodyType?: string | null; payloadCapacityKg?: number | null; plateNumber?: string | null } | null;
}) {
    return buildWaybillDomainProfile({
        trip: {
            plannedDistanceKm: params.trip?.plannedDistanceKm ?? null,
            trailerId: params.trip?.trailerId ?? null,
            number: params.trip?.number ?? null,
        },
        vehicle: params.vehicle ?? null,
    });
}

async function refreshTransportDocumentsForTrip(tripId: string, createdBy?: string | null) {
    try {
        const { syncTransportDocumentsForTrip } = await import('../trips/transport-documents-store.js');
        return await syncTransportDocumentsForTrip(tripId, createdBy ?? null);
    } catch {
        return null;
    }
}

function normalizeBodyType(value?: string | null) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function inferWaybillVehicleProfile(vehicle: {
    bodyType?: string | null;
    payloadCapacityKg?: number | null;
}): WaybillVehicleProfile | null {
    const bodyType = normalizeBodyType(vehicle.bodyType);

    if (!bodyType) return null;

    if ([
        'седан',
        'универсал',
        'кроссовер',
        'минивэн',
        'легковой',
    ].some(token => bodyType.includes(token))) {
        return 'passenger';
    }

    if ([
        'эвакуатор',
        'манипулятор',
        'кран',
        'погрузчик',
        'спец',
    ].some(token => bodyType.includes(token))) {
        return 'special';
    }

    if ([
        'тент',
        'борт',
        'фургон',
        'рефрижератор',
        'цистерна',
        'контейнеровоз',
        'самосвал',
        'тягач',
        'груз',
        'полуприцеп',
        'прицеп',
    ].some(token => bodyType.includes(token))) {
        return 'cargo';
    }

    return null;
}

function inferTransportMode(trip: { plannedDistanceKm?: number | null; trailerId?: string | null }, profile: WaybillVehicleProfile) {
    const distance = typeof trip.plannedDistanceKm === 'number' ? trip.plannedDistanceKm : null;
    if (distance !== null) {
        if (distance <= 80) return 'городское';
        if (distance <= 300) return 'пригородное';
    }

    if (profile === 'special') return 'специальное';
    if (trip.trailerId) return 'междугородное';
    return 'междугородное';
}

function buildWaybillProfileReadiness(profile: WaybillVehicleProfile, state: {
    trip: { trailerId?: string | null };
}) {
    const requiredFields = [
        'тип ТС',
        'водитель',
        'техосмотр',
        'медосмотр',
        'ПЛ',
    ];
    const warnings: string[] = [];

    if (state.trip.trailerId) {
        requiredFields.push('прицеп');
    }

    if (profile === 'special') {
        requiredFields.push('допуск спецтехники');
        warnings.push('Спецтехника требует ручной проверки состава и допуска перед выпуском');
    } else if (profile === 'passenger' && state.trip.trailerId) {
        warnings.push('Легковой профиль с прицепом нужно показывать как автопоезд');
    } else if (profile === 'cargo' && !state.trip.trailerId) {
        warnings.push('Грузовой профиль без прицепа выпускается как одиночный состав');
    }

    return {
        requiredFields,
        warnings,
        readinessLabel: warnings.length > 0 ? 'Требует проверки' : 'Готов к выпуску',
    };
}

function buildWaybillDomainProfile(state: {
    trip: { plannedDistanceKm?: number | null; trailerId?: string | null; number?: string | null };
    vehicle?: { bodyType?: string | null; payloadCapacityKg?: number | null; plateNumber?: string | null } | null;
}) {
    const profile: WaybillVehicleProfile = inferWaybillVehicleProfile({
        bodyType: state.vehicle?.bodyType,
        payloadCapacityKg: state.vehicle?.payloadCapacityKg,
    }) ?? 'cargo'; // fallback to cargo for unknown body types

    const unknownBodyType = inferWaybillVehicleProfile({
        bodyType: state.vehicle?.bodyType,
        payloadCapacityKg: state.vehicle?.payloadCapacityKg,
    }) === null;

    const transportMode = inferTransportMode(state.trip, profile);
    const transportServiceType = profile === 'special'
        ? 'специальные'
        : profile === 'passenger'
            ? 'служебные'
            : 'коммерческие';
    const profileLabel = profile === 'special'
        ? 'Спецтехника'
        : profile === 'passenger'
            ? 'Легковой профиль'
            : 'Грузовой профиль';
    const markers = [
        profileLabel,
        `Режим: ${transportMode}`,
        `Назначение: ${transportServiceType}`,
    ];
    const readiness = buildWaybillProfileReadiness(profile, state);

    if (state.trip.trailerId) {
        markers.push('Автопоезд');
    }

    if (unknownBodyType) {
        markers.push('⚠️ Тип ТС не распознан — профиль по умолчанию: грузовой');
        readiness.warnings.push(`Тип кузова "${state.vehicle?.bodyType ?? 'не указан'}" не распознан. Используется грузовой профиль по умолчанию.`);
    }

    return {
        profile,
        profileLabel,
        transportMode,
        transportServiceType,
        markers,
        requiredFields: readiness.requiredFields,
        warnings: readiness.warnings,
        readinessLabel: readiness.readinessLabel,
    } satisfies WaybillDomainProfile;
}

async function generateWaybillNumber(tx: any): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `WB-${year}-`;

    const [lastWaybill] = await tx
        .select({ number: waybills.number })
        .from(waybills)
        .where(like(waybills.number, `${prefix}%`))
        .orderBy(desc(waybills.number))
        .limit(1)
        .for('update');

    let nextNum = 1;
    if (lastWaybill) {
        const lastNum = parseInt(lastWaybill.number.replace(prefix, ''), 10);
        nextNum = lastNum + 1;
    }

    return `${prefix}${String(nextNum).padStart(5, '0')}`;
}

async function getTodayApprovedTechInspection(vehicleId: string) {
    const { todayStart, todayEnd } = getBusinessDayBounds();
    const [inspection] = await db
        .select({ id: techInspections.id, signature: techInspections.signature })
        .from(techInspections)
        .where(and(
            eq(techInspections.vehicleId, vehicleId),
            eq(techInspections.decision, 'approved'),
            eq(techInspections.inspectionType, 'pre_trip'),
            gte(techInspections.createdAt, todayStart),
            lte(techInspections.createdAt, todayEnd),
        ))
        .orderBy(desc(techInspections.createdAt))
        .limit(1);

    return inspection ?? null;
}

async function getTodayApprovedMedInspection(driverId: string) {
    const { todayStart, todayEnd } = getBusinessDayBounds();
    const [inspection] = await db
        .select({ id: medInspections.id, signature: medInspections.signature })
        .from(medInspections)
        .where(and(
            eq(medInspections.driverId, driverId),
            eq(medInspections.decision, 'approved'),
            eq(medInspections.inspectionType, 'pre_trip'),
            gte(medInspections.createdAt, todayStart),
            lte(medInspections.createdAt, todayEnd),
        ))
        .orderBy(desc(medInspections.createdAt))
        .limit(1);

    return inspection ?? null;
}

async function syncOrdersForIssuedWaybill(
    tx: any,
    tripId: string,
    authorId?: string,
    authorRole?: string,
) {
    const linkedOrders = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(and(
            eq(orders.tripId, tripId),
            eq(orders.status, OrderStatus.CONFIRMED),
        ));

    for (const order of linkedOrders) {
        await tx
            .update(orders)
            .set({ status: OrderStatus.ASSIGNED, updatedAt: new Date() })
            .where(eq(orders.id, order.id));

        if (authorId && authorRole) {
            await recordEvent({
                authorId,
                authorRole,
                eventType: 'order.assigned',
                entityType: 'order',
                entityId: order.id,
                data: {
                    tripId,
                    previousStatus: order.status,
                    newStatus: OrderStatus.ASSIGNED,
                    source: 'waybill_issued',
                },
            }, tx);
        }
    }
}

async function getTripPreTripState(tripId: string) {
    const [trip] = await db
        .select()
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

    if (!trip) {
        throw new Error('Trip not found');
    }

    if (!trip.vehicleId || !trip.driverId) {
        throw new Error('Trip has no assigned vehicle or driver');
    }

    const [vehicle] = await db
        .select({
            currentOdometerKm: vehicles.currentOdometerKm,
            maintenanceNextKm: vehicles.maintenanceNextKm,
            techInspectionExpiry: vehicles.techInspectionExpiry,
            osagoExpiry: vehicles.osagoExpiry,
            maintenanceNextDate: vehicles.maintenanceNextDate,
            tachographCalibrationExpiry: vehicles.tachographCalibrationExpiry,
            status: vehicles.status,
            plateNumber: vehicles.plateNumber,
            bodyType: vehicles.bodyType,
            payloadCapacityKg: vehicles.payloadCapacityKg,
            payloadVolumeM3: vehicles.payloadVolumeM3,
        })
        .from(vehicles)
        .where(eq(vehicles.id, trip.vehicleId))
        .limit(1);

    const [driver] = await db
        .select({
            id: drivers.id,
            fullName: drivers.fullName,
            isActive: drivers.isActive,
            licenseExpiry: drivers.licenseExpiry,
            medCertificateExpiry: drivers.medCertificateExpiry,
        })
        .from(drivers)
        .where(eq(drivers.id, trip.driverId))
        .limit(1);

    const [techInspection, medInspection, blockingIncidents] = await Promise.all([
        getTodayApprovedTechInspection(trip.vehicleId),
        getTodayApprovedMedInspection(trip.driverId),
        getBlockingIncidents({ tripId, vehicleId: trip.vehicleId, driverId: trip.driverId }),
    ]);

    const hasTechApproval = !!techInspection;
    const hasMedApproval = !!medInspection;
    const hasBlockingIncidents = blockingIncidents.length > 0;
    const readiness = buildReadinessSnapshot({ vehicle, driver, trip, blockingIncidents });

    let status: 'draft' | 'medical_check' | 'technical_check' | 'issued';
    if (hasTechApproval && hasMedApproval && !hasBlockingIncidents) {
        status = 'issued';
    } else if (hasTechApproval) {
        status = 'medical_check';
    } else if (hasMedApproval) {
        status = 'technical_check';
    } else {
        status = 'draft';
    }

    return {
        trip,
        vehicle,
        techInspection,
        medInspection,
        blockingIncidents,
        readiness,
        status,
    };
}

export async function syncWaybillStateForTrip(
    tripId: string,
    authorId?: string,
    authorRole?: string,
) {
    const state = await getTripPreTripState(tripId);

    const updatedWaybill = await db.transaction(async (tx) => {
        const [tripLocked] = await lockRowForUpdate(tx.select().from(trips).where(eq(trips.id, tripId)).limit(1));
        if (!tripLocked) {
            return null;
        }

        const [existingWaybill] = await lockRowForUpdate(
            tx
                .select()
                .from(waybills)
                .where(eq(waybills.tripId, tripId))
                .limit(1)
        );

        if (!existingWaybill) {
            return null;
        }

        const wasIssued = existingWaybill.status === 'issued';
        const issueNow = state.status === 'issued';
        const departureAt = issueNow ? (existingWaybill.departureAt ?? new Date()) : null;

        const [updatedWaybill] = await tx.update(waybills)
            .set({
                status: state.status,
                techInspectionId: state.techInspection?.id ?? null,
                medInspectionId: state.medInspection?.id ?? null,
                mechanicSignature: state.techInspection?.signature ?? null,
                medicSignature: state.medInspection?.signature ?? null,
                trailerId: state.trip.trailerId ?? null,
                departureAt,
                odometerOut: existingWaybill.odometerOut ?? state.vehicle?.currentOdometerKm ?? 0,
            })
            .where(eq(waybills.id, existingWaybill.id))
            .returning();

        if (issueNow && !wasIssued) {
            await tx.update(trips)
                .set({
                    waybillId: updatedWaybill.id,
                    status: 'waybill_issued',
                    odometerStart: state.vehicle?.currentOdometerKm ?? 0,
                    updatedAt: new Date(),
                })
                .where(eq(trips.id, tripId));

            if (authorId && authorRole) {
                await recordEvent({
                    authorId,
                    authorRole,
                    eventType: 'trip.waybill_issued',
                    entityType: 'trip',
                    entityId: tripId,
                    data: { waybillId: updatedWaybill.id, number: updatedWaybill.number },
                }, tx);
            }
        }

        if (issueNow) {
            await syncOrdersForIssuedWaybill(tx, tripId, authorId, authorRole);
        }

        return updatedWaybill;
    });

    await refreshTransportDocumentsForTrip(tripId, authorId ?? null);
    return updatedWaybill;
}

export async function generateWaybill(
    tripId: string,
    authorId: string,
    authorRole: string,
) {
    const state = await getTripPreTripState(tripId);

    // ============================================================
    // Gap 1 (docs/legal/subcontract-legal-analysis.md §1) — ПЛ-gating.
    // Путевой лист оформляет ЭКСПЛУАТАНТ ТС (ст. 6 ч. 2 ФЗ-259), не владелец.
    // При наёмном транспорте (execution_mode='subcontract') эксплуатант —
    // подрядчик: он проводит медосмотр, техконтроль, выпуск на линию.
    // Генерируя ПЛ на чужое ТС от нашего ЮЛ, мы создали бы недействительный
    // документ + взяли ответственность за медосмотр, который не проводили
    // (ст. 11.32, 12.31.1 КоАП).
    //
    // MVP-fallback (до реализации полной 5-модовой модели + we_operate_vehicle):
    // блокируем автогенерацию ПЛ для subcontract. Подрядчик оформляет ПЛ сам.
    // TODO(W5+): расширить execution_mode и разрешить ПЛ для own/rent_without_crew.
    if (state.trip.executionMode === 'subcontract') {
        throw Object.assign(
            new Error(
                'Путевой лист оформляет подрядчик-эксплуатант ТС (наёмный рейс). '
                + 'Запросите ПЛ у подрядчика и приложите к досье рейса. '
                + 'См. docs/legal/subcontract-legal-analysis.md §1.',
            ),
            { statusCode: 422, code: 'SUBCONTRACT_WAYBILL_BLOCKED' },
        );
    }

    if ([TripStatus.IN_TRANSIT, TripStatus.COMPLETED, TripStatus.BILLED, TripStatus.CANCELLED].includes(state.trip.status as any)) {
        throw new Error(`Waybill cannot be generated for trip status ${state.trip.status}`);
    }

    if (!state.readiness.canDispatch) {
        const message = state.readiness.hardIssues.map((issue) => issue.message).join('; ');
        throw new Error(`Waybill readiness blocked: ${message}`);
    }

    const domainProfile = buildWaybillDomainProfile(state);

    const [existingWaybill] = await db
        .select()
        .from(waybills)
        .where(eq(waybills.tripId, tripId))
        .limit(1);

    if (existingWaybill) {
        if (existingWaybill.status === 'closed') {
            throw Object.assign(new Error(`Waybill already closed: ${existingWaybill.number}`), { statusCode: 409 });
        }

        const synced = await syncWaybillStateForTrip(tripId, authorId, authorRole);
        if (!synced) {
            throw new Error('Failed to sync existing waybill');
        }
        return synced;
    }

    const created = await db.transaction(async (tx) => {
        const [tripLocked] = await lockRowForUpdate(tx.select().from(trips).where(eq(trips.id, tripId)).limit(1));
        if (!tripLocked) throw new Error('Trip not found');

        const [existingWaybillTx] = await lockRowForUpdate(tx.select().from(waybills).where(eq(waybills.tripId, tripId)).limit(1));
        if (existingWaybillTx) {
            return existingWaybillTx;
        }

        const number = await generateWaybillNumber(tx);
        const issuedAt = new Date();
        const validFrom = issuedAt;
        const [issuerUser] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, authorId)).limit(1);
        const issuerName = issuerUser?.fullName ?? authorId;
        const issuerPosition = authorRole === 'dispatcher' ? 'Диспетчер' : 'Ответственный за выпуск';
        const validTo = new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000);
        const [waybill] = await tx.insert(waybills).values({
            number,
            tripId,
            vehicleId: state.trip.vehicleId!,
            trailerId: state.trip.trailerId ?? null,
            driverId: state.trip.driverId!,
            status: WaybillStatus.DRAFT,
            techInspectionId: null,
            medInspectionId: null,
            mechanicSignature: null,
            medicSignature: null,
            odometerOut: state.vehicle?.currentOdometerKm ?? 0,
            departureAt: null,
            issuedByName: issuerName,
            issuedByPosition: issuerPosition,
            validFrom,
            validTo,
            transportServiceType: domainProfile.transportServiceType,
            transportMode: domainProfile.transportMode,
        }).returning();

        await tx.update(trips)
            .set({
                waybillId: waybill.id,
                status: 'waybill_draft',
                updatedAt: new Date(),
            })
            .where(eq(trips.id, tripId));

        await recordEvent({
            authorId,
            authorRole,
            eventType: 'document.created',
            entityType: 'waybill',
            entityId: waybill.id,
            data: {
                number: waybill.number,
                tripId: waybill.tripId,
                status: waybill.status,
                profile: domainProfile.profile,
                profileLabel: domainProfile.profileLabel,
                markers: domainProfile.markers,
                requiredFields: domainProfile.requiredFields,
                warnings: domainProfile.warnings,
                readinessLabel: domainProfile.readinessLabel,
                transportServiceType: domainProfile.transportServiceType,
                transportMode: domainProfile.transportMode,
            },
        }, tx);

        return waybill;
    });

    if (created.tripId !== tripId) {
        const synced = await syncWaybillStateForTrip(tripId, authorId, authorRole);
        if (!synced) {
            throw new Error('Failed to sync existing waybill');
        }
        await refreshTransportDocumentsForTrip(tripId, authorId);
        return synced;
    }

    if (state.status === 'draft') {
        await refreshTransportDocumentsForTrip(tripId, authorId);
        return created;
    }

    const synced = await syncWaybillStateForTrip(tripId, authorId, authorRole);
    await refreshTransportDocumentsForTrip(tripId, authorId);
    return synced ?? created;
}

export async function closeWaybill(
    waybillId: string,
    data: {
        odometerIn: number;
        fuelIn?: number;
        returnAt?: string;
    },
    authorId: string,
    authorRole: string,
) {
    const [waybill] = await db
        .select()
        .from(waybills)
        .where(eq(waybills.id, waybillId))
        .limit(1);

    if (!waybill) {
        throw new Error('Waybill not found');
    }

    if (waybill.status !== 'issued') {
        throw new Error('Only issued waybills can be closed');
    }

    {
        // C9: раньше throw'или ТОЛЬКО на 'rollback'. invalid_value (negative/NaN)
        // и unrealistic_delta (>5000км) проходили и писались в vehicles.currentOdometerKm.
        const validation = validateOdometerReadings(waybill.odometerOut ?? 0, data.odometerIn);
        if (!validation.ok) {
            throw new Error(validation.message ?? 'Некорректные показания одометра');
        }
    }

    const incompleteRoutePoints = await getIncompleteRoutePoints(waybill.tripId);
    if (incompleteRoutePoints.length > 0) {
        throw new Error('Cannot close waybill until all route points are completed');
    }

    const returnTime = data.returnAt ? new Date(data.returnAt) : new Date();

    const updated = await db.transaction(async (tx) => {
        const [lockedWaybill] = typeof tx.select === 'function'
            ? await lockRowForUpdate(tx.select().from(waybills).where(eq(waybills.id, waybillId)).limit(1))
            : [waybill];

        if (!lockedWaybill) {
            throw new Error('Waybill not found');
        }

        if (lockedWaybill.status !== 'issued') {
            throw new Error('Only issued waybills can be closed');
        }

        {
            // C9: см. выше — авторитетная проверка под FOR UPDATE, throw на любой !ok.
            const validation = validateOdometerReadings(lockedWaybill.odometerOut ?? 0, data.odometerIn);
            if (!validation.ok) {
                throw new Error(validation.message ?? 'Некорректные показания одометра');
            }
        }

        const [result] = await tx.update(waybills)
            .set({
                status: 'closed',
                odometerIn: data.odometerIn,
                fuelIn: data.fuelIn,
                returnAt: returnTime,
                closedAt: new Date(),
            })
            .where(eq(waybills.id, waybillId))
            .returning();

        await tx.update(vehicles)
            .set({
                currentOdometerKm: data.odometerIn,
                updatedAt: new Date(),
            })
            .where(eq(vehicles.id, lockedWaybill.vehicleId));

        await tx.update(trips)
            .set({
                odometerEnd: data.odometerIn,
                fuelEnd: data.fuelIn,
                actualCompletionAt: returnTime,
                updatedAt: new Date(),
            })
            .where(eq(trips.id, lockedWaybill.tripId));

        await recordEvent({
            authorId,
            authorRole,
            eventType: 'document.signed',
            entityType: 'waybill',
            entityId: waybillId,
            data: {
                action: 'closed',
                odometerIn: data.odometerIn,
                fuelIn: data.fuelIn,
                returnAt: returnTime.toISOString(),
            },
        }, tx);

        return result;
    });

    await refreshTransportDocumentsForTrip(waybill.tripId, authorId);
    return updated;
}

export async function listWaybills(page = 1, limit = 20, driverId?: string, filters?: { status?: string; search?: string; organizationId?: string | null }) {
    const offset = (page - 1) * limit;
    const parts: ReturnType<typeof eq>[] = [];
    if (driverId) parts.push(eq(waybills.driverId, driverId));
    if (filters?.status) parts.push(eq(waybills.status, filters.status as any));
    if (filters?.organizationId) {
        parts.push(
            inArray(waybills.vehicleId, db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.organizationId, filters.organizationId)))
        );
    }
    if (filters?.search) parts.push(ilike(waybills.number, containsLikePattern(filters.search)));
    const conditions = parts.length > 0 ? and(...parts) : undefined;

    const [totalResult] = await db
        .select({ count: count() })
        .from(waybills)
        .where(conditions);

    const items = await db
        .select({
            id: waybills.id,
            number: waybills.number,
            tripId: waybills.tripId,
            vehicleId: waybills.vehicleId,
            driverId: waybills.driverId,
            techInspectionId: waybills.techInspectionId,
            medInspectionId: waybills.medInspectionId,
            status: waybills.status,
            odometerOut: waybills.odometerOut,
            odometerIn: waybills.odometerIn,
            fuelIn: waybills.fuelIn,
            departureAt: waybills.departureAt,
            returnAt: waybills.returnAt,
            issuedAt: waybills.issuedAt,
            closedAt: waybills.closedAt,
            mechanicSignature: waybills.mechanicSignature,
            medicSignature: waybills.medicSignature,
            vehiclePlate: vehicles.plateNumber,
            vehicleMake: vehicles.make,
            vehicleModel: vehicles.model,
            vehicleBodyType: vehicles.bodyType,
            vehiclePayloadCapacityKg: vehicles.payloadCapacityKg,
            driverName: drivers.fullName,
            driverLicenseNumber: drivers.licenseNumber,
            tripNumber: trips.number,
            tripStatus: trips.status,
            tripTrailerId: trips.trailerId,
            tripPlannedDistanceKm: trips.plannedDistanceKm,
        })
        .from(waybills)
        .leftJoin(vehicles, eq(waybills.vehicleId, vehicles.id))
        .leftJoin(drivers, eq(waybills.driverId, drivers.id))
        .leftJoin(trips, eq(waybills.tripId, trips.id))
        .where(conditions)
        .orderBy(desc(waybills.issuedAt))
        .limit(limit)
        .offset(offset);

    const data = items.map((item) => ({
        ...item,
        domainProfile: buildWaybillDomainSnapshot({
            trip: {
                number: item.tripNumber,
                trailerId: item.tripTrailerId,
                plannedDistanceKm: item.tripPlannedDistanceKm,
            },
            vehicle: {
                plateNumber: item.vehiclePlate,
                bodyType: item.vehicleBodyType,
                payloadCapacityKg: item.vehiclePayloadCapacityKg,
            },
        }),
    }));

    return {
        data,
        total: totalResult.count,
        page,
        limit,
    };
}

export async function getWaybillById(id: string) {
    const [waybill] = await db
        .select()
        .from(waybills)
        .where(eq(waybills.id, id))
        .limit(1);

    if (!waybill) return null;

    const [vehicle] = await db
        .select({
            plateNumber: vehicles.plateNumber,
            make: vehicles.make,
            model: vehicles.model,
            bodyType: vehicles.bodyType,
            payloadCapacityKg: vehicles.payloadCapacityKg,
        })
        .from(vehicles)
        .where(eq(vehicles.id, waybill.vehicleId))
        .limit(1);

    const [driver] = await db
        .select({
            fullName: drivers.fullName,
            licenseNumber: drivers.licenseNumber,
        })
        .from(drivers)
        .where(eq(drivers.id, waybill.driverId))
        .limit(1);

    const [trip] = await db
        .select({
            number: trips.number,
            status: trips.status,
            trailerId: trips.trailerId,
            plannedDistanceKm: trips.plannedDistanceKm,
        })
        .from(trips)
        .where(eq(trips.id, waybill.tripId))
        .limit(1);

    return {
        ...waybill,
        vehicle,
        driver,
        trip,
        domainProfile: buildWaybillDomainSnapshot({ trip, vehicle }),
    };
}









