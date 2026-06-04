// ============================================================
// Telegram Bot Service — Sprint 6 Phase 1
// Sends notifications via Telegram Bot API.
// PROV-P1-1: все outbound — через httpFetch с таймаутом (10s). Голый fetch
// без таймаута вешал notification-worker / webhook-setup при зависшем TG API.
// ============================================================
import { httpFetch } from '../providers/_http.js';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';

// ================================================================
// Core API methods
// ================================================================

interface TelegramResponse {
    ok: boolean;
    result?: any;
    description?: string;
}

/**
 * Send a text message to a Telegram chat.
 */
export async function sendMessage(chatId: string | number, text: string, options?: {
    parseMode?: 'HTML' | 'MarkdownV2';
    disableNotification?: boolean;
}): Promise<TelegramResponse> {
    if (!BOT_TOKEN) {
        console.warn('⚠️ TELEGRAM_BOT_TOKEN not set — skipping notification');
        return { ok: false, description: 'Bot token not configured' };
    }

    const body = {
        chat_id: chatId,
        text,
        parse_mode: options?.parseMode ?? 'HTML',
        disable_notification: options?.disableNotification ?? false,
    };

    try {
        const res = await httpFetch(`${API_BASE}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }, { timeoutMs: 10000, retries: 1 });
        return await res.json() as TelegramResponse;
    } catch (err: any) {
        console.error('❌ Telegram sendMessage failed:', err.message);
        return { ok: false, description: err.message };
    }
}

/**
 * Get bot info (for /start verification).
 */
export async function getMe(): Promise<TelegramResponse> {
    const res = await httpFetch(`${API_BASE}/getMe`, {}, { timeoutMs: 10000, retries: 1 });
    return await res.json() as TelegramResponse;
}

/**
 * Set webhook URL for receiving updates.
 */
export async function setWebhook(url: string): Promise<TelegramResponse> {
    const res = await httpFetch(`${API_BASE}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, secret_token: WEBHOOK_SECRET || undefined }),
    }, { timeoutMs: 10000, retries: 1 });
    return await res.json() as TelegramResponse;
}

/**
 * Delete webhook (switch to polling).
 */
export async function deleteWebhook(): Promise<TelegramResponse> {
    const res = await httpFetch(`${API_BASE}/deleteWebhook`, {}, { timeoutMs: 10000, retries: 1 });
    return await res.json() as TelegramResponse;
}

// ================================================================
// Event → Notification formatting
// ================================================================

const EVENT_TEMPLATES: Record<string, {
    emoji: string;
    title: string;
    format: (data: Record<string, any>) => string;
}> = {
    'trip.created': {
        emoji: '🚛',
        title: 'Новый рейс',
        format: (d) => `Рейс <b>${d.number || '—'}</b> создан`,
    },
    'trip.assigned': {
        emoji: '✅',
        title: 'Рейс назначен',
        format: (d) => `Рейс назначен на <b>${d.driverName || '—'}</b>\nТС: ${d.vehiclePlate || '—'}`,
    },
    'trip.departed': {
        emoji: '🚀',
        title: 'Рейс в пути',
        format: (d) => `Рейс отправлен${d.previousStatus ? ` (из ${d.previousStatus})` : ''}`,
    },
    'trip.completed': {
        emoji: '🏁',
        title: 'Рейс завершён',
        format: (_d) => `Рейс успешно завершён`,
    },
    'trip.cancelled': {
        emoji: '❌',
        title: 'Рейс отменён',
        format: (d) => `Рейс отменён${d.reason ? `: ${d.reason}` : ''}`,
    },
    'order.created': {
        emoji: '📦',
        title: 'Новая заявка',
        format: (d) => `Заявка <b>${d.number || '—'}</b> создана\n${d.fromCity || '—'} → ${d.toCity || '—'}`,
    },
    'repair.created': {
        emoji: '🔧',
        title: 'Заявка на ремонт',
        format: (d) => `Приоритет: <b>${d.priority || '—'}</b>\n${d.description || ''}`,
    },
    'repair.completed': {
        emoji: '✅',
        title: 'Ремонт завершён',
        format: (d) => `ТС ${d.vehicleId || '—'} — ремонт завершён`,
    },
    'invoice.created': {
        emoji: '💰',
        title: 'Новый счёт',
        format: (d) => `Счёт <b>${d.number || '—'}</b>\nСумма: ${d.total ? Number(d.total).toLocaleString('ru-RU') + ' ₽' : '—'}`,
    },
    'invoice.paid': {
        emoji: '✅💰',
        title: 'Счёт оплачен',
        format: (_d) => `Счёт оплачен`,
    },
    // T-14 (spec §6) — проактивные напоминания о 5-дневном сроке СФ/УПД.
    'invoice.sf_deadline_approaching': {
        emoji: '⏳',
        title: 'Скоро срок выпуска СФ',
        format: (d) => `Заявка <b>${d.orderNumber || '—'}</b>: реализована ${d.daysSinceRealization || '?'} дн. назад. `
            + `Выставьте СФ до ${d.deadlineDate ? new Date(d.deadlineDate).toLocaleDateString('ru-RU') : '—'} (5-дневный срок, ст. 168 НК).`,
    },
    'invoice.sf_overdue': {
        emoji: '🔴',
        title: 'Просрочен выпуск СФ',
        format: (d) => `Заявка <b>${d.orderNumber || '—'}</b>: срок выпуска СФ просрочен на ${d.daysLate || '?'} дн. `
            + `(реализация ${d.realizationDate ? new Date(d.realizationDate).toLocaleDateString('ru-RU') : '—'}). Выставьте счёт-фактуру.`,
    },
    'vehicle.status_changed': {
        emoji: '🚗',
        title: 'Статус ТС изменён',
        format: (d) => `Новый статус: <b>${d.newStatus || '—'}</b>${d.reason ? `\nПричина: ${d.reason}` : ''}`,
    },
    'document.created': {
        emoji: '📄',
        title: 'Путевой лист',
        format: (d) => `Путевой лист <b>${d.number || '—'}</b> сформирован`,
    },
};

/**
 * C9-sec: экранирование HTML для parse_mode=HTML. Раньше произвольные поля
 * события (reason/description/plate/number/city…) подставлялись в HTML-шаблон
 * без экранирования → инъекция разметки/поломка сообщения через `<`/`>`/`&`.
 */
function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Экранирует строковые значения data; числа/прочее пропускает (для toLocaleString и т.п.). */
function escapeData(data: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
        out[k] = typeof v === 'string' ? escapeHtml(v) : v;
    }
    return out;
}

/**
 * Format an event into a Telegram notification message.
 */
export function formatEventMessage(eventType: string, entityType: string, entityId: string, data: Record<string, any>): string {
    const template = EVENT_TEMPLATES[eventType];
    const safe = escapeData(data);

    if (!template) {
        return `📋 <b>${escapeHtml(eventType)}</b>\n${escapeHtml(entityType)}: ${escapeHtml(entityId)}`;
    }

    // Литералы <b> в самих шаблонах статичны/безопасны; экранируются только
    // значения data (через safe).
    return `${template.emoji} <b>${template.title}</b>\n${template.format(safe)}`;
}

/**
 * Check if an event type should trigger a notification.
 */
export function isNotifiableEvent(eventType: string): boolean {
    return eventType in EVENT_TEMPLATES;
}
