// ============================================================
// ЭТрН XML Generator — Электронная транспортная накладная
// Формат: ФНС приказ ЕД-7-26/383@ (вступил в силу 01.09.2024)
// Генерирует Титул 1 (данные грузоотправителя/перевозчика)
// и Титул 4 (данные о доставке/completion)
//
// Encoding: UTF-8 (ФНС XSD v5.01+ принимает UTF-8).
// Если ЭДО-оператор требует windows-1251, конвертировать
// на уровне экспорта через iconv-lite.
// ============================================================

/** Input data for ЭТрН generation — assembled from TMS tables */
export interface ETrNInput {
    // Waybill
    waybillNumber: string;
    issuedAt: string; // ISO date

    // Trip
    tripNumber: string;

    // Vehicle
    vehicleMake: string;
    vehicleModel: string;
    vehiclePlateNumber: string;
    vehicleVin?: string;

    // Driver
    driverFullName: string;
    driverLicenseNumber: string;

    // Shipper (грузоотправитель) — from order's contractor
    shipperName: string;
    shipperInn: string;
    shipperKpp?: string;
    shipperAddress: string;

    // Carrier (перевозчик) — our company
    carrierName: string;
    carrierInn: string;
    carrierKpp?: string;
    carrierAddress: string;

    // Consignee (грузополучатель) — from order
    consigneeName: string;
    consigneeInn: string;
    consigneeKpp?: string;
    consigneeAddress: string;

    // Cargo
    cargoDescription: string;
    cargoWeight?: number;     // kg
    cargoVolume?: number;     // m³
    cargoPackages?: number;   // количество мест

    // Route
    loadingAddress: string;
    unloadingAddress: string;

    // Odometer
    odometerOut?: number;
    odometerIn?: number;

    // Sprint 13/14: Cargo condition from delivery confirmation
    cargoCondition?: 'intact' | 'damaged' | 'partial';
}

/**
 * Escape XML special characters
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
 * Format date to DD.MM.YYYY
 */
