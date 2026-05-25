// ============================================================
// I2 — Volume capacity check (кубы).
//
// Проверка что суммарный объём грузов (Σ orders.cargoVolumeM3)
// помещается в Vehicle + Trailer (.payloadVolumeM3 каждый).
//
// Поля nullable намеренно — если capacity не указана в ТС или
// объём не указан в заявке, проверка пропускается (skipReason).
// Это совместимо с legacy-данными до того как ввели поле.
//
// Поведение при overflow (см. partner-discussion 2026-05-25):
//   • API возвращает overflow:true с дельтой
//   • Caller решает: hard-block (400) или warning+forceOverflow=true
//   • При override пишется event в журнал — audit trail
// ============================================================
import { eq, inArray, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/connection.js';
import { vehicles, trailers, orders, tripOrders, trips } from '../../db/schema.js';

export interface VolumeCheckResult {
    /** Сумма capacity vehicle+trailer. NULL если capacity нигде не указана. */
    capacityVolumeM3: number | null;
    /** Сумма заявленных объёмов заявок (NULL-volume-заявки пропущены). */
    requiredVolumeM3: number;
    /** true если requiredVolume > capacity (capacity не NULL). */
    overflow: boolean;
    /** Положительное число = на сколько м³ перегруз. 0 если нет. */
    overflowAmount: number;
    /** Причина пропуска проверки (если есть). */
    skipReason: 'no_vehicle' | 'no_capacity_data' | null;
    /** Сколько заявок учтено (с заполненным cargoVolumeM3). */
    ordersChecked: number;
    /** Сколько заявок пропущено (cargoVolumeM3 = NULL). */
    ordersSkipped: number;
}

type DbLike = typeof defaultDb;

/**
 * Считает проверку объёма для existing trip (по trip.id, vehicle/trailer
 * берутся с самого trip + заявки через tripOrders).
 */
export async function computeTripVolumeCheck(
    tripId: string,
    tx: DbLike = defaultDb,
): Promise<VolumeCheckResult> {
    const [trip] = await tx
        .select({
            vehicleId: trips.vehicleId,
            trailerId: trips.trailerId,
        })
        .from(trips)
        .where(eq(trips.id, tripId))
        .limit(1);

    if (!trip) {
        return emptyResult({ skipReason: 'no_vehicle', requiredVolumeM3: 0 });
    }

    const orderIds = (
        await tx
            .select({ orderId: tripOrders.orderId })
            .from(tripOrders)
            .where(eq(tripOrders.tripId, tripId))
    ).map((r) => r.orderId);

    return computeVolumeCheckFromIds(trip.vehicleId, trip.trailerId, orderIds, tx);
}

/**
 * Считает проверку для произвольной комбинации vehicle/trailer/orders.
 * Используется при создании трипа (когда trip ещё не существует) и
 * при assign (когда vehicle/trailer меняется, а trip уже создан).
 */
export async function computeVolumeCheckFromIds(
    vehicleId: string | null | undefined,
    trailerId: string | null | undefined,
    orderIds: string[],
    tx: DbLike = defaultDb,
): Promise<VolumeCheckResult> {
    if (!vehicleId) {
        return emptyResult({ skipReason: 'no_vehicle', requiredVolumeM3: 0 });
    }

    // Capacity: vehicle + опционально trailer.
    const [veh] = await tx
        .select({ cap: vehicles.payloadVolumeM3 })
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1);
    const vehCap = veh?.cap ?? null;

    let trlCap: number | null = null;
    if (trailerId) {
        const [trl] = await tx
            .select({ cap: trailers.payloadVolumeM3 })
            .from(trailers)
            .where(eq(trailers.id, trailerId))
            .limit(1);
        trlCap = trl?.cap ?? null;
    }

    // Если ни vehicle, ни trailer capacity не указаны — нечего проверять.
    const hasAnyCap = vehCap != null || trlCap != null;
    if (!hasAnyCap) {
        return emptyResult({ skipReason: 'no_capacity_data', requiredVolumeM3: 0 });
    }

    const capacityVolumeM3 = (vehCap ?? 0) + (trlCap ?? 0);

    // Сумма cargoVolumeM3 по заявкам. NULL пропускаются (treat as 0).
    let requiredVolumeM3 = 0;
    let ordersChecked = 0;
    let ordersSkipped = 0;

    if (orderIds.length > 0) {
        const rows = await tx
            .select({
                volume: orders.cargoVolumeM3,
            })
            .from(orders)
            .where(inArray(orders.id, orderIds));

        for (const row of rows) {
            if (row.volume == null) {
                ordersSkipped += 1;
            } else {
                requiredVolumeM3 += row.volume;
                ordersChecked += 1;
            }
        }
    }

    const overflow = requiredVolumeM3 > capacityVolumeM3;
    const overflowAmount = overflow ? requiredVolumeM3 - capacityVolumeM3 : 0;

    return {
        capacityVolumeM3,
        requiredVolumeM3: roundM3(requiredVolumeM3),
        overflow,
        overflowAmount: roundM3(overflowAmount),
        skipReason: null,
        ordersChecked,
        ordersSkipped,
    };
}

function emptyResult(over: Partial<VolumeCheckResult>): VolumeCheckResult {
    return {
        capacityVolumeM3: null,
        requiredVolumeM3: 0,
        overflow: false,
        overflowAmount: 0,
        skipReason: null,
        ordersChecked: 0,
        ordersSkipped: 0,
        ...over,
    };
}

function roundM3(v: number): number {
    return Math.round(v * 100) / 100;
}

/**
 * Помощник для error-сообщения при overflow.
 */
export function formatOverflowMessage(check: VolumeCheckResult): string {
    return `Перегруз по объёму: ${check.requiredVolumeM3} м³ при вместимости ${check.capacityVolumeM3} м³ (превышение +${check.overflowAmount} м³). ` +
        `Передайте forceOverflow=true чтобы продавить с записью в журнал.`;
}
