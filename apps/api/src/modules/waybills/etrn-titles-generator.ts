// ============================================================
// ЭТрН XML Generators — Электронная транспортная накладная
// Тонкие («ссылочные») титулы 2, 5, 6 (приём перевозчиком / приём
// грузополучателем / выдача перевозчиком).
// Формат: ФНС приказ ЕД-7-26/1065@ (авто-ЭТрН; 383@ — водный транспорт),
// XSD-схемы 973_02 / 973_05 / 973_06 v5.01.
//
// ⚠️ АРХИТЕКТУРА: эти титулы НЕ дублируют участников/груз из Титула 1.
// Каждый ссылается на ФАЙЛ предыдущего титула через его ЭП (электронную
// подпись): Т2→файл Т1 (ИдИнфГО/@ЭП), Т5→файл Т2 (ИдИнфПрвПрием/@ЭП),
// Т6→файл Т5 (ИдИнфГП/@ЭП). Поэтому на вход подаётся ИдФайл предыдущего
// титула, дата/время его формирования и его ЭП.
//
// Структура соответствует реальным XSD ФНС (проверяется через
// xsd-schema-validator → valid:true). Значение ЭП до подключения КЭП-
// подписания (оператор/Контур) — placeholder; на XSD-валидность не влияет
// (XSD требует лишь непустую строку), но реальная отправка требует
// настоящей подписи предыдущего титула.
// ============================================================
import { randomUUID } from 'node:crypto';

/** Escape XML special characters. */
function escapeXml(str: string): string {
    return str
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// P3: даты ЭТрН форматируем в МСК (UTC+3), а не в локальной TZ сервера.
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Дата в МСК как ДД.ММ.ГГГГ (ДатаТип ФНС). */
function formatDate(isoDate: string): string {
    const d = new Date(new Date(isoDate).getTime() + MSK_OFFSET_MS);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}.${month}.${year}`;
}

/** Время в МСК как ЧЧ:ММ:СС (ВремяТип ФНС). */
function formatTime(isoDate: string): string {
    const d = new Date(new Date(isoDate).getTime() + MSK_OFFSET_MS);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

/** Дата-время в МСК как ДД.ММ.ГГГГTЧЧ:ММ:СС+03:00 (ДатаВремяВЗТип, 25 симв.). */
function formatDateTimeTZ(isoDate: string): string {
    return `${formatDate(isoDate)}T${formatTime(isoDate)}+03:00`;
}

/** Опциональный XML-атрибут. */
function attr(name: string, value: string | number | undefined | null): string {
    if (value === undefined || value === null || value === '') return '';
    return ` ${name}="${escapeXml(String(value))}"`;
}

/** Элемент <ФИО Фамилия Имя [Отчество]/> из строки «Фамилия Имя Отчество». */
function renderFio(full: string): string {
    const parts = full.trim().split(/\s+/);
    const last = parts[0] ?? '';
    const first = parts[1] ?? '';
    const middle = parts[2] || undefined;
    return `<ФИО Фамилия="${escapeXml(last)}" Имя="${escapeXml(first)}"${attr('Отчество', middle)}/>`;
}

/** Свободный адрес РФ <АдресИнф КодСтр="643" АдрТекст="..."/> (АдрИнфТип). */
function renderUserAddress(freeform: string): string {
    return `<АдресИнф КодСтр="643" АдрТекст="${escapeXml(freeform)}"/>`;
}

/** ИдФайл титула: ON_{SCHEMA}_{inn1}_{inn2}_{ГГГГММДД}_{GUID}. */
function genTitleDocId(schema: string, inn1: string, inn2: string, isoDate: string): string {
    const dateStr = formatDate(isoDate).split('.').reverse().join('');
    return `ON_${schema}_${inn1}_${inn2}_${dateStr}_${randomUUID()}`;
}

/** Ссылка на ЭП предыдущего титула (placeholder до подключения КЭП-подписания). */
export const SIGNATURE_PLACEHOLDER = 'PLACEHOLDER_ЭП_до_подключения_КЭП';

/** Shape of physical cargo facts captured at handover. */
export interface ActualCargo {
    description: string;
    weightKg: number;
    volumeM3?: number;
    packageType?: string;
    markingInfo?: string;
}

// ============================================================
// T02 — Carrier Acceptance (перевозчик принял груз у отправителя)
// XSD: ON_TRNACLPPRIN_1_973_02_05_01_01.xsd, КНД 1110340
// ============================================================

export interface T02Input {
    /** УИД транспортной накладной (сквозной для всех титулов). */
    uidTrN: string;
    /** Момент формирования Титула 2 (ISO). */
    issuedAt: string;

    /** ИдФайл подписанного Титула 1 (ИдИнфГО). */
    priorFileId: string;
    /** Момент формирования файла Титула 1 (ISO). */
    priorFileFormedAt: string;
    /** ЭП файла Титула 1 (placeholder до подключения КЭП). */
    priorSignature: string;

    /** ИНН перевозчика/отправителя — для генерации ИдФайл. */
    carrierInn: string;
    shipperInn: string;

    /** Подписант со стороны перевозчика (обычно водитель-экспедитор). */
    signatoryFullName: string;
    signatoryPosition?: string;

    /** Опц. замечания перевозчика о состоянии/таре/массе принятого груза. */
    acceptanceNote?: string;
}

/**
 * Generate ЭТрН Титул 2 — приём груза перевозчиком (КНД 1110340).
 * Тонкий титул-подтверждение: ссылается на файл Титула 1 через его ЭП,
 * добавляет подтверждение приёма и подпись перевозчика.
 */
export function generateETrNTitle2(input: T02Input): string {
    const docId = genTitleDocId('TRNACLPPRIN', input.carrierInn, input.shipperInn, input.issuedAt);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ КНД="1110340" ПоФактХЖ="Информация перевозчика о приеме груза к перевозке" ДатИнфПрвПрием="${formatDate(input.issuedAt)}" ВрИнфПрвПрием="${formatTime(input.issuedAt)}">
    <ИдИнфГО ИдФайлИнфГО="${escapeXml(input.priorFileId)}" ДатФайлИнфГО="${formatDate(input.priorFileFormedAt)}" ВрФайлИнфГО="${formatTime(input.priorFileFormedAt)}" ЭП="${escapeXml(input.priorSignature)}"/>
    <СодИнфПрвПрием УИД_ТрН="${escapeXml(input.uidTrN)}" СодОпер="Прием груза к перевозке">${input.acceptanceNote ? `
      <ЗамПрвПрием ЗамСостГруз="${escapeXml(input.acceptanceNote)}"/>` : ''}
    </СодИнфПрвПрием>
    <Подписант СтатПодп="1"${attr('Должн', input.signatoryPosition)}>
      ${renderFio(input.signatoryFullName)}
    </Подписант>
  </Документ>
</Файл>`;
}

