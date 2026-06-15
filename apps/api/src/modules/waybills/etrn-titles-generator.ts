// ============================================================
// ЭТрН XML Generators — Электронная транспортная накладная
// Титулы 2, 5, 6 (Carrier Acceptance / Consignee Acceptance / Carrier Completion)
// Формат: ФНС приказ ЕД-7-26/383@ (в силе с 01.09.2024),
// приказ Минтранса №348, XSD-схемы 973_02 / 973_05 / 973_06 v5.01.
//
// Encoding: UTF-8 (ФНС XSD v5.01+ принимает UTF-8).
// Если ЭДО-оператор требует windows-1251, конвертировать
// на уровне экспорта через encodeWindows1251 из etrn-generator.ts.
//
// Все генераторы — чистые функции; signature-блок выдаётся
// placeholder-элементом <ПодписьXxx Статус="ожидает" .../>,
// фактическая КЭП присоединяется отдельным detached PKCS#7 контейнером.
// ============================================================

/**
 * Escape XML special characters.
 * Локальная копия — генератор должен быть автономным,
 * без cross-file импортов (etrn-generator.ts не экспортирует helper).
 */
function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Format ISO date to DD.MM.YYYY (RU document standard).
 */
// P3 (код-аудит 2026-06-14): даты ЭТрН форматируем в МСК (UTC+3), а не в локальной
// TZ сервера — под Docker (UTC) был off-by-one в ДатаДок/ДатаВремя.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
function formatDate(isoDate: string): string {
    const d = new Date(new Date(isoDate).getTime() + MSK_OFFSET_MS);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}.${month}.${year}`;
}

/**
 * Format ISO datetime to DD.MM.YYYY HH:MM (RU document standard, МСК).
 */
function formatDateTime(isoDate: string): string {
    const d = new Date(new Date(isoDate).getTime() + MSK_OFFSET_MS);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const minutes = String(d.getUTCMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

/** Shape of physical cargo facts captured at handover. */
export interface ActualCargo {
    description: string;
    weightKg: number;
    volumeM3?: number;
    packageType?: string;
    markingInfo?: string;
}

// ============================================================
// T02 — Carrier Acceptance (Перевозчик принял груз у Отправителя)
// XSD: ON_TRNACLPPRIN_1_973_02_05_01_01.xsd
// ============================================================

export interface T02Input {
    /** Document GUID (will become ИдФайл). */
    docId: string;
    /** Internal TMS waybill identifier — пишется в НомДок. */
    waybillId: string;
    carrierInn: string;
    carrierName: string;
    carrierKpp?: string;
    shipperInn: string;
    shipperName: string;
    /** Optional shipper KPP — XSD accepts it as part of СвЮЛ block. */
    shipperKpp?: string;
    actualCargo: ActualCargo;
    /** ISO-8601 fact-of-loading timestamp. */
    loadingDateTime: string;
    loadingAddress: string;
    /** Optional notes printed into ПримечанияПеревозчика. */
    notes?: string;
}

/**
 * Generate ЭТрН Титул 2 — приём груза перевозчиком.
 *
 * Подписывается перевозчиком в момент фактической погрузки. Содержит
 * фактические сведения о принятом грузе (могут отличаться от Титула 1).
 */
export function generateETrNTitle2(input: T02Input): string {
    const docDate = formatDate(input.loadingDateTime);
    const loadingTs = formatDateTime(input.loadingDateTime);
    const c = input.actualCargo;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(input.docId)}">
  <Документ ДатаДок="${docDate}" НомДок="${escapeXml(input.waybillId)}" ТипДок="ТитулПеревозчикаПрием">
    <СвУчастниковПеревозкиГруза>
      <Отправитель>
        <ЮЛ НаимОрг="${escapeXml(input.shipperName)}" ИНН="${escapeXml(input.shipperInn)}"${input.shipperKpp ? ` КПП="${escapeXml(input.shipperKpp)}"` : ''}/>
      </Отправитель>
      <Перевозчик>
        <ЮЛ НаимОрг="${escapeXml(input.carrierName)}" ИНН="${escapeXml(input.carrierInn)}"${input.carrierKpp ? ` КПП="${escapeXml(input.carrierKpp)}"` : ''}/>
      </Перевозчик>
    </СвУчастниковПеревозкиГруза>

    <СвГруз>
      <Груз Наим="${escapeXml(c.description)}" МассаГруз="${c.weightKg}"${c.volumeM3 !== undefined ? ` ОбъемГруз="${c.volumeM3}"` : ''}${c.packageType ? ` ВидУпак="${escapeXml(c.packageType)}"` : ''}${c.markingInfo ? ` Маркировка="${escapeXml(c.markingInfo)}"` : ''}/>
    </СвГруз>

    <ДатаВремяПриема>${loadingTs}</ДатаВремяПриема>

    <АдресПогрузки>${escapeXml(input.loadingAddress)}</АдресПогрузки>
${input.notes ? `
    <ПримечанияПеревозчика>${escapeXml(input.notes)}</ПримечанияПеревозчика>` : ''}

    <!-- Placeholder. Реальная КЭП присоединяется detached PKCS#7. -->
    <ПодписьПеревозчика Статус="ожидает" ИНН="${escapeXml(input.carrierInn)}"/>
  </Документ>
</Файл>`;

    return xml;
}

