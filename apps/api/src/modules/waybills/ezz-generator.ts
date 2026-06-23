// ============================================================
// ЭЗЗ XML Generator — Электронный заказ и заявка (на перевозку).
// Формат: ФНС приказ ЕД-7-26/108@ (формат эл. заказа и заявки).
// ⚠️ Обязателен для ВСЕХ грузов с 01.09.2026 — приоритет наравне с ЭТрН
// (отдельный документ на каждую перевозку). Поэтому ЭЗЗ важнее ЭПЛ.
// Структура 108@ — файл обмена информации грузоотправителя: сведения о
// грузоотправителе, перевозчике, уполномоченных лицах, адресах подачи ТС,
// погрузки и выгрузки, о грузе, о параметрах ТС, необходимых для перевозки.
//
// ⚠️ Первая версия: структурно приближено к XSD приказа 108@. Точные имена
// элементов и ВерсФорм финализируются после подключения реальных XSD ФНС +
// подтверждения /jurist действующей на 01.09.2026 редакции (108@ действует
// до 01.09.2026 — возможен приказ-преемник). Фиктивные реквизиты не
// подставляются — сборка входа отказывает (422) при отсутствии ИНН.
// ============================================================
import { escapeXml, formatDate, genDocId, attr } from './epd-helpers.js';

export interface EZZInput {
    orderNumber: string;
    issuedAt: string; // ISO (дата заказа/заявки)

    // Грузоотправитель (контрагент заказа)
    shipperName: string;
    shipperInn: string;
    shipperKpp?: string;
    shipperAddress: string;

    // Перевозчик (организация)
    carrierName: string;
    carrierInn: string;
    carrierKpp?: string;
    carrierAddress: string;

    // Адреса
    dispatchAddress?: string;  // подача ТС
    loadingAddress: string;    // погрузка
    unloadingAddress: string;  // выгрузка

    // Груз
    cargoDescription: string;
    cargoWeight?: number;   // кг
    cargoVolume?: number;   // м³
    cargoPackages?: number; // мест
    cargoType?: string;

    // Параметры требуемого ТС
    bodyType?: string;            // тип кузова
    payloadCapacityKg?: number;   // грузоподъёмность
    payloadVolumeM3?: number;     // объём

    // Сроки
    loadingDate?: string;   // ISO
    unloadingDate?: string; // ISO
}

/**
 * Сгенерировать XML электронного заказа/заявки (ЭЗЗ) по структуре 108@.
 * Файл обмена информации грузоотправителя: участники, адреса, груз, параметры ТС.
 */
export function generateEZZ(input: EZZInput): string {
    const docId = genDocId('EZZ', input.carrierInn, input.shipperInn, input.issuedAt);
    const docDate = formatDate(input.issuedAt);

    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ ВидДок="ЭлЗаказЗаявка" ДатаДок="${docDate}" НомДок="${escapeXml(input.orderNumber)}">
    <СвГрузоотправитель>
      <ЮЛ НаимОрг="${escapeXml(input.shipperName)}" ИНН="${escapeXml(input.shipperInn)}"${attr('КПП', input.shipperKpp)}/>
      <Адрес>${escapeXml(input.shipperAddress)}</Адрес>
    </СвГрузоотправитель>
    <СвПеревозчик>
      <ЮЛ НаимОрг="${escapeXml(input.carrierName)}" ИНН="${escapeXml(input.carrierInn)}"${attr('КПП', input.carrierKpp)}/>
      <Адрес>${escapeXml(input.carrierAddress)}</Адрес>
    </СвПеревозчик>
    <Адреса>
      ${input.dispatchAddress ? `<ПунктПодачиТС Адрес="${escapeXml(input.dispatchAddress)}"/>` : ''}
      <ПунктПогрузки Адрес="${escapeXml(input.loadingAddress)}"${attr('Дата', input.loadingDate ? formatDate(input.loadingDate) : undefined)}/>
      <ПунктВыгрузки Адрес="${escapeXml(input.unloadingAddress)}"${attr('Дата', input.unloadingDate ? formatDate(input.unloadingDate) : undefined)}/>
    </Адреса>
    <СвГруз Наим="${escapeXml(input.cargoDescription)}"${attr('Вид', input.cargoType)}${attr('МассаГруз', input.cargoWeight)}${attr('ОбъемГруз', input.cargoVolume)}${attr('КолМест', input.cargoPackages)}/>
    <ПараметрыТС${attr('ТипКузова', input.bodyType)}${attr('Грузоподъемность', input.payloadCapacityKg)}${attr('Объем', input.payloadVolumeM3)}/>
  </Документ>
</Файл>`;
}
