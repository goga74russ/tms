// ============================================================
// Pure formatting helpers for the web app.
// Behaviour mirrors the per-page inline helpers in
// `app/client/page.tsx`, `app/admin/tariffs/page.tsx`, etc.
// ============================================================

export function toNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : null;
}

/** Plain Russian-formatted ruble amount: "1 234 ₽". */
export function formatMoney(value: number | string | null | undefined): string {
    const n = toNumber(value);
    if (n === null) return '—';
    return n.toLocaleString('ru-RU') + ' ₽';
}

/** ICU currency-formatted ruble amount: "1 234,00 ₽" (max 2 fraction digits). */
export function formatCurrency(value: number | string | null | undefined): string {
    const n = toNumber(value);
    if (n === null) return '—';
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 2,
    }).format(n);
}

/** Kopecks (integer) -> ruble string. 12345 -> "123,45 ₽". */
export function formatKopecksAsRub(kopecks: number | string | null | undefined): string {
    const n = toNumber(kopecks);
    if (n === null) return '—';
    return formatCurrency(n / 100);
}

/** Short Russian date: "13.05.2026". Returns '—' on invalid input. */
export function formatDate(iso: string | Date | null | undefined): string {
    if (!iso) return '—';
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU');
}

/** Verbose Russian date+time: "13 мая 2026 г., 14:30". */
export function formatDateTime(iso: string | Date | null | undefined): string {
    if (!iso) return '—';
    const d = iso instanceof Date ? iso : new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Russian plural form selector.
 * `pluralize(1, ['трип', 'трипа', 'трипов'])` -> 'трип'
 * `pluralize(2, ['трип', 'трипа', 'трипов'])` -> 'трипа'
 * `pluralize(5, ['трип', 'трипа', 'трипов'])` -> 'трипов'
 */
export function pluralize(
    count: number,
    forms: [one: string, few: string, many: string],
): string {
    const n = Math.abs(Math.trunc(count));
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
}

/** Truncate string to `max` chars, append `…` when cut. Pure helper. */
export function truncate(str: string | null | undefined, max: number): string {
    if (str === null || str === undefined) return '';
    if (max <= 0) return '';
    if (str.length <= max) return str;
    return str.slice(0, max).trimEnd() + '…';
}
