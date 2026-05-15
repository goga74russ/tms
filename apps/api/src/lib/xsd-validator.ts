// ============================================================
// ЭТрН XSD Validator — структурная проверка XML-титулов перед
// отправкой в ЭДО-оператора (Diadoc / SBIS / Kontur).
//
// Закон 01.09.2026 (ФНС приказ ЕД-7-26/383@, Минтранс №348)
// требует валидацию по XSD-схемам линейки 973_01..973_08 v5.01.
//
// На данном этапе реальные XSD-файлы ФНС лежат в `docs/etrn/`
// рабочей машины (см. `etrn-xsd-manifest.ts`) и пока подключены
// только для inspection-скрипта. Полноценный XSD-валидатор
// (libxml2 / xmllint-wasm) ещё не подключён — текущая реализация
// делает прагматичную структурную проверку через `fast-xml-parser`:
//   • корневой элемент `<Файл>` с атрибутами `ВерсФорм="5.01"`
//     и `ВерсПрог`;
//   • присутствует `<Документ>`;
//   • для каждого типа титула — обязательные ветки (отправитель,
//     перевозчик, получатель, ссылка на предыдущий титул и т.д.).
//
// Этого достаточно, чтобы поймать grossly malformed XML до того,
// как он уйдёт в ЭДО-оператора и вернётся с непонятной ошибкой.
//
// TODO: заменить на реальную XSD-валидацию через `xmllint-wasm`
// (WASM-порт libxml2, без native-зависимостей) сразу после того,
// как схемы ФНС будут скопированы в `apps/api/docs/etrn/schemas/`
// и подключены к рантайму API.
// ============================================================
import { XMLParser } from 'fast-xml-parser';

export type ETrNTitleType = 'T01' | 'T02' | 'T05' | 'T06';

export interface XsdValidationResult {
    valid: boolean;
    errors: string[];
}

const ATTR_PREFIX = '@_';

/**
 * Общая ленивая обёртка для парсера — переиспользуется между вызовами.
 * fast-xml-parser держит конфигурацию в инстансе; пересоздание дешёвое,
 * но один shared instance дешевле под нагрузкой.
 */
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ATTR_PREFIX,
    parseTagValue: false,
    parseAttributeValue: false,
    allowBooleanAttributes: true,
    trimValues: true,
});

type ParsedNode = Record<string, unknown> | undefined;

function asNode(value: unknown): ParsedNode {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    return undefined;
}

function getAttr(node: ParsedNode, name: string): string | undefined {
    if (!node) return undefined;
    const raw = node[`${ATTR_PREFIX}${name}`];
    if (raw === undefined || raw === null) return undefined;
    return String(raw);
}

function getChild(node: ParsedNode, name: string): ParsedNode {
    if (!node) return undefined;
    const value = node[name];
    if (Array.isArray(value)) {
        return asNode(value[0]);
    }
    return asNode(value);
}

function hasChild(node: ParsedNode, name: string): boolean {
    if (!node) return false;
    return Object.prototype.hasOwnProperty.call(node, name) && node[name] !== undefined;
}

/**
 * Структурно проверить XML-титул ЭТрН перед отправкой в ЭДО.
 *
 * @param xml      XML как строка (UTF-8 или windows-1251 — внутри парсер
 *                 работает с уже декодированным текстом).
 * @param titleType  Тип титула (T01/T02/T05/T06).
 * @returns        `{ valid, errors }` — список человекочитаемых ошибок
 *                 на русском языке (пустой массив, если всё ОК).
 */
export function validateETrNXml(
    xml: string,
    titleType: ETrNTitleType,
): XsdValidationResult {
    const errors: string[] = [];

    if (typeof xml !== 'string' || xml.trim().length === 0) {
        return { valid: false, errors: ['XML пустой или не является строкой.'] };
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = parser.parse(xml) as Record<string, unknown>;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            valid: false,
            errors: [`Не удалось распарсить XML: ${message}`],
        };
    }

    const root = asNode(parsed['Файл']);
    if (!root) {
        errors.push('Корневой элемент должен называться <Файл>.');
        return { valid: false, errors };
    }

    // Общие атрибуты для всех титулов.
    const versForm = getAttr(root, 'ВерсФорм');
    if (versForm !== '5.01') {
        errors.push(
            versForm === undefined
                ? 'Отсутствует обязательный атрибут ВерсФорм у <Файл>.'
                : `Атрибут ВерсФорм должен быть "5.01" (получено: "${versForm}").`,
        );
    }

    const versProg = getAttr(root, 'ВерсПрог');
    if (!versProg) {
        errors.push('Отсутствует обязательный атрибут ВерсПрог у <Файл>.');
    }

    const dokument = getChild(root, 'Документ');
    if (!dokument) {
        errors.push('Внутри <Файл> отсутствует <Документ>.');
        // Дальше проверять нечего — без <Документ> остальное не имеет смысла.
        return { valid: false, errors };
    }

    switch (titleType) {
        case 'T01':
            validateT01(dokument, errors);
            break;
        case 'T02':
            validateT02(dokument, errors);
            break;
        case 'T05':
            validateT05(dokument, errors);
            break;
        case 'T06':
            validateT06(dokument, errors);
            break;
        default: {
            // Exhaustiveness guard — TypeScript должен ругаться, если добавили
            // новый тип и забыли обработать.
            const _exhaustive: never = titleType;
            errors.push(`Неизвестный тип титула: ${String(_exhaustive)}.`);
        }
    }

    return { valid: errors.length === 0, errors };
}

