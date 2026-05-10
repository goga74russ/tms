import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { vehicles, drivers, contractors, users, orders } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { hashPassword } from '../../auth/auth.js';
import { buildTemplate, parseTemplate, type TemplateType } from './templates.js';

const TEMPLATE_TYPES: TemplateType[] = ['contractors', 'vehicles', 'drivers', 'orders'];

interface PreviewRow {
    index: number;
    data: Record<string, unknown>;
    valid: boolean;
    errors: string[];
}

function validateContractor(item: Record<string, unknown>): string[] {
    const errs: string[] = [];
    if (!item.name) errs.push('Название обязательно');
    if (!item.inn) errs.push('ИНН обязателен');
    else if (!/^\d{10}(\d{2})?$/.test(String(item.inn))) errs.push('ИНН должен содержать 10 или 12 цифр');
    return errs;
}

function validateVehicle(item: Record<string, unknown>): string[] {
    const errs: string[] = [];
    if (!item.plateNumber) errs.push('Госномер обязателен');
    if (!item.vin) errs.push('VIN обязателен');
    if (!item.make) errs.push('Марка обязательна');
    if (!item.model) errs.push('Модель обязательна');
    return errs;
}

function validateDriver(item: Record<string, unknown>): string[] {
    const errs: string[] = [];
    if (!item.fullName) errs.push('ФИО обязательно');
    if (!item.licenseNumber) errs.push('Номер ВУ обязателен');
    return errs;
}

function validateOrder(item: Record<string, unknown>): string[] {
    const errs: string[] = [];
    if (!item.number) errs.push('Номер заявки обязателен');
    if (!item.contractorInn) errs.push('ИНН контрагента обязателен');
    if (!item.cargoDescription) errs.push('Описание груза обязательно');
    if (!item.cargoWeightKg) errs.push('Вес груза обязателен');
    if (!item.loadingAddress) errs.push('Адрес погрузки обязателен');
    if (!item.unloadingAddress) errs.push('Адрес выгрузки обязателен');
    return errs;
}

