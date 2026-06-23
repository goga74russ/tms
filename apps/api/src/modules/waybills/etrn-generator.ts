// ============================================================
// ЭТрН XML Generator — Электронная транспортная накладная
// Формат: ФНС приказ ЕД-7-26/1065@ (от 09.12.2021) — авто-ЭТрН (титулы, XSD 973_*).
// ⚠️ НЕ 383@: ЕД-7-26/383@ (14.05.2024) — это ЭТрН для ВНУТРЕННЕГО ВОДНОГО транспорта.
// Генерирует Титул 1 (данные грузоотправителя/перевозчика)
// и Титул 4 (данные о доставке/completion)
//
// Encoding: UTF-8 (ФНС XSD v5.01+ принимает UTF-8).
// Если ЭДО-оператор требует windows-1251, конвертировать
// на уровне экспорта через iconv-lite.
// ============================================================
import { randomUUID } from 'node:crypto';

/**
 * Ошибка неполноты данных для ЭТрН — бросается, когда обязательное по XSD
 * ФНС (приказ 1065@) поле отсутствует в TMS. routes.ts ловит и отдаёт 422
 * с человекочитаемым списком. Дисциплина «не подставляем фиктивные реквизиты»:
 * лучше честный отказ, чем невалидный/выдуманный документ.
 */
export class EtrnIncompleteError extends Error {
    readonly statusCode = 422 as const;
    readonly code = 'ETRN_DATA_INCOMPLETE' as const;
    constructor(public readonly field: string) {
        super(`Не заполнено обязательное для ЭТрН поле: ${field}`);
        this.name = 'EtrnIncompleteError';
    }
}

function req<T>(value: T | undefined | null, field: string): T {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
        throw new EtrnIncompleteError(field);
    }
    return value;
}

/** Input data for ЭТрН generation — assembled from TMS tables */
export interface ETrNInput {
    // Waybill
    waybillNumber: string;
    issuedAt: string; // ISO date

    // Trip
    tripNumber: string;

    // Заказ/заявка (опц.) → НомЗак/ДатаЗак
    orderNumber?: string;
    orderDate?: string; // ISO

    // Vehicle
    vehicleMake: string;
    vehicleModel: string;
    vehiclePlateNumber: string;
    vehicleVin?: string;
    vehicleType?: string;          // ПарТС/@Тип (default «Грузовой автомобиль»)
    vehicleCapacityTons?: number;  // ПарТС/@Грузопод (т)
    vehicleVolumeM3?: number;      // ПарТС/@Вместим (м³)

    // Driver
    driverFullName: string;        // → ФИО (Фамилия/Имя/Отчество, split по пробелам)
    driverLicenseNumber: string;   // → НомВУ
    driverLicenseSeries?: string;  // → СерВУ (если хранится отдельно)
    driverLicenseIssueDate?: string; // ISO → ДатаВыдВУ
    driverInn?: string;            // ИННФЛ (альтернатива ВУ)
    driverPhone?: string;          // СвВодит/Тлф

    // Shipper (грузоотправитель) — from order's contractor
    shipperName: string;
    shipperInn: string;
    shipperKpp?: string;
    shipperAddress: string;
    shipperPhone?: string;         // СвГО/Контакт/Тлф (обязателен по XSD)

    // Carrier (перевозчик) — our company
    carrierName: string;
    carrierInn: string;
    carrierKpp?: string;
    carrierAddress: string;
    carrierPhone?: string;         // СвПер/Контакт/Тлф

    // Consignee (грузополучатель) — from order
    consigneeName: string;
    consigneeInn: string;
    consigneeKpp?: string;
    consigneeAddress: string;
    consigneePhone?: string;       // СвГП/Контакт/Тлф

    // Cargo
    cargoDescription: string;
    cargoWeight?: number;     // kg — брутто (МасБрутЗнач/МасБрутОтгр)
    cargoVolume?: number;     // m³
    cargoPackages?: number;   // количество мест (КолМестГр/КолМестПрием)
    cargoState?: string;      // ОпГруз/@СостГруз (default «В упаковке»)
    cargoPackaging?: string;  // ОпГруз/@СпУпак (default «Не указано»)
    cargoTareCode?: string;   // ОпГруз/@ВидТар — код ОКВГУМ, 2 симв. (default «01»)
    cargoMarking?: string;    // ОпГруз/Марк (default «Без маркировки»)

