// ================================================================
// CommerceML 2.x XML Builder for 1C:Бухгалтерия Export
// ================================================================
import { XMLBuilder } from 'fast-xml-parser';
import { toFiniteNumber } from '../../utils/number.js';

export interface InvoiceExportRow {
    id: string;
    number: string;
    type: string;
    status: string;
    subtotal: number;
    vatAmount: number;
    total: number;
    periodStart: Date;
    periodEnd: Date;
    createdAt: Date;
    contractor?: {
        name: string;
        inn: string;
        kpp?: string | null;
        legalAddress?: string;
    } | null;
    tripIds?: string[];
}

export interface ExportOptions {
    companyName?: string;
    companyInn?: string;
    companyKpp?: string;
}

const DEFAULT_OPTIONS: ExportOptions = {
    companyName: process.env.COMPANY_NAME || 'ООО «ТМС Логистик»',
    companyInn: process.env.COMPANY_INN || '7701234567',
    companyKpp: process.env.COMPANY_KPP || '770101001',
};

/**
 * Build a CommerceML 2.x-compatible XML document from a list of invoices.
 * 
 * The generated XML follows the structure that 1С:Бухгалтерия 8.3
 * can import via "Загрузка данных из внешних систем":
 *
 * ```xml
 * <КоммерческаяИнформация ВерсияСхемы="2.10" ДатаФормирования="...">
 *   <Документ>
 *     <Ид>...</Ид>
 *     <Номер>...</Номер>
 *     ...
 *   </Документ>
 * </КоммерческаяИнформация>
 * ```
 */
export function buildCommerceMLXml(
    invoices: InvoiceExportRow[],
    options: ExportOptions = {},
): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const now = new Date();

    const documents = invoices.map((inv) => {
        const docType = mapInvoiceType(inv.type);
        const lineItems = buildLineItems(inv);

        return {
            Ид: inv.id,
            Номер: inv.number,
            Дата: formatDate(inv.createdAt),
            ХозОперация: docType.operation,
            Роль: 'Продавец',
            Валюта: 'RUB',
            Курс: 1,
            Сумма: roundTo2(inv.total),
            Контрагенты: {
                Контрагент: {
                    Ид: inv.contractor?.inn ?? 'UNKNOWN',
                    Наименование: inv.contractor?.name ?? 'Неизвестный контрагент',
                    ИНН: inv.contractor?.inn ?? '',
                    КПП: inv.contractor?.kpp ?? '',
                    ЮридическийАдрес: inv.contractor?.legalAddress ?? '',
                    Роль: 'Покупатель',
                },
            },
            Товары: {
                Товар: lineItems,
            },
            РеквизитыДокумента: {
                ТипДокумента: docType.type1c,
                Период: {
                    ДатаНачала: formatDate(inv.periodStart),
                    ДатаОкончания: formatDate(inv.periodEnd),
                },
                СтавкаНДС: formatVatRate(inv),
                СуммаБезНДС: roundTo2(inv.subtotal),
                СуммаНДС: roundTo2(inv.vatAmount),
                СуммаВсего: roundTo2(inv.total),
                Статус: mapInvoiceStatus(inv.status),
            },
        };
    });

    const xmlObj = {
        '?xml': {
            '@_version': '1.0',
            '@_encoding': 'UTF-8',
        },
        КоммерческаяИнформация: {
            '@_ВерсияСхемы': '2.10',
            '@_ДатаФормирования': now.toISOString(),
            Продавец: {
                Наименование: opts.companyName,
                ИНН: opts.companyInn,
                КПП: opts.companyKpp,
            },
            ...(documents.length > 0
                ? { Документ: documents.length === 1 ? documents[0] : documents }
                : {}),
        },
    };

    const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        format: true,
        indentBy: '  ',
        processEntities: true,
        suppressEmptyNode: false,
    });

    const xml: string = builder.build(xmlObj);
    return xml;
}

// ================================================================
// Helpers
// ================================================================

// C2: фактическая ставка НДС из сумм (вместо хардкода '20%'). 0 → «Без НДС».
function formatVatRate(inv: InvoiceExportRow): string {
    if (inv.vatAmount <= 0 || inv.subtotal <= 0) return 'Без НДС';
    const rate = Math.round((inv.vatAmount / inv.subtotal) * 100);
    return `${rate}%`;
}

function mapInvoiceType(type: string): { type1c: string; operation: string } {
    // C2: различаем все DB invoice_type (раньше всё кроме act/upd → СчётНаОплату,
    // СФ/КСФ теряли юр-тип → расхождение книги продаж в 1С).
    switch (type) {
        case 'act':
            return { type1c: 'АктВыполненныхРабот', operation: 'Реализация услуг' };
        case 'upd':
            return { type1c: 'УниверсальныйПередаточныйДокумент', operation: 'Реализация товаров и услуг' };
        case 'sf':
            return { type1c: 'СчётФактура', operation: 'Реализация услуг' };
        case 'corrective_sf':
            return { type1c: 'КорректировочныйСчётФактура', operation: 'Корректировка реализации' };
        case 'corrective_upd':
            return { type1c: 'КорректировочныйУПД', operation: 'Корректировка реализации' };
        case 'advance':
            return { type1c: 'АвансовыйСчётФактура', operation: 'Получение аванса' };
        case 'payment':
        case 'invoice':
        default:
            return { type1c: 'СчётНаОплату', operation: 'Реализация услуг' };
    }
}

function mapInvoiceStatus(status: string): string {
    // C2: актуальный invoice-FSM (раньше — устаревшие sent/paid/overdue, которых
    // больше не приходит → issued/paid_full/… проваливались в default).
    switch (status) {
        case 'draft': return 'Черновик';
        case 'issued': return 'Выставлен';
        case 'paid_partial': return 'ЧастичноОплачен';
        case 'paid_full': return 'Оплачен';
        case 'cancelled': return 'Отменён';
        case 'corrected': return 'Скорректирован';
        default: return status;
    }
}

function buildLineItems(inv: InvoiceExportRow) {
    // Each invoice maps to one aggregated service line
    // (in a full implementation, you'd break down by trip)
    const tripCount = inv.tripIds?.length ?? 1;

    return {
        Ид: `SVC-${inv.number}`,
        Наименование: `Транспортные услуги по рейсам (${tripCount} шт.)`,
        ЕдиницаИзмерения: 'усл.',
        Количество: tripCount,
        ЦенаЗаЕдиницу: roundTo2(inv.subtotal / tripCount),
        Сумма: roundTo2(inv.subtotal),
        СтавкаНДС: formatVatRate(inv),
        СуммаНДС: roundTo2(inv.vatAmount),
        Итого: roundTo2(inv.total),
    };
}

function formatDate(date: Date | string): string {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0];
}

function roundTo2(n: unknown): number {
    return Math.round(toFiniteNumber(n) * 100) / 100;
}
