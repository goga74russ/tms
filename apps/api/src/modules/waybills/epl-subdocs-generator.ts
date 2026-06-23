// ============================================================
// ЭПЛ суб-документы (приказ ФНС ЕД-7-26/116@, часть 968) — отдельные
// файлы обмена, дополняющие главный путевой лист (ON_PTLSSOBTS_968_01):
//   968_02 предрейсовый медосмотр       ON_PTLSPRMO  (КНД 1110381)
//   968_03 контроль техсостояния/выпуск ON_PTLSVIPTS (КНД 1110382)
//   968_04 одометр при выезде           ON_PTLSODVZD (КНД 1110383)
//   968_05 одометр при заезде в парк    ON_PTLSODPARK(КНД 1110384)
//   968_06 послерейсовый медосмотр      ON_PTLSPOSMO (КНД 1110385)
//
// Документы образуют цепочку: каждый ссылается на файл предыдущего через
// его ЭП (placeholder до подключения КЭП-обмена, Контур). Все проходят
// реальную XSD ФНС (xsd-schema-validator) → valid:true.
//
// ⚠️ Медосмотры по формату 5.01 передают ТОЛЬКО факт «прошёл/допущен»
// (ОтметМО* — фикс. enum), показателей АД/пульса/алкотеста в схеме нет.
// Фиктивные реквизиты не подставляются: req() → EtrnIncompleteError → 422.
// ============================================================
import { randomUUID } from 'node:crypto';
import { EtrnIncompleteError } from './etrn-generator.js';

function req<T>(value: T | undefined | null, field: string): T {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        throw new EtrnIncompleteError(field);
    }
    return value;
}
function escapeXml(str: string): string {
    return str
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
const MSK = 3 * 60 * 60 * 1000;
function fmtDate(iso: string): string {
    const d = new Date(new Date(iso).getTime() + MSK);
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}
function fmtTime(iso: string): string {
    const d = new Date(new Date(iso).getTime() + MSK);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}
function fmtTZ(iso: string): string {
    return `${fmtDate(iso)}T${fmtTime(iso)}+03:00`;
}
function attr(name: string, value: string | number | undefined | null): string {
    if (value === undefined || value === null || value === '') return '';
    return ` ${name}="${escapeXml(String(value))}"`;
}
function fio(full: string, field: string): string {
    const p = req(full, field).trim().split(/\s+/);
    req(p[0], `${field} (фамилия)`);
    req(p[1], `${field} (имя)`);
    return `<ФИО Фамилия="${escapeXml(p[0]!)}" Имя="${escapeXml(p[1]!)}"${attr('Отчество', p[2] || undefined)}/>`;
}
function docId(schema: string, carrierInn: string, iso: string): string {
    return `ON_${schema}_${carrierInn}_${fmtDate(iso).split('.').reverse().join('')}_${randomUUID()}`;
}

/** ЭП файла-предшественника в цепочке (placeholder до подключения КЭП). */
export const SIGNATURE_PLACEHOLDER = 'PLACEHOLDER_ЭП_до_подключения_КЭП';

/** Реквизиты лицензии медорганизации. */
export interface MedLicense {
    seria: string;        // Сер
    number: string;       // Ном
    issueDate: string;    // ISO → ДатВыд
    expiryDate: string;   // ISO → Срок
}

/** Ссылка на файл-предшественник в цепочке ЭПЛ. */
export interface PriorRef {
    fileId: string;
    formedAt: string;     // ISO
    signature: string;    // ЭП (placeholder до КЭП)
}

interface MedExamInput {
    waybillUid: string;       // УИД_ПЛ
    issuedAt: string;
    carrierInn: string;
    prior: PriorRef;
    examAt: string;           // ISO → ДатВрПрМО
    medOrgName: string;
    medicFullName: string;
    medicPosition?: string;
    license: MedLicense;
    driverFullName: string;
    driverInn?: string;
    driverLicenseNumber?: string;
    driverLicenseSeries?: string;
    driverLicenseIssueDate?: string; // ISO
    signatoryFullName: string;
    signatoryPosition?: string;
}

function renderMedOrg(i: MedExamInput): string {
    const l = i.license;
    return `<СвМедОрг НаимМедОрг="${escapeXml(req(i.medOrgName, 'медорганизация: наименование'))}"${attr('Должн', i.medicPosition)}>
        ${fio(i.medicFullName, 'медработник: ФИО')}
        <ЛицензМО Сер="${escapeXml(req(l.seria, 'лицензия МО: серия'))}" Ном="${escapeXml(req(l.number, 'лицензия МО: номер'))}" ДатВыд="${fmtDate(req(l.issueDate, 'лицензия МО: дата выдачи'))}" Срок="${fmtDate(req(l.expiryDate, 'лицензия МО: срок'))}"/>
      </СвМедОрг>`;
}
function renderDriver(i: MedExamInput): string {
    const vu = i.driverLicenseNumber && i.driverLicenseSeries && i.driverLicenseIssueDate
        ? `\n          <ВодитУд НомВУ="${escapeXml(i.driverLicenseNumber.replace(/\s+/g, ''))}" СерВУ="${escapeXml(i.driverLicenseSeries)}" ДатаВыдВУ="${fmtDate(i.driverLicenseIssueDate)}"/>`
        : '';
    return `<СвВодит${attr('ИННФЛ', i.driverInn)}>${vu}
          ${fio(i.driverFullName, 'водитель: ФИО')}
        </СвВодит>`;
}

/** 968_02 — предрейсовый/предсменный медосмотр (КНД 1110381). */
export function generateEPLPreTripMed(input: MedExamInput): string {
    const id = docId('PTLSPRMO', input.carrierInn, input.issuedAt);
    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(id)}">
  <Документ КНД="1110381" ДатИнфМО="${fmtDate(input.issuedAt)}" ВрИнфМО="${fmtTime(input.issuedAt)}">
    <ИдИнфСоб ИдФайлИнфСоб="${escapeXml(input.prior.fileId)}" ДатФайлИнфСоб="${fmtDate(input.prior.formedAt)}" ВрФайлИнфСоб="${fmtTime(input.prior.formedAt)}" ЭП="${escapeXml(input.prior.signature)}"/>
    <СодИнфМО УИД_ПЛ="${escapeXml(input.waybillUid)}" ВидМО="1">
      ${renderMedOrg(input)}
      <СвМОПред ДатВрПрМО="${fmtTZ(input.examAt)}" НалКоорТочВрПрМО="0" ОтметМОПред="Прошел предсменный медицинский осмотр, к исполнению трудовых обязанностей допущен">
        ${renderDriver(input)}
      </СвМОПред>
    </СодИнфМО>
    <ПодпИнфМО${attr('Должн', input.signatoryPosition)} СпосПодтПолном="1">
      ${fio(input.signatoryFullName, 'подписант медосмотра')}
    </ПодпИнфМО>
  </Документ>
</Файл>`;
}

/** 968_06 — послерейсовый/послесменный медосмотр (КНД 1110385). */
export function generateEPLPostTripMed(input: MedExamInput): string {
    const id = docId('PTLSPOSMO', input.carrierInn, input.issuedAt);
    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(id)}">
  <Документ КНД="1110385" ДатИнфМО="${fmtDate(input.issuedAt)}" ВрИнфМО="${fmtTime(input.issuedAt)}">
    <ИдИнфЗаезд ИдФайлИнфЗаезд="${escapeXml(input.prior.fileId)}" ДатФайлИнфЗаезд="${fmtDate(input.prior.formedAt)}" ВрФайлИнфЗаезд="${fmtTime(input.prior.formedAt)}" ЭП="${escapeXml(input.prior.signature)}"/>
    <СодИнфМО УИД_ПЛ="${escapeXml(input.waybillUid)}" ВидМО="2">
      ${renderMedOrg(input)}
      <СвМОПосл ДатВрПрМО="${fmtTZ(input.examAt)}" НалКоорТочВрПрМО="0" ОтметМОПосл="Прошел послерейсовый медицинский осмотр">
        ${renderDriver(input)}
      </СвМОПосл>
    </СодИнфМО>
    <ПодпИнфМО${attr('Должн', input.signatoryPosition)} СпосПодтПолном="1">
      ${fio(input.signatoryFullName, 'подписант медосмотра')}
    </ПодпИнфМО>
  </Документ>
</Файл>`;
}

