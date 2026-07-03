// ============================================================
// In-app уведомления — REST для колокольчика в навигации.
// Каждый пользователь видит только свои уведомления (по userId из JWT).
// ============================================================
import { FastifyPluginAsync } from 'fastify';
import {
    listNotifications,
    unreadCount,
    markRead,
    markAllRead,
} from './app-notifications.service.js';

const appNotificationRoutes: FastifyPluginAsync = async (app) => {
    app.get('/notifications', {
        schema: { tags: ['Уведомления'], summary: 'Список уведомлений', description: 'Последние уведомления текущего пользователя.' },
        preHandler: [app.authenticate],
    }, async (request) => {
        const user = request.user as { userId: string };
        const data = await listNotifications(user.userId);
        return { success: true, data };
    });

    app.get('/notifications/unread-count', {
        schema: { tags: ['Уведомления'], summary: 'Счётчик непрочитанных', description: 'Число непрочитанных уведомлений (для бейджа колокольчика).' },
        preHandler: [app.authenticate],
    }, async (request) => {
        const user = request.user as { userId: string };
        const count = await unreadCount(user.userId);
        return { success: true, data: { count } };
    });

    app.patch('/notifications/:id/read', {
        schema: { tags: ['Уведомления'], summary: 'Отметить прочитанным' },
        preHandler: [app.authenticate],
    }, async (request) => {
        const user = request.user as { userId: string };
        const { id } = request.params as { id: string };
        await markRead(user.userId, id);
        return { success: true };
    });

    app.patch('/notifications/read-all', {
        schema: { tags: ['Уведомления'], summary: 'Отметить все прочитанными' },
        preHandler: [app.authenticate],
    }, async (request) => {
        const user = request.user as { userId: string };
        await markAllRead(user.userId);
        return { success: true };
    });
};

export default appNotificationRoutes;
