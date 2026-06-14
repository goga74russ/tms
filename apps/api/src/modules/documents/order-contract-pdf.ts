// ============================================================
// Договор-заявка на перевозку груза (P1-4, N2)
// Акцептированная заявка = договор перевозки на разовую перевозку
// (ст. 8 ч.1 ФЗ-259, ПП РФ № 2200; существенные условия — ст. 432/785/790 ГК).
// Шаблон утверждён Jurist (sign-off по чек-листу: 7 блоков / 22 поля).
// Блок 6 (ответственность) — дословные формулировки Jurist.
// ============================================================
import {
    createDoc, streamToBuffer, formatDate, formatMoney, drawHLine,
    sectionHeader, MARGIN, CONTENT_W,
} from './pdf-base.js';
import { carrierForPdf, NOT_SET, type CarrierRequisites } from './org-requisites.js';

export interface OrderContractParty {
    name: string;
    inn?: string | null;
    kpp?: string | null;
    ogrn?: string | null;
    address?: string | null;
    phone?: string | null;
}

export interface OrderContractPdfInput {
    number: string;
    date: string | Date | null;
    place?: string | null; // место составления (город)
    customer: OrderContractParty; // Заказчик (контрагент)
    carrier: CarrierRequisites | null; // Перевозчик (организация)
    // Маршрут
    loadingAddress?: string | null;
    unloadingAddress?: string | null;
    loadingDate?: string | Date | null;
    unloadingDate?: string | Date | null;
    // Груз
    cargoDescription?: string | null;
    cargoWeightKg?: number | null;
    cargoVolumeM3?: number | null;
    cargoPlaces?: number | null;
    cargoType?: string | null; // характер/упаковка
    adrClass?: string | null;
    adrUnNumber?: string | null;
    temperatureMin?: number | null;
    temperatureMax?: number | null;
    consigneeName?: string | null;
    consigneeAddress?: string | null;
    // Транспорт и водитель
    vehicleMake?: string | null;
    vehiclePlate?: string | null;
    vehicleBodyType?: string | null;
    trailerPlate?: string | null;
    driverName?: string | null;
    driverPhone?: string | null;
    driverLicense?: string | null;
    // Цена и оплата
    price?: number | null;
    includesVat?: boolean;
    vatRate?: number | null; // ① resolveVatRate; null → без НДС
    paymentTerms?: string | null;
    // Блок 6 параметры
    downtimeRatePerHour?: number | null; // {ставка простоя}
    delayPenaltyPercent?: number | null; // {процент} 6.4 (default 1)
}

function val(v: unknown): string {
    if (v == null || v === '') return '—';
    return String(v);
}