// ============================================================
// T05 — Consignee Acceptance (Грузополучатель принял груз)
// XSD: ON_TRNACLGRPO_1_973_05_05_01_01.xsd
// ============================================================

export interface T05Input {
    docId: string;
    waybillId: string;
    /** ИдФайл предыдущего Титула 1 — обязательная связь по приказу №348. */
    referencedT01Id: string;
    carrierInn: string;
    carrierName: string;
    carrierKpp?: string;
    consigneeInn: string;
    consigneeName: string;
    consigneeKpp?: string;
    actualCargo: ActualCargo;
    deliveryDateTime: string;
    deliveryAddress: string;
    /** true если фактический груз отличается от заявленного в T01. */
    hasDiscrepancies: boolean;
    discrepancyNotes?: string;
    /** Free-form remarks from consignee (printed into ПримечанияГрузополучателя). */
    notes?: string;
}

/**
 * Generate ЭТрН Титул 5 — приём груза грузополучателем.
 *
 * Подписывается грузополучателем в момент фактической выдачи. Фиксирует
 * фактические сведения о грузе и факт расхождений с Титулом 1.
 */
export function generateETrNTitle5(input: T05Input): string {
    const docDate = formatDate(input.deliveryDateTime);
    const deliveryTs = formatDateTime(input.deliveryDateTime);
    const c = input.actualCargo;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(input.docId)}">
  <Документ ДатаДок="${docDate}" НомДок="${escapeXml(input.waybillId)}" ТипДок="ТитулГрузополучателя">
    <СсылкаНаТитул1 ИдФайл="${escapeXml(input.referencedT01Id)}"/>

    <СвУчастниковПеревозкиГруза>
      <Перевозчик>
        <ЮЛ НаимОрг="${escapeXml(input.carrierName)}" ИНН="${escapeXml(input.carrierInn)}"${input.carrierKpp ? ` КПП="${escapeXml(input.carrierKpp)}"` : ''}/>
      </Перевозчик>
      <Получатель>
        <ЮЛ НаимОрг="${escapeXml(input.consigneeName)}" ИНН="${escapeXml(input.consigneeInn)}"${input.consigneeKpp ? ` КПП="${escapeXml(input.consigneeKpp)}"` : ''}/>
      </Получатель>
    </СвУчастниковПеревозкиГруза>

    <СвГруз>
      <Груз Наим="${escapeXml(c.description)}" МассаГруз="${c.weightKg}"${c.volumeM3 !== undefined ? ` ОбъемГруз="${c.volumeM3}"` : ''}${c.packageType ? ` ВидУпак="${escapeXml(c.packageType)}"` : ''}${c.markingInfo ? ` Маркировка="${escapeXml(c.markingInfo)}"` : ''}/>
    </СвГруз>

    <ДатаВремяВыдачи>${deliveryTs}</ДатаВремяВыдачи>

    <АдресВыдачи>${escapeXml(input.deliveryAddress)}</АдресВыдачи>

    <РасхождениеСНакладной Признак="${input.hasDiscrepancies ? 'true' : 'false'}"${input.hasDiscrepancies && input.discrepancyNotes ? `>
      <ОписаниеРасхождения>${escapeXml(input.discrepancyNotes)}</ОписаниеРасхождения>
    </РасхождениеСНакладной>` : '/>'}
