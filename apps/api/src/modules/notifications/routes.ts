// ============================================================
// Telegram Notifications — Fastify Routes (Sprint 6)
// Bot webhook + subscription management
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { db } from '../../db/connection.js';
import { notificationSubscriptions, users } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { isPlatformSuperAdmin } from '../../auth/guards.js';
import { sendMessage, getMe, setWebhook, deleteWebhook } from '../../integrations/telegram.service.js';

const telegramRoutes: FastifyPluginAsync = async (app) => {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';
    // --- Webhook endpoint (receives updates from Telegram) ---
    app.post('/telegram/webhook', {
        schema: { tags: ['Уведомления'], summary: 'Telegram webhook', description: 'Приём входящих сообщений от Telegram Bot API.' },
    }, async (request, reply) => {
        if (!webhookSecret) {
            request.log.error('TELEGRAM_WEBHOOK_SECRET is not configured; rejecting webhook');
            return reply.status(503).send({ ok: false });
        }

        const secretHeader = request.headers['x-telegram-bot-api-secret-token'];
        const providedSecret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
        if (providedSecret !== webhookSecret) {
            return reply.status(401).send({ ok: false });
        }

        const update = request.body as { message?: { text?: string; chat: { id: number }; from?: { username?: string; first_name?: string } } };

        // Handle /start command
        if (update?.message?.text?.startsWith('/start')) {
            const chatId = update.message.chat.id;
            const username = update.message.from?.username || '';
            const firstName = update.message.from?.first_name || '';

            // Extract deep link payload (userId).
            // P2 (код-аудит 2026-06-14): невалидный (не-UUID) userId из payload ронял
            // хэндлер в 500 (PG invalid uuid на users.id и на insert) и провоцировал
            // ретраи Telegram. Санитизируем: не-UUID → null (подписка без org).
            const parts = update.message.text.split(' ');
            const rawUserId = parts[1] || null;
            const userId = rawUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUserId)
                ? rawUserId
                : null;

            // P0-S2: привязываем подписку к организации пользователя из deep-link.
            // Воркер рассылает события только подписчикам той же орг.
            let organizationId: string | null = null;
            if (userId) {
                const [u] = await db.select({ organizationId: users.organizationId })
                    .from(users).where(eq(users.id, userId)).limit(1);
                organizationId = u?.organizationId ?? null;
            }

            // Upsert subscription
            await db.insert(notificationSubscriptions).values({
                userId,
                organizationId,
                telegramChatId: String(chatId),
                telegramUsername: username,
                eventTypes: ['*'],
                isActive: true,
            }).onConflictDoUpdate({
                target: notificationSubscriptions.telegramChatId,
                set: {
                    userId,
                    organizationId,
                    telegramUsername: username,
                    isActive: true,
                },
            });

            // P3 (код-аудит 2026-06-14): без org-привязки подписка «сирота» —
            // воркер рассылает события только подписчикам той же орг, поэтому
            // org=null чат не получит НИЧЕГО. Не врём «подключены»: просим
            // открыть ссылку из приложения (она несёт userId в payload).
            if (!organizationId) {
                await sendMessage(chatId, [
                    '⚠️ <b>ТрансПульт — чат зарегистрирован, но не привязан к аккаунту.</b>',
                    '',
                    `Привет, ${firstName}! Чтобы получать уведомления, открой ссылку`,
                    'подключения Telegram из своего личного кабинета ТрансПульт —',
                    'она привяжет этот чат к твоей организации.',
                ].join('\n'));
                return { ok: true };
            }

            await sendMessage(chatId, [
                '✅ <b>ТрансПульт — уведомления подключены!</b>',
                '',
                `Привет, ${firstName}! Теперь ты будешь получать уведомления о:`,
                '• 🚛 Рейсах (создание, назначение, отправка, завершение)',
                '• 📦 Заявках (новые, статус)',
                '• 🔧 Ремонтах (создание, завершение)',
                '• 💰 Счетах (создание, оплата)',
                '• 📄 Путевых листах',
                '',
                '<b>Команды:</b>',
                '/status — текущий статус',
                '/mute — приостановить уведомления',
                '/unmute — возобновить уведомления',
            ].join('\n'));

            return { ok: true };
        }

        // Handle /status command
        if (update?.message?.text === '/status') {
            const chatId = update.message.chat.id;
            const [sub] = await db.select()
                .from(notificationSubscriptions)
                .where(eq(notificationSubscriptions.telegramChatId, String(chatId)))
                .limit(1);

            if (sub) {
                const events = (sub.eventTypes as string[]).join(', ');
                await sendMessage(chatId, [
                    '📊 <b>Статус подписки</b>',
                    '',
                    `Активна: ${sub.isActive ? '✅ Да' : '❌ Нет'}`,
                    `События: ${events}`,
                    `Подключено: ${sub.createdAt.toLocaleDateString('ru-RU')}`,
                ].join('\n'));
            } else {
                await sendMessage(chatId, '❌ Подписка не найдена. Используйте /start');
            }
            return { ok: true };
        }

        // Handle /mute command
        if (update?.message?.text === '/mute') {
            const chatId = String(update.message.chat.id);
            await db.update(notificationSubscriptions)
                .set({ isActive: false })
                .where(eq(notificationSubscriptions.telegramChatId, chatId));
            await sendMessage(chatId, '🔇 Уведомления приостановлены. /unmute чтобы возобновить.');
            return { ok: true };
        }

        // Handle /unmute command
        if (update?.message?.text === '/unmute') {
            const chatId = String(update.message.chat.id);
            await db.update(notificationSubscriptions)
                .set({ isActive: true })
                .where(eq(notificationSubscriptions.telegramChatId, chatId));
            await sendMessage(chatId, '🔔 Уведомления возобновлены!');
            return { ok: true };
        }

        return { ok: true };
    });

    // --- Admin: Setup webhook ---
    app.post('/telegram/setup-webhook', {
        schema: { tags: ['Уведомления'], summary: 'Настроить webhook', description: 'Регистрация webhook URL в Telegram Bot API.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        const { url } = request.body as { url: string };
        if (!url) return reply.code(400).send({ success: false, error: 'url is required' });
        const result = await setWebhook(url);
        return { success: result.ok, data: result };
    });

    // --- Admin: Delete webhook ---
    app.delete('/telegram/webhook', {
        schema: { tags: ['Уведомления'], summary: 'Удалить webhook', description: 'Удаление webhook из Telegram.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async () => {
        const result = await deleteWebhook();
        return { success: result.ok, data: result };
    });

    // --- Admin: Bot info ---
    app.get('/telegram/bot-info', {
        schema: { tags: ['Уведомления'], summary: 'Информация о боте', description: 'Получить данные Telegram-бота (имя, username).' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async () => {
        const result = await getMe();
        return { success: result.ok, data: result.result };
    });

    // --- Admin: List subscriptions ---
    app.get('/telegram/subscriptions', {
        schema: { tags: ['Уведомления'], summary: 'Подписки', description: 'Список привязанных Telegram-аккаунтов.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        // C3 (CBO): раньше отдавались подписки ВСЕХ тенантов (chatId/userId — PII).
        // Фильтр по орг; super-admin (admin && !org) — кросс-tenant (все); прочий org-less → пусто.
        const user = request.user as { roles?: string[]; organizationId?: string | null };
        if (!user.organizationId) {
            if (!isPlatformSuperAdmin(user)) return reply.send({ success: true, data: [] });
            const all = await db.select().from(notificationSubscriptions);
            return { success: true, data: all };
        }
        const subs = await db.select().from(notificationSubscriptions)
            .where(eq(notificationSubscriptions.organizationId, user.organizationId));
        return { success: true, data: subs };
    });

    // --- Admin: Test notification ---
    app.post('/telegram/test', {
        schema: { tags: ['Уведомления'], summary: 'Тест уведомления', description: 'Отправка тестового сообщения в Telegram.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request, reply) => {
        const { chatId, message } = request.body as { chatId?: string; message?: string };
        // C3 (CBO, механизм «а»): раньше broadcast уходил подписчикам ВСЕХ тенантов.
        // super-admin (admin && !org) — кросс-tenant; прочий org-less → DENY.
        const user = request.user as { roles?: string[]; organizationId?: string | null };
        const isSuper = isPlatformSuperAdmin(user);
        if (!user.organizationId && !isSuper) return reply.status(403).send({ success: false, error: 'Учётная запись не привязана к организации' });
        if (!chatId) {
            // Активные подписчики орг (super-admin — все).
            const subs = await db.select()
                .from(notificationSubscriptions)
                .where(user.organizationId
                    ? and(eq(notificationSubscriptions.isActive, true), eq(notificationSubscriptions.organizationId, user.organizationId))
                    : eq(notificationSubscriptions.isActive, true));
            const text = message || '🧪 <b>Тестовое уведомление</b>\n\nТрансПульт работает корректно!';
            // Рассылаем параллельно батчами (ограничение конкуренции), результат отправки сохраняем.
            const BATCH_SIZE = 20;
            let sent = 0;
            for (let i = 0; i < subs.length; i += BATCH_SIZE) {
                const batch = subs.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(
                    batch.map((sub) => sendMessage(sub.telegramChatId, text)),
                );
                for (const r of results) {
                    if (r.status === 'fulfilled' && r.value.ok) sent++;
                }
            }
            return { success: true, sent };
        }
        // chatId-путь: разрешаем только если chatId — подписка нашей орг (иначе
        // можно слать в чужой чат по подсмотренному chatId). super-admin — любой chatId.
        if (!isSuper) {
            const [own] = await db.select({ id: notificationSubscriptions.id })
                .from(notificationSubscriptions)
                .where(and(
                    eq(notificationSubscriptions.telegramChatId, chatId),
                    eq(notificationSubscriptions.organizationId, user.organizationId!),
                )).limit(1);
            if (!own) return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
        }
        const result = await sendMessage(chatId, message || '🧪 Тестовое уведомление ТрансПульт');
        return { success: result.ok, data: result };
    });
};

export default telegramRoutes;