// ============================================================
// T05 — Consignee Acceptance (грузополучатель принял груз)
// XSD: ON_TRNACLGRPO_1_973_05_05_01_01.xsd, КНД 1110341
// ============================================================

export interface T05Input {
    uidTrN: string;
    issuedAt: string;

    /** ИдФайл подписанного Титула 2 (ИдИнфПрвПрием). */
    priorFileId: string;
    priorFileFormedAt: string;
    priorSignature: string;

    consigneeInn: string;
    consigneeName: string;
    /** ИНН отправителя — для генерации ИдФайл. */
    shipperInn: string;

    actualCargo: ActualCargo;
    /** Факт. прибытие/убытие под выгрузку + заявленное прибытие (ISO). */
    deliveryArrivalAt: string;
    deliveryDepartureAt: string;
    deliveryRequestedAt: string;
    deliveryAddress: string;
    packagesAccepted: number;
    /** Общее описание состояния (обязательно, ≥1 симв.). */
    overallCondition: string;

    signatoryFullName: string;
    signatoryPosition?: string;
}

/**
 * Generate ЭТрН Титул 5 — приём груза грузополучателем (КНД 1110341).
 * Ссылается на файл Титула 2 через его ЭП; фиксирует факт приёмки,
 * фактический груз и состояние.
 */
