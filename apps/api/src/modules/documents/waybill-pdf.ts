// ============================================================
// Путевой лист — форма Ф.4-П (унифицированная)
// ============================================================
import {
    createDoc, streamToBuffer, formatDate, drawHLine,
    sectionHeader, drawSignatureLine, MARGIN, CONTENT_W, CARRIER,
    PAGE_W,
} from './pdf-base.js';

export interface WaybillPdfInput {
    number: string;
    issuedAt: string | Date | null;
    departureAt?: string | Date | null;
    returnAt?: string | Date | null;
    // Vehicle
    vehicleMake?: string | null;
    vehicleModel?: string | null;
    vehiclePlate?: string | null;
    vehicleVin?: string | null;
    odometerOut?: number | null;
    odometerIn?: number | null;
    fuelOut?: number | null;
    fuelIn?: number | null;
    // Driver
    driverName?: string | null;
    driverLicense?: string | null;
    // Inspections
    mechanicName?: string | null;
    mechanicDecision?: string | null;
    mechanicTime?: string | Date | null;
    medicName?: string | null;
    medicDecision?: string | null;
    medicTime?: string | Date | null;
    // Route
    tripNumber?: string | null;
    loadingAddress?: string | null;
    unloadingAddress?: string | null;
    orderNumbers?: string[];
    // Status
    status?: string | null;
}

