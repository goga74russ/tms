// ============================================================
// Путевой лист — форма Ф.4-П (унифицированная)
// ============================================================
import {
    createDoc, streamToBuffer, formatDate, drawHLine,
    sectionHeader, drawSignatureLine, MARGIN, CONTENT_W,
    PAGE_W,
} from './pdf-base.js';
import { carrierForPdf, NOT_SET, type CarrierRequisites } from './org-requisites.js';

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
    // \u041c\u0438\u043d\u0442\u0440\u0430\u043d\u0441 \u2116390 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u0440\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b
    driverSnils?: string | null;
    issuedByName?: string | null;
    issuedByPosition?: string | null;
    validFrom?: string | Date | null;
    validTo?: string | Date | null;
    transportServiceType?: string | null;
    transportMode?: string | null;
    // ⑥ Приказ №390 — ОСАГО и диагностическая карта ТС.
    osagoNumber?: string | null;
    osagoExpiry?: string | Date | null;
    diagnosticCardNumber?: string | null;
    diagnosticCardExpiry?: string | Date | null;
    carrier: CarrierRequisites | null; // ③ — реквизиты перевозчика из организации
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
    const C = carrierForPdf(data.carrier);

    // ── Шапка ──────────────────────────────────────────────
    doc.font('Bold').fontSize(11).text('ПУТЕВОЙ ЛИСТ', { align: 'center' });
    doc.font('Regular').fontSize(9).text('Форма № 4-П', { align: 'center' });
    doc.moveDown(0.3);

    // Дата и номер справа, организация слева
    const topY = doc.y;
    doc.font('Bold').fontSize(10).text(C.name, MARGIN, topY, { width: CONTENT_W * 0.6 });
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

    // ── \u0420\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b \u043f\u043e \u041f\u0440\u0438\u043a\u0430\u0437\u0443 \u041c\u0438\u043d\u0442\u0440\u0430\u043d\u0441\u0430 \u21162390 ───────────────────────────────
    const has390 = data.driverSnils || data.issuedByName || data.issuedByPosition
        || data.validFrom || data.validTo
        || data.transportServiceType || data.transportMode
        || data.osagoNumber || data.osagoExpiry
        || data.diagnosticCardNumber || data.diagnosticCardExpiry
        || (C.ogrn && C.ogrn !== NOT_SET);

    if (has390) {
        sectionHeader(doc, '\u0420\u0415\u041a\u0412\u0418\u0417\u0418\u0422\u042b \u041f\u041e \u041f\u0420\u0418\u041a\u0410\u0417\u0423 \u041c\u0418\u041d\u0422\u0420\u0410\u041d\u0421\u0410 \u2116390');

        // \u041e\u0413\u0420\u041d/\u041e\u0413\u0420\u041d\u0418\u041f \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430 \u0422\u0421 (\u043f\u0435\u0440\u0435\u0432\u043e\u0437\u0447\u0438\u043a).
        if (C.ogrn && C.ogrn !== NOT_SET) {
            const ogrnY = doc.y + 2;
            doc.font('Regular').fontSize(9).fillColor('#666').text('\u041e\u0413\u0420\u041d/\u041e\u0413\u0420\u041d\u0418\u041f \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430:', MARGIN, ogrnY, { width: 150 });
            doc.font('Regular').fontSize(10).fillColor('#000').text(C.ogrn, MARGIN + 155, ogrnY, { width: 200 });
            doc.moveDown(1);
        }

        // \u041e\u0421\u0410\u0413\u041e \u2014 \u0441\u0435\u0440\u0438\u044f/\u043d\u043e\u043c\u0435\u0440 + \u0441\u0440\u043e\u043a.
        if (data.osagoNumber || data.osagoExpiry) {
            const osY = doc.y + 2;
            doc.font('Regular').fontSize(9).fillColor('#666').text('\u041f\u043e\u043b\u0438\u0441 \u041e\u0421\u0410\u0413\u041e:', MARGIN, osY, { width: 150 });
            const osText = [data.osagoNumber || '\u2014', data.osagoExpiry ? `\u0434\u043e ${formatDate(data.osagoExpiry)}` : null]
                .filter(Boolean).join(', ');
            doc.font('Regular').fontSize(10).fillColor('#000').text(osText, MARGIN + 155, osY, { width: CONTENT_W - 155 });
            doc.moveDown(1);
        }

        // \u0414\u0438\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043a\u0430\u0440\u0442\u0430 \u2014 \u043d\u043e\u043c\u0435\u0440 + \u0441\u0440\u043e\u043a.
        if (data.diagnosticCardNumber || data.diagnosticCardExpiry) {
            const dcY = doc.y + 2;
            doc.font('Regular').fontSize(9).fillColor('#666').text('\u0414\u0438\u0430\u0433\u043d\u043e\u0441\u0442\u0438\u0447\u0435\u0441\u043a\u0430\u044f \u043a\u0430\u0440\u0442\u0430:', MARGIN, dcY, { width: 150 });
            const dcText = [data.diagnosticCardNumber || '\u2014', data.diagnosticCardExpiry ? `\u0434\u043e ${formatDate(data.diagnosticCardExpiry)}` : null]
                .filter(Boolean).join(', ');
            doc.font('Regular').fontSize(10).fillColor('#000').text(dcText, MARGIN + 155, dcY, { width: CONTENT_W - 155 });
            doc.moveDown(1);
        }

        if (data.driverSnils) {
            const snilsY = doc.y + 2;
            doc.font('Regular').fontSize(9).fillColor('#666').text(
                '\u0421\u041d\u0418\u041b\u0421 \u0432\u043e\u0434\u0438\u0442\u0435\u043b\u044f:',
                MARGIN, snilsY, { width: 150 },
            );
            doc.font('Regular').fontSize(10).fillColor('#000').text(
                data.driverSnils,
                MARGIN + 155, snilsY, { width: 200 },
            );
            doc.moveDown(1);
        }

        if (data.issuedByName || data.issuedByPosition) {
            const issY = doc.y + 2;
            doc.font('Regular').fontSize(9).fillColor('#666').text(
                '\u0412\u044b\u0434\u0430\u043b \u043f\u0443\u0442\u0435\u0432\u043e\u0439 \u043b\u0438\u0441\u0442:',
                MARGIN, issY, { width: 150 },
            );
            const issuerText = [data.issuedByName, data.issuedByPosition]
                .filter(Boolean).join(', ');
            doc.font('Regular').fontSize(10).fillColor('#000').text(
                issuerText,
                MARGIN + 155, issY, { width: CONTENT_W - 155 },
            );
            doc.moveDown(1);
        }

        if (data.validFrom || data.validTo) {
            const valY = doc.y + 2;
            doc.font('Regular').fontSize(9).fillColor('#666').text(
                '\u0421\u0440\u043e\u043a \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f:',
                MARGIN, valY, { width: 150 },
            );
            const validText = `${formatDateTime(data.validFrom)} \u2014 ${formatDateTime(data.validTo)}`;
            doc.font('Regular').fontSize(10).fillColor('#000').text(
                validText,
                MARGIN + 155, valY, { width: CONTENT_W - 155 },
            );
            doc.moveDown(1);
        }

        if (data.transportServiceType) {
            const tstY = doc.y + 2;
            doc.font('Regular').fontSize(9).fillColor('#666').text(
                '\u0412\u0438\u0434 \u043f\u0435\u0440\u0435\u0432\u043e\u0437\u043a\u0438:',
                MARGIN, tstY, { width: 150 },
            );
            doc.font('Regular').fontSize(10).fillColor('#000').text(
                data.transportServiceType,
                MARGIN + 155, tstY, { width: CONTENT_W - 155 },
            );
            doc.moveDown(1);
        }

        if (data.transportMode) {
            const tmY = doc.y + 2;
            doc.font('Regular').fontSize(9).fillColor('#666').text(
                '\u0412\u0438\u0434 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f:',
                MARGIN, tmY, { width: 150 },
            );
            doc.font('Regular').fontSize(10).fillColor('#000').text(
                data.transportMode,
                MARGIN + 155, tmY, { width: CONTENT_W - 155 },
            );
            doc.moveDown(1);
        }

        doc.moveDown(0.5);
    }

    // ── \u041f\u043e\u0434\u043f\u0438\u0441\u0438 ─────────────────────────────────────────────
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
            `Путевой лист № ${data.number} | ${C.name} | ИНН ${C.inn} | Дата формирования: ${formatDate(new Date())}`,
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
