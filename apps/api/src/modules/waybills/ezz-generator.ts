// ============================================================
// ЭЗЗ XML Generator — Электронный заказ/заявка, ИНФОРМАЦИЯ ПЕРЕВОЗЧИКА.
// Формат: ФНС приказ ЕД-7-26/108@, схема ON_ZAKZVPER_1_969_02 (КНД 1110362,
// ВерсФорм 5.01, ред. с 01.01.2026). Структура проверяется через
// xsd-schema-validator (EZZ_SCHEMA_FILE) → valid:true.
//
// ⚠️ Это документ ПЕРЕВОЗЧИКА (акцепт заявки): водитель, ТС, расчёт платы +
// ссылка на файл заявки ГРУЗООТПРАВИТЕЛЯ через его ЭП (ИдИнфГО). Парный
// первичный документ грузоотправителя — ON_ZAKZVGO_1_969_01 (его XSD ФНС
// по прямым URL пока не отдаёт; ждём из пакета 108@ / от Контура).
//
// Значение ЭП заявки ГО — placeholder до подключения КЭП-обмена (Контур).
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
function formatDateTimeTZ(isoDate: string): string {
    return `${formatDate(isoDate)}T${formatTime(isoDate)}+03:00`;
}
function attr(name: string, value: string | number | undefined | null): string {
    if (value === undefined || value === null || value === '') return '';
    return ` ${name}="${escapeXml(String(value))}"`;
}
/** Свободный адрес <Адрес><АдрИнф КодСтр="643" АдрТекст="..."/></Адрес>. */
function renderAddr(freeform: string, field: string): string {
    return `<Адрес>
            <АдрИнф КодСтр="643" АдрТекст="${escapeXml(req(freeform, field))}"/>
          </Адрес>`;
}
function renderFio(full: string, field: string): string {
    const parts = req(full, field).trim().split(/\s+/);
    req(parts[0], `${field} (фамилия)`);
    req(parts[1], `${field} (имя)`);
    return `<ФИО Фамилия="${escapeXml(parts[0]!)}" Имя="${escapeXml(parts[1]!)}"${attr('Отчество', parts[2] || undefined)}/>`;
}

/** Ссылка на ЭП заявки грузоотправителя (placeholder до подключения КЭП). */
export const SIGNATURE_PLACEHOLDER = 'PLACEHOLDER_ЭП_до_подключения_КЭП';

export interface EZZCarrierInput {
    orderNumber: string;     // УИД_Зак
    issuedAt: string;        // ISO → ДатИнфПрв/ВрИнфПрв

    // Перевозчик-составитель
    carrierName: string;     // НаимЭкСубСост
    carrierInn: string;
    shipperInn: string;      // для ИдФайл

    // Ссылка на файл заявки грузоотправителя (ИдИнфГО)
    shipperFileId: string;
    shipperFileFormedAt: string; // ISO
    shipperSignature: string;    // ЭП (placeholder)

    // Контактное лицо перевозчика (СвЛицОргПрвз)
    contactFullName: string;
    contactPhone: string;

    // Водитель (СвВодит) — НомВУ/СерВУ/ДатаВыдВУ/ИННФЛ обязательны по XSD
    driverFullName: string;
    driverLicenseNumber: string;
    driverLicenseSeries: string;
    driverLicenseIssueDate: string; // ISO
    driverInn: string;
    driverPhone: string;

    // ТС (СвТС/ПарТС)
    vehiclePlateNumber: string;
    vehicleType?: string;          // ПарТС/@Тип (default «Грузовой автомобиль»)
    vehicleMake: string;
    vehicleModel?: string;
    vehicleCapacityTons: number;   // Грузопод
    vehicleVolumeM3: number;       // Вместим

    // Расчёт платы (РазмПлатРасчет)
    carrierCost: number;           // СтТовБезНДС
    carrierCostWithVat: number;    // СтТовУчНал
    vatRate: string;               // НалСт (например «20%»)
    currencyCode?: string;         // КодОКВ (default «643» — RUB)

    // Подписант перевозчика
    signatoryFullName?: string;
    signatoryPosition?: string;
}

/**
 * Сгенерировать XML ЭЗЗ — информация перевозчика (969_02, акцепт заявки).
 */
