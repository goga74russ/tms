// ============================================================
// ЭТрН XSD Validator — структурная проверка XML-титулов перед
// отправкой в ЭДО-оператора (Diadoc / SBIS / Kontur).
//
// Закон 01.09.2026 (ФНС приказ ЕД-7-26/1065@ авто-ЭТрН, Минтранс №348;
// 383@ — водный транспорт, не наш кейс)
// требует валидацию по XSD-схемам линейки 973_01..973_08 v5.01.
//
// Это БЫСТРАЯ структурная проверка через `fast-xml-parser`:
//   • корневой элемент `<Файл>` с атрибутами `ВерсФорм="5.01"`
//     и `ВерсПрог`;
//   • присутствует `<Документ>`;
//   • для каждого типа титула — обязательные ветки (отправитель,
//     перевозчик, получатель, ссылка на предыдущий титул и т.д.).
//
// Её цель — поймать grossly malformed XML дёшево и синхронно.
//
// НАСТОЯЩАЯ XSD-валидация против реальных схем ФНС теперь живёт в
// `xsd-schema-validator.ts` (libxml2 через `xmllint-wasm`, схемы
// завендорены в `apps/api/src/assets/etrn-schemas/`). Текущие
// генераторы её пока НЕ проходят — измеренная дельта и дорожная
// карта приведения к сертифицируемому виду: `docs/etrn/CERTIFICATION-DELTA.md`.
// ============================================================
import { XMLParser } from 'fast-xml-parser';

export type ETrNTitleType = 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06';

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
        case 'T03':
            validateT03(dokument, errors);
            break;
        case 'T04':
            validateT04(dokument, errors);
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
// Структуры конкретных титулов — имена тегов из РЕАЛЬНЫХ XSD ФНС
// (приказ ЕД-7-26/1065@ v5.01), как их пишут генераторы после
// приведения к сертифицируемому виду. Это БЫСТРАЯ структурная проверка
// (root, КНД, наличие ключевых веток); полная XSD-валидация —
// `xsd-schema-validator.ts` (xmllint-wasm).
// ------------------------------------------------------------------

/** КНД каждого титула (обязательный атрибут <Документ>). */
export const ETRN_TITLE_KND: Record<ETrNTitleType, string> = {
    T01: '1110339',
    T02: '1110340',
    T03: '1110343', // переадресовка
    T04: '1110344', // замена водителя/ТС
    T05: '1110341',
    T06: '1110342',
};

function checkKnd(dokument: ParsedNode, title: ETrNTitleType, errors: string[]): void {
    const knd = getAttr(dokument, 'КНД');
    const expected = ETRN_TITLE_KND[title];
    if (knd !== expected) {
        errors.push(`${title}: атрибут КНД должен быть "${expected}" (получено: "${knd ?? '—'}").`);
    }
}

function validateT01(dokument: ParsedNode, errors: string[]): void {
    checkKnd(dokument, 'T01', errors);
    const sod = getChild(dokument, 'СодИнфГО');
    if (!sod) {
        errors.push('T01: отсутствует <СодИнфГО> (содержание информации грузоотправителя).');
        return;
    }
    if (!getChild(sod, 'СвГО')) errors.push('T01: отсутствует <СвГО> (грузоотправитель).');
    if (!getChild(sod, 'СвПер')) errors.push('T01: отсутствует <СвПер> (перевозчик).');
    if (!hasChild(sod, 'СвГруз')) errors.push('T01: отсутствует <СвГруз> (сведения о грузе).');
}

function validateT02(dokument: ParsedNode, errors: string[]): void {
    checkKnd(dokument, 'T02', errors);
    const idInf = getChild(dokument, 'ИдИнфГО');
    if (!idInf) {
        errors.push('T02: отсутствует <ИдИнфГО> (ссылка на файл Титула 1).');
    } else if (!getAttr(idInf, 'ЭП')) {
        errors.push('T02: в <ИдИнфГО> отсутствует ЭП Титула 1.');
    }
    if (!hasChild(dokument, 'СодИнфПрвПрием')) {
        errors.push('T02: отсутствует <СодИнфПрвПрием> (подтверждение приёма).');
    }
}

function validateT03(dokument: ParsedNode, errors: string[]): void {
    checkKnd(dokument, 'T03', errors);
    const idInf = getChild(dokument, 'ИдИнфПрвПрием');
    if (!idInf) {
        errors.push('T03: отсутствует <ИдИнфПрвПрием> (ссылка на файл предыдущего титула).');
    } else if (!getAttr(idInf, 'ЭП')) {
        errors.push('T03: в <ИдИнфПрвПрием> отсутствует ЭП предыдущего титула.');
    }
    if (!hasChild(dokument, 'СодИнфПА')) {
        errors.push('T03: отсутствует <СодИнфПА> (сведения о переадресовке).');
    }
}

function validateT04(dokument: ParsedNode, errors: string[]): void {
    checkKnd(dokument, 'T04', errors);
    const idInf = getChild(dokument, 'ИдИнфПрвПрием');
    if (!idInf) {
        errors.push('T04: отсутствует <ИдИнфПрвПрием> (ссылка на файл предыдущего титула).');
    } else if (!getAttr(idInf, 'ЭП')) {
        errors.push('T04: в <ИдИнфПрвПрием> отсутствует ЭП предыдущего титула.');
    }
    if (!hasChild(dokument, 'СодИнфЗамен')) {
        errors.push('T04: отсутствует <СодИнфЗамен> (сведения о замене водителя/ТС).');
    }
}

function validateT05(dokument: ParsedNode, errors: string[]): void {
    checkKnd(dokument, 'T05', errors);
    const idInf = getChild(dokument, 'ИдИнфПрвПрием');
    if (!idInf) {
        errors.push('T05: отсутствует <ИдИнфПрвПрием> (ссылка на файл Титула 2).');
    } else if (!getAttr(idInf, 'ЭП')) {
        errors.push('T05: в <ИдИнфПрвПрием> отсутствует ЭП Титула 2.');
    }
    if (!hasChild(dokument, 'СодИнфГП')) {
        errors.push('T05: отсутствует <СодИнфГП> (содержание информации грузополучателя).');
    }
}

function validateT06(dokument: ParsedNode, errors: string[]): void {
    checkKnd(dokument, 'T06', errors);
    const idInf = getChild(dokument, 'ИдИнфГП');
    if (!idInf) {
        errors.push('T06: отсутствует <ИдИнфГП> (ссылка на файл Титула 5).');
    } else if (!getAttr(idInf, 'ЭП')) {
        errors.push('T06: в <ИдИнфГП> отсутствует ЭП Титула 5.');
    }
    if (!hasChild(dokument, 'СодПрвВыд')) {
        errors.push('T06: отсутствует <СодПрвВыд> (содержание выдачи).');
    }
}