function validate(type: TemplateType, item: Record<string, unknown>): string[] {
    switch (type) {
        case 'contractors': return validateContractor(item);
        case 'vehicles': return validateVehicle(item);
        case 'drivers': return validateDriver(item);
        case 'orders': return validateOrder(item);
    }
}

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
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }

        const items = (request.body as { items?: unknown[] })?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return reply.status(400).send({ success: false, error: 'items[] обязателен' });
        }
        if (items.length > 200) {
            return reply.status(400).send({ success: false, error: 'Максимум 200 записей' });
        }

        const orgId = user.organizationId || null;
        const results = { created: 0, errors: [] as { index: number, error: string }[] };

        for (let i = 0; i < items.length; i++) {
            const item = items[i] as any;
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
                    organizationId: orgId,
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
    // Sprint 14: автосоздание учётной записи если userId не указан
    // ================================================================
    app.post('/import/drivers', {
        schema: { tags: ['Импорт'], summary: 'Импорт водителей', description: 'Массовый импорт водителей. Автосоздание user-аккаунта с ролью driver при необходимости.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }

        const items = (request.body as { items?: unknown[] })?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return reply.status(400).send({ success: false, error: 'items[] обязателен' });
        }

        const orgId = user.organizationId || null;
        const results = { created: 0, usersCreated: 0, errors: [] as { index: number, error: string }[] };

        for (let i = 0; i < items.length; i++) {
            const item = items[i] as any;
            try {
                if (!item.fullName || !item.licenseNumber) {
                    results.errors.push({ index: i, error: `Пропущено: ${item.fullName || '?'} — не заполнены обязательные поля` });
                    continue;
                }

                const importResult = await db.transaction(async (tx) => {
                    let userId = item.userId as string | undefined;
                    let userCreated = false;

                    if (!userId && item.email) {
                        const [existing] = await tx.select({ id: users.id })
                            .from(users).where(eq(users.email, item.email)).limit(1);
                        if (existing) {
                            userId = existing.id;
                        }
                    }

                    if (!userId) {
                        const email = item.email || `driver_${Date.now()}_${i}@import.local`;
                        const tempPassword = randomBytes(12).toString('hex');
                        const passwordHash = await hashPassword(tempPassword);

                        const [newUser] = await tx.insert(users).values({
                            email,
                            passwordHash,
                            fullName: item.fullName,
                            phone: item.phone || null,
                            roles: ['driver'],
                            organizationId: orgId,
                        }).returning({ id: users.id });

                        userId = newUser.id;
                        userCreated = true;
                    }

                    await tx.insert(drivers).values({
                        userId,
                        fullName: item.fullName,
                        birthDate: item.birthDate ? new Date(item.birthDate) : new Date('1990-01-01'),
                        licenseNumber: item.licenseNumber,
                        licenseCategories: item.licenseCategories || ['B', 'C'],
                        licenseExpiry: item.licenseExpiry ? new Date(item.licenseExpiry) : new Date('2027-01-01'),
                        organizationId: orgId,
                    });

                    return { userCreated };
                });

                if (importResult.userCreated) results.usersCreated++;
                results.created++;
            } catch (err: any) {
                results.errors.push({ index: i, error: `${item.fullName || '?'}: ${err?.message}` });
            }
        }

        return { success: true, data: results };
    });

    // ================================================================
    // GET /import/templates/:type — отдаёт XLSX-шаблон
    // ================================================================
    app.get<{ Params: { type: string } }>('/import/templates/:type', {
        schema: {
            tags: ['Импорт'],
            summary: 'Скачать XLSX-шаблон',
            description: 'Возвращает .xlsx с шапкой колонок, 2 примерами и листом «Инструкция».',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const type = request.params.type as TemplateType;
        if (!TEMPLATE_TYPES.includes(type)) {
            return reply.status(400).send({ success: false, error: `Неизвестный тип: ${type}` });
        }
        const buf = buildTemplate(type);
        reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        reply.header('Content-Disposition', `attachment; filename="template_${type}.xlsx"`);
        return reply.send(buf);
    });

    // ================================================================
    // POST /import/:type/preview — multipart, парсит и валидирует
    // ================================================================
    app.post<{ Params: { type: string } }>('/import/:type/preview', {
        schema: {
            tags: ['Импорт'],
            summary: 'Предпросмотр импорта',
            description: 'Принимает .xlsx файл, возвращает разобранные строки с ошибками валидации.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { roles: string[]; organizationId?: string };
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }
        const type = request.params.type as TemplateType;
        if (!TEMPLATE_TYPES.includes(type)) {
            return reply.status(400).send({ success: false, error: `Неизвестный тип: ${type}` });
        }

        const file = await request.file();
        if (!file) {
            return reply.status(400).send({ success: false, error: 'Файл не передан' });
        }
        const buf = await file.toBuffer();

        let rows: Record<string, unknown>[];
        try {
            rows = parseTemplate(type, buf);
        } catch (err: any) {
            return reply.status(400).send({ success: false, error: `Ошибка чтения XLSX: ${err?.message ?? err}` });
        }

        if (rows.length > 200) {
            return reply.status(400).send({ success: false, error: 'Максимум 200 строк за один импорт' });
        }

        const preview: PreviewRow[] = rows.map((data, index) => {
            const errs = validate(type, data);
            return { index, data, valid: errs.length === 0, errors: errs };
        });

        return {
            success: true,
            data: {
                type,
                total: preview.length,
                validCount: preview.filter((p) => p.valid).length,
                errorCount: preview.filter((p) => !p.valid).length,
                rows: preview,
            },
        };
    });

    // ================================================================
    // POST /import/orders — массовый импорт заявок (по ИНН контрагента)
    // ================================================================
    app.post('/import/orders', {
        schema: { tags: ['Импорт'], summary: 'Импорт заявок', description: 'Связывает заявки с контрагентом по ИНН. Контрагент должен существовать.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }

        const items = (request.body as { items?: unknown[] })?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return reply.status(400).send({ success: false, error: 'items[] обязателен' });
        }
        if (items.length > 200) {
            return reply.status(400).send({ success: false, error: 'Максимум 200 записей' });
        }

        const orgId = user.organizationId || null;
        const results = { created: 0, errors: [] as { index: number; error: string }[] };

        for (let i = 0; i < items.length; i++) {
            const item = items[i] as any;
            try {
                const errs = validateOrder(item);
                if (errs.length > 0) {
                    results.errors.push({ index: i, error: errs.join('; ') });
                    continue;
                }
                const [contractor] = await db.select({ id: contractors.id })
                    .from(contractors)
                    .where(eq(contractors.inn, String(item.contractorInn)))
                    .limit(1);
                if (!contractor) {
                    results.errors.push({ index: i, error: `Контрагент с ИНН ${item.contractorInn} не найден` });
                    continue;
                }

                await db.insert(orders).values({
                    number: String(item.number),
                    contractorId: contractor.id,
                    cargoDescription: String(item.cargoDescription),
                    cargoWeightKg: Number(item.cargoWeightKg),
                    cargoVolumeM3: item.cargoVolumeM3 != null ? Number(item.cargoVolumeM3) : undefined,
                    loadingAddress: String(item.loadingAddress),
                    loadingDate: item.loadingDate ? new Date(String(item.loadingDate)) : undefined,
                    unloadingAddress: String(item.unloadingAddress),
                    unloadingDate: item.unloadingDate ? new Date(String(item.unloadingDate)) : undefined,
                    coldChainRequired: Boolean(item.coldChainRequired),
                    temperatureMinC: item.temperatureMinC != null && item.temperatureMinC !== '' ? Number(item.temperatureMinC) : undefined,
                    temperatureMaxC: item.temperatureMaxC != null && item.temperatureMaxC !== '' ? Number(item.temperatureMaxC) : undefined,
                    organizationId: orgId,
                    createdBy: user.userId,
                });
                results.created++;
            } catch (err: any) {
                results.errors.push({ index: i, error: `${item.number || '?'}: ${err?.message?.includes('unique') ? 'дубликат номера' : err?.message}` });
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
        const user = request.user as { userId: string; roles: string[]; organizationId?: string };
        if (!user.roles.includes('admin') && !user.roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Только admin/manager' });
        }

        const items = (request.body as { items?: unknown[] })?.items;
        if (!Array.isArray(items) || items.length === 0) {
            return reply.status(400).send({ success: false, error: 'items[] обязателен' });
        }

        const orgId = user.organizationId || null;
        const results = { created: 0, errors: [] as { index: number, error: string }[] };

        for (let i = 0; i < items.length; i++) {
            const item = items[i] as any;
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
                    organizationId: orgId,
                });
                results.created++;
            } catch (err: any) {
                results.errors.push({ index: i, error: `${item.name || '?'}: ${err?.message?.includes('unique') ? 'дубликат ИНН' : err?.message}` });
            }
        }

        return { success: true, data: results };
    });
}


