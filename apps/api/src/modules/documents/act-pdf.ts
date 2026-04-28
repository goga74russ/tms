// ============================================================
// Акт выполненных работ (транспортные услуги)
// ============================================================
import {
    createDoc, streamToBuffer, formatDate, formatMoney, drawHLine,
    sectionHeader, drawTable, drawSignatureLine, MARGIN, CONTENT_W, CARRIER,
} from './pdf-base.js';

export interface ActTripRow {
    date: string | Date | null;
    tripNumber: string;
    route: string;
    distanceKm?: number | null;
    amount: number | string;
}

export interface ActPdfInput {
    number: string;
    date: string | Date | null;
    periodStart: string | Date | null;
    periodEnd: string | Date | null;
    contractorName: string;
    contractorInn?: string | null;
    contractorKpp?: string | null;
    contractorAddress?: string | null;
    trips: ActTripRow[];
    subtotal: number | string;
    vatAmount: number | string;
    total: number | string;
    vatRate?: number; // default 20
}

export async function generateActPdf(data: ActPdfInput): Promise<Buffer> {
    const doc = createDoc();
    const vatLabel = `НДС ${data.vatRate ?? 20}%`;

    // ── Шапка ──────────────────────────────────────────────
    doc.font('Bold').fontSize(13).text('АКТ ВЫПОЛНЕННЫХ РАБОТ', { align: 'center' });
    doc.font('Regular').fontSize(10)
        .text(`№ ${data.number} от ${formatDate(data.date)}`, { align: 'center' });
    doc.font('Regular').fontSize(9)
        .text(`за период: ${formatDate(data.periodStart)} — ${formatDate(data.periodEnd)}`, { align: 'center' });
    doc.moveDown(0.8);
    drawHLine(doc);
    doc.moveDown(0.6);

    // ── Стороны ─────────────────────────────────────────────
    const sidesY = doc.y;
    const halfW = CONTENT_W / 2 - 10;

    // Исполнитель
    doc.font('Bold').fontSize(9).text('ИСПОЛНИТЕЛЬ:', MARGIN, sidesY, { width: halfW });
    doc.font('Regular').fontSize(9).text(CARRIER.name, MARGIN, sidesY + 14, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`ИНН: ${CARRIER.inn}  КПП: ${CARRIER.kpp}`, MARGIN, sidesY + 26, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(CARRIER.address, MARGIN, sidesY + 38, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`Тел: ${CARRIER.phone}`, MARGIN, sidesY + 50, { width: halfW });

    // Заказчик
    const x2 = MARGIN + halfW + 20;
    doc.font('Bold').fontSize(9).fillColor('#000').text('ЗАКАЗЧИК:', x2, sidesY, { width: halfW });
    doc.font('Regular').fontSize(9).fillColor('#000').text(data.contractorName, x2, sidesY + 14, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`ИНН: ${data.contractorInn || '—'}  КПП: ${data.contractorKpp || '—'}`, x2, sidesY + 26, { width: halfW });
    if (data.contractorAddress) {
        doc.font('Regular').fontSize(8).fillColor('#555')
            .text(data.contractorAddress, x2, sidesY + 38, { width: halfW });
    }

    doc.y = sidesY + 70;
    doc.fillColor('#000');
    doc.moveDown(0.5);
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── Таблица рейсов ─────────────────────────────────────
    sectionHeader(doc, 'Перечень оказанных услуг');

    const colNum   = { header: '№',         width: 25,  align: 'center' as const };
    const colDate  = { header: 'Дата',       width: 65,  align: 'left'   as const };
    const colTrip  = { header: 'Рейс №',     width: 70,  align: 'left'   as const };
    const colRoute = { header: 'Маршрут',    width: 230, align: 'left'   as const };
    const colKm    = { header: 'км',         width: 40,  align: 'right'  as const };
    const colAmt   = { header: 'Сумма, руб.', width: 85, align: 'right'  as const };

    const tableRows = data.trips.map((t, i) => [
        i + 1,
        formatDate(t.date),
        t.tripNumber,
        t.route,
        t.distanceKm ?? '—',
        formatMoney(t.amount),
    ]);

    drawTable(doc, [colNum, colDate, colTrip, colRoute, colKm, colAmt], tableRows);

    doc.moveDown(0.5);

    // ── Итого ───────────────────────────────────────────────
    const totX = MARGIN + CONTENT_W - 220;
    const totW = 130;
    const totLabelW = 90;

    function totRow(label: string, value: string, bold = false) {
        const y = doc.y;
        doc.font(bold ? 'Bold' : 'Regular').fontSize(9).fillColor('#555')
            .text(label, totX, y, { width: totLabelW });
        doc.font(bold ? 'Bold' : 'Regular').fontSize(10).fillColor('#000')
            .text(value, totX + totLabelW, y, { width: totW, align: 'right' });
        doc.moveDown(0.4);
    }

    totRow('Итого без НДС:', formatMoney(data.subtotal) + ' ₽');
    totRow(vatLabel + ':', formatMoney(data.vatAmount) + ' ₽');
    drawHLine(doc, doc.y);
    doc.moveDown(0.2);
    totRow('ИТОГО:', formatMoney(data.total) + ' ₽', true);

    // Сумма прописью (упрощённо)
    doc.moveDown(0.3);
    doc.font('Regular').fontSize(9).fillColor('#444')
        .text(`Всего оказано услуг на сумму ${formatMoney(data.total)} руб. (${vatLabel} включён).`, MARGIN, doc.y);

    doc.moveDown(1.5);
    drawHLine(doc);
    doc.moveDown(0.5);

    doc.font('Regular').fontSize(9).fillColor('#000')
        .text(
            'Вышеперечисленные услуги выполнены полностью и в срок. ' +
            'Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.',
            MARGIN, doc.y, { width: CONTENT_W },
        );

    doc.moveDown(1.5);

    // ── Подписи ─────────────────────────────────────────────
    const sigY = doc.y;
    // Исполнитель
    doc.font('Bold').fontSize(9).text('ИСПОЛНИТЕЛЬ:', MARGIN, sigY, { width: 200 });
    doc.font('Regular').fontSize(8).fillColor('#555').text(CARRIER.name, MARGIN, sigY + 12, { width: 200 });
    drawSignatureLine(doc, 'Подпись', undefined, MARGIN, sigY + 30);

    // Заказчик
    doc.font('Bold').fontSize(9).fillColor('#000').text('ЗАКАЗЧИК:', MARGIN + 300, sigY, { width: 200 });
    doc.font('Regular').fontSize(8).fillColor('#555').text(data.contractorName, MARGIN + 300, sigY + 12, { width: 200 });
    drawSignatureLine(doc, 'Подпись', undefined, MARGIN + 300, sigY + 30);

    // ── Футер ───────────────────────────────────────────────
    doc.moveDown(4);
    drawHLine(doc);
    doc.font('Regular').fontSize(7).fillColor('#999')
        .text(
            `Акт № ${data.number} | ${CARRIER.name} | ИНН ${CARRIER.inn} | Сформирован: ${formatDate(new Date())}`,
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
