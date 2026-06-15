import type { FastifyInstance } from 'fastify';
import { db } from '../../db/connection.js';
import { vehicles, drivers, contractors, users, orders } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { hashPassword } from '../../auth/auth.js';
import { buildTemplate, parseTemplate, type TemplateType } from './templates.js';
import { validate, validateOrder, mapPgErrorToFriendlyRu } from './validators.js';
import { safeClientError } from '../../utils/safe-error.js';
import { hasPrivilege } from '@tms/shared';

const TEMPLATE_TYPES: TemplateType[] = ['contractors', 'vehicles', 'drivers', 'orders'];

interface PreviewRow {
    index: number;
    data: Record<string, unknown>;
    valid: boolean;
    errors: string[];
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

        // A-P0-8: collect valid rows + per-row errors first, then INSERT all
        // valid rows inside ONE transaction. Previously: per-row insert with
        // no tx → partial failure left DB inconsistent. Now: either all valid
        // rows land, or none (atomic batch).
        // We pre-build error list outside the tx (validation only) so they
        // get reported even when the bulk insert succeeds. We pre-build pg
        // codes once so the error mapper doesn't leak raw constraint text.
        const validRows: Array<{ index: number; plateNumber: string; values: Record<string, unknown> }> = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i] as any;
            if (!item.plateNumber || !item.vin || !item.make || !item.model) {
                results.errors.push({ index: i, error: `Пропущено: ${item.plateNumber || '?'} — не заполнены обязательные поля` });
                continue;
            }
            validRows.push({
                index: i,
                plateNumber: item.plateNumber,
                values: {
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
                },
            });
        }

        if (validRows.length > 0) {
            try {
                await db.transaction(async (tx) => {
                    for (const row of validRows) {
                        await tx.insert(vehicles).values(row.values as any);
                        results.created++;
                    }
                });
            } catch (err: any) {
                // A-P0-5: map known PG codes to friendly messages — never echo
                // raw constraint text (leaks index/column names).
                const friendly = mapPgErrorToFriendlyRu(err?.code, 'vehicles');
                results.created = 0;
                results.errors.push({ index: -1, error: `Импорт отменён: ${friendly}` });
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
        // C9: batch-limit (DoS) — драйверы создают user-аккаунт с bcrypt per-row.
        if (items.length > 200) {
            return reply.status(400).send({ success: false, error: 'Максимум 200 записей' });
        }

        const orgId = user.organizationId || null;
        const results = { created: 0, usersCreated: 0, errors: [] as { index: number, error: string }[] };

        // A-P0-8: весь батч в ОДНОЙ внешней db.transaction (как vehicles/
        // contractors/orders) — раньше каждая строка шла в своей db.transaction,
        // partial failure оставлял БД в несогласованном состоянии. Теперь:
        // каждая строка в savepoint (tx.transaction) → per-row ошибка
        // откатывает только эту строку и не отравляет внешнюю tx; при общем
        // (не построчном) провале — откат всего батча.
        try {
            await db.transaction(async (tx) => {
                for (let i = 0; i < items.length; i++) {
                    const item = items[i] as any;
                    try {
                        if (!item.fullName || !item.licenseNumber) {
                            results.errors.push({ index: i, error: `Пропущено: ${item.fullName || '?'} — не заполнены обязательные поля` });
                            continue;
                        }

                        const importResult = await tx.transaction(async (sp) => {
                            let userId = item.userId as string | undefined;
                            let userCreated = false;

                            if (!userId && item.email && orgId) {
                                // C3 (механизм «а»): email-lookup скоупим по орг — иначе
                                // импортируемый водитель линковался к юзеру ЧУЖОЙ орг (hijack).
                                const [existing] = await sp.select({ id: users.id })
                                    .from(users).where(and(eq(users.email, item.email), eq(users.organizationId, orgId))).limit(1);
                                if (existing) {
                                    userId = existing.id;
                                }
                            }

                            if (!userId) {
                                const email = item.email || `driver_${Date.now()}_${i}@import.local`;
                                const tempPassword = randomBytes(12).toString('hex');
                                const passwordHash = await hashPassword(tempPassword);

                                const [newUser] = await sp.insert(users).values({
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

                            await sp.insert(drivers).values({
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
                        results.errors.push({ index: i, error: `${item.fullName || '?'}: ${safeClientError(err, 'ошибка создания записи')}` });
                    }
                }
            });
        } catch (err: any) {
            // Общий (не построчный) провал внешней tx → откат всего батча.
            results.created = 0;
            results.usersCreated = 0;
            results.errors.push({ index: -1, error: `Импорт отменён: ${safeClientError(err, 'ошибка импорта')}` });
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
        // P2 (код-аудит 2026-06-14): импорт — привилегированная операция. Раньше
        // GET /import/templates/:type был только под authenticate → driver/client/
        // mechanic качали шаблоны импорта. Гейтим по привилегированной роли.
        const user = request.user as { roles: string[] };
        if (!hasPrivilege(user.roles)) {
            return reply.status(403).send({ success: false, error: 'Недостаточно прав для импорта' });
        }
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
            return reply.status(400).send({ success: false, error: `Ошибка чтения XLSX: ${safeClientError(err, 'некорректный формат файла')}` });
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

        // A-P0-8: validate + resolve contractor refs OUTSIDE the tx (it
        // queries reads only). Then INSERT all valid rows in ONE tx.
        const validRows: Array<{ values: Record<string, unknown> }> = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i] as any;
            const errs = validateOrder(item);
            if (errs.length > 0) {
                results.errors.push({ index: i, error: errs.join('; ') });
                continue;
            }
            // C3 (механизм «а»): contractor по ИНН скоупим по орг — иначе заявка
            // линковалась к контрагенту ЧУЖОЙ орг (cross-tenant linking). org-less → не найден.
            const [contractor] = orgId ? await db.select({ id: contractors.id })
                .from(contractors)
                .where(and(eq(contractors.inn, String(item.contractorInn)), eq(contractors.organizationId, orgId)))
                .limit(1) : [];
            if (!contractor) {
                results.errors.push({ index: i, error: `Контрагент с ИНН ${item.contractorInn} не найден` });
                continue;
            }
            validRows.push({
                values: {
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
                },
            });
        }

        if (validRows.length > 0) {
            try {
                await db.transaction(async (tx) => {
                    for (const row of validRows) {
                        await tx.insert(orders).values(row.values as any);
                        results.created++;
                    }
                });
            } catch (err: any) {
                const friendly = mapPgErrorToFriendlyRu(err?.code, 'orders');
                results.created = 0;
                results.errors.push({ index: -1, error: `Импорт отменён: ${friendly}` });
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
        // C9: batch-limit (DoS) — единообразно с vehicles/orders/drivers.
        if (items.length > 200) {
            return reply.status(400).send({ success: false, error: 'Максимум 200 записей' });
        }

        const orgId = user.organizationId || null;
        const results = { created: 0, errors: [] as { index: number, error: string }[] };

        // A-P0-8: validate first, then batch insert in one transaction.
        const validRows: Array<{ values: Record<string, unknown> }> = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i] as any;
            if (!item.name || !item.inn) {
                results.errors.push({ index: i, error: `Пропущено: ${item.name || '?'} — не заполнены обязательные поля` });
                continue;
            }
            // P2 (код-аудит 2026-06-14): валидация формата ИНН (10 — ЮЛ, 12 — ФЛ/ИП),
            // иначе нечисловой мусор попадал в БД через JSON bulk-import.
            if (!/^(\d{10}|\d{12})$/.test(String(item.inn))) {
                results.errors.push({ index: i, error: `Пропущено: ${item.name} — некорректный ИНН (нужно 10 или 12 цифр)` });
                continue;
            }
            validRows.push({
                values: {
                    name: item.name,
                    inn: item.inn,
                    kpp: item.kpp || null,
                    legalAddress: item.legalAddress || '',
                    phone: item.phone || null,
                    email: item.email || null,
                    organizationId: orgId,
                },
            });
        }

        if (validRows.length > 0) {
            try {
                await db.transaction(async (tx) => {
                    for (const row of validRows) {
                        await tx.insert(contractors).values(row.values as any);
                        results.created++;
                    }
                });
            } catch (err: any) {
                const friendly = mapPgErrorToFriendlyRu(err?.code, 'contractors');
                results.created = 0;
                results.errors.push({ index: -1, error: `Импорт отменён: ${friendly}` });
            }
        }

        return { success: true, data: results };
    });
}


