// ============================================================
// Telegram Notifications — Fastify Routes (Sprint 6)
// Bot webhook + subscription management
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { db } from '../../db/connection.js';
import { notificationSubscriptions } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendMessage, getMe, setWebhook, deleteWebhook } from '../../integrations/telegram.service.js';

const telegramRoutes: FastifyPluginAsync = async (app) => {
    // --- Webhook endpoint (receives updates from Telegram) ---
    app.post('/telegram/webhook', {
        schema: { tags: ['Уведомления'], summary: 'Telegram webhook', description: 'Приём входящих сообщений от Telegram Bot API.' },
    }, async (request, reply) => {
        const update = request.body as any;

        // Handle /start command
        if (update?.message?.text?.startsWith('/start')) {
            const chatId = update.message.chat.id;
            const username = update.message.from?.username || '';
            const firstName = update.message.from?.first_name || '';

            // Extract deep link payload (userId)
            const parts = update.message.text.split(' ');
            const userId = parts[1] || null;

            // Upsert subscription
            await db.insert(notificationSubscriptions).values({
                userId,
                telegramChatId: String(chatId),
                telegramUsername: username,
                eventTypes: ['*'],
                isActive: true,
            }).onConflictDoUpdate({
                target: notificationSubscriptions.telegramChatId,
                set: {
                    userId,
                    telegramUsername: username,
                    isActive: true,
                },
            });

            await sendMessage(chatId, [
                '✅ <b>TMS Уведомления подключены!</b>',
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
    }, async () => {
        const subs = await db.select().from(notificationSubscriptions);
        return { success: true, data: subs };
    });

    // --- Admin: Test notification ---
    app.post('/telegram/test', {
        schema: { tags: ['Уведомления'], summary: 'Тест уведомления', description: 'Отправка тестового сообщения в Telegram.' },
        preHandler: [app.authenticate, requireAbility('manage', 'Settings')],
    }, async (request) => {
        const { chatId, message } = request.body as { chatId?: string; message?: string };
        if (!chatId) {
            // Send to all active subscribers
            const subs = await db.select()
                .from(notificationSubscriptions)
                .where(eq(notificationSubscriptions.isActive, true));
            let sent = 0;
            for (const sub of subs) {
                const res = await sendMessage(sub.telegramChatId,
                    message || '🧪 <b>Тестовое уведомление</b>\n\nTMS работает корректно!');
                if (res.ok) sent++;
            }
            return { success: true, sent };
        }
        const result = await sendMessage(chatId, message || '🧪 Тестовое уведомление TMS');
        return { success: result.ok, data: result };
    });
};

export default telegramRoutes;
