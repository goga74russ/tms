// ============================================================
// Счёт на оплату (транспортные услуги)
// ============================================================
import {
    createDoc, streamToBuffer, formatDate, formatMoney, drawHLine,
    drawTable, MARGIN, CONTENT_W, CARRIER, PAGE_W,
} from './pdf-base.js';

export interface InvoiceLineItem {
    name: string;
    qty: number;
    unit: string;
    price: number | string;
    amount: number | string;
}

export interface InvoicePdfInput {
    number: string;
    date: string | Date | null;
    contractorName: string;
    contractorInn?: string | null;
    contractorKpp?: string | null;
    contractorAddress?: string | null;
    items: InvoiceLineItem[];
    subtotal: number | string;
    vatAmount: number | string;
    total: number | string;
    vatRate?: number;
    validDays?: number;
}

export async function generateInvoicePdf(data: InvoicePdfInput): Promise<Buffer> {
    const doc = createDoc();
    const vatLabel = `НДС ${data.vatRate ?? 20}%`;

    // ── Банковские реквизиты (шапка) ───────────────────────
    // Серая полоса с реквизитами
    doc.rect(MARGIN, doc.y, CONTENT_W, 48).fill('#f5f5f5');
    const bankY = doc.y + 4;
    doc.font('Bold').fontSize(9).fillColor('#000').text(CARRIER.name, MARGIN + 4, bankY, { width: CONTENT_W * 0.55 });
    doc.font('Regular').fontSize(8).fillColor('#333')
        .text(`ИНН: ${CARRIER.inn}  КПП: ${CARRIER.kpp}`, MARGIN + 4, bankY + 12, { width: CONTENT_W * 0.55 });
    doc.font('Regular').fontSize(8).fillColor('#333')
        .text(CARRIER.address, MARGIN + 4, bankY + 22, { width: CONTENT_W * 0.55 });

    // Банк справа
    const bx = MARGIN + CONTENT_W * 0.58;
    doc.font('Regular').fontSize(8).fillColor('#333').text(`Банк: ${CARRIER.bank}`, bx, bankY, { width: CONTENT_W * 0.42 });
    doc.font('Regular').fontSize(8).fillColor('#333').text(`БИК: ${CARRIER.bik}`, bx, bankY + 12, { width: CONTENT_W * 0.42 });
    doc.font('Regular').fontSize(8).fillColor('#333').text(`р/с: ${CARRIER.account}`, bx, bankY + 22, { width: CONTENT_W * 0.42 });
    doc.font('Regular').fontSize(8).fillColor('#333').text(`к/с: ${CARRIER.corr}`, bx, bankY + 34, { width: CONTENT_W * 0.42 });

    doc.y = bankY + 52;
    drawHLine(doc);

    // ── Заголовок счёта ─────────────────────────────────────
    doc.moveDown(0.6);
    doc.font('Bold').fontSize(14).fillColor('#000').text('СЧЁТ НА ОПЛАТУ', { align: 'center' });
    doc.font('Regular').fontSize(10)
        .text(`№ ${data.number} от ${formatDate(data.date)}`, { align: 'center' });
    doc.moveDown(0.6);
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── Поставщик / Покупатель ──────────────────────────────
    const pairY = doc.y;
    const lw = 90;

    // Поставщик
    doc.font('Bold').fontSize(9).text('Поставщик:', MARGIN, pairY, { width: lw });
    doc.font('Regular').fontSize(9).text(CARRIER.name, MARGIN + lw, pairY, { width: CONTENT_W / 2 - lw });

    doc.moveDown(0.4);
    const pairY2 = doc.y;
    doc.font('Bold').fontSize(9).text('Покупатель:', MARGIN, pairY2, { width: lw });
    doc.font('Regular').fontSize(9).text(data.contractorName, MARGIN + lw, pairY2, { width: CONTENT_W / 2 - lw });

    doc.moveDown(0.3);
    const pairY3 = doc.y;
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`ИНН: ${data.contractorInn || '—'}  КПП: ${data.contractorKpp || '—'}`, MARGIN + lw, pairY3);
    if (data.contractorAddress) {
        doc.moveDown(0.3);
        doc.font('Regular').fontSize(8).fillColor('#555')
            .text(data.contractorAddress, MARGIN + lw, doc.y, { width: CONTENT_W - lw });
    }

    doc.fillColor('#000');
    doc.moveDown(1);
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── Таблица услуг ───────────────────────────────────────
    const colN   = { header: '№',            width: 25,  align: 'center' as const };
    const colNm  = { header: 'Наименование', width: 225, align: 'left'   as const };
    const colQ   = { header: 'Кол.',         width: 35,  align: 'right'  as const };
    const colU   = { header: 'Ед.',          width: 40,  align: 'center' as const };
    const colP   = { header: 'Цена',         width: 80,  align: 'right'  as const };
    const colA   = { header: 'Сумма',        width: 110, align: 'right'  as const };

    const tableRows = data.items.map((item, i) => [
        i + 1,
        item.name,
        item.qty,
        item.unit,
        formatMoney(item.price),
        formatMoney(item.amount),
    ]);

    drawTable(doc, [colN, colNm, colQ, colU, colP, colA], tableRows);

    doc.moveDown(0.5);

    // ── Итоги ───────────────────────────────────────────────
    const totX = MARGIN + CONTENT_W - 220;
    const totLW = 110;
    const totVW = 110;

    function totRow(label: string, value: string, bold = false) {
        const y = doc.y;
        doc.font(bold ? 'Bold' : 'Regular').fontSize(9).fillColor('#555')
            .text(label, totX, y, { width: totLW });
        doc.font(bold ? 'Bold' : 'Regular').fontSize(bold ? 11 : 10).fillColor('#000')
            .text(value, totX + totLW, y, { width: totVW, align: 'right' });
        doc.moveDown(0.4);
    }

    totRow('Итого без НДС:', formatMoney(data.subtotal) + ' ₽');
    totRow(vatLabel + ':', formatMoney(data.vatAmount) + ' ₽');
    drawHLine(doc, doc.y);
    doc.moveDown(0.2);
    totRow('К ОПЛАТЕ:', formatMoney(data.total) + ' ₽', true);

    doc.moveDown(0.5);
    doc.font('Regular').fontSize(9).fillColor('#444')
        .text(`Всего к оплате: ${formatMoney(data.total)} руб. (включая ${vatLabel}: ${formatMoney(data.vatAmount)} руб.)`, MARGIN);

    doc.moveDown(0.5);
    doc.font('Regular').fontSize(9).fillColor('#e65c00')
        .text(`Счёт действителен ${data.validDays ?? 10} дней с даты выставления.`, MARGIN);

    // ── Подпись ─────────────────────────────────────────────
    doc.moveDown(1.5);
    drawHLine(doc);
    doc.moveDown(0.5);

    const sigY = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#000').text('Руководитель:', MARGIN, sigY, { width: 100 });
    doc.moveTo(MARGIN + 105, sigY + 14).lineTo(MARGIN + 240, sigY + 14).stroke('#000');
    doc.font('Regular').fontSize(9).text('Главный бухгалтер:', MARGIN + 280, sigY, { width: 120 });
    doc.moveTo(MARGIN + 405, sigY + 14).lineTo(MARGIN + 515, sigY + 14).stroke('#000');

    // ── Футер ───────────────────────────────────────────────
    doc.moveDown(2.5);
    drawHLine(doc);
    doc.font('Regular').fontSize(7).fillColor('#999')
        .text(
            `Счёт № ${data.number} | ${CARRIER.name} | ИНН ${CARRIER.inn} | Сформирован: ${formatDate(new Date())}`,
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
