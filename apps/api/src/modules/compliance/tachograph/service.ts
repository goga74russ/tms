// ============================================================
// Tachograph DDD ingestion service.
// Bridges parseDddBuffer() to the existing `tachograph_records`
// table and an audit log in `tachograph_uploads`.
// ============================================================
import { eq, and } from 'drizzle-orm';
import { db } from '../../../db/connection.js';
import {
    drivers, tachographRecords, tachographUploads,
} from '../../../db/schema.js';
import {
    parseDddBuffer, aggregateToDailyRecords,
    type DddParseResult,
} from './ddd-parser.js';

export interface IngestResult {
    parsed: DddParseResult;
    driverId: string | null;
    recordsInserted: number;
    totalDrivingMinutes: number;
    uploadId: string;
}

/** Locate a driver by tachograph card number, scoped to the org. */
export async function findDriverByCardNumber(
    organizationId: string | null | undefined,
    cardNumber: string | null,
): Promise<{ id: string; fullName: string } | null> {
    if (!cardNumber) return null;
    const where = organizationId
        ? and(
            eq(drivers.tachographCardNumber, cardNumber),
            eq(drivers.organizationId, organizationId),
        )
        : eq(drivers.tachographCardNumber, cardNumber);
    const rows = await db
        .select({ id: drivers.id, fullName: drivers.fullName })
        .from(drivers)
        .where(where)
        .limit(1);
    return rows[0] ?? null;
}

/**
 * Parse the DDD buffer, persist the daily aggregates, and append
 * an audit row. Designed to never throw on malformed files —
 * partial data + warnings is more useful than a 500.
 */
export async function ingestDddBuffer(args: {
    buffer: Buffer;
    organizationId: string | null;
    uploadedBy: string;
    fileName: string;
}): Promise<IngestResult> {
    const { buffer, organizationId, uploadedBy, fileName } = args;
    const parsed = parseDddBuffer(buffer);

    const driver = await findDriverByCardNumber(organizationId, parsed.driverCardNumber);
    const driverId = driver?.id ?? null;

    let recordsInserted = 0;
    let totalDrivingMinutes = 0;
    if (driverId) {
        const daily = aggregateToDailyRecords(parsed);
        for (const d of daily) {
            // Идемпотентность: повторная загрузка того же .DDD не должна
            // дублировать записи. Уникального индекса на (driver_id, date,
            // source) нет, поэтому проверяем существование перед insert.
            const existing = await db
                .select({ id: tachographRecords.id })
                .from(tachographRecords)
                .where(and(
                    eq(tachographRecords.driverId, driverId),
                    eq(tachographRecords.date, d.date),
                    eq(tachographRecords.source, 'ddd'),
                ))
                .limit(1);
            if (existing.length > 0) continue;
            // P2 (код-аудит 2026-06-14): после миграции 0044 (unique driver_id+date+source)
            // check-then-insert при гонке двух загрузок ронял 23505 → 500. onConflictDoNothing
            // делает insert идемпотентным; счётчики инкрементим только если строка реально
            // вставлена (returning пустой при конфликте).
            const inserted = await db.insert(tachographRecords).values({
                driverId,
                date: d.date,
                drivingMinutes: d.drivingMinutes,
                restMinutes: d.restMinutes,
                continuousDrivingMinutes: d.continuousDrivingMinutes,
                source: 'ddd',
            }).onConflictDoNothing().returning({ id: tachographRecords.id });
            if (inserted.length === 0) continue;
            recordsInserted++;
            totalDrivingMinutes += d.drivingMinutes;
        }
    } else {
        parsed.warnings.push(
            parsed.driverCardNumber
                ? `Водитель с номером карты ${parsed.driverCardNumber} не найден`
                : 'Номер карты водителя не извлечён из файла',
        );
    }

    const [upload] = await db.insert(tachographUploads).values({
        organizationId: organizationId ?? null,
        driverId,
        driverCardNumber: parsed.driverCardNumber,
        vehicleVin: parsed.vehicleVin,
        periodFrom: parsed.periodFrom,
        periodTo: parsed.periodTo,
        fileName,
        fileSizeBytes: buffer.length,
        recordsInserted,
        totalDrivingMinutes,
        uploadedBy,
        parseWarnings: parsed.warnings,
    }).returning({ id: tachographUploads.id });

    return {
        parsed,
        driverId,
        recordsInserted,
        totalDrivingMinutes,
        uploadId: upload!.id,
    };
}
