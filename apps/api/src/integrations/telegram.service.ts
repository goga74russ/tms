// ============================================================
// Telegram Bot Service — Sprint 6 Phase 1
// Sends notifications via Telegram Bot API (native fetch, no deps)
// ============================================================

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

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
        const res = await fetch(`${API_BASE}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
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
    const res = await fetch(`${API_BASE}/getMe`);
    return await res.json() as TelegramResponse;
}

/**
 * Set webhook URL for receiving updates.
 */
export async function setWebhook(url: string): Promise<TelegramResponse> {
    const res = await fetch(`${API_BASE}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
    });
    return await res.json() as TelegramResponse;
}

/**
 * Delete webhook (switch to polling).
 */
export async function deleteWebhook(): Promise<TelegramResponse> {
    const res = await fetch(`${API_BASE}/deleteWebhook`);
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
 * Format an event into a Telegram notification message.
 */
export function formatEventMessage(eventType: string, entityType: string, entityId: string, data: Record<string, any>): string {
    const template = EVENT_TEMPLATES[eventType];

    if (!template) {
        return `📋 <b>${eventType}</b>\n${entityType}: ${entityId}`;
    }

    return `${template.emoji} <b>${template.title}</b>\n${template.format(data)}`;
}

/**
 * Check if an event type should trigger a notification.
 */
export function isNotifiableEvent(eventType: string): boolean {
    return eventType in EVENT_TEMPLATES;
}