export async function generateOrderContractPdf(data: OrderContractPdfInput): Promise<Buffer> {
    const doc = createDoc();
    const C = carrierForPdf(data.carrier);
    const rate = data.vatRate ?? null;
    const hasVat = rate != null && rate > 0;
    const delayPct = data.delayPenaltyPercent ?? 1;
    const downtime = data.downtimeRatePerHour != null ? formatMoney(data.downtimeRatePerHour) : '___________';

    // ── Блок 1: Шапка ────────────────────────────────────────
    doc.font('Bold').fontSize(14).fillColor('#000')
        .text('ДОГОВОР-ЗАЯВКА на перевозку груза', { align: 'center' });
    doc.font('Regular').fontSize(10)
        .text(`№ ${data.number} от ${formatDate(data.date)}`, { align: 'center' });
    doc.font('Regular').fontSize(8).fillColor('#555')
        .text(`Место составления: ${val(data.place)}`, { align: 'center' });
    doc.moveDown(0.4);
    drawHLine(doc);
    doc.moveDown(0.4);

    // ── Блок 2: Стороны ──────────────────────────────────────
    const sidesY = doc.y;
    const halfW = CONTENT_W / 2 - 12;
    const x2 = MARGIN + halfW + 24;
    const cu = data.customer;

    doc.font('Bold').fontSize(9).fillColor('#000').text('ЗАКАЗЧИК:', MARGIN, sidesY, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#000').text(val(cu.name), MARGIN, sidesY + 13, { width: halfW });
    doc.font('Regular').fontSize(7.5).fillColor('#555')
        .text(`ИНН: ${val(cu.inn)}${cu.kpp ? ` / КПП: ${cu.kpp}` : ''}`, MARGIN, sidesY + 25, { width: halfW });
    doc.font('Regular').fontSize(7.5).fillColor('#555').text(`ОГРН(ИП): ${val(cu.ogrn)}`, MARGIN, sidesY + 35, { width: halfW });
    doc.font('Regular').fontSize(7.5).fillColor('#555').text(`Адрес: ${val(cu.address)}`, MARGIN, sidesY + 45, { width: halfW });
    doc.font('Regular').fontSize(7.5).fillColor('#555').text(`Тел: ${val(cu.phone)}`, MARGIN, sidesY + 55, { width: halfW });

    doc.font('Bold').fontSize(9).fillColor('#000').text('ПЕРЕВОЗЧИК (ИСПОЛНИТЕЛЬ):', x2, sidesY, { width: halfW });
    doc.font('Regular').fontSize(8).fillColor('#000').text(C.name, x2, sidesY + 13, { width: halfW });
    doc.font('Regular').fontSize(7.5).fillColor('#555')
        .text(`ИНН: ${C.inn}${C.kpp ? ` / КПП: ${C.kpp}` : ''}`, x2, sidesY + 25, { width: halfW });
    doc.font('Regular').fontSize(7.5).fillColor('#555').text(`${C.kpp ? 'ОГРН' : 'ОГРНИП'}: ${C.ogrn}`, x2, sidesY + 35, { width: halfW });
    doc.font('Regular').fontSize(7.5).fillColor('#555').text(`Адрес: ${C.address}`, x2, sidesY + 45, { width: halfW });
    doc.font('Regular').fontSize(7.5).fillColor('#555').text(`Банк: ${C.bank}  р/с: ${C.account}`, x2, sidesY + 55, { width: halfW });

    doc.y = sidesY + 70;
    doc.fillColor('#000');
    doc.font('Regular').fontSize(7.5).fillColor('#555')
        .text('Полномочия подписантов: на основании Устава / доверенности / МЧД.', MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.4);
    drawHLine(doc);
    doc.moveDown(0.3);

    // ── Блок 3: Существенные условия перевозки ───────────────
    sectionHeader(doc, 'Условия перевозки');
    const line = (label: string, v: string) => {
        const y = doc.y;
        doc.font('Regular').fontSize(8).fillColor('#666').text(label, MARGIN, y, { width: 150 });
        doc.font('Regular').fontSize(9).fillColor('#000').text(v, MARGIN + 152, y, { width: CONTENT_W - 152 });
        doc.moveDown(0.5);
    };
    line('Адрес погрузки:', `${val(data.loadingAddress)}${data.loadingDate ? `  (подача: ${formatDate(data.loadingDate)})` : ''}`);
    line('Адрес выгрузки:', `${val(data.unloadingAddress)}${data.unloadingDate ? `  (доставка: ${formatDate(data.unloadingDate)})` : ''}`);
    line('Груз:', val(data.cargoDescription));
    const cargoParams = [
        data.cargoWeightKg != null ? `${data.cargoWeightKg} кг` : null,
        data.cargoVolumeM3 != null ? `${data.cargoVolumeM3} м³` : null,
        data.cargoPlaces != null ? `${data.cargoPlaces} мест` : null,
        data.cargoType || null,
    ].filter(Boolean).join(', ');
    line('Масса/объём/упаковка:', cargoParams || '—');
    const special = [
        data.adrClass ? `ADR класс ${data.adrClass}${data.adrUnNumber ? ` (UN ${data.adrUnNumber})` : ''}` : null,
        (data.temperatureMin != null || data.temperatureMax != null) ? `темп. режим ${data.temperatureMin ?? '?'}…${data.temperatureMax ?? '?'} °C` : null,
    ].filter(Boolean).join('; ');
    line('Особые свойства:', special || 'нет');
    if (data.consigneeName) line('Грузополучатель:', `${data.consigneeName}${data.consigneeAddress ? ', ' + data.consigneeAddress : ''}`);

    // ── Блок 4: Транспорт и водитель ─────────────────────────
    doc.moveDown(0.2);
    sectionHeader(doc, 'Транспорт и водитель');
    line('ТС (марка / госномер / кузов):', `${val(data.vehicleMake)} / ${val(data.vehiclePlate)} / ${val(data.vehicleBodyType)}`);
    if (data.trailerPlate) line('Прицеп (госномер):', data.trailerPlate);
    line('Водитель (ФИО / тел):', `${val(data.driverName)}${data.driverPhone ? ` / ${data.driverPhone}` : ''}`);
    line('ВУ / Паспорт:', `ВУ ${val(data.driverLicense)} / Паспорт: ______________`);

    // ── Блок 5: Цена и оплата ────────────────────────────────
    doc.moveDown(0.2);
    sectionHeader(doc, 'Цена и порядок расчётов');
    const priceStr = data.price != null
        ? `${formatMoney(data.price)} руб. ${hasVat ? `(${data.includesVat ? 'в т.ч.' : 'кроме того'} НДС ${rate}%)` : '(без НДС)'}`
        : '—';
    line('Стоимость перевозки:', priceStr);
    line('Условия оплаты:', val(data.paymentTerms) === '—' ? 'безналичный расчёт по оригиналам документов' : val(data.paymentTerms));

    // ── Блок 6: Ответственность (дословно от Jurist) ─────────
    doc.moveDown(0.2);
    sectionHeader(doc, '6. Ответственность сторон');
    const para = (t: string) => {
        doc.font('Regular').fontSize(7.5).fillColor('#222').text(t, MARGIN, doc.y, { width: CONTENT_W, align: 'justify' });
        doc.moveDown(0.35);
    };
    para('6.1. За несвоевременную подачу транспортного средства под погрузку либо срыв подачи Перевозчик уплачивает Заказчику штраф в размере 5% от стоимости перевозки за каждые сутки просрочки, но не более 20% от стоимости перевозки.');
    para(`6.2. За простой транспортного средства сверх установленного времени погрузки/выгрузки по вине Заказчика (грузоотправителя, грузополучателя) Заказчик уплачивает Перевозчику плату за простой в размере ${downtime} рублей за каждый час простоя. Время простоя исчисляется с момента прибытия ТС в пункт погрузки/выгрузки, зафиксированного в перевозочных документах.`);
    para('6.3. Перевозчик несёт ответственность за сохранность груза с момента его принятия к перевозке и до момента выдачи грузополучателю в соответствии со статьёй 796 Гражданского кодекса РФ. За утрату, недостачу или повреждение (порчу) груза Перевозчик возмещает ущерб в размере стоимости утраченного (недостающего) груза или суммы, на которую понизилась его стоимость.');
    para(`6.4. За нарушение срока доставки груза Перевозчик уплачивает Заказчику штраф в размере ${delayPct}% провозной платы за каждые сутки просрочки (но не более размера провозной платы), если иное не предусмотрено законодательством.`);
    para('6.5. Стороны освобождаются от ответственности за неисполнение обязательств вследствие обстоятельств непреодолимой силы (форс-мажор): стихийные бедствия, военные действия, акты государственных органов, запрет движения, иные обстоятельства вне разумного контроля Сторон. Сторона, для которой возникли такие обстоятельства, обязана уведомить другую Сторону в течение 3 (трёх) рабочих дней.');
    para('6.6. Во всём, что не урегулировано настоящим Договором-заявкой, Стороны руководствуются Гражданским кодексом РФ, Федеральным законом «Устав автомобильного транспорта» от 08.11.2007 № 259-ФЗ и Правилами перевозок грузов автомобильным транспортом.');

    // ── Блок 7: Подписи ──────────────────────────────────────
    doc.moveDown(0.5);
    drawHLine(doc);
    doc.moveDown(0.5);
    const sy = doc.y;
    const sHalf = CONTENT_W / 2 - 10;
    doc.font('Bold').fontSize(9).fillColor('#000').text('ЗАКАЗЧИК', MARGIN, sy, { width: sHalf });
    doc.font('Regular').fontSize(7.5).fillColor('#555').text('должность / подпись / ФИО', MARGIN, sy + 28, { width: sHalf });
    doc.moveTo(MARGIN, sy + 26).lineTo(MARGIN + sHalf - 20, sy + 26).stroke('#000');
    doc.font('Regular').fontSize(8).fillColor('#999').text('М.П.', MARGIN, sy + 40);

    doc.font('Bold').fontSize(9).fillColor('#000').text('ПЕРЕВОЗЧИК', MARGIN + sHalf + 20, sy, { width: sHalf });
    doc.font('Regular').fontSize(7.5).fillColor('#555').text(`${C.name} — должность / подпись / ФИО`, MARGIN + sHalf + 20, sy + 28, { width: sHalf });
    doc.moveTo(MARGIN + sHalf + 20, sy + 26).lineTo(MARGIN + CONTENT_W, sy + 26).stroke('#000');
    doc.font('Regular').fontSize(8).fillColor('#999').text('М.П.', MARGIN + sHalf + 20, sy + 40);

    // ── Footer ───────────────────────────────────────────────
    doc.moveDown(3);
    drawHLine(doc);
    doc.font('Regular').fontSize(7).fillColor('#999')
        .text(
            'Договор-заявка является офертой; её подписание либо фактическое исполнение (подача ТС / приём груза) признаётся акцептом (ст. 438 ГК РФ).',
            MARGIN, doc.y + 4, { width: CONTENT_W, align: 'center' },
        );

    return streamToBuffer(doc);
}
