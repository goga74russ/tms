// ============================================================
// ЭТрН XML Generator — Электронная транспортная накладная
// Формат: ФНС приказ ЕД-7-26/383@ (вступил в силу 01.09.2024)
// Генерирует Титул 1 (данные грузоотправителя/перевозчика)
// и Титул 4 (данные о доставке/completion)
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

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
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

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0">
  <Документ ДатаДок="${docDate}" НомДок="${escapeXml(input.waybillNumber)}">
    <СвДоставка>
      <Перевозчик>
        <ЮЛ НаимОрг="${escapeXml(input.carrierName)}" ИНН="${escapeXml(input.carrierInn)}"${input.carrierKpp ? ` КПП="${escapeXml(input.carrierKpp)}"` : ''}/>
      </Перевозчик>

      <РезДоставки Статус="доставлено"/>

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
