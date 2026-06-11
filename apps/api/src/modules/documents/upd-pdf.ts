// ============================================================
// \u0423\u041f\u0414 \u2014 \u0423\u043d\u0438\u0432\u0435\u0440\u0441\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442
// \u0421\u0442\u0430\u0442\u0443\u0441 1: \u0441\u0447\u0451\u0442-\u0444\u0430\u043a\u0442\u0443\u0440\u0430 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442 (\u041d\u0414\u0421 \u0432\u044b\u0434\u0435\u043b\u044f\u0435\u0442\u0441\u044f)
// \u0421\u0442\u0430\u0442\u0443\u0441 2: \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442 (\u0431\u0435\u0437 \u0441\u0447\u0451\u0442-\u0444\u0430\u043a\u0442\u0443\u0440\u044b)
// ============================================================
import {
    createDoc, streamToBuffer, formatDate, formatMoney, drawHLine,
    sectionHeader, drawTable, drawSignatureLine, MARGIN, CONTENT_W, PAGE_W,
} from './pdf-base.js';
import { carrierForPdf, type CarrierRequisites } from './org-requisites.js';

export interface UpdTripRow {
    date: string | Date | null;
    tripNumber: string;
    route: string;
    distanceKm?: number | null;
    qty: number;
    unit: string;
    price: number | string;
    amount: number | string;
}

export interface UpdPdfInput {
    /** \u041d\u043e\u043c\u0435\u0440 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0430 */
    number: string;
    /** \u0414\u0430\u0442\u0430 \u0441\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d\u0438\u044f */
    date: string | Date | null;
    /** \u041d\u0430\u0447\u0430\u043b\u043e \u043f\u0435\u0440\u0438\u043e\u0434\u0430 */
    periodStart: string | Date | null;
    /** \u041a\u043e\u043d\u0435\u0446 \u043f\u0435\u0440\u0438\u043e\u0434\u0430 */
    periodEnd: string | Date | null;
    /** 1 = \u0441\u0447\u0451\u0442-\u0444\u0430\u043a\u0442\u0443\u0440\u0430 + \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u0434\u043e\u043a.; 2 = \u0442\u043e\u043b\u044c\u043a\u043e \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u0434\u043e\u043a. */
    status: 1 | 2;
    /** \u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044f */
    contractorName: string;
    contractorInn?: string | null;
    contractorKpp?: string | null;
    contractorAddress?: string | null;
    /** \u0420\u0435\u0439\u0441\u044b (\u0441\u0442\u0440\u043e\u043a\u0438 \u0442\u0430\u0431\u043b\u0438\u0446\u044b) */
    trips: UpdTripRow[];
    /** \u0421\u0443\u043c\u043c\u0430 \u0431\u0435\u0437 \u041d\u0414\u0421 */
    subtotal: number | string;
    /** \u0421\u0443\u043c\u043c\u0430 \u041d\u0414\u0421 */
    vatAmount: number | string;
    /** \u0418\u0442\u043e\u0433\u043e \u0441 \u041d\u0414\u0421 */
    total: number | string;
    /** \u0421\u0442\u0430\u0432\u043a\u0430 \u041d\u0414\u0421, % (\u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e 20) */
    vatRate?: number;
    /** \u041f\u043e\u0434\u043f\u0438\u0441\u0430\u043d\u0442 \u0441\u043e \u0441\u0442\u043e\u0440\u043e\u043d\u044b \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430 */
    sellerSignatory?: string | null;
    /** \u041f\u043e\u0434\u043f\u0438\u0441\u0430\u043d\u0442 \u0441\u043e \u0441\u0442\u043e\u0440\u043e\u043d\u044b \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044f */
    buyerSignatory?: string | null;
    carrier: CarrierRequisites | null; // \u2462 \u2014 \u0440\u0435\u043a\u0432\u0438\u0437\u0438\u0442\u044b \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u0430 \u0438\u0437 \u043e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u0438
}