    // Route
    loadingAddress: string;
    unloadingAddress: string;

    // Факты погрузки (СвПогруз) — обязательны по XSD Титула 1
    loadingRequestedAt?: string; // ISO → ЗаявПогр
    loadingArrivalAt?: string;   // ISO → ФДатВрПриб
    loadingDepartureAt?: string; // ISO → ФДатВрУбыт
    massMethod?: string;         // МетОпрМасс (enum 01/02/03, default «01»)

    // Подписант со стороны грузоотправителя
    signatoryFullName?: string;  // → Подписант/ФИО

    // Odometer
    odometerOut?: number;
    odometerIn?: number;

    // Sprint 13/14: Cargo condition from delivery confirmation (для Титула 4)
    cargoCondition?: 'intact' | 'damaged' | 'partial';
}

/**
 * Escape XML special characters
 */
function escapeXml(str: string): string {
    return str
        // P3 (код-аудит 2026-06-14): вырезаем запрещённые XML-1.0 управляющие символы
        // (#x0-#x8, #xB, #xC, #xE-#x1F) — иначе ЭТрН-XML становился невалидным.
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
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
    // ДатаДок юридически значима. Извлекаем календарную дату в МСК (UTC+3),
    // а не в локальной TZ сервера: в Docker TZ=UTC issuedAt около полуночи МСК
    // иначе даёт ДатаДок на сутки раньше. РФ без перехода на летнее время → UTC+3.
    const d = new Date(new Date(isoDate).getTime() + 3 * 60 * 60 * 1000);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
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
 * Generate a unique document ID for ЭТрН Титул 1.
 * Формат имени файла обмена по приказу ФНС: ON_TRNACLGROT_{ИНН получателя}_{ИНН
 * отправителя}_{ГГГГММДД}_{GUID}. Schematron ФНС требует ИдФайл == имя файла.xml.
 */
function generateDocId(consigneeInn: string, shipperInn: string, date: string): string {
    const dateStr = formatDate(date).split('.').reverse().join(''); // ГГГГММДД
    // C9: CSPRNG randomUUID() вместо Math.random()-GUID (юр-значимая связка титулов).
    const guid = randomUUID();
    return `ON_TRNACLGROT_${consigneeInn}_${shipperInn}_${dateStr}_${guid}`;
}

/** Время в МСК как ЧЧ:ММ:СС (ВремяТип ФНС). */
function formatTime(isoDate: string): string {
    const d = new Date(new Date(isoDate).getTime() + 3 * 60 * 60 * 1000);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

/** Дата-время в МСК как ДД.ММ.ГГГГTЧЧ:ММ:СС+03:00 (ДатаВремяВЗТип, ровно 25 симв.). */
function formatDateTimeTZ(isoDate: string): string {
    return `${formatDate(isoDate)}T${formatTime(isoDate)}+03:00`;
}

/** Опциональный XML-атрибут: пустые значения опускаем. */
function attr(name: string, value: string | number | undefined | null): string {
    if (value === undefined || value === null || value === '') return '';
    return ` ${name}="${escapeXml(String(value))}"`;
}

/** Разбить ФИО «Фамилия Имя Отчество» на части (Отчество опц.). */
function splitFio(full: string): { Фамилия: string; Имя: string; Отчество?: string } {
    const parts = full.trim().split(/\s+/);
    return { Фамилия: parts[0] ?? '', Имя: parts[1] ?? '', Отчество: parts[2] || undefined };
}

/** Элемент <ФИО Фамилия Имя [Отчество]/> с проверкой обязательных частей. */
function renderFio(full: string, field: string): string {
    const fio = splitFio(req(full, field));
    req(fio.Фамилия, `${field} (фамилия)`);
    req(fio.Имя, `${field} (имя)`);
    return `<ФИО Фамилия="${escapeXml(fio.Фамилия)}" Имя="${escapeXml(fio.Имя)}"${attr('Отчество', fio.Отчество)}/>`;
}

/** Свободный адрес РФ как <АдресИнф КодСтр="643" АдрТекст="..."/> (АдрИнфТип). */
function renderUserAddress(freeform: string, field: string): string {
    return `<АдресИнф КодСтр="643" АдрТекст="${escapeXml(req(freeform, field))}"/>`;
}

/**
 * Контактная ветка участника. ВАЖНО: в XSD ФНС `УчастникТрНТип` элемент
 * <Контакт> ОБЯЗАТЕЛЕН (sequence: <Адрес> minOccurs=0, затем <Контакт>).
 * <Адрес> — лишь опциональный префикс и НЕ заменяет <Контакт> (BUG-EPD-01:
 * прежний fallback на <Адрес> при пустом телефоне давал невалидный XML для
 * СвПер). Поэтому телефон участника обязателен → req() → честный 422.
 */
function renderContact(phone: string | undefined, field: string): string {
    return `
          <Контакт>
            <Тлф>${escapeXml(req(phone, field))}</Тлф>
          </Контакт>`;
}

/**
 * Generate ЭТрН Титул 1 — сведения грузоотправителя (приказ ФНС ЕД-7-26/1065@,
 * КНД 1110339, ВерсФорм 5.01). Структура соответствует реальной XSD-схеме
 * ON_TRNACLGROT_1_973_01 (проверяется через xsd-schema-validator).
 *
 * Обязательные по XSD, но потенциально отсутствующие в TMS поля (телефоны
 * сторон, факты погрузки, подписант) проверяются через req() → EtrnIncompleteError
 * → 422 в routes. Фиктивные значения не подставляются.
 */
export function generateETrN(input: ETrNInput): string {
    const docId = generateDocId(input.consigneeInn, input.shipperInn, input.issuedAt);
    const lic = req(input.driverLicenseNumber, 'водитель: номер ВУ').replace(/\s+/g, '');

    const xml = `<?xml version="1.0" encoding="windows-1251"?>
<Файл ВерсФорм="5.01" ВерсПрог="TMS-1.0" ИдФайл="${escapeXml(docId)}">
  <Документ КНД="1110339" ПоФактХЖ="Сведения грузоотправителя" ДатИнфГО="${formatDate(input.issuedAt)}" ВрИнфГО="${formatTime(input.issuedAt)}">
    <СодИнфГО СодОпер="Информация грузоотправителя" НомерТрН="${escapeXml(input.waybillNumber)}" ДатаТрН="${formatDate(input.issuedAt)}" НомЗак="${escapeXml(req(input.orderNumber, 'номер заказа'))}" ДатаЗак="${formatDate(req(input.orderDate, 'дата заказа'))}">
      <СвГО ГОЭксп="0">
        <РекИдентГО>
          <ИдСв>
            <СвЮЛУч НаимОрг="${escapeXml(input.shipperName)}" ИННЮЛ="${escapeXml(input.shipperInn)}"${attr('КПП', input.shipperKpp)}/>
          </ИдСв>${renderContact(input.shipperPhone, 'грузоотправитель: телефон')}
        </РекИдентГО>
      </СвГО>
      <СвГП>
        <РекИдентГП>
          <ИдСв>
            <СвЮЛУч НаимОрг="${escapeXml(input.consigneeName)}" ИННЮЛ="${escapeXml(input.consigneeInn)}"${attr('КПП', input.consigneeKpp)}/>
          </ИдСв>${renderContact(input.consigneePhone, 'грузополучатель: телефон')}
        </РекИдентГП>
        <АдресДостГр>${renderUserAddress(input.unloadingAddress, 'адрес доставки')}</АдресДостГр>
      </СвГП>
      <СвГруз>
        <ОпГруз НаимГруз="${escapeXml(input.cargoDescription)}" СостГруз="${escapeXml(input.cargoState ?? 'В упаковке')}" СпУпак="${escapeXml(input.cargoPackaging ?? 'Не указано')}" ВидТар="${escapeXml(input.cargoTareCode ?? '01')}" КолМестГр="${req(input.cargoPackages, 'груз: количество мест')}">
          <Марк>${escapeXml(input.cargoMarking ?? 'Без маркировки')}</Марк>
          <ПлМасГруз МасБрутЗнач="${req(input.cargoWeight, 'груз: масса брутто')}"/>
        </ОпГруз>
      </СвГруз>
      <УказГО УкНормПрвз="Перевозка осуществляется в соответствии с Уставом автомобильного транспорта и Правилами перевозок грузов автомобильным транспортом">
        <СвПА ЛицоПА="Грузоотправитель" СпосПерУкПА="Электронное уведомление перевозчика о переадресовке">
          <КонтПА>
            <Тлф>${escapeXml(req(input.shipperPhone, 'грузоотправитель: телефон (для указаний ГО)'))}</Тлф>
          </КонтПА>
        </СвПА>
      </УказГО>
      <СвПер>
        <ИдСв>
          <СвЮЛУч НаимОрг="${escapeXml(input.carrierName)}" ИННЮЛ="${escapeXml(input.carrierInn)}"${attr('КПП', input.carrierKpp)}/>
        </ИдСв>${renderContact(input.carrierPhone, 'перевозчик: телефон')}
      </СвПер>
      <СвВодит НомВУ="${escapeXml(lic)}"${attr('СерВУ', input.driverLicenseSeries)}${attr('ДатаВыдВУ', input.driverLicenseIssueDate ? formatDate(input.driverLicenseIssueDate) : undefined)}>
        ${input.driverPhone ? `<Тлф>${escapeXml(input.driverPhone)}</Тлф>\n        ` : ''}${renderFio(input.driverFullName, 'водитель: ФИО')}
      </СвВодит>
      <СвТС>
        <ТС РегНомер="${escapeXml(input.vehiclePlateNumber)}" ТипВлад="1">
          <ПарТС Тип="${escapeXml(input.vehicleType ?? 'Грузовой автомобиль')}" Марка="${escapeXml((input.vehicleMake + ' ' + input.vehicleModel).trim())}"${attr('Грузопод', input.vehicleCapacityTons?.toFixed(2))}${attr('Вместим', input.vehicleVolumeM3?.toFixed(2))}/>
        </ТС>
      </СвТС>
      <СвПогруз ЗаявПогр="${formatDateTimeTZ(req(input.loadingRequestedAt, 'погрузка: заявленное время'))}" НалКоорТочВрЗаяв="0" ФДатВрПриб="${formatDateTimeTZ(req(input.loadingArrivalAt, 'погрузка: время прибытия'))}" НалКоорТочВрФПогр="0" ФДатВрУбыт="${formatDateTimeTZ(req(input.loadingDepartureAt, 'погрузка: время убытия'))}" НалКоорТочВрФУбыт="0" МасБрутОтгр="${req(input.cargoWeight, 'груз: масса брутто')}" МетОпрМасс="${escapeXml(input.massMethod ?? '01')}" КолМестПрием="${req(input.cargoPackages, 'груз: количество мест')}">
        <ФАдресПогр>${renderUserAddress(input.loadingAddress, 'адрес погрузки')}</ФАдресПогр>
        <СвЛицПогрГр СовпГОП="1">
          <ИдентРекГО>
            <ИННЮЛ>${escapeXml(input.shipperInn)}</ИННЮЛ>
          </ИдентРекГО>
        </СвЛицПогрГр>
        <ВладИнфр СовпГОВ="1">
          <ИдентРекГО>
            <ИННЮЛ>${escapeXml(input.shipperInn)}</ИННЮЛ>
          </ИдентРекГО>
        </ВладИнфр>
      </СвПогруз>
    </СодИнфГО>
    <Подписант СтатПодп="1">
      ${renderFio(input.signatoryFullName ?? input.shipperName, 'подписант грузоотправителя')}
    </Подписант>
  </Документ>
</Файл>`;

    return xml;
}

/**
 * ⚠️ ЛЕГАСИ, НЕ ФНС-формат. Упрощённая «сводка о доставке» (completion).
 * НЕ путать с настоящим Титулом 4 ЭТрН (замена водителя/ТС, КНД 1110344) —
 * тот в etrn-titles-generator.ts → generateETrNTitle4 и проходит XSD.
 * Реальное завершение цикла перевозки — Титул 6 (generateETrNTitle6).
 * Оставлено для обратной совместимости эндпоинта /waybills/:id/etrn-title4.
 */
export function generateETrNDeliveryNote(input: ETrNInput): string {
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
