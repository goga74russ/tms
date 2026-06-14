// ============================================================
// Счёт-фактура (ПП РФ № 1137, ред. с 01.04.2026)
// ⑤ — отдельный генератор СФ (раньше server печатал СФ через generateActPdf —
// заголовок «АКТ», что юридически неверно: СФ даёт право на вычет НДС, акт — нет).
// Шаблон утверждён Jurist (sign-off по чек-листу invoice-spec §7 + §0.1).
// ============================================================
import {
    createDoc, streamToBuffer, formatDate, formatMoney, drawHLine,
    sectionHeader, drawTable, MARGIN, CONTENT_W,
} from './pdf-base.js';
import { carrierForPdf, NOT_SET, type CarrierRequisites } from './org-requisites.js';

export interface SfTripRow {
    tripNumber: string;
    route?: string | null;
    qty: number;
    unit: string;
    price: number | string;
    amount: number | string; // gross (с НДС)
}

export interface SfPdfInput {
    number: string;
    date: string | Date | null;
    contractorName: string;
    contractorInn?: string | null;
    contractorKpp?: string | null;
    contractorAddress?: string | null;
    trips: SfTripRow[];
    subtotal: number | string;
    vatAmount: number | string;
    total: number | string;
    vatRate?: number | null; // ① — из данных счёта, без дефолта 20
    includesVat?: boolean;
    basisText?: string | null;
    // ИСФ (исправленный СФ) — строка 1а: номер/дата исправления.
    correctionNumber?: string | null;
    correctionDate?: string | Date | null;
    carrier: CarrierRequisites | null;
}

