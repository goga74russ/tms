// ============================================================
// ЭПД XML helpers — общие для ЭТрН / ЭПЛ / ЭЗЗ генераторов.
// Конвенции форматов ФНС: <Файл ВерсФорм ИдФайл>, ИдФайл вида
// ON_<ТИП>_<получатель_ИНН>_<отправитель_ИНН>_<дата>_<guid>, даты ДД.ММ.ГГГГ (МСК).
// ============================================================
import { randomUUID } from 'node:crypto';

/** Экранирование XML + вырезание запрещённых XML-1.0 управляющих символов. */
export function escapeXml(str: string): string {
    return str
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** ISO → ДД.ММ.ГГГГ в МСК (UTC+3): юр-значимая ДатаДок не должна «съезжать» из-за TZ контейнера. */
export function formatDate(isoDate: string): string {
    const d = new Date(new Date(isoDate).getTime() + 3 * 60 * 60 * 1000);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${day}.${month}.${d.getUTCFullYear()}`;
}

/** ИдФайл по конвенции ФНС: ON_<ТИП>_<recipientInn>_<senderInn>_<ДДММГГГГ>_<guid>. */
export function genDocId(type: string, recipientInn: string, senderInn: string, isoDate: string): string {
    const dateStr = formatDate(isoDate).replace(/\./g, '');
    return `ON_${type}_${recipientInn}_${senderInn}_${dateStr}_${randomUUID()}`;
}

/** Опциональный атрибут: ` Имя="значение"` или '' если пусто. */
export function attr(name: string, value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    return ` ${name}="${escapeXml(String(value))}"`;
}
