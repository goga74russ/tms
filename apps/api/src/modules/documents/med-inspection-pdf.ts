// ============================================================
// Акт предрейсового медицинского осмотра — PDF (Wave 1, 152-ФЗ)
// ============================================================
import { eq } from 'drizzle-orm';
import {
    createDoc, streamToBuffer, formatDate, drawHLine,
    sectionHeader, drawSignatureLine, drawTable,
    MARGIN, CONTENT_W,
} from './pdf-base.js';
import { db } from '../../db/connection.js';
import { medInspections, drivers, users, trips } from '../../db/schema.js';
import { resolveOrgRequisites, carrierForPdf } from './org-requisites.js';

function formatDateTime(d: Date | string | null | undefined): string {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export async function generateMedInspectionPdf(inspectionId: string): Promise<Buffer> {
    const [insp] = await db
        .select()
        .from(medInspections)
        .where(eq(medInspections.id, inspectionId))
        .limit(1);
    if (!insp) {
        throw new Error('Med inspection not found');
    }

    const [driverRows, medicRows] = await Promise.all([
        insp.driverId
            ? db
                .select({ fullName: drivers.fullName, licenseNumber: drivers.licenseNumber, organizationId: drivers.organizationId })
                .from(drivers)
                .where(eq(drivers.id, insp.driverId))
                .limit(1)
            : Promise.resolve([null as any]),
        insp.medicId
            ? db
                .select({ fullName: users.fullName })
                .from(users)
                .where(eq(users.id, insp.medicId))
                .limit(1)
            : Promise.resolve([null as any]),
    ]);
    const [driver] = driverRows;
    const [medic] = medicRows;

    let tripNumber: string | null = null;
    if (insp.tripId) {
        const [trip] = await db
            .select({ number: trips.number })
            .from(trips)
            .where(eq(trips.id, insp.tripId))
            .limit(1);
        tripNumber = trip?.number ?? null;
    }

    // ③ — реквизиты исполнителя из организации водителя (а не хардкод).
    const C = carrierForPdf(await resolveOrgRequisites(driver?.organizationId ?? null));

    const doc = createDoc();

    const title = insp.inspectionType === 'post_trip'
        ? 'АКТ ПОСЛЕРЕЙСОВОГО МЕДИЦИНСКОГО ОСМОТРА'
        : 'АКТ ПРЕДРЕЙСОВОГО МЕДИЦИНСКОГО ОСМОТРА';
    doc.font('Bold').fontSize(13).text(title, { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Regular').fontSize(9).text(C.name, { align: 'center' });
    doc.moveDown(0.2);
    doc.font('Regular').fontSize(9).text(`152-ФЗ | ИНН ${C.inn} | Адрес: ${C.address}`, { align: 'center' });
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

    // Driver
    sectionHeader(doc, 'Водитель');
    const drvY = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('ФИО:', MARGIN, drvY, { width: 50 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(driver?.fullName ?? '—', MARGIN + 52, drvY, { width: 250 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('ВУ:', MARGIN + 320, drvY, { width: 30 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(driver?.licenseNumber ?? '—', MARGIN + 352, drvY, { width: 200 });
    doc.moveDown(1.2);

    // Medic
    sectionHeader(doc, 'Медицинский работник');
    const medY = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('ФИО:', MARGIN, medY, { width: 50 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(medic?.fullName ?? '—', MARGIN + 52, medY, { width: 300 });
    doc.moveDown(1.2);

    // Vitals (152-ФЗ — these are PII and shown only on the act PDF for the medic record)
    sectionHeader(doc, 'Показатели');
    drawTable(doc, [
        { header: 'Параметр', width: 240 },
        { header: 'Значение', width: CONTENT_W - 240, align: 'left' },
    ], [
        ['Артериальное давление, мм рт.ст.', `${insp.systolicBp ?? '—'} / ${insp.diastolicBp ?? '—'}`],
        ['ЧСС, уд/мин', String(insp.heartRate ?? '—')],
        ['Температура тела, °C', String(insp.temperature ?? '—')],
        ['Состояние', insp.condition ?? '—'],
        ['Алкотест', insp.alcoholTest === 'positive' ? 'ПОЛОЖИТЕЛЬНЫЙ' : 'отрицательный'],
        ['Жалобы', insp.complaints ?? '—'],
    ]);
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
    drawSignatureLine(doc, 'Медик', medic?.fullName ?? null, MARGIN, sigY);
    drawSignatureLine(doc, 'Водитель', driver?.fullName ?? null, MARGIN + 220, sigY);

    doc.moveDown(3.5);
    drawHLine(doc);
    doc.font('Regular').fontSize(7).fillColor('#999')
        .text(
            `Акт № ${insp.id} | ${C.name} | Дата формирования: ${formatDate(new Date())}`,
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