// ------------------------------------------------------------------
// Структуры конкретных титулов.
//
// ВАЖНО: имена тегов выбраны под фактический вывод генераторов в
// `apps/api/src/modules/waybills/etrn-generator.ts` и
// `apps/api/src/modules/waybills/etrn-titles-generator.ts`.
// В XSD ФНС используются составные имена (Грузоотправитель/
// Грузополучатель), но текущие генераторы пишут короткие
// (Отправитель/Получатель внутри <СвУчаст> или
// <СвУчастниковПеревозкиГруза>). Когда подключим реальный XSD-валидатор,
// либо приведём генераторы к ФНС-именам, либо смапим в адаптере.
// ------------------------------------------------------------------

function validateT01(dokument: ParsedNode, errors: string[]): void {
    // Текущий generateETrN() пишет <СвУчаст>, не <СвУчастниковПеревозкиГруза>.
    // Принимаем оба написания, чтобы не ломать существующий код.
    const svUchast =
        getChild(dokument, 'СвУчаст') ??
        getChild(dokument, 'СвУчастниковПеревозкиГруза');

    if (!svUchast) {
        errors.push('T01: отсутствует блок участников (<СвУчаст> / <СвУчастниковПеревозкиГруза>).');
        return;
    }

    const shipper =
        getChild(svUchast, 'Отправитель') ?? getChild(svUchast, 'Грузоотправитель');
    if (!shipper) {
        errors.push('T01: отсутствует <Отправитель> (грузоотправитель).');
    }

    const carrier = getChild(svUchast, 'Перевозчик');
    if (!carrier) {
        errors.push('T01: отсутствует <Перевозчик>.');
    }

    if (!hasChild(dokument, 'СвГруз')) {
        errors.push('T01: отсутствует блок <СвГруз> (сведения о грузе).');
    }
}

function validateT02(dokument: ParsedNode, errors: string[]): void {
    const svUchast =
        getChild(dokument, 'СвУчастниковПеревозкиГруза') ??
        getChild(dokument, 'СвУчаст');
    if (!svUchast) {
        errors.push('T02: отсутствует блок <СвУчастниковПеревозкиГруза>.');
        return;
    }

    const carrier = getChild(svUchast, 'Перевозчик');
    if (!carrier) {
        errors.push('T02: отсутствует <Перевозчик> в составе участников.');
    }

    const shipper =
        getChild(svUchast, 'Отправитель') ?? getChild(svUchast, 'Грузоотправитель');
    if (!shipper) {
        errors.push('T02: отсутствует <Отправитель>.');
    }

    if (!hasChild(dokument, 'СвГруз')) {
        errors.push('T02: отсутствует блок <СвГруз> (фактические сведения о грузе).');
    }
}

function validateT05(dokument: ParsedNode, errors: string[]): void {
    if (!hasChild(dokument, 'СсылкаНаТитул1')) {
        errors.push('T05: отсутствует обязательная <СсылкаНаТитул1>.');
    }

    const svUchast =
        getChild(dokument, 'СвУчастниковПеревозкиГруза') ??
        getChild(dokument, 'СвУчаст');
    if (!svUchast) {
        errors.push('T05: отсутствует блок <СвУчастниковПеревозкиГруза>.');
        return;
    }

    const consignee =
        getChild(svUchast, 'Получатель') ?? getChild(svUchast, 'Грузополучатель');
    if (!consignee) {
        errors.push('T05: отсутствует <Получатель> (грузополучатель).');
    }

    const carrier = getChild(svUchast, 'Перевозчик');
    if (!carrier) {
        errors.push('T05: отсутствует <Перевозчик>.');
    }

    if (!hasChild(dokument, 'СвГруз')) {
        errors.push('T05: отсутствует блок <СвГруз>.');
    }
}

function validateT06(dokument: ParsedNode, errors: string[]): void {
    if (!hasChild(dokument, 'СсылкаНаТитул5')) {
        errors.push('T06: отсутствует обязательная <СсылкаНаТитул5>.');
    }

    const svUchast =
        getChild(dokument, 'СвУчастниковПеревозкиГруза') ??
        getChild(dokument, 'СвУчаст');
    if (!svUchast) {
        errors.push('T06: отсутствует блок <СвУчастниковПеревозкиГруза>.');
        return;
    }

    const carrier = getChild(svUchast, 'Перевозчик');
    if (!carrier) {
        errors.push('T06: отсутствует <Перевозчик> в составе участников.');
    }

    // Placeholder подписи — пока не требуем строгий формат КЭП,
    // но факт наличия блока проверяем: без него ЭДО-оператор
    // отбросит документ ещё на приёме.
    if (
        !hasChild(dokument, 'ПодписьПеревозчика') &&
        !hasChild(dokument, 'Подписант')
    ) {
        errors.push('T06: отсутствует placeholder подписи перевозчика (<ПодписьПеревозчика>).');
    }
}
