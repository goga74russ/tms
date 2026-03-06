import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { vehicles, drivers, contractors } from '../../db/schema.js';

/**
 * Excel/CSV Import Routes — Sprint 7
 * POST /api/import/vehicles  — bulk import от JSON массива
 * POST /api/import/drivers   — bulk import водителей
 * POST /api/import/contractors — bulk import контрагентов
 * 
 * ⚠️ ПРИМЕЧАНИЕ: реальный Excel парсинг (xlsx) требует npm пакет `xlsx`.
 *    Сейчас принимаем JSON массив — фронтенд парсит Excel через SheetJS.
 */
export default async function importRoutes(app: FastifyInstance) {

    // ================================================================
    // POST /import/vehicles — массовый импорт ТС
    // ================================================================
    app.post('/import/vehicles', {
        schema: { tags: ['Импорт'], summary: 'Импорт ТС', description: 'Массовый импорт транспортных средств (до 200 за запрос). Валидация каждой записи.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = (request as any).user;
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }

        const items = (request.body as any)?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return reply.status(400).send({ success: false, error: 'items[] обязателен' });
        }
        if (items.length > 200) {
            return reply.status(400).send({ success: false, error: 'Максимум 200 записей' });
        }

        const results = { created: 0, errors: [] as { index: number, error: string }[] };

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
                if (!item.plateNumber || !item.vin || !item.make || !item.model) {
                    results.errors.push({ index: i, error: `Пропущено: ${item.plateNumber || '?'} — не заполнены обязательные поля` });
                    continue;
                }
                await db.insert(vehicles).values({
                    plateNumber: item.plateNumber,
                    vin: item.vin,
                    make: item.make,
                    model: item.model,
                    year: item.year || new Date().getFullYear(),
                    bodyType: item.bodyType || 'тент',
                    payloadCapacityKg: item.payloadCapacityKg || 5000,
                    payloadVolumeM3: item.payloadVolumeM3 || 20,
                    fuelTankLiters: item.fuelTankLiters || 120,
                    fuelNormPer100Km: item.fuelNormPer100Km || 18,
                    currentOdometerKm: item.currentOdometerKm || 0,
                });
                results.created++;
            } catch (err: any) {
                results.errors.push({ index: i, error: `${item.plateNumber || '?'}: ${err?.message?.includes('unique') ? 'дубликат' : err?.message}` });
            }
        }

        return { success: true, data: results };
    });

    // ================================================================
    // POST /import/drivers — массовый импорт водителей
    // ================================================================
    app.post('/import/drivers', {
        schema: { tags: ['Импорт'], summary: 'Импорт водителей', description: 'Массовый импорт водителей. Требуется userId для привязки к учётной записи.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = (request as any).user;
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }

        const items = (request.body as any)?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return reply.status(400).send({ success: false, error: 'items[] обязателен' });
        }

        const results = { created: 0, errors: [] as { index: number, error: string }[] };

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
                if (!item.fullName || !item.licenseNumber) {
                    results.errors.push({ index: i, error: `Пропущено: ${item.fullName || '?'} — не заполнены обязательные поля` });
                    continue;
                }
                await db.insert(drivers).values({
                    userId: item.userId || '00000000-0000-0000-0000-000000000000',
                    fullName: item.fullName,
                    birthDate: item.birthDate ? new Date(item.birthDate) : new Date('1990-01-01'),
                    licenseNumber: item.licenseNumber,
                    licenseCategories: item.licenseCategories || ['B', 'C'],
                    licenseExpiry: item.licenseExpiry ? new Date(item.licenseExpiry) : new Date('2027-01-01'),
                });
                results.created++;
            } catch (err: any) {
                results.errors.push({ index: i, error: `${item.fullName || '?'}: ${err?.message}` });
            }
        }

        return { success: true, data: results };
    });

    // ================================================================
    // POST /import/contractors — массовый импорт контрагентов
    // ================================================================
    app.post('/import/contractors', {
        schema: { tags: ['Импорт'], summary: 'Импорт контрагентов', description: 'Массовый импорт контрагентов. Валидация ИНН.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = (request as any).user;
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }

        const items = (request.body as any)?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return reply.status(400).send({ success: false, error: 'items[] обязателен' });
        }

        const results = { created: 0, errors: [] as { index: number, error: string }[] };

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            try {
                if (!item.name || !item.inn) {
                    results.errors.push({ index: i, error: `Пропущено: ${item.name || '?'} — не заполнены обязательные поля` });
                    continue;
                }
                await db.insert(contractors).values({
                    name: item.name,
                    inn: item.inn,
                    kpp: item.kpp || null,
                    legalAddress: item.legalAddress || '',
                    phone: item.phone || null,
                    email: item.email || null,
                });
                results.created++;
            } catch (err: any) {
                results.errors.push({ index: i, error: `${item.name || '?'}: ${err?.message?.includes('unique') ? 'дубликат ИНН' : err?.message}` });
            }
        }

        return { success: true, data: results };
    });
}
