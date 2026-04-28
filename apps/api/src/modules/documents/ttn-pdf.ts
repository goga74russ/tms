// ============================================================
// Товарно-транспортная накладная — форма 1-Т (упрощённая)
// ============================================================
import {
    createDoc, streamToBuffer, formatDate, drawHLine,
    sectionHeader, drawSignatureLine, MARGIN, CONTENT_W, CARRIER,
} from './pdf-base.js';

export interface TtnPdfInput {
    orderNumber: string;
    date: string | Date | null;
    // Стороны
    shipperName: string;
    shipperInn?: string | null;
    shipperAddress?: string | null;
    consigneeName: string;
    consigneeInn?: string | null;
    consigneeAddress?: string | null;
    // Груз
    cargoDescription: string;
    cargoWeightKg?: number | null;
    cargoVolumeCbm?: number | null;
    cargoPlaces?: number | null;
    // Транспорт
    vehicleMake?: string | null;
    vehicleModel?: string | null;
    vehiclePlate?: string | null;
    driverName?: string | null;
    driverLicense?: string | null;
    // Маршрут
    loadingAddress: string;
    unloadingAddress: string;
    distanceKm?: number | null;
    // Опционально
    tripNumber?: string | null;
    waybillNumber?: string | null;
}

export async function generateTtnPdf(data: TtnPdfInput): Promise<Buffer> {
    const doc = createDoc();

    // ── Шапка ──────────────────────────────────────────────
    // ГОСТ-шапка ТТН справа
    const hdrBoxX = MARGIN + CONTENT_W - 200;
    doc.rect(hdrBoxX, doc.y, 200, 50).stroke('#000');
    const bY = doc.y + 4;
    doc.font('Regular').fontSize(7).fillColor('#555')
        .text('Форма № 1-Т', hdrBoxX + 4, bY, { width: 192, align: 'center' });
    doc.font('Bold').fontSize(9).fillColor('#000')
        .text('Товарно-транспортная накладная', hdrBoxX + 4, bY + 12, { width: 192, align: 'center' });
    doc.font('Regular').fontSize(8)
        .text(`№ ${data.orderNumber}  от  ${formatDate(data.date)}`, hdrBoxX + 4, bY + 28, { width: 192, align: 'center' });

    // Организация слева
    doc.font('Bold').fontSize(11).fillColor('#000').text(CARRIER.name, MARGIN, doc.y - 46, { width: CONTENT_W - 210 });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`ИНН ${CARRIER.inn}  /  КПП ${CARRIER.kpp}`, MARGIN, doc.y - 32, { width: CONTENT_W - 210 });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(CARRIER.address, MARGIN, doc.y - 20, { width: CONTENT_W - 210 });

    doc.y = bY + 58;
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── Раздел 1: Стороны ───────────────────────────────────
    sectionHeader(doc, '1. Стороны грузоперевозки');

    const halfW = CONTENT_W / 2 - 10;
    const sidesY = doc.y + 2;

    // Грузоотправитель
    doc.font('Bold').fontSize(9).fillColor('#000').text('Грузоотправитель:', MARGIN, sidesY, { width: halfW });
    doc.font('Regular').fontSize(9).text(data.shipperName, MARGIN, sidesY + 13, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`ИНН: ${data.shipperInn || '—'}`, MARGIN, sidesY + 25, { width: halfW });
    if (data.shipperAddress) {
        doc.font('Regular').fontSize(8).fillColor('#555')
            .text(data.shipperAddress, MARGIN, sidesY + 37, { width: halfW });
    }

    // Грузополучатель
    const x2 = MARGIN + halfW + 20;
    doc.font('Bold').fontSize(9).fillColor('#000').text('Грузополучатель:', x2, sidesY, { width: halfW });
    doc.font('Regular').fontSize(9).fillColor('#000').text(data.consigneeName, x2, sidesY + 13, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`ИНН: ${data.consigneeInn || '—'}`, x2, sidesY + 25, { width: halfW });
    if (data.consigneeAddress) {
        doc.font('Regular').fontSize(8).fillColor('#555')
            .text(data.consigneeAddress, x2, sidesY + 37, { width: halfW });
    }

    doc.y = sidesY + 58;
    doc.fillColor('#000');
    doc.moveDown(0.5);

    // ── Раздел 2: Транспортный раздел ──────────────────────
    sectionHeader(doc, '2. Транспортный раздел');

    const tr1Y = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Транспортное средство:', MARGIN, tr1Y, { width: 150 });
    const veh = [data.vehicleMake, data.vehicleModel].filter(Boolean).join(' ');
    doc.font('Regular').fontSize(10).fillColor('#000').text(veh || '—', MARGIN + 153, tr1Y, { width: 160 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Гос. номер:', MARGIN + 330, tr1Y, { width: 80 });
    doc.font('Bold').fontSize(11).fillColor('#000').text(data.vehiclePlate || '—', MARGIN + 413, tr1Y, { width: 100 });

    doc.moveDown(0.9);
    const tr2Y = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Водитель:', MARGIN, tr2Y, { width: 70 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(data.driverName || '—', MARGIN + 72, tr2Y, { width: 200 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Удостоверение:', MARGIN + 285, tr2Y, { width: 100 });
    doc.font('Regular').fontSize(9).fillColor('#000').text(data.driverLicense || '—', MARGIN + 387, tr2Y, { width: 130 });

    doc.moveDown(0.9);
    const tr3Y = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Адрес погрузки:', MARGIN, tr3Y, { width: 110 });
    doc.font('Regular').fontSize(9).fillColor('#000').text(data.loadingAddress, MARGIN + 112, tr3Y, { width: CONTENT_W / 2 - 115 });
    doc.font('Regular').fontSize(9).fillColor('#666').text('Адрес выгрузки:', MARGIN + CONTENT_W / 2, tr3Y, { width: 110 });
    doc.font('Regular').fontSize(9).fillColor('#000')
        .text(data.unloadingAddress, MARGIN + CONTENT_W / 2 + 112, tr3Y, { width: CONTENT_W / 2 - 115 });

    if (data.distanceKm) {
        doc.moveDown(0.6);
        const tr4Y = doc.y;
        doc.font('Regular').fontSize(9).fillColor('#666').text('Расстояние, км:', MARGIN, tr4Y, { width: 120 });
        doc.font('Regular').fontSize(10).fillColor('#000').text(String(data.distanceKm), MARGIN + 122, tr4Y, { width: 100 });
        if (data.tripNumber) {
            doc.font('Regular').fontSize(9).fillColor('#666').text('Рейс №:', MARGIN + 250, tr4Y, { width: 60 });
            doc.font('Regular').fontSize(9).fillColor('#000').text(data.tripNumber, MARGIN + 313, tr4Y, { width: 100 });
        }
        if (data.waybillNumber) {
            doc.font('Regular').fontSize(9).fillColor('#666').text('Путевой лист:', MARGIN + 430, tr4Y, { width: 90 });
            doc.font('Regular').fontSize(9).fillColor('#000').text(data.waybillNumber, MARGIN + 522, tr4Y, { width: 100 });
        }
    }

    doc.fillColor('#000');
    doc.moveDown(1);

    // ── Раздел 3: Товарный раздел ───────────────────────────
    sectionHeader(doc, '3. Товарный раздел (сведения о грузе)');

    const cargo1Y = doc.y + 2;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Наименование груза:', MARGIN, cargo1Y, { width: 140 });
    doc.font('Regular').fontSize(10).fillColor('#000').text(data.cargoDescription, MARGIN + 142, cargo1Y, { width: CONTENT_W - 145 });

    doc.moveDown(0.8);
    const cargo2Y = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#666').text('Масса брутто, кг:', MARGIN, cargo2Y, { width: 130 });
    doc.font('Regular').fontSize(10).fillColor('#000')
        .text(data.cargoWeightKg != null ? String(data.cargoWeightKg) : '—', MARGIN + 132, cargo2Y, { width: 80 });

    doc.font('Regular').fontSize(9).fillColor('#666').text('Объём, м³:', MARGIN + 230, cargo2Y, { width: 75 });
    doc.font('Regular').fontSize(10).fillColor('#000')
        .text(data.cargoVolumeCbm != null ? String(data.cargoVolumeCbm) : '—', MARGIN + 307, cargo2Y, { width: 80 });

    doc.font('Regular').fontSize(9).fillColor('#666').text('Мест:', MARGIN + 410, cargo2Y, { width: 45 });
    doc.font('Regular').fontSize(10).fillColor('#000')
        .text(data.cargoPlaces != null ? String(data.cargoPlaces) : '—', MARGIN + 457, cargo2Y, { width: 60 });

    doc.fillColor('#000');
    doc.moveDown(1.5);
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── Подписи ─────────────────────────────────────────────
    doc.font('Bold').fontSize(9).text('Подписи сторон:');
    doc.moveDown(0.4);

    const sigY = doc.y;
    drawSignatureLine(doc, 'Грузоотправитель', data.shipperName.substring(0, 25), MARGIN, sigY);
    drawSignatureLine(doc, 'Водитель (принял)', data.driverName, MARGIN + 185, sigY);
    drawSignatureLine(doc, 'Грузополучатель', data.consigneeName.substring(0, 25), MARGIN + 375, sigY);

    // ── Отметка о приёмке ───────────────────────────────────
    doc.moveDown(3.5);
    doc.font('Bold').fontSize(9).text('Отметка о приёмке груза:');
    doc.moveDown(0.3);
    const recY = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#555').text('Груз получил:', MARGIN, recY, { width: 100 });
    doc.moveTo(MARGIN + 105, recY + 14).lineTo(MARGIN + 280, recY + 14).stroke('#000');
    doc.font('Regular').fontSize(9).fillColor('#555').text('Дата:', MARGIN + 300, recY, { width: 40 });
    doc.moveTo(MARGIN + 342, recY + 14).lineTo(MARGIN + 430, recY + 14).stroke('#000');

    // ── Футер ───────────────────────────────────────────────
    doc.moveDown(2);
    drawHLine(doc);
    doc.font('Regular').fontSize(7).fillColor('#999')
        .text(
            `ТТН № ${data.orderNumber} | ${CARRIER.name} | ИНН ${CARRIER.inn} | Сформирована: ${formatDate(new Date())}`,
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