export function generateETrNTitle5(input: T05Input): string {
    const docId = genTitleDocId('TRNACLGRPO', input.consigneeInn, input.shipperInn, input.issuedAt);
    const c = input.actualCargo;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ КНД="1110341" ПоФактХЖ="Транспортная накладная (информация грузополучателя)" ДатИнфГП="${formatDate(input.issuedAt)}" ВрИнфГП="${formatTime(input.issuedAt)}" НаимЭконСубСост="${escapeXml(input.consigneeName)}">
    <ИдИнфПрвПрием ИдФайлИнфПрвПрием="${escapeXml(input.priorFileId)}" ДатФайлПрвПрием="${formatDate(input.priorFileFormedAt)}" ВрФайлПрвПрием="${formatTime(input.priorFileFormedAt)}" ЭП="${escapeXml(input.priorSignature)}"/>
    <СодИнфГП УИД_ТрН="${escapeXml(input.uidTrN)}" СодОпПр="Груз принят грузополучателем">
      <ПриемГрузГП ФДатВрПриб="${formatDateTimeTZ(input.deliveryArrivalAt)}" НалКоорТочВрФПр="0" ФДатВрУбыт="${formatDateTimeTZ(input.deliveryDepartureAt)}" НалКоорТочВрФУб="0" ЗаявДатВрПриб="${formatDateTimeTZ(input.deliveryRequestedAt)}" НалКоорТочВрЗПр="0" КолМестПриемЧ="${input.packagesAccepted}" ОбщСвСост="${escapeXml(input.overallCondition)}" МасБрутЗначПрием="${c.weightKg}">
        <АдрВыгруз>${renderUserAddress(input.deliveryAddress)}</АдрВыгруз>
        <СвПринПоНаим НаимГруз="${escapeXml(c.description)}" СостГруз="${escapeXml(c.packageType ?? 'Без повреждений')}" КолМест="${input.packagesAccepted}">
          <МасГруз МасБрутЗнач="${c.weightKg}"/>
        </СвПринПоНаим>
      </ПриемГрузГП>
    </СодИнфГП>
    <Подписант СтатПодп="1"${attr('Должн', input.signatoryPosition)}>
      ${renderFio(input.signatoryFullName)}
    </Подписант>
  </Документ>
</Файл>`;
}

// ============================================================
// T06 — Carrier Delivery (перевозчик выдал груз грузополучателю)
// XSD: ON_TRNACLPVYN_1_973_06_05_01_01.xsd, КНД 1110342
// ============================================================

export interface T06Input {
    uidTrN: string;
    issuedAt: string;

    /** ИдФайл подписанного Титула 5 (ИдИнфГП). */
    priorFileId: string;
    priorFileFormedAt: string;
    priorSignature: string;

    carrierInn: string;
    /** ИНН грузополучателя — для генерации ИдФайл. */
    consigneeInn: string;

    signatoryFullName: string;
    signatoryPosition?: string;
    /** Опц. содержание операции выдачи. */
    operationNote?: string;
}

/**
 * Generate ЭТрН Титул 6 — выдача груза перевозчиком (КНД 1110342),
 * завершающий титул цикла. Ссылается на файл Титула 5 через его ЭП.
 */
export function generateETrNTitle6(input: T06Input): string {
    const docId = genTitleDocId('TRNACLPVYN', input.carrierInn, input.consigneeInn, input.issuedAt);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ КНД="1110342" ПоФактХЖ="Информация перевозчика о выдаче груза грузополучателю" ДатИнфПрвВыд="${formatDate(input.issuedAt)}" ВрИнфПрвВыд="${formatTime(input.issuedAt)}">
    <ИдИнфГП ИдФайлИнфГП="${escapeXml(input.priorFileId)}" ДатФайлИнфГП="${formatDate(input.priorFileFormedAt)}" ВрФайлИнфГП="${formatTime(input.priorFileFormedAt)}" ЭП="${escapeXml(input.priorSignature)}"/>
    <СодПрвВыд УИД_ТрН="${escapeXml(input.uidTrN)}" СодОпер="${escapeXml(input.operationNote ?? 'Выдача груза грузополучателю завершена')}"/>
    <Подписант СтатПодп="1"${attr('Должн', input.signatoryPosition)}>
      ${renderFio(input.signatoryFullName)}
    </Подписант>
  </Документ>
</Файл>`;
}