${input.notes ? `
    <ПримечанияГрузополучателя>${escapeXml(input.notes)}</ПримечанияГрузополучателя>` : ''}

    <!-- Placeholder. Реальная КЭП присоединяется detached PKCS#7. -->
    <ПодписьГрузополучателя Статус="ожидает" ИНН="${escapeXml(input.consigneeInn)}"/>
  </Документ>
</Файл>`;

    return xml;
}

// ============================================================
// T06 — Carrier Delivery Completion (Перевозчик закрыл рейс)
// XSD: ON_TRNACLPVYN_1_973_06_05_01_01.xsd
// ============================================================

export interface T06Input {
    docId: string;
    waybillId: string;
    /** ИдФайл предыдущего Титула 5 — обязательная связь. */
    referencedT05Id: string;
    carrierInn: string;
    carrierName: string;
    carrierKpp?: string;
    consigneeInn: string;
    consigneeName: string;
    consigneeKpp?: string;
    /** ISO-8601 timestamp финального закрытия цикла перевозки. */
    completionDateTime: string;
    /** Итоговая стоимость перевозки, рубли (опционально). */
    totalCost?: number;
    notes?: string;
}

/**
 * Generate ЭТрН Титул 6 — финальное закрытие цикла перевозчиком.
 *
 * Подписывается перевозчиком после Титула 5 грузополучателя. Завершает
 * жизненный цикл ЭТрН и фиксирует итоговую стоимость перевозки.
 */
export function generateETrNTitle6(input: T06Input): string {
    const docDate = formatDate(input.completionDateTime);
    const completionTs = formatDateTime(input.completionDateTime);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(input.docId)}">
  <Документ ДатаДок="${docDate}" НомДок="${escapeXml(input.waybillId)}" ТипДок="ТитулПеревозчикаЗавершение">
    <СсылкаНаТитул5 ИдФайл="${escapeXml(input.referencedT05Id)}"/>

    <СвУчастниковПеревозкиГруза>
      <Перевозчик>
        <ЮЛ НаимОрг="${escapeXml(input.carrierName)}" ИНН="${escapeXml(input.carrierInn)}"${input.carrierKpp ? ` КПП="${escapeXml(input.carrierKpp)}"` : ''}/>
      </Перевозчик>
      <Получатель>
        <ЮЛ НаимОрг="${escapeXml(input.consigneeName)}" ИНН="${escapeXml(input.consigneeInn)}"${input.consigneeKpp ? ` КПП="${escapeXml(input.consigneeKpp)}"` : ''}/>
      </Получатель>
    </СвУчастниковПеревозкиГруза>

    <ДатаВремяЗавершения>${completionTs}</ДатаВремяЗавершения>
${input.totalCost !== undefined ? `
    <ИтоговаяСтоимостьПеревозки Валюта="RUB">${input.totalCost.toFixed(2)}</ИтоговаяСтоимостьПеревозки>` : ''}
${input.notes ? `
    <ПримечанияПеревозчика>${escapeXml(input.notes)}</ПримечанияПеревозчика>` : ''}

    <!-- Placeholder. Реальная КЭП присоединяется detached PKCS#7. -->
    <ПодписьПеревозчика Статус="ожидает" ИНН="${escapeXml(input.carrierInn)}"/>
  </Документ>
</Файл>`;

    return xml;
}
