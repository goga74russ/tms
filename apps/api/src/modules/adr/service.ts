// ============================================================
// Wave 5 — ADR / hazmat (опасные грузы) compatibility checks.
// Локализованные сообщения на русском (см. ТЗ).
// ============================================================
import { db } from '../../db/connection.js';
import { orders, drivers, vehicles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

export interface AdrValidationResult {
    ok: boolean;
    errors: string[];
    /** ADR-класс заявки (если есть) */
    adrClass?: string | null;
    /** UN номер */
    adrUnNumber?: string | null;
}

/**
 * Проверяет совместимость заявки/ТС/водителя для перевозки опасных грузов.
 *
 * Если у заявки нет adr_class — считаем перевозку не-опасной, валидация
 * проходит автоматически.
 *
 * Ошибки (RU):
 *  • "Водитель не имеет действующего ADR-свидетельства"
 *  • "ADR-сертификат водителя истёк"
 *  • "ТС не оборудовано для ADR-перевозок"
 */
export async function validateAdrCompatibility(
    orderId: string,
    vehicleId: string,
    driverId: string,
    nowDate: Date = new Date(),
): Promise<AdrValidationResult> {
    const [order] = await db
        .select({
            id: orders.id,
            adrClass: orders.adrClass,
            adrUnNumber: orders.adrUnNumber,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

    if (!order) {
        return { ok: false, errors: ['Заявка не найдена'] };
    }

    // Не-опасный груз — валидация не требуется
    if (!order.adrClass) {
        return {
            ok: true,
            errors: [],
            adrClass: null,
            adrUnNumber: order.adrUnNumber ?? null,
        };
    }

    const errors: string[] = [];

    const [vehicle] = await db
        .select({ id: vehicles.id, adrEquipped: vehicles.adrEquipped })
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1);

    const [driver] = await db
        .select({
            id: drivers.id,
            adrCertificateExpiry: drivers.adrCertificateExpiry,
        })
        .from(drivers)
        .where(eq(drivers.id, driverId))
        .limit(1);

    if (!driver) {
        errors.push('Водитель не найден');
    } else if (!driver.adrCertificateExpiry) {
        errors.push('Водитель не имеет действующего ADR-свидетельства');
    } else if (new Date(driver.adrCertificateExpiry) < nowDate) {
        errors.push('ADR-сертификат водителя истёк');
    }

    if (!vehicle) {
        errors.push('ТС не найдено');
    } else if (!vehicle.adrEquipped) {
        errors.push('ТС не оборудовано для ADR-перевозок');
    }

    return {
        ok: errors.length === 0,
        errors,
        adrClass: order.adrClass,
        adrUnNumber: order.adrUnNumber ?? null,
    };
}