/** 968_03 — контроль техсостояния и выпуск ТС на линию (КНД 1110382). */
export interface EPLVehicleControlInput {
    waybillUid: string;
    issuedAt: string;
    carrierInn: string;
    prior: PriorRef;
    controlAt: string;        // ISO → ДатВрКонтТехСост
    releaseAt: string;        // ISO → ДатВрВыпНаЛин
    serviceable: boolean;     // ОтметКонтТехСост 1/2
    vehicleType: string;
    vehicleMake: string;
    vehicleModel: string;
    vehiclePlateNumber: string;
    controllerFullName: string;
    controllerPosition?: string;
    signatoryFullName: string;
    signatoryPosition?: string;
}
export function generateEPLVehicleControl(input: EPLVehicleControlInput): string {
    const id = docId('PTLSVIPTS', input.carrierInn, input.issuedAt);
    const ok = input.serviceable;
    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(id)}">
  <Документ КНД="1110382" ДатИнфТехСост="${fmtDate(input.issuedAt)}" ВрИнфТехСост="${fmtTime(input.issuedAt)}">
    <ИдИнфСоб ИдФайлИнфСоб="${escapeXml(input.prior.fileId)}" ДатФайлИнфСоб="${fmtDate(input.prior.formedAt)}" ВрФайлИнфСоб="${fmtTime(input.prior.formedAt)}" ЭП="${escapeXml(input.prior.signature)}"/>
    <СодИнфТехСост УИД_ПЛ="${escapeXml(input.waybillUid)}" ДатВрКонтТехСост="${fmtTZ(input.controlAt)}" НалКоорТочВрКонтТехСост="0" ОтметКонтТехСост="${ok ? '1' : '2'}"${ok ? ` ДатВрВыпНаЛин="${fmtTZ(input.releaseAt)}" НалКоорТочВрВыпНаЛин="0"` : ''}>
      <СвОтвЛиц${attr('Должн', input.controllerPosition ?? 'Контролёр технического состояния АТС')}>
        ${fio(input.controllerFullName, 'контролёр техсостояния: ФИО')}
      </СвОтвЛиц>
      <СвТС>
        <ТС Тип="${escapeXml(input.vehicleType)}" Марка="${escapeXml(input.vehicleMake)}" Модель="${escapeXml(input.vehicleModel)}" РегНомер="${escapeXml(input.vehiclePlateNumber)}"/>
      </СвТС>
    </СодИнфТехСост>
    <ПодпИнфТехСост${attr('Должн', input.signatoryPosition)} СпосПодтПолном="1">
      ${fio(input.signatoryFullName, 'подписант техконтроля')}
    </ПодпИнфТехСост>
  </Документ>
