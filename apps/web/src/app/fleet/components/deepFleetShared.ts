'use client';

export type DeepFleetOption = {
    id: string;
    label: string;
};

export function formatDateTime(value?: string | Date | null) {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function formatDate(value?: string | Date | null) {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ru-RU');
}

export function formatMoney(value?: number | string | null) {
    const amount = Number(value ?? 0);
    return amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽';
}

export function toLocalDateTimeInputValue(value?: string | Date | null) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toLocalDateInputValue(value?: string | Date | null) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getRowRecord<T>(row: any, key: string): T {
    return (row?.[key] ?? row) as T;
}

export function durationHours(startAt?: string | Date | null, endAt?: string | Date | null) {
    if (!startAt) return 0;
    const start = new Date(startAt);
    const end = endAt ? new Date(endAt) : new Date();
    return Math.max((end.getTime() - start.getTime()) / 3600000, 0);
}