export async function generateSfPdf(data: SfPdfInput): Promise<Buffer> {
    const doc = createDoc();
    const C = carrierForPdf(data.carrier);
    const rate = data.vatRate ?? null;
    const hasVat = rate != null && rate > 0;
    const vatLabel = hasVat ? `${rate}%` : 'без НДС';

    // ── Заголовок (чек-лист #1) ──────────────────────────────
    doc.font('Bold').fontSize(14).fillColor('#000')
        .text('СЧЁТ-ФАКТУРА', { align: 'center' });
    doc.font('Regular').fontSize(10).fillColor('#000')
        .text(`№ ${data.number} от ${formatDate(data.date)}`, { align: 'center' });
    // #2 строка 1а — исправление (для ИСФ; иначе прочерк, но поле присутствует).
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(
            `Исправление (стр. 1а): ${data.correctionNumber ? `№ ${data.correctionNumber} от ${formatDate(data.correctionDate)}` : '—'}`,
            { align: 'center' },
        );
    doc.moveDown(0.4);
    drawHLine(doc);
    doc.moveDown(0.5);

    // ── Продавец / Покупатель (#3,4,9) ───────────────────────
    const sidesY = doc.y;
    const halfW = CONTENT_W / 2 - 12;
    const x2 = MARGIN + halfW + 24;

    doc.font('Bold').fontSize(9).fillColor('#000').text('ПРОДАВЕЦ:', MARGIN, sidesY, { width: halfW });
    doc.font('Regular').fontSize(9).fillColor('#000').text(C.name, MARGIN, sidesY + 13, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555').text(`ИНН: ${C.inn}  КПП: ${C.kpp || '—'}`, MARGIN, sidesY + 25, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555').text(C.address, MARGIN, sidesY + 37, { width: halfW });
    // #4 ОГРН/ОГРНИП продавца (новое с 01.04.2026 для ИП).
    if (C.ogrn !== NOT_SET) {
        const label = C.kpp ? 'ОГРН' : 'ОГРНИП';
        doc.font('Regular').fontSize(8).fillColor('#555').text(`${label}: ${C.ogrn}`, MARGIN, sidesY + 49, { width: halfW });
    }

    doc.font('Bold').fontSize(9).fillColor('#000').text('ПОКУПАТЕЛЬ:', x2, sidesY, { width: halfW });
    doc.font('Regular').fontSize(9).fillColor('#000').text(data.contractorName, x2, sidesY + 13, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#555').text(`ИНН: ${data.contractorInn || '—'}  КПП: ${data.contractorKpp || '—'}`, x2, sidesY + 25, { width: halfW });
    if (data.contractorAddress) {
        doc.font('Regular').fontSize(8).fillColor('#555').text(data.contractorAddress, x2, sidesY + 37, { width: halfW });
    }

    doc.moveTo(MARGIN + halfW + 12, sidesY).lineTo(MARGIN + halfW + 12, sidesY + 62).stroke('#cccccc');
    doc.y = sidesY + 66;
    doc.fillColor('#000');

    // ── Грузоотправитель / Грузополучатель (#5,6) ────────────
    const shipY = doc.y;
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`Грузоотправитель и его адрес: он же (${C.name})`, MARGIN, shipY, { width: CONTENT_W });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`Грузополучатель и его адрес: ${data.contractorName}${data.contractorAddress ? ', ' + data.contractorAddress : ''}`, MARGIN, doc.y, { width: CONTENT_W });

    // ── Строки 5 / 5б / гос.контракт / валюта (#7,8,10,11) ───
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text('Стр. 5 (к платёжно-расчётному документу, при авансе): —', MARGIN, doc.y, { width: CONTENT_W });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text('Стр. 5б (идентификатор реализации в счёт ранее полученной оплаты): —', MARGIN, doc.y, { width: CONTENT_W });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`Идентификатор гос. контракта: ${data.basisText?.trim() || '—'}`, MARGIN, doc.y, { width: CONTENT_W });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text('Валюта: Российский рубль (643)', MARGIN, doc.y, { width: CONTENT_W });

    doc.moveDown(0.5);
    drawHLine(doc);
    doc.moveDown(0.4);

    // ── Табличная часть (#12, ставка #16) ────────────────────
    sectionHeader(doc, 'Перечень товаров (работ, услуг)');
    const colN    = { header: '№',            width: 20,  align: 'center' as const };
    const colDesc = { header: 'Наименование', width: 150, align: 'left'   as const };
    const colUnit = { header: 'Ед.',          width: 28,  align: 'center' as const };
    const colQty  = { header: 'Кол.',         width: 28,  align: 'right'  as const };
    const colPrc  = { header: 'Цена, руб.',   width: 62,  align: 'right'  as const };
    const colAmt  = { header: 'Стоим. б/НДС', width: 62,  align: 'right'  as const };
    const colVatR = { header: 'Ставка',       width: 38,  align: 'center' as const };
    const colVatA = { header: 'Сумма НДС',    width: 62,  align: 'right'  as const };
    const colTot  = { header: 'Стоим. с НДС', width: 65,  align: 'right'  as const };
    // сумма ширин: 20+150+28+28+62+62+38+62+65 = 515 ≈ CONTENT_W

    const rows = data.trips.map((t, i) => {
        const amt = Number(t.amount);
        const vat = hasVat ? Math.round(amt * (rate as number) / (100 + (rate as number)) * 100) / 100 : 0;
        const base = amt - vat;
        return [
            i + 1,
            `${t.tripNumber}${t.route ? ' (' + t.route + ')' : ''}`,
            t.unit,
            t.qty,
            formatMoney(t.price),
            formatMoney(base),
            vatLabel,
            hasVat ? formatMoney(vat) : 'без НДС',
            formatMoney(amt),
        ];
    });
    drawTable(doc, [colN, colDesc, colUnit, colQty, colPrc, colAmt, colVatR, colVatA, colTot], rows);

    // #13,14 графа 14 + графы прослеживаемости 11-13 — для услуг прочерк, но присутствуют.
    doc.moveDown(0.2);
    doc.font('Regular').fontSize(7.5).fillColor('#888')
        .text(
            'Графы 11-13 (прослеживаемость: рег.№ партии, ед.изм., кол-во) и графа 14 '
            + '(стоимость прослеживаемых товаров без НДС): не применяются — транспортные услуги (прочерк).',
            MARGIN, doc.y, { width: CONTENT_W },
        );

    // ── Итого (#15) ──────────────────────────────────────────
    doc.moveDown(0.4);
    doc.font('Bold').fontSize(10).fillColor('#000')
        .text(
            `Итого к оплате: ${formatMoney(data.total)} руб.`
            + (hasVat ? ` (в т.ч. НДС ${rate}%: ${formatMoney(data.vatAmount)} руб.)` : ' (НДС не облагается)'),
            MARGIN, doc.y, { width: CONTENT_W },
        );

    // ── Подписи (#17) ────────────────────────────────────────
    doc.moveDown(1.5);
    drawHLine(doc);
    doc.moveDown(0.5);
    const sigY = doc.y;
    const isIp = !C.kpp;
    if (isIp) {
        doc.font('Bold').fontSize(9).fillColor('#000').text('Индивидуальный предприниматель:', MARGIN, sigY, { width: CONTENT_W });
        doc.font('Regular').fontSize(8).fillColor('#555').text(`${C.name}${C.ogrn !== NOT_SET ? `, ОГРНИП ${C.ogrn}` : ''}`, MARGIN, sigY + 13, { width: CONTENT_W });
        doc.moveTo(MARGIN, sigY + 36).lineTo(MARGIN + 200, sigY + 36).stroke('#000');
        doc.font('Regular').fontSize(7).fillColor('#999').text('(подпись)', MARGIN + 70, sigY + 38);
    } else {
        const half = CONTENT_W / 2 - 10;
        doc.font('Bold').fontSize(9).fillColor('#000').text('Руководитель:', MARGIN, sigY, { width: half });
        doc.moveTo(MARGIN, sigY + 24).lineTo(MARGIN + half - 20, sigY + 24).stroke('#000');
        doc.font('Bold').fontSize(9).fillColor('#000').text('Главный бухгалтер:', MARGIN + half + 20, sigY, { width: half });
        doc.moveTo(MARGIN + half + 20, sigY + 24).lineTo(MARGIN + CONTENT_W, sigY + 24).stroke('#000');
        doc.font('Regular').fontSize(7).fillColor('#999').text('(или уполномоченное лицо по приказу / МЧД)', MARGIN, sigY + 30, { width: CONTENT_W });
    }

    // ── Footer (#18) ─────────────────────────────────────────
    doc.moveDown(4);
    drawHLine(doc);
    doc.font('Regular').fontSize(7).fillColor('#999')
        .text(
            `Счёт-фактура № ${data.number} | ${C.name} | Форма по Постановлению Правительства РФ № 1137 (ред. с 01.04.2026) | Сформирован: ${formatDate(new Date())}`,
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
