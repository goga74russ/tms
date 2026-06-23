// ============================================================
// ЭПЛ XML Generator — Электронный путевой лист (главный документ).
// Формат: ФНС приказ ЕД-7-26/116@ (ВерсФорм 5.01), схема
// ON_PTLSSOBTS_1_968_01 (КНД 1110380). Структура проверяется через
// xsd-schema-validator (EPL_SCHEMA_FILE) → valid:true.
//
// ⚠️ Это ГЛАВНЫЙ документ ПЛ. Предрейсовый медосмотр (968_02),
// техконтроль/выпуск ТС (968_03), показания одометра выезд/возврат
// (968_04/05) и послерейсовый медосмотр (968_06) — ОТДЕЛЬНЫЕ документы
// ФНС, моделируются отдельными генераторами (TODO).
//
// ⚠️ Обязателен с 01.09.2026 ТОЛЬКО для маркируемого алкоголя; для
// остальных грузов — добровольный, НЕ блокер compliance.
//
// Фиктивные реквизиты не подставляются: отсутствие обязательного поля →
// EtrnIncompleteError → 422 в routes.
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
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
function formatDate(isoDate: string): string {
    const d = new Date(new Date(isoDate).getTime() + MSK_OFFSET_MS);
    return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`;
}
function formatTime(isoDate: string): string {
    const d = new Date(new Date(isoDate).getTime() + MSK_OFFSET_MS);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}
function attr(name: string, value: string | number | undefined | null): string {
    if (value === undefined || value === null || value === '') return '';
    return ` ${name}="${escapeXml(String(value))}"`;
}
function renderFio(full: string, field: string): string {
    const parts = req(full, field).trim().split(/\s+/);
    const last = parts[0] ?? '';
    const first = parts[1] ?? '';
    req(last, `${field} (фамилия)`);
    req(first, `${field} (имя)`);
    return `<ФИО Фамилия="${escapeXml(last)}" Имя="${escapeXml(first)}"${attr('Отчество', parts[2] || undefined)}/>`;
}

export interface EPLInput {
    waybillNumber: string;
    issuedAt: string;       // ISO → ДатИнфСоб/ВрИнфСоб/УИД_ПЛ/ДатаПЛ
    validDate?: string;     // ISO → ДатаИспПЛ (путевой лист на один день)

    // Перевозчик / владелец ТС (СвЛицПЛ)
    carrierName: string;
    carrierInn: string;
    carrierKpp?: string;
    carrierOgrn: string;    // ОГРН обязателен в СвЛицПЛ
    carrierAddress: string;
    carrierPhone?: string;

    // ТС
    vehicleType?: string;   // ТС/@Тип (default «Грузовой автомобиль»)
    vehicleMake: string;
    vehicleModel: string;
    vehiclePlateNumber: string;

    // Водитель
    driverFullName: string;
    driverLicenseNumber?: string;
    driverLicenseSeries?: string;
    driverLicenseIssueDate?: string; // ISO
    driverInn?: string;

    // Классификация (enum ФНС)
    transportType?: string; // ВидПрв: КП/СН/СТ (default «СН» — служебная необходимость)
    messageType?: string;   // ВидСообщ: Г/П/М (default «Г» — городское)
    postTripMedExam?: string; // ОбМедОсмПосле: 1/2 (default «2»)
    ownerType?: string;     // ЛицоОфПЛ: С/А (default «С» — собственник)

    // Подписант
    signatoryFullName?: string;
    signatoryPosition?: string;
}

/**
 * Сгенерировать XML электронного путевого листа (главный документ, 968_01).
 */
export function generateEPL(input: EPLInput): string {
    const docId = `ON_PTLSSOBTS_${input.carrierInn}_${input.carrierInn}_${formatDate(input.issuedAt).split('.').reverse().join('')}_${randomUUID()}`;
    const uid = randomUUID();

    // ВодитУд опционален, но требует все три реквизита ВУ — пишем только если есть полная триада.
    const license = input.driverLicenseNumber?.replace(/\s+/g, '');
    const vuBlock = license && input.driverLicenseSeries && input.driverLicenseIssueDate
        ? `\n        <ВодитУд НомВУ="${escapeXml(license)}" СерВУ="${escapeXml(input.driverLicenseSeries)}" ДатаВыдВУ="${formatDate(input.driverLicenseIssueDate)}"/>`
        : '';

    const contact = input.carrierPhone
        ? `\n        <Контакт>\n          <Тлф>${escapeXml(input.carrierPhone)}</Тлф>\n        </Контакт>`
        : '';

    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ КНД="1110380" ДатИнфСоб="${formatDate(input.issuedAt)}" ВрИнфСоб="${formatTime(input.issuedAt)}" НомерПЛ="${escapeXml(input.waybillNumber)}" ДатаПЛ="${formatDate(input.issuedAt)}" ПризнНачРейс="1">
    <СодИнфСоб УИД_ПЛ="${uid}" ОбМедОсмПосле="${escapeXml(input.postTripMedExam ?? '2')}" ВидПрв="${escapeXml(input.transportType ?? 'СН')}" ВидСообщ="${escapeXml(input.messageType ?? 'Г')}">
      <СрокПЛ ПЛДень="1" ДатаИспПЛ="${formatDate(input.validDate ?? input.issuedAt)}"/>
      <СвЛицПЛ ЛицоОфПЛ="${escapeXml(input.ownerType ?? 'С')}">
        <ИдСв>
          <СвЮЛУч НаимОрг="${escapeXml(input.carrierName)}" ИННЮЛ="${escapeXml(input.carrierInn)}"${attr('КПП', input.carrierKpp)} ОГРН="${escapeXml(req(input.carrierOgrn, 'перевозчик: ОГРН'))}"/>
        </ИдСв>
        <Адрес>
          <АдрИнф КодСтр="643" АдрТекст="${escapeXml(req(input.carrierAddress, 'перевозчик: адрес'))}"/>
        </Адрес>${contact}
      </СвЛицПЛ>
      <СвТС>
        <ТС Тип="${escapeXml(input.vehicleType ?? 'Грузовой автомобиль')}" Марка="${escapeXml(input.vehicleMake)}" Модель="${escapeXml(input.vehicleModel)}" РегНомер="${escapeXml(input.vehiclePlateNumber)}"/>
      </СвТС>
      <СвВодит${attr('ИННФЛ', input.driverInn)}>${vuBlock}
        ${renderFio(input.driverFullName, 'водитель: ФИО')}
      </СвВодит>
    </СодИнфСоб>
    <ПодпИнфСоб${attr('Должн', input.signatoryPosition)} СпосПодтПолном="1">
      ${renderFio(input.signatoryFullName ?? '', 'подписант ПЛ')}
    </ПодпИнфСоб>
  </Документ>
</Файл>`;
}