export async function generateUpdPdf(data: UpdPdfInput): Promise<Buffer> {
    const doc = createDoc();
    const C = carrierForPdf(data.carrier);
    const vatRate = data.vatRate ?? 20;
    const vatLabel = `\u041d\u0414\u0421 ${vatRate}%`;

    const statusText = data.status === 1
        ? '\u0421\u0442\u0430\u0442\u0443\u0441: 1 (\u0441\u0447\u0451\u0442-\u0444\u0430\u043a\u0442\u0443\u0440\u0430 \u0438 \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442)'
        : '\u0421\u0442\u0430\u0442\u0443\u0441: 2 (\u043f\u0435\u0440\u0435\u0434\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442)';

    // ── \u0428\u0430\u043f\u043a\u0430: \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a + \u043d\u043e\u043c\u0435\u0440 ──────────────────────────────────
    doc.font('Bold').fontSize(14).fillColor('#000000')
        .text('\u0423\u041d\u0418\u0412\u0415\u0420\u0421\u0410\u041b\u042c\u041d\u042b\u0419 \u041f\u0415\u0420\u0415\u0414\u0410\u0422\u041e\u0427\u041d\u042b\u0419 \u0414\u041e\u041a\u0423\u041c\u0415\u041d\u0422', { align: 'center' });
    doc.font('Regular').fontSize(10).fillColor('#000')
        .text(`\u2116 ${data.number} \u043e\u0442 ${formatDate(data.date)}`, { align: 'center' });
    doc.font('Regular').fontSize(9).fillColor('#555')
        .text(`\u0437\u0430 \u043f\u0435\u0440\u0438\u043e\u0434: ${formatDate(data.periodStart)} \u2014 ${formatDate(data.periodEnd)}`, { align: 'center' });
    doc.moveDown(0.4);

    // \u0411\u043b\u043e\u043a \u0441\u0442\u0430\u0442\u0443\u0441\u0430
    const statusBoxY = doc.y;
    doc.rect(MARGIN, statusBoxY, CONTENT_W, 16).fill(data.status === 1 ? '#e8f4e8' : '#e8eef4');
    doc.font('Bold').fontSize(8).fillColor('#333')
        .text(statusText, MARGIN + 6, statusBoxY + 3, { width: CONTENT_W - 12 });
    doc.y = statusBoxY + 20;

    doc.moveDown(0.3);
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── \u041f\u0440\u043e\u0434\u0430\u0432\u0435\u0446 / \u041f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044c ─────────────────────────────────
    const sidesY = doc.y;
    const halfW = CONTENT_W / 2 - 12;
    const x2 = MARGIN + halfW + 24;

    // \u041f\u0440\u043e\u0434\u0430\u0432\u0435\u0446 (\u043b\u0435\u0432\u0430\u044f \u043a\u043e\u043b\u043e\u043d\u043a\u0430)
    doc.font('Bold').fontSize(9).fillColor('#000').text('\u041f\u0420\u041e\u0414\u0410\u0412\u0415\u0426:', MARGIN, sidesY, { width: halfW });
    doc.font('Regular').fontSize(9).fillColor('#000')
        .text(C.name, MARGIN, sidesY + 13, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`\u0418\u041d\u041d: ${C.inn}  \u041a\u041f\u041f: ${C.kpp}`, MARGIN, sidesY + 25, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(C.address, MARGIN, sidesY + 37, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`\u0422\u0435\u043b: ${C.phone}`, MARGIN, sidesY + 49, { width: halfW });

    // \u041f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044c (\u043f\u0440\u0430\u0432\u0430\u044f \u043a\u043e\u043b\u043e\u043d\u043a\u0430)
    doc.font('Bold').fontSize(9).fillColor('#000').text('\u041f\u041e\u041a\u0423\u041f\u0410\u0422\u0415\u041b\u042c:', x2, sidesY, { width: halfW });
    doc.font('Regular').fontSize(9).fillColor('#000')
        .text(data.contractorName, x2, sidesY + 13, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`\u0418\u041d\u041d: ${data.contractorInn || '\u2014'}  \u041a\u041f\u041f: ${data.contractorKpp || '\u2014'}`, x2, sidesY + 25, { width: halfW });
    if (data.contractorAddress) {
        doc.font('Regular').fontSize(8).fillColor('#555')
            .text(data.contractorAddress, x2, sidesY + 37, { width: halfW });
    }

    // \u0412\u0435\u0440\u0442\u0438\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0440\u0430\u0437\u0434\u0435\u043b\u0438\u0442\u0435\u043b\u044c \u043c\u0435\u0436\u0434\u0443 \u043a\u043e\u043b\u043e\u043d\u043a\u0430\u043c\u0438
    doc.moveTo(MARGIN + halfW + 12, sidesY)
        .lineTo(MARGIN + halfW + 12, sidesY + 62)
        .stroke('#cccccc');

    doc.y = sidesY + 66;
    doc.fillColor('#000');
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── \u0422\u0430\u0431\u043b\u0438\u0446\u0430 \u0443\u0441\u043b\u0443\u0433 / \u0440\u0435\u0439\u0441\u043e\u0432 ──────────────────────────────────
    sectionHeader(doc, '\u041f\u0435\u0440\u0435\u0447\u0435\u043d\u044c \u0443\u0441\u043b\u0443\u0433 (\u0442\u043e\u0432\u0430\u0440\u043e\u0432)');

    // \u041a\u043e\u043b\u043e\u043d\u043a\u0438 \u0441\u043e\u0433\u043b\u0430\u0441\u043d\u043e \u0444\u043e\u0440\u043c\u0435 \u0423\u041f\u0414 (\u0443\u043f\u0440\u043e\u0449\u0435\u043d\u043d\u044b\u0435: \u0431\u0435\u0437 \u0433\u0440\u0430\u0444 \u0441\u0442\u0440\u0430\u043d\u044b \u043f\u0440\u043e\u0438\u0441\u0445\u043e\u0436\u0434\u0435\u043d\u0438\u044f)
    const colN    = { header: '\u2116',              width: 22,  align: 'center' as const };
    const colDesc = { header: '\u041d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435',    width: 152, align: 'left'   as const };
    const colUnit = { header: '\u0415\u0434.',            width: 30,  align: 'center' as const };
    const colQty  = { header: '\u041a\u043e\u043b.',            width: 30,  align: 'right'  as const };
    const colPrc  = { header: '\u0426\u0435\u043d\u0430, \u0440\u0443\u0431.',    width: 70,  align: 'right'  as const };
    const colAmt  = { header: '\u0421\u0443\u043c\u043c\u0430 \u0431/\u041d\u0414\u0421',   width: 64,  align: 'right'  as const };
    const colVatR = { header: `\u0421\u0442. ${vatRate}%`,     width: 30,  align: 'center' as const };
    const colVatA = { header: '\u0421\u0443\u043c\u043c\u0430 \u041d\u0414\u0421',    width: 64,  align: 'right'  as const };
    const colTot  = { header: '\u0421\u0443\u043c\u043c\u0430 \u0441 \u041d\u0414\u0421',  width: 53,  align: 'right'  as const };

    // \u041f\u0440\u043e\u0432\u0435\u0440\u044f\u0435\u043c \u0441\u0443\u043c\u043c\u0443 \u0448\u0438\u0440\u0438\u043d: 22+152+30+30+70+64+30+64+53 = 515 = CONTENT_W (515.28 \u043e\u043a)
    const tableRows = data.trips.map((t, i) => {
        const amt = Number(t.amount);
        const vatAmt = data.status === 1
            ? Math.round(amt * vatRate / (100 + vatRate) * 100) / 100
            : 0;
        const base = data.status === 1 ? amt - vatAmt : amt;
        return [
            i + 1,
            `${t.tripNumber} ${t.route ? '(' + t.route + ')' : ''}`.trim(),
            t.unit,
            t.qty,
            formatMoney(t.price),
            formatMoney(base),
            data.status === 1 ? `${vatRate}%` : '\u0431\u0435\u0437 \u041d\u0414\u0421',
            data.status === 1 ? formatMoney(vatAmt) : '0,00',
            formatMoney(amt),
        ];
    });

    drawTable(doc, [colN, colDesc, colUnit, colQty, colPrc, colAmt, colVatR, colVatA, colTot], tableRows);

    doc.moveDown(0.5);

    // ── \u0418\u0442\u043e\u0433\u043e ─────────────────────────────────────────────────────
    const totX = MARGIN + CONTENT_W - 240;
    const totLabelW = 130;
    const totValW = 110;

    function totRow(label: string, value: string, bold = false) {
        const y = doc.y;
        doc.font(bold ? 'Bold' : 'Regular').fontSize(9).fillColor('#555')
            .text(label, totX, y, { width: totLabelW });
        doc.font(bold ? 'Bold' : 'Regular').fontSize(bold ? 11 : 10).fillColor('#000')
            .text(value, totX + totLabelW, y, { width: totValW, align: 'right' });
        doc.moveDown(0.4);
    }

    totRow('\u0418\u0442\u043e\u0433\u043e \u0431\u0435\u0437 \u041d\u0414\u0421:', formatMoney(data.subtotal) + ' \u20bd');
    totRow(vatLabel + ':', formatMoney(data.vatAmount) + ' \u20bd');
    drawHLine(doc, doc.y);
    doc.moveDown(0.2);
    totRow('\u0418\u0422\u041e\u0413\u041e \u0421 \u041d\u0414\u0421:', formatMoney(data.total) + ' \u20bd', true);

    doc.moveDown(0.4);
    doc.font('Regular').fontSize(9).fillColor('#444')
        .text(
            `\u0412\u0441\u0435\u0433\u043e \u043f\u043e \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442\u0443: ${formatMoney(data.total)} \u0440\u0443\u0431. (${vatLabel}: ${formatMoney(data.vatAmount)} \u0440\u0443\u0431.)`,
            MARGIN, doc.y, { width: CONTENT_W },
        );

    doc.moveDown(1);
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── \u0418\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f \u043e \u043f\u0435\u0440\u0435\u0434\u0430\u0447\u0435 ──────────────────────────────
    doc.font('Regular').fontSize(9).fillColor('#000')
        .text(
            '\u0422\u043e\u0432\u0430\u0440\u044b (\u0440\u0430\u0431\u043e\u0442\u044b, \u0443\u0441\u043b\u0443\u0433\u0438) \u043f\u0435\u0440\u0435\u0434\u0430\u043d\u044b / \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u044b \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u0438 \u0432 \u0441\u0440\u043e\u043a. ' +
            '\u041f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044c \u043f\u0440\u0435\u0442\u0435\u043d\u0437\u0438\u0439 \u043f\u043e \u043e\u0431\u044a\u0451\u043c\u0443, \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0438 \u0441\u0440\u043e\u043a\u0430\u043c \u043e\u043a\u0430\u0437\u0430\u043d\u0438\u044f \u0443\u0441\u043b\u0443\u0433 \u043d\u0435 \u0438\u043c\u0435\u0435\u0442.',
            MARGIN, doc.y, { width: CONTENT_W },
        );

    doc.moveDown(1.5);

    // ── \u041f\u043e\u0434\u043f\u0438\u0441\u0438 ────────────────────────────────────────────────
    const sigY = doc.y;
    const sigHalfW = CONTENT_W / 2 - 20;

    // \u041f\u0440\u043e\u0434\u0430\u0432\u0435\u0446
    doc.font('Bold').fontSize(9).fillColor('#000').text('\u041f\u0420\u041e\u0414\u0410\u0412\u0415\u0426:', MARGIN, sigY, { width: sigHalfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(C.name, MARGIN, sigY + 12, { width: sigHalfW });
    drawSignatureLine(doc, '\u041f\u043e\u0434\u043f\u0438\u0441\u044c', data.sellerSignatory, MARGIN, sigY + 28);
    doc.font('Regular').fontSize(7).fillColor('#555')
        .text(`\u041c. \u041f.`, MARGIN + 130, sigY + 28);

    // \u041f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u044c
    const sigX2 = MARGIN + sigHalfW + 30;
    doc.font('Bold').fontSize(9).fillColor('#000').text('\u041f\u041e\u041a\u0423\u041f\u0410\u0422\u0415\u041b\u042c:', sigX2, sigY, { width: sigHalfW });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(data.contractorName, sigX2, sigY + 12, { width: sigHalfW });
    drawSignatureLine(doc, '\u041f\u043e\u0434\u043f\u0438\u0441\u044c', data.buyerSignatory, sigX2, sigY + 28);
    doc.font('Regular').fontSize(7).fillColor('#555')
        .text(`\u041c. \u041f.`, sigX2 + 130, sigY + 28);

    doc.y = sigY + 60;
    doc.moveDown(0.5);

    // \u0414\u0430\u0442\u044b \u043f\u043e\u0434\u043f\u0438\u0441\u0430\u043d\u0438\u044f
    const dateLineY = doc.y;
    doc.font('Regular').fontSize(9).fillColor('#000')
        .text('\u0414\u0430\u0442\u0430 \u043f\u043e\u0434\u043f\u0438\u0441\u0430\u043d\u0438\u044f \u043f\u0440\u043e\u0434\u0430\u0432\u0446\u043e\u043c: ___________________', MARGIN, dateLineY, { width: sigHalfW });
    doc.font('Regular').fontSize(9).fillColor('#000')
        .text('\u0414\u0430\u0442\u0430 \u043f\u043e\u0434\u043f\u0438\u0441\u0430\u043d\u0438\u044f \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u0435\u043c: ___________________', sigX2, dateLineY, { width: sigHalfW });

    doc.moveDown(1.5);

    // ── \u0424\u0443\u0442\u0435\u0440 ─────────────────────────────────────────────────────
    drawHLine(doc);
    doc.font('Regular').fontSize(7).fillColor('#999')
        .text(
            `\u0423\u041f\u0414 \u2116 ${data.number} | ${C.name} | \u0418\u041d\u041d ${C.inn} | \u0421\u0444\u043e\u0440\u043c\u0438\u0440\u043e\u0432\u0430\u043d: ${formatDate(new Date())}`,
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