export function generateEZZCarrier(input: EZZCarrierInput): string {
    const docId = `ON_ZAKZVPER_${input.carrierInn}_${input.shipperInn}_${formatDate(input.issuedAt).split('.').reverse().join('')}_${randomUUID()}`;

    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ КНД="1110362" ДатИнфПрв="${formatDate(input.issuedAt)}" ВрИнфПрв="${formatTime(input.issuedAt)}" НаимЭкСубСост="${escapeXml(input.carrierName)}">
    <ИдИнфГО ИдФайлИнфГО="${escapeXml(req(input.shipperFileId, 'ссылка на заявку грузоотправителя'))}" ДатФайлИнфГО="${formatDate(input.shipperFileFormedAt)}" ВрФайлИнфГО="${formatTime(input.shipperFileFormedAt)}" ЭП="${escapeXml(req(input.shipperSignature, 'ЭП заявки грузоотправителя'))}"/>
    <СодИнфПрв УИД_Зак="${escapeXml(input.orderNumber)}" СодОпер="1">
      <СвЛицОргПрвз>
        <Тлф>${escapeXml(req(input.contactPhone, 'перевозчик: телефон контактного лица'))}</Тлф>
        ${renderFio(input.contactFullName, 'перевозчик: ответственное лицо')}
      </СвЛицОргПрвз>
      <СвВодит НомВУ="${escapeXml(req(input.driverLicenseNumber, 'водитель: номер ВУ').replace(/\s+/g, ''))}" СерВУ="${escapeXml(req(input.driverLicenseSeries, 'водитель: серия ВУ'))}" ДатаВыдВУ="${formatDate(req(input.driverLicenseIssueDate, 'водитель: дата выдачи ВУ'))}" ИННФЛ="${escapeXml(req(input.driverInn, 'водитель: ИНН'))}">
        <Тлф>${escapeXml(req(input.driverPhone, 'водитель: телефон'))}</Тлф>
        ${renderFio(input.driverFullName, 'водитель: ФИО')}
      </СвВодит>
      <СвТС>
        <ТС РегНомер="${escapeXml(input.vehiclePlateNumber)}" ТипВлад="1">
          <ПарТС Тип="${escapeXml(input.vehicleType ?? 'Грузовой автомобиль')}" Марка="${escapeXml((input.vehicleMake + (input.vehicleModel ? ' ' + input.vehicleModel : '')).trim())}" Грузопод="${input.vehicleCapacityTons.toFixed(2)}" Вместим="${input.vehicleVolumeM3.toFixed(2)}"/>
        </ТС>
      </СвТС>
      <РазмПлатРасчет КодОКВ="${escapeXml(input.currencyCode ?? '643')}" СтТовБезНДС="${input.carrierCost.toFixed(2)}" НалСт="${escapeXml(input.vatRate)}" СтТовУчНал="${input.carrierCostWithVat.toFixed(2)}"/>
    </СодИнфПрв>
    <ПодпИнфПрв${attr('Должн', input.signatoryPosition)} СпосПодтПолном="1">
      ${renderFio(input.signatoryFullName ?? '', 'подписант перевозчика')}
    </ПодпИнфПрв>
  </Документ>
</Файл>`;
}

// ============================================================
// ЭЗЗ — ПЕРВИЧНАЯ заказ-заявка ГРУЗООТПРАВИТЕЛЯ.
// Формат: ФНС приказ ЕД-7-26/108@, схема ON_ZAKZVGO_1_969_01 (КНД 1110361).
// Несёт груз/адреса/участников — формируется из данных заказа TMS, без
// зависимости от входящего ЭДО. Это обязательный документ на каждую перевозку.
// ============================================================

export interface EZZShipperInput {
    orderNumber: string;     // НомЗак
    issuedAt: string;        // ISO → ДатИнфГО/ВрИнфГО/ДатаЗак

    // Грузоотправитель (СвГО) — составитель
    shipperName: string;     // НаимЭкСубСост + СвЮЛУч
    shipperInn: string;
    shipperKpp?: string;
    shipperPhone: string;

    // Перевозчик (СвПрв)
    carrierName: string;
    carrierInn: string;
    carrierKpp?: string;
    carrierPhone: string;

    // Подача ТС (ПунктПод)
    dispatchAt: string;      // ISO → ДатВрПод
    dispatchAddress: string;

    // Погрузка (АдрПункт Опер=Погрузка) + владелец инфраструктуры
    loadingAddress: string;
    loadingOwnerName?: string; // ОргВладИнфр (default = грузоотправитель)
    loadingOwnerInn?: string;

    // Выгрузка
    unloadingAddress: string;

    // Груз (ОпГруз)
    cargoDescription: string;
    cargoGrossWeightKg?: number;
    cargoPackages?: number;
    cargoVolumeM3?: number;
    cargoTareCode?: string;   // ВидТар ОКВГУМ (default «01»)
    cargoState?: string;      // СостГруз (default «Исправное»)
    massMethod?: string;      // МетОпрМасс (default «01»)
    distributable?: string;   // РаспрГр (default «1»)
    divisible?: string;       // ДелГр (default «1»)
    // Габариты грузового места (РазмерГрМест обязателен по XSD), м
    cargoHeightM?: number;
    cargoLengthM?: number;
    cargoWidthM?: number;

    // Требуемые параметры ТС (ПарТСПрвз) — обязательны по XSD
    vehicleType?: string;     // Тип (default «Грузовой автомобиль»)
    vehicleCapacityTons?: number;
    vehicleVolumeM3?: number;

    // Нормативные требования (обязательны по XSD, шаблонные дефолты)
    normReq?: string;         // УкНормПрвз (default «Особых требований нет»)
    foodTransport?: string;   // ПрвзПищПрод (default «Не требуется»)

    // Подписант грузоотправителя
    signatoryFullName?: string;
    signatoryPosition?: string;
}

/**
 * Сгенерировать XML первичной заказ-заявки грузоотправителя (969_01, КНД 1110361).
 */
export function generateEZZShipper(input: EZZShipperInput): string {
    const docId = `ON_ZAKZVGO_${input.shipperInn}_${input.carrierInn}_${formatDate(input.issuedAt).split('.').reverse().join('')}_${randomUUID()}`;

    return `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ КНД="1110361" Функция="Заказ" ДатИнфГО="${formatDate(input.issuedAt)}" ВрИнфГО="${formatTime(input.issuedAt)}" НаимЭкСубСост="${escapeXml(input.shipperName)}">
    <СодИнфГО СодОпер="Предоставление заказа и заявки на перевозку груза автомобильным транспортом" НомЗак="${escapeXml(input.orderNumber)}" ДатаЗак="${formatDate(input.issuedAt)}" УкНормПрвз="${escapeXml(input.normReq ?? 'Особых требований нет')}" ПрвзПищПрод="${escapeXml(input.foodTransport ?? 'Не требуется')}">
      <СвГО>
        <ИдСв>
          <СвЮЛУч НаимОрг="${escapeXml(input.shipperName)}" ИННЮЛ="${escapeXml(input.shipperInn)}"${attr('КПП', input.shipperKpp)}/>
        </ИдСв>
        <Конт>
          <Тлф>${escapeXml(req(input.shipperPhone, 'грузоотправитель: телефон'))}</Тлф>
        </Конт>
      </СвГО>
      <СвПрв>
        <ИдСв>
          <СвЮЛУч НаимОрг="${escapeXml(input.carrierName)}" ИННЮЛ="${escapeXml(input.carrierInn)}"${attr('КПП', input.carrierKpp)}/>
        </ИдСв>
        <Конт>
          <Тлф>${escapeXml(req(input.carrierPhone, 'перевозчик: телефон'))}</Тлф>
        </Конт>
      </СвПрв>
      <ПунктПод ДатВрПод="${formatDateTimeTZ(input.dispatchAt)}" НалКоорТочВрПод="0">
        <АдрПунктПод>
          ${renderAddr(input.dispatchAddress, 'адрес подачи ТС')}
        </АдрПунктПод>
      </ПунктПод>
      <АдрПункт Опер="Погрузка">
        <АдресПункт>
          ${renderAddr(input.loadingAddress, 'адрес погрузки')}
        </АдресПункт>
        <ОргВладИнфр НаимВладИнфр="${escapeXml(input.loadingOwnerName ?? input.shipperName)}" ИННВладИнфр="${escapeXml(input.loadingOwnerInn ?? input.shipperInn)}"/>
      </АдрПункт>
      <АдрПункт Опер="Выгрузка">
        <АдресПункт>
          ${renderAddr(input.unloadingAddress, 'адрес выгрузки')}
        </АдресПункт>
      </АдрПункт>
      <ОпГруз НаимГруз="${escapeXml(input.cargoDescription)}" СостГруз="${escapeXml(input.cargoState ?? 'Исправное')}" ВидТар="${escapeXml(input.cargoTareCode ?? '01')}" КолГрМест="${req(input.cargoPackages, 'груз: количество мест')}" МетОпрМасс="${escapeXml(input.massMethod ?? '01')}"${attr('Объем', input.cargoVolumeM3?.toFixed(2))} РаспрГр="${escapeXml(input.distributable ?? '1')}" ДелГр="${escapeXml(input.divisible ?? '1')}">
        <МасГруз МасБрутЗнач="${req(input.cargoGrossWeightKg, 'груз: масса брутто').toFixed(3)}"/>
        <РазмерГрМест ВысЗнач="${req(input.cargoHeightM, 'груз: высота места').toFixed(3)}" ДлЗнач="${req(input.cargoLengthM, 'груз: длина места').toFixed(3)}" ШирЗнач="${req(input.cargoWidthM, 'груз: ширина места').toFixed(3)}"/>
      </ОпГруз>
      <ПарТСПрвз Тип="${escapeXml(input.vehicleType ?? 'Грузовой автомобиль')}" Грузопод="${req(input.vehicleCapacityTons, 'требуемая грузоподъёмность ТС').toFixed(2)}" Вместим="${req(input.vehicleVolumeM3, 'требуемый объём ТС').toFixed(2)}"/>
    </СодИнфГО>
    <ПодпИнфГО${attr('Должн', input.signatoryPosition)} СпосПодтПолном="1">
      ${renderFio(input.signatoryFullName ?? '', 'подписант грузоотправителя')}
    </ПодпИнфГО>
  </Документ>
</Файл>`;
}