function formatDate(isoDate: string): string {
    const d = new Date(isoDate);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}.${month}.${year}`;
}

const WINDOWS_1251_MAP = new Map<number, number>([
    [0x0401, 0xA8], [0x0451, 0xB8], [0x0404, 0xAA], [0x0454, 0xBA],
    [0x0407, 0xAF], [0x0457, 0xBF], [0x0406, 0xB2], [0x0456, 0xB3],
    [0x2116, 0xB9], [0x00AB, 0xAB], [0x00BB, 0xBB], [0x2013, 0x96],
    [0x2014, 0x97], [0x2026, 0x85], [0x201C, 0x93], [0x201D, 0x94],
    [0x2018, 0x91], [0x2019, 0x92],
]);

export function encodeWindows1251(input: string): Buffer {
    const bytes: number[] = [];
    for (const char of input) {
        const code = char.charCodeAt(0);
        if (code <= 0x7f) {
            bytes.push(code);
            continue;
        }
        if (code >= 0x0410 && code <= 0x044F) {
            bytes.push(code <= 0x042F ? code - 0x0410 + 0xC0 : code - 0x0430 + 0xE0);
            continue;
        }
        const mapped = WINDOWS_1251_MAP.get(code);
        bytes.push(mapped ?? 0x3F);
    }
    return Buffer.from(bytes);
}

/**
 * Generate a unique document ID for ЭТрН.
 * Format: ON_ETRN_{carrier_inn}_{shipper_inn}_{date}_{guid}
 */
function generateDocId(carrierInn: string, shipperInn: string, date: string): string {
    const dateStr = formatDate(date).replace(/\./g, '');
    const guid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    return `ON_ETRN_${carrierInn}_${shipperInn}_${dateStr}_${guid}`;
}

/**
 * Generate ЭТрН Титул 1 — основные данные о перевозке.
 * Содержит информацию об участниках, грузе, ТС, водителе и маршруте.
 *
 * Формат приближен к XSD-схеме ФНС приказа ЕД-7-26/383@.
 */
export function generateETrN(input: ETrNInput): string {
    const docId = generateDocId(input.carrierInn, input.shipperInn, input.issuedAt);
    const docDate = formatDate(input.issuedAt);

    const xml = `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ ДатаДок="${docDate}" НомДок="${escapeXml(input.waybillNumber)}">
    <СвТранworthy>

      <!-- Сведения об участниках -->
      <СвУчаст>
        <Отправитель>
          <ЮЛ НаимОрг="${escapeXml(input.shipperName)}" ИНН="${escapeXml(input.shipperInn)}"${input.shipperKpp ? ` КПП="${escapeXml(input.shipperKpp)}"` : ''}/>
          <Адрес>${escapeXml(input.shipperAddress)}</Адрес>
        </Отправитель>
        <Получатель>
          <ЮЛ НаимОрг="${escapeXml(input.consigneeName)}" ИНН="${escapeXml(input.consigneeInn)}"${input.consigneeKpp ? ` КПП="${escapeXml(input.consigneeKpp)}"` : ''}/>
          <Адрес>${escapeXml(input.consigneeAddress)}</Адрес>
        </Получатель>
        <Перевозчик>
          <ЮЛ НаимОрг="${escapeXml(input.carrierName)}" ИНН="${escapeXml(input.carrierInn)}"${input.carrierKpp ? ` КПП="${escapeXml(input.carrierKpp)}"` : ''}/>
          <Адрес>${escapeXml(input.carrierAddress)}</Адрес>
        </Перевозчик>
      </СвУчаст>

      <!-- Сведения о грузе -->
      <СвГруз>
        <Груз Наим="${escapeXml(input.cargoDescription)}"${input.cargoWeight ? ` МассаГруз="${input.cargoWeight}"` : ''}${input.cargoVolume ? ` ОбъемГруз="${input.cargoVolume}"` : ''}${input.cargoPackages ? ` КолМест="${input.cargoPackages}"` : ''}/>
      </СвГруз>

      <!-- Сведения о транспортном средстве -->
      <СвТС>
        <ТС Марка="${escapeXml(input.vehicleMake + ' ' + input.vehicleModel)}" ГосНом="${escapeXml(input.vehiclePlateNumber)}"${input.vehicleVin ? ` VIN="${escapeXml(input.vehicleVin)}"` : ''}/>
      </СвТС>

      <!-- Сведения о водителе -->
      <СвВодит ФИО="${escapeXml(input.driverFullName)}" ВУ="${escapeXml(input.driverLicenseNumber)}"/>

      <!-- Маршрут -->
      <Маршрут>
        <ПунктПогрузки Адрес="${escapeXml(input.loadingAddress)}"/>
        <ПунктРазгрузки Адрес="${escapeXml(input.unloadingAddress)}"/>
      </Маршрут>

      <!-- Путевой лист -->
      <ПутЛист Номер="${escapeXml(input.waybillNumber)}" ДатаВыд="${docDate}"${input.odometerOut ? ` ПоказОдомВыезд="${input.odometerOut}"` : ''}/>

    </СвТранworthy>
  </Документ>
</Файл>`;

    return xml;
}

/**
 * Generate ЭТрН Титул 4 — данные о доставке (completion).
 * Формируется перевозчиком после завершения рейса.
 */
export function generateETrNTitle4(input: ETrNInput): string {
    const docDate = formatDate(input.issuedAt);

    const xml = `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0">
  <Документ ДатаДок="${docDate}" НомДок="${escapeXml(input.waybillNumber)}">
    <СвДоставка>
      <Перевозчик>
        <ЮЛ НаимОрг="${escapeXml(input.carrierName)}" ИНН="${escapeXml(input.carrierInn)}"${input.carrierKpp ? ` КПП="${escapeXml(input.carrierKpp)}"` : ''}/>
      </Перевозчик>

      <РезДоставки Статус="${input.cargoCondition === 'damaged' ? 'доставлено с повреждениями' : input.cargoCondition === 'partial' ? 'доставлено с недостачей' : 'доставлено'}"/>${input.cargoCondition && input.cargoCondition !== 'intact' ? `
      <СостГруза>${escapeXml(input.cargoCondition === 'damaged' ? 'повреждён' : 'частичная недостача')}</СостГруза>` : ''}

      <СвТС>
        <ТС ГосНом="${escapeXml(input.vehiclePlateNumber)}"${input.odometerIn ? ` ПоказОдомВозвр="${input.odometerIn}"` : ''}/>
      </СвТС>

      <СвВодит ФИО="${escapeXml(input.driverFullName)}" ВУ="${escapeXml(input.driverLicenseNumber)}"/>

      <ПунктДоставки Адрес="${escapeXml(input.unloadingAddress)}"/>
    </СвДоставка>
  </Документ>
</Файл>`;

    return xml;
}