</Файл>`;
}

/** 968_04 — показания одометра при выезде (КНД 1110383). */
export interface EPLOdometerOutInput {
    waybillUid: string;
    issuedAt: string;
    carrierInn: string;
    prior: PriorRef;
    departureAt: string;      // ISO → ДатВрВыезд
    odometer: number;         // ОдомВыезд (км, ≤7 знаков)
    responsibleFullName: string;
    responsiblePosition?: string;
    signatoryFullName: string;
    signatoryPosition?: string;
}
export function generateEPLOdometerOut(input: EPLOdometerOutInput): string {
    const id = docId('PTLSODVZD', input.carrierInn, input.issuedAt);
    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(id)}">
  <Документ КНД="1110383" ДатИнфВыезд="${fmtDate(input.issuedAt)}" ВрИнфВыезд="${fmtTime(input.issuedAt)}">
    <ИдИнфТехСост ИдФайлИнфТехСост="${escapeXml(input.prior.fileId)}" ДатФайлИнфТехСост="${fmtDate(input.prior.formedAt)}" ВрФайлИнфТехСост="${fmtTime(input.prior.formedAt)}" ЭП="${escapeXml(input.prior.signature)}"/>
    <СодИнфВыезд УИД_ПЛ="${escapeXml(input.waybillUid)}" ПризнНачРейс="1">
      <СвОдомВыезд ДатВрВыезд="${fmtTZ(input.departureAt)}" НалКоорТочВрВыезд="0" ОдомВыезд="${Math.trunc(req(input.odometer, 'одометр: выезд'))}"/>
      <СвУплЛиц${attr('Должн', input.responsiblePosition ?? 'Механик')}>
        ${fio(input.responsibleFullName, 'уполномоченное лицо: ФИО')}
      </СвУплЛиц>
    </СодИнфВыезд>
    <ПодпИнфВыезд${attr('Должн', input.signatoryPosition)} ТипПодпис="1" СпосПодтПолном="1">
      ${fio(input.signatoryFullName, 'подписант выезда')}
    </ПодпИнфВыезд>
  </Документ>
</Файл>`;
}

/** 968_05 — показания одометра при заезде в парк (КНД 1110384). */
export interface EPLOdometerInInput {
    waybillUid: string;
    issuedAt: string;
    carrierInn: string;
    prior: PriorRef;
    returnAt: string;         // ISO → ДатВрЗаезд
    odometer: number;         // ОдомЗаезд
    responsibleFullName: string;
    responsiblePosition?: string;
    signatoryFullName: string;
    signatoryPosition?: string;
}
export function generateEPLOdometerIn(input: EPLOdometerInInput): string {
    const id = docId('PTLSODPARK', input.carrierInn, input.issuedAt);
    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(id)}">
  <Документ КНД="1110384" ДатИнфЗаезд="${fmtDate(input.issuedAt)}" ВрИнфЗаезд="${fmtTime(input.issuedAt)}">
    <ИдИнфВыезд ИдФайлИнфВыезд="${escapeXml(input.prior.fileId)}" ДатФайлИнфВыезд="${fmtDate(input.prior.formedAt)}" ВрФайлИнфВыезд="${fmtTime(input.prior.formedAt)}" ЭП="${escapeXml(input.prior.signature)}"/>
    <СодИнфЗаезд УИД_ПЛ="${escapeXml(input.waybillUid)}" ПризнКонцРейс="1">
      <СвОдомЗаезд ДатВрЗаезд="${fmtTZ(input.returnAt)}" НалКоорТочВрЗаезд="0" ОдомЗаезд="${Math.trunc(req(input.odometer, 'одометр: заезд'))}"/>
      <СвУплЛиц${attr('Должн', input.responsiblePosition ?? 'Механик контрольно-технического пункта')}>
        ${fio(input.responsibleFullName, 'уполномоченное лицо: ФИО')}
      </СвУплЛиц>
    </СодИнфЗаезд>
    <ПодпИнфЗаезд${attr('Должн', input.signatoryPosition)} ТипПодпис="1" СпосПодтПолном="1">
      ${fio(input.signatoryFullName, 'подписант заезда')}
    </ПодпИнфЗаезд>
  </Документ>
</Файл>`;
}
