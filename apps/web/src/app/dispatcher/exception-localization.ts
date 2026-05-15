// ============================================================
// Dispatcher — exception localization (RU).
// Maps engine-emitted English exception strings/types/titles to
// Russian labels. Extracted from page.tsx (B-4 / B-22) so the
// maps can be shared and tested in isolation.
// ============================================================

export type LocalizableException = {
    type?: string;
    title?: string;
};

// B-4: Russian labels for exception type slugs.
export const EXCEPTION_TYPE_LABEL_RU: Record<string, string> = {
    crew_rest: 'План отдыха экипажа',
    post_trip_return: 'Возврат ТС после рейса',
    etrn_blocking: 'Блокер ЭТрН: документ обязателен',
    missing_document: 'Документ блокирует закрытие рейса',
    document_warning: 'Предупреждение по документам',
    open_claim: 'Открытая претензия',
    shipment_discrepancy: 'Расхождение при отгрузке',
    compatibility: 'Совместимость груза/ТС',
    breakdown: 'Поломка ТС в рейсе',
    downtime: 'Простой на точке маршрута',
    cancellation_after_arrival: 'Отмена после прибытия ТС',
    route_change: 'Изменение маршрута',
    resource_replacement: 'Замена ТС/водителя',
    execution_event: 'Событие исполнения',
};

// B-4: Russian labels for exception title strings.
export const EXCEPTION_TITLE_LABEL_RU: Record<string, string> = {
    'Crew and rest plan': 'План отдыха экипажа',
    'Post-trip vehicle return': 'Возврат ТС после рейса',
    'ETRN blocks trip close': 'Блокер ЭТрН: документ обязателен',
    'Document blocks trip close': 'Документ блокирует закрытие рейса',
    'Document warning': 'Предупреждение по документам',
    'Open claim': 'Открытая претензия',
    'Trip breakdown': 'Поломка ТС в рейсе',
    'Route point downtime': 'Простой на точке маршрута',
    'Cancellation after vehicle arrival': 'Отмена после прибытия ТС',
    'Trip route changed': 'Изменение маршрута',
    'Trip resource replaced': 'Замена ТС/водителя',
    'Trip disruption': 'Нарушение хода рейса',
    'Trip delay': 'Задержка рейса',
    'Trip downtime': 'Простой рейса',
    'Manual correction': 'Ручная корректировка',
    'Pending photo evidence': 'Ожидается фотофиксация',
    'Execution event': 'Событие исполнения',
};

// B-22: exact-match map for engine-emitted subtitle strings (lowercase keys).
export const EXACT_MAP: Record<string, string> = {
    'etrn is required but missing': 'ЭТрН обязателен, но отсутствует',
    'transport_document was rejected': 'Транспортный документ отклонён',
    'transport_document is pending signature': 'Документ ожидает подпись',
    'transport_document is missing': 'Транспортный документ не создан',
    'document is missing': 'Документ отсутствует',
    'document was rejected': 'Документ отклонён',
    'document is pending': 'Документ ожидает обработки',
    'claim is open': 'Претензия открыта',
    'route point overdue': 'Точка маршрута просрочена',
    'shipment discrepancy detected': 'Зафиксировано расхождение',
    'driver med inspection rejected': 'Медосмотр водителя не пройден',
    'driver license expires soon': 'Истекают права водителя',
    'vehicle inspection rejected': 'Техосмотр ТС не пройден',
    'vehicle OSAGO expired': 'ОСАГО истекло',
    'vehicle not assigned': 'ТС не назначено',
    'driver not assigned': 'Водитель не назначен',
    'crew rest violation': 'Нарушение режима труда и отдыха',
    'trip breakdown reported': 'Зафиксирована поломка ТС',
    'downtime at route point': 'Простой на точке маршрута',
    'cancellation after arrival': 'Отмена после прибытия',
};

// B-22: prefix regex patterns for engine-emitted subtitle strings.
export const PREFIX_PATTERNS: Array<[RegExp, string]> = [
    [/^Bulk\/liquid cargo is assigned to a vehicle/i, 'Налив/насыпь назначены на ТС без подходящего кузова'],
    [/^Food cargo is combined with hazard(ous)? cargo/i, 'Продовольствие совмещено с опасным грузом'],
    [/^Vehicle .* is overloaded/i, 'Превышение грузоподъёмности ТС'],
    [/^Driver .* has no active license/i, 'У водителя нет действующих прав'],
    [/^Order .* requires cold chain/i, 'Заказ требует холодовой цепи'],
];

/** Localize an exception's title via type slug, exact title, or known prefixes. */
export function localizeExceptionTitle(item: LocalizableException): string {
    if (item.type && EXCEPTION_TYPE_LABEL_RU[item.type]) return EXCEPTION_TYPE_LABEL_RU[item.type];
    if (item.title && EXCEPTION_TITLE_LABEL_RU[item.title]) return EXCEPTION_TITLE_LABEL_RU[item.title];
    if (item.title?.startsWith('Shipment discrepancy:')) return 'Расхождение при отгрузке';
    if (item.title?.startsWith('Compatibility:')) return 'Совместимость груза/ТС';
    return item.title ?? '';
}

/** Localize a subtitle message string. Returns null for empty / blank input. */
export function localizeExceptionMessage(s: string | null | undefined): string | null {
    if (!s) return null;
    const trimmed = s.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (EXACT_MAP[lower]) return EXACT_MAP[lower];
    for (const [re, ru] of PREFIX_PATTERNS) if (re.test(trimmed)) return ru;
    // Heuristic: if string contains only ASCII letters/punctuation it's likely
    // an English engine string we haven't mapped yet — keep as is.
    return trimmed;
}