function formatTime(d: string | Date | null | undefined): string {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(d: string | Date | null | undefined): string {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export async function generateWaybillPdf(data: WaybillPdfInput): Promise<Buffer> {
    const doc = createDoc();

    // ── Шапка ──────────────────────────────────────────────
    doc.font('Bold').fontSize(11).text('ПУТЕВОЙ ЛИСТ', { align: 'center' });
    doc.font('Regular').fontSize(9).text('Форма № 4-П', { align: 'center' });
    doc.moveDown(0.3);

    // Дата и номер справа, организация слева
    const topY = doc.y;
    doc.font('Bold').fontSize(10).text(CARRIER.name, MARGIN, topY, { width: CONTENT_W * 0.6 });
    doc.font('Regular').fontSize(9)
        .text(`№ ${data.number}`, MARGIN + CONTENT_W * 0.6, topY, { width: CONTENT_W * 0.4, align: 'right' });
    doc.font('Regular').fontSize(9)
        .text(`от ${formatDate(data.issuedAt)}`, MARGIN + CONTENT_W * 0.6, topY + 12, {
            width: CONTENT_W * 0.4, align: 'right',
        });

    doc.moveDown(1);
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── Транспортное средство ───────────────────────────────
    sectionHeader(doc, 'Транспортное средство');

    const row1Y = doc.y + 2;
    // Марка/модель
    doc.font('Regular').fontSize(9).fillColor('#666').text('Марка / Модель:', MARGIN, row1Y, { width: 110 });
    doc.font('Regular').fontSize(10).fillColor('#000')
        .text(`${data.vehicleMake || '—'} ${data.vehicleModel || ''}`.trim(), MARGIN + 115, row1Y, { width: 180 });
    // Гос. номер
    doc.font('Regular').fontSize(9).fillColor('#666').text('Гос. номер:', MARGIN + 310, row1Y, { width: 85 });
    doc.font('Bold').fontSize(11).fillColor('#000').text(data.vehiclePlate || '—', MARGIN + 398, row1Y, { width: 110 });

    doc.moveDown(1);
    const row2Y = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666').text('VIN:', MARGIN, row2Y, { width: 40 });
    doc.font('Regular').fontSize(9).fillColor('#000').text(data.vehicleVin || '—', MARGIN + 42, row2Y, { width: 200 });

    doc.font('Regular').fontSize(9).fillColor('#666').text('Одометр выезд, км:', MARGIN + 260, row2Y, { width: 130 });
    doc.font('Regular').fontSize(10).fillColor('#000')
        .text(data.odometerOut != null ? String(data.odometerOut) : '—', MARGIN + 393, row2Y, { width: 80 });

    doc.moveDown(1);
    const row3Y = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Топливо выдано, л:', MARGIN, row3Y, { width: 130 });
    doc.font('Regular').fontSize(10).fillColor('#000')
        .text(data.fuelOut != null ? String(data.fuelOut) : '—', MARGIN + 132, row3Y, { width: 80 });

    doc.font('Regular').fontSize(9).fillColor('#666').text('Одометр возврат, км:', MARGIN + 260, row3Y, { width: 130 });
    doc.font('Regular').fontSize(10).fillColor('#000')
        .text(data.odometerIn != null ? String(data.odometerIn) : '—', MARGIN + 393, row3Y, { width: 80 });

    doc.moveDown(1.2);

    // ── Водитель ────────────────────────────────────────────
    sectionHeader(doc, 'Водитель');
    const drvY = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('ФИО:', MARGIN, drvY, { width: 40 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(data.driverName || '—', MARGIN + 42, drvY, { width: 250 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Удостоверение:', MARGIN + 305, drvY, { width: 90 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(data.driverLicense || '—', MARGIN + 398, drvY, { width: 115 });
    doc.moveDown(1.2);

    // ── Штамп механика ──────────────────────────────────────
    sectionHeader(doc, 'Штамп механика (технический осмотр)');
    const mechY = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Механик:', MARGIN, mechY, { width: 70 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(data.mechanicName || '—', MARGIN + 72, mechY, { width: 200 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Решение:', MARGIN + 280, mechY, { width: 60 });
    doc.font('Bold').fontSize(10).fillColor(data.mechanicDecision === 'approved' ? '#006600' : '#000')
        .text(data.mechanicDecision === 'approved' ? 'ДОПУЩЕН' : (data.mechanicDecision || '—'), MARGIN + 343, mechY, { width: 80 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Время:', MARGIN + 430, mechY, { width: 50 });
    doc.font('Regular').fontSize(9).fillColor('#000').text(formatDateTime(data.mechanicTime), MARGIN + 482, mechY, { width: 80 });
    doc.moveDown(1.2);

    // ── Штамп медика ────────────────────────────────────────
    sectionHeader(doc, 'Штамп медика (медицинский осмотр)');
    const medY = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Медик:', MARGIN, medY, { width: 70 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(data.medicName || '—', MARGIN + 72, medY, { width: 200 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Решение:', MARGIN + 280, medY, { width: 60 });
    doc.font('Bold').fontSize(10).fillColor(data.medicDecision === 'approved' ? '#006600' : '#000')
        .text(data.medicDecision === 'approved' ? 'ДОПУЩЕН' : (data.medicDecision || '—'), MARGIN + 343, medY, { width: 80 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Время:', MARGIN + 430, medY, { width: 50 });
    doc.font('Regular').fontSize(9).fillColor('#000').text(formatDateTime(data.medicTime), MARGIN + 482, medY, { width: 80 });
    doc.moveDown(1.2);

    // ── Маршрут и задание ───────────────────────────────────
    sectionHeader(doc, 'Маршрут и задание');
    const routeY = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Рейс №:', MARGIN, routeY, { width: 60 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(data.tripNumber || '—', MARGIN + 62, routeY, { width: 120 });

    if (data.orderNumbers && data.orderNumbers.length > 0) {
        doc.font('Regular').fontSize(9).fillColor('#666')
            .text('Заявки:', MARGIN + 195, routeY, { width: 50 });
        doc.font('Regular').fontSize(9).fillColor('#000')
            .text(data.orderNumbers.join(', '), MARGIN + 248, routeY, { width: CONTENT_W - 248 });
    }

    doc.moveDown(0.8);
    const addr1Y = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Откуда:', MARGIN, addr1Y, { width: 55 });
    doc.font('Regular').fontSize(9).fillColor('#000').text(data.loadingAddress || '—', MARGIN + 57, addr1Y, { width: CONTENT_W / 2 - 60 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Куда:', MARGIN + CONTENT_W / 2, addr1Y, { width: 45 });
    doc.font('Regular').fontSize(9).fillColor('#000')
        .text(data.unloadingAddress || '—', MARGIN + CONTENT_W / 2 + 47, addr1Y, { width: CONTENT_W / 2 - 50 });

    doc.moveDown(0.8);
    const timeY = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Выезд:', MARGIN, timeY, { width: 55 });
    doc.font('Regular').fontSize(9).fillColor('#000').text(formatDateTime(data.departureAt), MARGIN + 57, timeY, { width: 180 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Возврат:', MARGIN + 255, timeY, { width: 55 });
    doc.font('Regular').fontSize(9).fillColor('#000')
        .text(data.returnAt ? formatDateTime(data.returnAt) : '—', MARGIN + 312, timeY, { width: 180 });

    doc.moveDown(1.5);

    // ── Подписи ─────────────────────────────────────────────
    drawHLine(doc);
    doc.moveDown(0.5);

    const sigY = doc.y;
    drawSignatureLine(doc, 'Механик', data.mechanicName, MARGIN, sigY);
    drawSignatureLine(doc, 'Медик', data.medicName, MARGIN + 170, sigY);
    drawSignatureLine(doc, 'Диспетчер', undefined, MARGIN + 340, sigY);

    doc.moveDown(3.5);
    drawSignatureLine(doc, 'Водитель (принял ТС)', data.driverName, MARGIN, doc.y);

    // ── Нижний колонтитул ───────────────────────────────────
    doc.moveDown(2);
    drawHLine(doc);
    doc.font('Regular').fontSize(7).fillColor('#999999')
        .text(
            `Путевой лист № ${data.number} | ${CARRIER.name} | ИНН ${CARRIER.inn} | Дата формирования: ${formatDate(new Date())}`,
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
