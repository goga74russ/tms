// ============================================================
// НАСТОЯЩИЙ XSD-валидатор ЭПД — libxml2 через xmllint-wasm.
//
// В отличие от структурной проверки в `xsd-validator.ts`
// (fast-xml-parser, ловит только grossly malformed XML), этот
// модуль валидирует XML против РЕАЛЬНЫХ XSD-схем ФНС, завендоренных
// в `apps/api/src/assets/etrn-schemas/` (линейка 973_* для ЭТрН,
// 974_* сопроводительная ведомость, 975_* заказ-наряд — приказ
// ЕД-7-26/1065@ от 09.12.2021, ВерсФорм 5.01).
//
// Схемы поставляются в windows-1251; перед передачей в libxml2-wasm
// контент декодируется в UTF-8 (WASM-сборка стабильнее с UTF-8),
// декларация encoding переписывается соответственно. То же — для
// входного XML генераторов (они пишут windows-1251).
//
// Доставка в прод: Dockerfile копирует `apps/api/src/assets/` →
// `apps/api/dist/assets/`, поэтому резолв `../assets/etrn-schemas/`
// от скомпилированного `dist/lib/` работает в рантайме без правок.
//
// ⚠️ На текущем этапе генераторы (`etrn-generator.ts`) пишут
// упрощённую структуру и НЕ проходят эту валидацию — см.
// `docs/etrn/CERTIFICATION-DELTA.md` с измеренной дельтой и
// дорожной картой приведения к сертифицируемому виду.
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateXML } from 'xmllint-wasm';

/** Типы титулов ЭТрН, для которых есть завендоренные XSD-схемы ФНС. */
export type EtrnSchemaTitle = 'T01' | 'T02' | 'T03' | 'T04' | 'T05' | 'T06' | 'T07' | 'T08';

/** Сопоставление титул → файл XSD (имена строго из перечня ФНС). */
export const ETRN_SCHEMA_FILE: Record<EtrnSchemaTitle, string> = {
    T01: 'ON_TRNACLGROT_1_973_01_05_01_02.xsd', // Титул 1 — сведения грузоотправителя
    T02: 'ON_TRNACLPPRIN_1_973_02_05_01_01.xsd', // Титул 2 — приём груза перевозчиком
    T03: 'ON_TRNPEREADR_1_973_03_05_01_01.xsd', // Титул 3 — переадресовка
    T04: 'ON_TRNZAMEN_1_973_04_05_01_01.xsd',    // Титул 4 — замена водителя/ТС
    T05: 'ON_TRNACLGRPO_1_973_05_05_01_01.xsd',  // Титул 5 — приём груза грузополучателем
    T06: 'ON_TRNACLPVYN_1_973_06_05_01_01.xsd',  // Титул 6 — выдача груза перевозчиком
    T07: 'ON_TRNPUDPER_1_973_07_05_01_03.xsd',   // Титул 7 — ПУД перевозчика
    T08: 'ON_TRNPUDGO_1_973_08_05_01_01.xsd',    // Титул 8 — подтверждение ПУД грузополучателем
};

const SCHEMA_DIR = fileURLToPath(new URL('../assets/etrn-schemas/', import.meta.url));

/** Кэш декодированных (windows-1251 → UTF-8) схем — декодируем файл один раз. */
const schemaCache = new Map<string, string>();

function loadSchema(fileName: string): string {
    const cached = schemaCache.get(fileName);
    if (cached) return cached;
    const decoded = new TextDecoder('windows-1251')
        .decode(readFileSync(SCHEMA_DIR + fileName))
        .replace('encoding="windows-1251"', 'encoding="UTF-8"');
    schemaCache.set(fileName, decoded);
    return decoded;
}

export interface XsdValidationResult {
    valid: boolean;
    /** Человекочитаемые ошибки валидатора (как их вернул libxml2). */
    errors: string[];
}

function normalizeErrors(errors: unknown): string[] {
    if (!Array.isArray(errors)) return [];
    return errors.map((e) => {
        if (typeof e === 'string') return e;
        if (e && typeof e === 'object' && 'message' in e) {
            return String((e as { message: unknown }).message);
        }
        return JSON.stringify(e);
    });
}

/**
 * Провалидировать XML-титул ЭТрН против реальной XSD-схемы ФНС.
 *
 * @param xml    XML как строка (windows-1251 или UTF-8 — декларация
 *               будет переписана на UTF-8 перед передачей в libxml2).
 * @param title  Тип титула (T01..T08) — определяет XSD-файл.
 */
export async function validateEtrnAgainstXsd(
    xml: string,
    title: EtrnSchemaTitle,
): Promise<XsdValidationResult> {
    if (typeof xml !== 'string' || xml.trim().length === 0) {
        return { valid: false, errors: ['XML пустой или не является строкой.'] };
    }

    const schemaFile = ETRN_SCHEMA_FILE[title];
    if (!schemaFile) {
        return { valid: false, errors: [`Нет XSD-схемы для титула ${title}.`] };
    }

    let schema: string;
    try {
        schema = loadSchema(schemaFile);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { valid: false, errors: [`Не удалось загрузить XSD ${schemaFile}: ${message}`] };
    }

    const xmlUtf8 = xml.replace('encoding="windows-1251"', 'encoding="UTF-8"');

    try {
        const result = await validateXML({
            xml: [{ fileName: `etrn-${title}.xml`, contents: xmlUtf8 }],
            schema: [schema],
        });
        return { valid: Boolean(result.valid), errors: normalizeErrors(result.errors) };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { valid: false, errors: [`XSD-валидатор не смог обработать XML: ${message}`] };
    }
}
