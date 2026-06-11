// ============================================================
// Акт предрейсового технического осмотра — PDF (Wave 1)
// ============================================================
import { eq } from 'drizzle-orm';
import {
    createDoc, streamToBuffer, formatDate, drawHLine,
    sectionHeader, drawSignatureLine, drawTable,
    MARGIN, CONTENT_W,
} from './pdf-base.js';
import { db } from '../../db/connection.js';
import { techInspections, vehicles, users, trips, drivers } from '../../db/schema.js';
import { resolveOrgRequisites, carrierForPdf } from './org-requisites.js';

interface ChecklistItem {
    name: string;
    result: 'ok' | 'fault';
    comment?: string;
    photoUrl?: string;
}

function formatDateTime(d: Date | string | null | undefined): string {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export async function generateTechInspectionPdf(inspectionId: string): Promise<Buffer> {
    const [insp] = await db
        .select()
        .from(techInspections)
        .where(eq(techInspections.id, inspectionId))
        .limit(1);
    if (!insp) {
        throw new Error('Tech inspection not found');
    }

    const [[vehicle], [mechanic]] = await Promise.all([
        insp.vehicleId
            ? db
                .select({
                    make: vehicles.make,
                    model: vehicles.model,
                    plateNumber: vehicles.plateNumber,
                    vin: vehicles.vin,
                    organizationId: vehicles.organizationId,
                })
                .from(vehicles)
                .where(eq(vehicles.id, insp.vehicleId))
                .limit(1)
            : Promise.resolve([null as any]),
        insp.mechanicId
            ? db
                .select({ fullName: users.fullName })
                .from(users)
                .where(eq(users.id, insp.mechanicId))
                .limit(1)
            : Promise.resolve([null as any]),
    ]);

    let tripNumber: string | null = null;
    let driverName: string | null = null;
    if (insp.tripId) {
        const [trip] = await db
            .select({ id: trips.id, number: trips.number, driverId: trips.driverId })
            .from(trips)
            .where(eq(trips.id, insp.tripId))
            .limit(1);
        tripNumber = trip?.number ?? null;
        if (trip?.driverId) {
            const [driver] = await db
                .select({ fullName: drivers.fullName })
                .from(drivers)
                .where(eq(drivers.id, trip.driverId))
                .limit(1);
            driverName = driver?.fullName ?? null;
        }
    }

    const items: ChecklistItem[] = (insp.items as ChecklistItem[] | null) ?? [];

    // ③ — реквизиты исполнителя из организации ТС (а не хардкод).
    const C = carrierForPdf(await resolveOrgRequisites(vehicle?.organizationId ?? null));

    const doc = createDoc();

    // Header
    const title = insp.inspectionType === 'post_trip'
        ? 'АКТ ПОСЛЕРЕЙСОВОГО ТЕХНИЧЕСКОГО ОСМОТРА'
        : 'АКТ ПРЕДРЕЙСОВОГО ТЕХНИЧЕСКОГО ОСМОТРА';
    doc.font('Bold').fontSize(13).text(title, { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Regular').fontSize(9).text(C.name, { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Regular').fontSize(9).text(`ИНН ${C.inn} | Адрес: ${C.address}`, { align: 'center' });
    doc.moveDown(0.5);
    drawHLine(doc);
    doc.moveDown(0.4);

    // Metadata
    sectionHeader(doc, 'Общие данные');
    const metaY = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Дата осмотра:', MARGIN, metaY, { width: 120 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(formatDateTime(insp.createdAt), MARGIN + 122, metaY, { width: 200 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Номер рейса:', MARGIN + 330, metaY, { width: 100 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(tripNumber ?? '—', MARGIN + 432, metaY, { width: 110 });
    doc.moveDown(1);
    const meta2Y = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Чек-лист версия:', MARGIN, meta2Y, { width: 120 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(insp.checklistVersion ?? '—', MARGIN + 122, meta2Y, { width: 120 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Тип осмотра:', MARGIN + 330, meta2Y, { width: 100 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(insp.inspectionType ?? '—', MARGIN + 432, meta2Y, { width: 110 });
    doc.moveDown(1.2);

    // Vehicle
    sectionHeader(doc, 'Транспортное средство');
    const vehY = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Марка / Модель:', MARGIN, vehY, { width: 110 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(`${vehicle?.make ?? '—'} ${vehicle?.model ?? ''}`.trim(), MARGIN + 115, vehY, { width: 200 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Гос. номер:', MARGIN + 330, vehY, { width: 90 });
    doc.font('Bold').fontSize(11).fillColor('#000').text(vehicle?.plateNumber ?? '—', MARGIN + 422, vehY, { width: 130 });
    doc.moveDown(1);
    doc.font('Regular').fontSize(9).fillColor('#666').text('VIN:', MARGIN, doc.y, { width: 40 });
    doc.font('Regular').fontSize(9).fillColor('#000').text(vehicle?.vin ?? '—', MARGIN + 42, doc.y, { width: 250 });
    doc.moveDown(1.2);

    // Personnel
    sectionHeader(doc, 'Персонал');
    const pY = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Механик:', MARGIN, pY, { width: 80 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(mechanic?.fullName ?? '—', MARGIN + 82, pY, { width: 220 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Водитель:', MARGIN + 320, pY, { width: 80 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(driverName ?? '—', MARGIN + 402, pY, { width: 150 });
    doc.moveDown(1.2);

    // Checklist
    sectionHeader(doc, 'Чек-лист');
    if (items.length > 0) {
        drawTable(doc, [
            { header: '№', width: 30, align: 'center' },
            { header: 'Пункт', width: 280 },
            { header: 'Результат', width: 80, align: 'center' },
            { header: 'Комментарий', width: CONTENT_W - 30 - 280 - 80 },
        ], items.map((it, i) => [
            String(i + 1),
            it.name,
            it.result === 'ok' ? 'OK' : 'НЕИСПР.',
            it.comment ?? '',
        ]));
    } else {
        doc.font('Regular').fontSize(9).fillColor('#666').text('Пункты чек-листа отсутствуют', { align: 'center' });
        doc.moveDown(0.5);
    }
    doc.moveDown(0.8);

    // Decision
    sectionHeader(doc, 'Решение');
    const decY = doc.y + 2;
    doc.font('Bold').fontSize(12)
        .fillColor(insp.decision === 'approved' ? '#006600' : '#aa0000')
        .text(insp.decision === 'approved' ? 'ДОПУЩЕН' : 'НЕ ДОПУЩЕН', MARGIN, decY);
    doc.fillColor('#000');
    if (insp.comment) {
        doc.moveDown(0.7);
        doc.font('Regular').fontSize(9).fillColor('#666').text('Комментарий:', MARGIN, doc.y, { width: 100 });
        doc.font('Regular').fontSize(10).fillColor('#000').text(insp.comment, MARGIN + 102, doc.y, { width: CONTENT_W - 102 });
    }
    doc.moveDown(2);

    // Signatures
    drawHLine(doc);
    doc.moveDown(0.5);
    const sigY = doc.y;
    drawSignatureLine(doc, 'Механик', mechanic?.fullName ?? null, MARGIN, sigY);
    drawSignatureLine(doc, 'Водитель', driverName, MARGIN + 220, sigY);

    doc.moveDown(3.5);
    drawHLine(doc);
    doc.font('Regular').fontSize(7).fillColor('#999')
        .text(
            `Акт № ${insp.id} | ${C.name} | Дата формирования: ${formatDate(new Date())}`,
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
