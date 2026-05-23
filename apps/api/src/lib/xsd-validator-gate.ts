// ============================================================
// Гейт XSD-валидации для EDI-провайдеров.
//
// Используется как defense-in-depth: каждый адаптер EDI
// (Diadoc/SBIS/Kontur/Mock) перед фактической отправкой
// прогоняет payload через эту функцию. Если payload — это
// XML-титул ЭТрН (root <Файл> с распознаваемым ТипДок),
// он проходит структурную проверку из `xsd-validator.ts`.
// Не-XML контент (PDF и т.п.) пропускается без проверки.
// ============================================================
import { validateETrNXml, type ETrNTitleType } from './xsd-validator.js';

export class XsdValidationError extends Error {
    readonly statusCode = 422 as const;
    readonly code = 'XSD_VALIDATION_FAILED' as const;
    readonly details: string[];

    constructor(details: string[]) {
        super('XSD validation failed');
        this.name = 'XsdValidationError';
        this.details = details;
    }
}

/** Простой type-guard для error-handler'ов на роутах. */
export function isXsdValidationError(err: unknown): err is XsdValidationError {
    return err instanceof XsdValidationError;
}

/** Маппинг ТипДок (атрибут <Документ>) → внутренний титул-тип. */
const TIP_DOK_TO_TITLE: Record<string, ETrNTitleType> = {
    ТитулПеревозчикаПрием: 'T02',
    ТитулГрузополучателя: 'T05',
    ТитулПеревозчикаЗавершение: 'T06',
};

/**
 * Попытаться распознать XML как титул ЭТрН.
 * Возвращает тип титула или `null`, если контент не похож на ЭТрН XML.
 *
 * Распознавание делается через дешёвую regex-эвристику — мы не парсим
 * XML здесь, чтобы не платить за полный парс на каждом вызове.
 * Реальный парс делает `validateETrNXml` уже после распознавания.
 */
export function detectETrNTitleType(xml: string): ETrNTitleType | null {
    // Быстрый отказ: нет root <Файл> — точно не ЭТрН.
    if (!/<Файл[\s>]/.test(xml)) return null;

    const tipDokMatch = xml.match(/<Документ[^>]*ТипДок="([^"]+)"/);
    if (tipDokMatch) {
        const mapped = TIP_DOK_TO_TITLE[tipDokMatch[1] ?? ''];
        if (mapped) return mapped;
    }

    // Эвристика по структуре для T01 (generateETrN не пишет ТипДок).
    if (/<СвУчаст>/.test(xml) || /<СвУчастниковПеревозкиГруза>/.test(xml)) {
        if (/<СсылкаНаТитул5/.test(xml)) return 'T06';
        if (/<СсылкаНаТитул1/.test(xml)) return 'T05';
        if (/ТипДок="ТитулПеревозчикаПрием"/.test(xml)) return 'T02';
        // По умолчанию — T01 (initiation grass-roots).
        return 'T01';
    }

    return null;
}

/**
 * Декодирует payload, который EdiProvider.sendDocument получает извне.
 *
 * Принимает ОБА формата:
 *   • base64 (как из MIME-вложений) — декодируем
 *   • raw XML (как из in-process pipeline modules/edi/service.ts) —
 *     возвращаем как есть
 *
 * Detection: если строка стартует с `<?xml` или `<Файл` — это уже raw XML.
 * Иначе пытаемся base64-decode.
 *
 * Возвращает `null`, если контент не похож на XML (например, base64-PDF).
 */
function decodeBase64Xml(input: string): string | null {
    // Raw XML на входе — никакого base64-decode не нужно.
    const trimmed = input.trimStart();
    if (trimmed.startsWith('<?xml') || trimmed.startsWith('<Файл')) {
        // Перекодировка windows-1251 если декларация это требует.
        const declMatch = trimmed.match(/<\?xml[^?]*encoding="([^"]+)"/i);
        if (declMatch && declMatch[1] && /1251/i.test(declMatch[1])) {
            // Для raw XML обычно уже UTF-8; здесь just-in-case попытка
            // декодировать содержимое как windows-1251 байты.
            return decodeWindows1251(Buffer.from(trimmed, 'latin1'));
        }
        return trimmed;
    }

    let buf: Buffer;
    try {
        buf = Buffer.from(input, 'base64');
    } catch {
        return null;
    }
    if (buf.length === 0) return null;

    // PDF? Не наш случай.
    if (buf.slice(0, 4).toString('ascii') === '%PDF') return null;

    // Сначала просто UTF-8.
    const utf8 = buf.toString('utf8');
    if (utf8.startsWith('<?xml') || utf8.startsWith('<Файл')) {
        // Если в декларации указан windows-1251, перекодируем.
        const declMatch = utf8.match(/<\?xml[^?]*encoding="([^"]+)"/i);
        if (declMatch && declMatch[1] && /1251/i.test(declMatch[1])) {
            return decodeWindows1251(buf);
        }
        return utf8;
    }

    // Возможно весь XML в windows-1251 (тогда UTF-8-декод дал крокозябры,
    // но сам префикс `<?xml` ASCII-совместим, так что эта ветка редкая).
    if (utf8.includes('<?xml')) return utf8;
    return null;
}

/** Минимальный windows-1251 → utf-16 декодер (только нужный диапазон). */
function decodeWindows1251(buf: Buffer): string {
    let result = '';
    for (let i = 0; i < buf.length; i++) {
        const b = buf[i]!;
        if (b < 0x80) {
            result += String.fromCharCode(b);
        } else if (b >= 0xC0 && b <= 0xDF) {
            result += String.fromCharCode(b - 0xC0 + 0x0410); // А-Я
        } else if (b >= 0xE0 && b <= 0xFF) {
            result += String.fromCharCode(b - 0xE0 + 0x0430); // а-я
        } else if (b === 0xA8) {
            result += 'Ё';
        } else if (b === 0xB8) {
            result += 'ё';
        } else {
            result += '?';
        }
    }
    return result;
}

/**
 * Главная функция-гейт. Бросает `XsdValidationError`, если payload —
 * это ЭТрН-XML и он не проходит структурную проверку.
 * Для не-XML payload (PDF и т.п.) — no-op.
 *
 * @param base64Payload  payload, как его принимает EdiProvider.sendDocument
 * @param explicitTitleType  если вызывающий код знает тип титула (например
 *   из колонки `transport_documents.title_type`), передаёт его явно
 *   и пропускает heuristic-detection.
 */
export function assertValidETrNPayload(
    base64Payload: string,
    explicitTitleType?: ETrNTitleType,
): void {
    const xml = decodeBase64Xml(base64Payload);
    if (xml === null) return; // не XML — нечего валидировать

    const titleType = explicitTitleType ?? detectETrNTitleType(xml);
    if (!titleType) return; // XML, но не ЭТрН-титул — пропускаем

    const result = validateETrNXml(xml, titleType);
    if (!result.valid) {
        throw new XsdValidationError(result.errors);
    }
}
