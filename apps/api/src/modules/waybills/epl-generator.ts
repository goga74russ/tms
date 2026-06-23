// ============================================================
// ЭПЛ XML Generator — Электронный путевой лист.
// Формат: ФНС приказ ЕД-7-26/116@ (формат эл. путевого листа).
// Структура 116@ — файлы обмена: путевой лист (маршрут/ТС/водитель),
// предрейсовый медосмотр, показания одометра выезд/возврат, опц.
// предрейсовый техконтроль и послесменный медосмотр.
//
// ⚠️ Первая версия: структурно приближено к XSD приказа 116@.
// Точные имена элементов и ВерсФорм финализируются после подключения
// реальных XSD ФНС (см. xsd-validator) + подтверждения /jurist действующей
// на 01.09.2026 редакции приказа. Фиктивные реквизиты не подставляются —
// сборка входа в routes.ts отказывает (422) при отсутствии ИНН перевозчика.
// ============================================================
import { escapeXml, formatDate, genDocId, attr } from './epd-helpers.js';

export interface EPLInput {
    waybillNumber: string;
    issuedAt: string;        // ISO
    validFrom?: string;      // ISO
    validTo?: string;        // ISO

    // Перевозчик (организация рейса)
    carrierName: string;
    carrierInn: string;
    carrierKpp?: string;
    carrierAddress: string;

    // ТС
    vehicleMake: string;
    vehicleModel: string;
    vehiclePlateNumber: string;
    vehicleVin?: string;

    // Водитель
    driverFullName: string;
    driverLicenseNumber: string;

    // Маршрут
    loadingAddress?: string;
    unloadingAddress?: string;

    // Предрейсовый медосмотр
    med?: {
        decision: 'approved' | 'rejected';
        systolicBp?: number;
        diastolicBp?: number;
        heartRate?: number;
        temperature?: number;
        medicName?: string;
        at?: string; // ISO
    };

    // Предрейсовый техконтроль
    tech?: {
        decision: 'approved' | 'rejected';
        mechanicName?: string;
        at?: string; // ISO
    };

    // Одометр / выезд-возврат
    odometerOut?: number;
    odometerIn?: number;
    departureAt?: string; // ISO
    returnAt?: string;    // ISO
}

/**
 * Сгенерировать XML электронного путевого листа (ЭПЛ) по структуре 116@.
 * Один документ <Файл> с разделами: участник (перевозчик), ТС, водитель,
 * маршрут, медосмотр, техконтроль, показания одометра.
 */
export function generateEPL(input: EPLInput): string {
    const docId = genDocId('EPL', input.carrierInn, input.carrierInn, input.issuedAt);
    const docDate = formatDate(input.issuedAt);

    const medBlock = input.med ? `
      <ПредрейсМедОсмотр Решение="${input.med.decision === 'approved' ? 'допущен' : 'не допущен'}"${attr('ДатаВремя', input.med.at ? formatDate(input.med.at) : undefined)}>
        <Показатели${attr('АД_Сист', input.med.systolicBp)}${attr('АД_Диаст', input.med.diastolicBp)}${attr('Пульс', input.med.heartRate)}${attr('Температура', input.med.temperature)}/>
        ${input.med.medicName ? `<Медработник ФИО="${escapeXml(input.med.medicName)}"/>` : ''}
      </ПредрейсМедОсмотр>` : '';

    const techBlock = input.tech ? `
      <ПредрейсТехКонтроль Решение="${input.tech.decision === 'approved' ? 'исправен' : 'неисправен'}"${attr('ДатаВремя', input.tech.at ? formatDate(input.tech.at) : undefined)}>
        ${input.tech.mechanicName ? `<Контролёр ФИО="${escapeXml(input.tech.mechanicName)}"/>` : ''}
      </ПредрейсТехКонтроль>` : '';

    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ ВидДок="ЭлПутевойЛист" ДатаДок="${docDate}" НомДок="${escapeXml(input.waybillNumber)}"${attr('ДействУетС', input.validFrom ? formatDate(input.validFrom) : undefined)}${attr('ДействУетПо', input.validTo ? formatDate(input.validTo) : undefined)}>
    <СвПеревозчик>
      <ЮЛ НаимОрг="${escapeXml(input.carrierName)}" ИНН="${escapeXml(input.carrierInn)}"${attr('КПП', input.carrierKpp)}/>
      <Адрес>${escapeXml(input.carrierAddress)}</Адрес>
    </СвПеревозчик>
    <СвТС Марка="${escapeXml(input.vehicleMake + ' ' + input.vehicleModel)}" ГосНом="${escapeXml(input.vehiclePlateNumber)}"${attr('VIN', input.vehicleVin)}/>
    <СвВодит ФИО="${escapeXml(input.driverFullName)}" ВУ="${escapeXml(input.driverLicenseNumber)}"/>
    <Маршрут>
      ${input.loadingAddress ? `<ПунктПогрузки Адрес="${escapeXml(input.loadingAddress)}"/>` : ''}
      ${input.unloadingAddress ? `<ПунктРазгрузки Адрес="${escapeXml(input.unloadingAddress)}"/>` : ''}
    </Маршрут>${medBlock}${techBlock}
    <ПоказанияОдометра${attr('Выезд', input.odometerOut)}${attr('Возврат', input.odometerIn)}${attr('ВремяВыезда', input.departureAt ? formatDate(input.departureAt) : undefined)}${attr('ВремяВозврата', input.returnAt ? formatDate(input.returnAt) : undefined)}/>
  </Документ>
</Файл>`;
}
