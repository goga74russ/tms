import { FastifyPluginAsync } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { resolveContractorId } from '../../auth/guards.js';
import { tarificationService } from './tarification.service.js';
import { financeService } from './finance.service.js';
import { InvoiceCreateSchema, FuelAnalysisQuerySchema, Export1CQuerySchema, AdjustmentCreateSchema } from './schemas.js';
import { db } from '../../db/connection.js';
import { invoices, invoiceTrips, invoiceAdjustments, contractors as contractorsTable } from '../../db/schema.js';
import { z } from 'zod';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { PRIVILEGED_ROLES, hasPrivilege } from '@tms/shared';

function num(value: unknown): number {
    return typeof value === 'number' ? value : Number(value ?? 0);
}

function serializeInvoice<T extends { subtotal: unknown; vatAmount: unknown; total: unknown }>(invoice: T) {
    return {
        ...invoice,
        subtotal: num(invoice.subtotal),
        vatAmount: num(invoice.vatAmount),
        total: num(invoice.total),
    };
}

async function ensureInvoiceAccess(
    invoiceId: string,
    user: { userId: string; roles: string[]; organizationId?: string },
) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
    if (!invoice) {
        return { error: { status: 404, body: { success: false, error: 'Счёт не найден' } } as const };
    }

    if (!hasPrivilege(user.roles) && user.roles.includes('client')) {
        const myContractorId = await resolveContractorId(user.userId);
        if (invoice.contractorId !== myContractorId) {
            return { error: { status: 403, body: { success: false, error: 'Доступ запрещён' } } as const };
        }
    } else if (user.organizationId) {
        const [contractor] = await db.select({ id: contractorsTable.id })
            .from(contractorsTable)
            .where(and(eq(contractorsTable.id, invoice.contractorId), eq(contractorsTable.organizationId, user.organizationId)))
            .limit(1);
        if (!contractor) {
            return { error: { status: 403, body: { success: false, error: 'Доступ запрещён' } } as const };
        }
    }

    return { invoice };
}

async function attachTripIds<T extends { id: string; subtotal: unknown; vatAmount: unknown; total: unknown }>(list: T[]) {
    if (list.length === 0) return [];

    const links = await db.select({ invoiceId: invoiceTrips.invoiceId, tripId: invoiceTrips.tripId })
        .from(invoiceTrips)
        .where(inArray(invoiceTrips.invoiceId, list.map((item) => item.id)));

    const tripIdsByInvoice = new Map<string, string[]>();
    for (const link of links) {
        const existing = tripIdsByInvoice.get(link.invoiceId) ?? [];
        existing.push(link.tripId);
        tripIdsByInvoice.set(link.invoiceId, existing);
    }

    return list.map((item) => ({
        ...serializeInvoice(item),
        tripIds: tripIdsByInvoice.get(item.id) ?? [],
    }));
}

const financeRoutes: FastifyPluginAsync = async (fastify) => {

    // 1. GET /finance/trips/:id/cost — Расчёт стоимости рейса
    fastify.get<{ Params: { id: string } }>(
        '/finance/trips/:id/cost',
        { schema: { tags: ['Финансы'], summary: 'Стоимость рейса', description: 'Расчёт по тарифу: стоимость и маржа + модификаторы + НДС.' }, preHandler: [fastify.authenticate, requireAbility('read', 'Trip')] },
        async (request, reply) => {
            try {
                const cost = await tarificationService.calculateTripCost(request.params.id);
                return { success: true, data: cost };
            } catch (error: any) {
                return reply.code(400).send({ success: false, error: error.message });
            }
        }
    );

    // 2. GET /finance/invoices — Список счетов (RLS: client sees only own)
    fastify.get<{ Querystring: { page?: string; limit?: string } }>(
        '/finance/invoices',
        { schema: { tags: ['Финансы'], summary: 'Список счетов', description: 'Все счета/акты. RLS: клиент видит только свои.' }, preHandler: [fastify.authenticate, requireAbility('read', 'Invoice')] },
        async (request, reply) => {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const page = parseInt(request.query.page || '1', 10);
            const limit = parseInt(request.query.limit || '50', 10);
            const offset = (page - 1) * limit;

            if (!hasPrivilege(user.roles) && user.roles.includes('client')) {
                const myContractorId = await resolveContractorId(user.userId);
                if (!myContractorId) {
                    return { success: true, data: [] };
                }
                const list = await db.query.invoices.findMany({
                    where: eq(invoices.contractorId, myContractorId),
                    orderBy: [desc(invoices.createdAt)],
                    limit,
                    offset,
                });
                return { success: true, data: await attachTripIds(list) };
            }

            // Org-scoped: filter invoices by contractor's organizationId
            const conditions = [];
            if (user.organizationId) {
                conditions.push(
                    inArray(invoices.contractorId,
                        db.select({ id: contractorsTable.id }).from(contractorsTable).where(eq(contractorsTable.organizationId, user.organizationId))
                    )
                );
            }
            const where = conditions.length > 0 ? and(...conditions) : undefined;

            const list = await db.select().from(invoices)
                .where(where)
                .orderBy(desc(invoices.createdAt))
                .limit(limit)
                .offset(offset);
            return { success: true, data: await attachTripIds(list) };
        }
    );

    // 3. POST /finance/invoices — Генерация счёта
    fastify.post(
        '/finance/invoices',
        { schema: { tags: ['Финансы'], summary: 'Сформировать счёт', description: 'Генерация счёта по завершённым рейсам за период. Валидация Zod.' }, preHandler: [fastify.authenticate, requireAbility('create', 'Invoice')] },
        async (request, reply) => {
            const parsed = InvoiceCreateSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(422).send({ success: false, error: parsed.error.flatten() });
            }
            try {
                const user = request.user as { userId: string; roles: string[]; organizationId?: string };
                const invoice = await financeService.generateInvoices(parsed.data, user.userId, user.roles[0], user.organizationId);
                return reply.code(201).send({ success: true, data: invoice });
            } catch (error: any) {
                return reply.code(400).send({ success: false, error: error.message });
            }
        }
    );

    // 4. PUT /finance/invoices/:id/status — Смена статуса счёта
    fastify.put<{ Params: { id: string } }>(
        '/finance/invoices/:id/status',
        { schema: { tags: ['Финансы'], summary: 'Сменить статус счёта', description: 'draft→sent→paid/overdue. Валидация переходов.' }, preHandler: [fastify.authenticate, requireAbility('update', 'Invoice')] },
        async (request, reply) => {
            try {
                const parseResult = z.object({ status: z.string().min(1) }).safeParse(request.body);
                if (!parseResult.success) {
                    return reply.code(400).send({ success: false, error: 'Validation failed', details: parseResult.error.flatten() });
                }

                const access = await ensureInvoiceAccess(request.params.id, request.user as { userId: string; roles: string[]; organizationId?: string });
                if (access.error) {
                    return reply.code(access.error.status).send(access.error.body);
                }

                const updated = await financeService.updateInvoiceStatus(
                    request.params.id,
                    parseResult.data.status,
                    request.user.userId,
                    request.user.roles[0]
                );
                return { success: true, data: serializeInvoice(updated) };
            } catch (error: any) {
                return reply.code(400).send({ success: false, error: error.message });
            }
        }
    );

    // 5. GET /finance/fuel-analysis — План-факт ГСМ
    fastify.get(
        '/finance/fuel-analysis',
        { schema: { tags: ['Финансы'], summary: 'План-факт ГСМ', description: 'Анализ расхода топлива: норматив vs факт. Фильтр по дате и ТС.' }, preHandler: [fastify.authenticate, requireAbility('read', 'Vehicle')] },
        async (request, reply) => {
            const q = request.query as { startDate?: string; endDate?: string; vehicleId?: string };
            const start = q.startDate ? new Date(q.startDate) : undefined;
            const end = q.endDate ? new Date(q.endDate) : undefined;
            const vehicleId = q.vehicleId || undefined;
            const data = await financeService.analyzeFuel(start, end, vehicleId, (request.user as { organizationId?: string }).organizationId);
            return { success: true, data };
        }
    );

    // 6. GET /finance/kpi — KPI метрики
    fastify.get<{ Querystring: { startDate?: string; endDate?: string } }>(
        '/finance/kpi',
        { schema: { tags: ['Финансы'], summary: 'KPI метрики', description: 'Выручка, маржа, простои, загрузка ТС, производительность водителей за период.' }, preHandler: [fastify.authenticate, requireAbility('read', 'KPI')] },
        async (request, reply) => {
            const q = request.query;
            const start = new Date(q.startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)));
            const end = new Date(q.endDate || new Date());
            const metrics = await financeService.getKpiMetrics(start, end, (request.user as { organizationId?: string }).organizationId);
            return { success: true, data: metrics };
        }
    );

    // 6. GET /finance/invoices/:id — Детали счёта/акта с данными о рейсах
    fastify.get<{ Params: { id: string } }>(
        '/finance/invoices/:id',
        { schema: { tags: ['Финансы'], summary: 'Детали счёта/акта', description: 'Счёт/акт по ID с данными контрагента и рейсов. RLS: клиент видит только свои.' }, preHandler: [fastify.authenticate, requireAbility('read', 'Invoice')] },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const user = request.user as { userId: string; roles: string[]; organizationId?: string };
                const access = await ensureInvoiceAccess(id, user);
                if (access.error) {
                    return reply.code(access.error.status).send(access.error.body);
                }
                const { invoice } = access;

                const { contractors, trips: tripsTable, orders } = await import('../../db/schema.js');

                const [contractor] = invoice.contractorId
                    ? await db.select({ name: contractors.name, inn: contractors.inn, kpp: contractors.kpp, legalAddress: contractors.legalAddress })
                        .from(contractors).where(eq(contractors.id, invoice.contractorId)).limit(1)
                    : [null];

                // Sprint 11: query via junction table (FK-backed)
                const rows = await db.select({
                    id: tripsTable.id,
                    number: tripsTable.number,
                    actualCompletionAt: tripsTable.actualCompletionAt,
                    distanceKm: tripsTable.actualDistanceKm,
                    loadingAddress: orders.loadingAddress,
                    unloadingAddress: orders.unloadingAddress,
                }).from(invoiceTrips)
                    .innerJoin(tripsTable, eq(invoiceTrips.tripId, tripsTable.id))
                    .leftJoin(orders, eq(orders.tripId, tripsTable.id))
                    .where(eq(invoiceTrips.invoiceId, invoice.id));

                const tripCount = rows.length || 1;
                const costPerTrip = Number(invoice.total) / tripCount;
                const tripRows = rows.map(t => ({
                    date: t.actualCompletionAt,
                    tripNumber: t.number,
                    route: t.loadingAddress && t.unloadingAddress ? `${t.loadingAddress} → ${t.unloadingAddress}` : '—',
                    distanceKm: t.distanceKm ? Number(t.distanceKm) : null,
                    amount: costPerTrip,
                }));

                return {
                    success: true,
                    data: {
                        ...invoice,
                        contractorName: contractor?.name ?? null,
                        contractorInn: contractor?.inn ?? null,
                        contractorKpp: contractor?.kpp ?? null,
                        contractorAddress: contractor?.legalAddress ?? null,
                        tripRows,
                    },
                };
            } catch (error: any) {
                request.log.error(error);
                return reply.code(500).send({ success: false, error: error.message });
            }
        }
    );

    // 6.5 GET /finance/invoices/:id/pdf — Скачать счёт/акт как PDF
    fastify.get<{ Params: { id: string } }>(
        '/finance/invoices/:id/pdf',
        { schema: { tags: ['Финансы'], summary: 'PDF счёта/акта', description: 'Скачать счёт на оплату или акт выполненных работ в формате PDF.' }, preHandler: [fastify.authenticate, requireAbility('read', 'Invoice')] },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const user = request.user as { userId: string; roles: string[]; organizationId?: string };
                const access = await ensureInvoiceAccess(id, user);
                if (access.error) {
                    return reply.code(access.error.status).send(access.error.body);
                }
                const { invoice } = access;

                // Load contractor info
                const { contractors, trips: tripsTable, orders } = await import('../../db/schema.js');
                const [contractor] = invoice.contractorId
                    ? await db.select().from(contractors).where(eq(contractors.id, invoice.contractorId)).limit(1)
                    : [null];

                // Sprint 11: query via junction table
                const pdfTripRows = await db.select({
                    number: tripsTable.number,
                    actualCompletionAt: tripsTable.actualCompletionAt,
                    distanceKm: tripsTable.actualDistanceKm,
                    loadingAddress: orders.loadingAddress,
                    unloadingAddress: orders.unloadingAddress,
                }).from(invoiceTrips)
                    .innerJoin(tripsTable, eq(invoiceTrips.tripId, tripsTable.id))
                    .leftJoin(orders, eq(orders.tripId, tripsTable.id))
                    .where(eq(invoiceTrips.invoiceId, invoice.id));

                const tripCount = pdfTripRows.length || 1;
                const costPerTrip = Number(invoice.total) / tripCount;
                const tripRows: any[] = pdfTripRows.map(t => ({
                    date: t.actualCompletionAt,
                    tripNumber: t.number,
                    route: t.loadingAddress && t.unloadingAddress ? `${t.loadingAddress} → ${t.unloadingAddress}` : '—',
                    distanceKm: t.distanceKm ? Number(t.distanceKm) : null,
                    amount: costPerTrip,
                }));

                let pdfBuffer: Buffer;

                if (invoice.type === 'invoice') {
                    const { generateInvoicePdf } = await import('../documents/invoice-pdf.js');
                    pdfBuffer = await generateInvoicePdf({
                        number: invoice.number,
                        date: invoice.createdAt,
                        contractorName: contractor?.name ?? '—',
                        contractorInn: contractor?.inn,
                        contractorKpp: contractor?.kpp,
                        contractorAddress: contractor?.legalAddress,
                        items: [{
                            name: `Транспортные услуги за период ${invoice.periodStart ? new Date(invoice.periodStart).toLocaleDateString('ru-RU') : '—'} — ${invoice.periodEnd ? new Date(invoice.periodEnd).toLocaleDateString('ru-RU') : '—'}`,
                            qty: pdfTripRows.length || 1,
                            unit: 'рейс',
                            price: Number(invoice.subtotal) / (pdfTripRows.length || 1),
                            amount: Number(invoice.subtotal),
                        }],
                        subtotal: Number(invoice.subtotal),
                        vatAmount: Number(invoice.vatAmount),
                        total: Number(invoice.total),
                    });
                } else {
                    // act or upd
                    const { generateActPdf } = await import('../documents/act-pdf.js');
                    pdfBuffer = await generateActPdf({
                        number: invoice.number,
                        date: invoice.createdAt,
                        periodStart: invoice.periodStart,
                        periodEnd: invoice.periodEnd,
                        contractorName: contractor?.name ?? '—',
                        contractorInn: contractor?.inn,
                        contractorKpp: contractor?.kpp,
                        contractorAddress: contractor?.legalAddress,
                        trips: tripRows,
                        subtotal: Number(invoice.subtotal),
                        vatAmount: Number(invoice.vatAmount),
                        total: Number(invoice.total),
                    });
                }

                const typeLabel = invoice.type === 'invoice' ? 'invoice' : 'act';
                reply.header('Content-Type', 'application/pdf');
                reply.header('Content-Disposition', `attachment; filename="${typeLabel}_${invoice.number}.pdf"`);
                reply.header('Content-Length', pdfBuffer.length);
                return reply.send(pdfBuffer);
            } catch (error: any) {
                request.log.error(error);
                return reply.code(500).send({ success: false, error: error.message });
            }
        }
    );

    // 6.6 GET /finance/invoices/:id/upd — УПД PDF
    fastify.get<{ Params: { id: string } }>(
        '/finance/invoices/:id/upd',
        { schema: { tags: ['\u0424\u0438\u043d\u0430\u043d\u0441\u044b'], summary: 'PDF \u0423\u041f\u0414', description: '\u0423\u043d\u0438\u0432\u0435\u0440\u0441\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u0434\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u0432 PDF (\u0441\u0447\u0451\u0442-\u0444\u0430\u043a\u0442\u0443\u0440\u0430 + \u043f\u0435\u0440\u0435\u0434\u0430\u0442\u043e\u0447\u043d\u044b\u0439 \u0434\u043e\u043a.).' }, preHandler: [fastify.authenticate, requireAbility('read', 'Invoice')] },
        async (request, reply) => {
            try {
                const { id } = request.params;
                const user = request.user as { userId: string; roles: string[]; organizationId?: string };
                const access = await ensureInvoiceAccess(id, user);
                if (access.error) {
                    return reply.code(access.error.status).send(access.error.body);
                }
                const { invoice } = access;

                const { contractors, trips: tripsTable, orders } = await import('../../db/schema.js');
                const [contractor] = invoice.contractorId
                    ? await db.select().from(contractors).where(eq(contractors.id, invoice.contractorId)).limit(1)
                    : [null];

                const updTripRows = await db.select({
                    number: tripsTable.number,
                    actualCompletionAt: tripsTable.actualCompletionAt,
                    distanceKm: tripsTable.actualDistanceKm,
                    loadingAddress: orders.loadingAddress,
                    unloadingAddress: orders.unloadingAddress,
                }).from(invoiceTrips)
                    .innerJoin(tripsTable, eq(invoiceTrips.tripId, tripsTable.id))
                    .leftJoin(orders, eq(orders.tripId, tripsTable.id))
                    .where(eq(invoiceTrips.invoiceId, invoice.id));

                const tripCount = updTripRows.length || 1;
                const costPerTrip = Number(invoice.total) / tripCount;

                const { generateUpdPdf } = await import('../documents/upd-pdf.js');
                const pdfBuffer = await generateUpdPdf({
                    number: invoice.number,
                    date: invoice.createdAt,
                    periodStart: invoice.periodStart,
                    periodEnd: invoice.periodEnd,
                    status: 1,
                    contractorName: contractor?.name ?? '\u2014',
                    contractorInn: contractor?.inn,
                    contractorKpp: contractor?.kpp,
                    contractorAddress: contractor?.legalAddress,
                    trips: updTripRows.map(t => ({
                        date: t.actualCompletionAt,
                        tripNumber: t.number,
                        route: t.loadingAddress && t.unloadingAddress
                            ? `${t.loadingAddress} \u2192 ${t.unloadingAddress}`
                            : '\u2014',
                        distanceKm: t.distanceKm ? Number(t.distanceKm) : null,
                        qty: 1,
                        unit: '\u0440\u0435\u0439\u0441',
                        price: costPerTrip,
                        amount: costPerTrip,
                    })),
                    subtotal: Number(invoice.subtotal),
                    vatAmount: Number(invoice.vatAmount),
                    total: Number(invoice.total),
                });

                reply.header('Content-Disposition', `attachment; filename="upd_${invoice.number}.pdf"`);
                return reply.send(pdfBuffer);
            } catch (error: any) {
                request.log.error(error);
                return reply.code(500).send({ success: false, error: error.message });
            }
        }
    );

    // 7. GET /finance/export/1c — Экспорт в 1С (RLS: client sees only own)
    fastify.get<{ Querystring: { startDate?: string; endDate?: string; format?: string } }>(
        '/finance/export/1c',
        { schema: { tags: ['Финансы'], summary: 'Экспорт в 1С', description: 'Выгрузка данных в CommerceML 2.x XML для 1С. RLS: клиентам недоступно.' }, preHandler: [fastify.authenticate, requireAbility('read', 'Invoice')] },
        async (request, reply) => {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const q = request.query;
            const start = new Date(q.startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)));
            const end = new Date(q.endDate || new Date());

            // RLS: clients cannot export all data (but privileged users can)
            if (!hasPrivilege(user.roles) && user.roles.includes('client')) {
                return reply.code(403).send({
                    success: false,
                    error: 'Клиентам доступен только просмотр своих счетов',
                });
            }

            // Legacy JSON format (for backward compatibility)
            if (q.format === 'json') {
                const data = await financeService.get1CExportData(start, end, user.organizationId);
                return { success: true, data };
            }

            // Default: XML (CommerceML 2.x)
            try {
                const xml = await financeService.export1CXml(start, end, user.organizationId);
                const filename = `1c_export_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.xml`;
                reply.header('Content-Type', 'application/xml; charset=utf-8');
                reply.header('Content-Disposition', `attachment; filename="${filename}"`);
                return reply.send(xml);
            } catch (error: any) {
                return reply.code(500).send({ success: false, error: error.message });
            }
        }
    );
    // 8. POST /finance/invoices/:invoiceId/adjustments — создать корректировку
    fastify.post<{ Params: { invoiceId: string } }>(
        '/finance/invoices/:invoiceId/adjustments',
        { schema: { tags: ['Финансы'], summary: 'Создать корректировку счёта', description: 'Добавляет корректировочную запись к счёту и пересчитывает итог.' }, preHandler: [fastify.authenticate, requireAbility('update', 'Invoice')] },
        async (request, reply) => {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const { invoiceId } = request.params;

            const access = await ensureInvoiceAccess(invoiceId, user);
            if (access.error) {
                return reply.code(access.error.status).send(access.error.body);
            }

            const parsed = AdjustmentCreateSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(422).send({ success: false, error: parsed.error.flatten() });
            }

            try {
                const adjustment = await financeService.createAdjustment(
                    invoiceId,
                    parsed.data.reason,
                    parsed.data.description,
                    parsed.data.amount,
                    user.userId,
                );
                return reply.code(201).send({ success: true, data: adjustment });
            } catch (error: any) {
                return reply.code(400).send({ success: false, error: error.message });
            }
        }
    );

    // 9. GET /finance/invoices/:invoiceId/adjustments — список корректировок
    fastify.get<{ Params: { invoiceId: string } }>(
        '/finance/invoices/:invoiceId/adjustments',
        { schema: { tags: ['Финансы'], summary: 'Список корректировок счёта', description: 'Все корректировки для указанного счёта.' }, preHandler: [fastify.authenticate, requireAbility('read', 'Invoice')] },
        async (request, reply) => {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const { invoiceId } = request.params;

            const access = await ensureInvoiceAccess(invoiceId, user);
            if (access.error) {
                return reply.code(access.error.status).send(access.error.body);
            }

            try {
                const adjustments = await financeService.listAdjustments(invoiceId);
                return { success: true, data: adjustments };
            } catch (error: any) {
                return reply.code(400).send({ success: false, error: error.message });
            }
        }
    );

    // 10. DELETE /finance/adjustments/:id — удалить корректировку
    fastify.delete<{ Params: { id: string } }>(
        '/finance/adjustments/:id',
        { schema: { tags: ['Финансы'], summary: 'Удалить корректировку', description: 'Удаляет корректировку и пересчитывает итог счёта.' }, preHandler: [fastify.authenticate, requireAbility('update', 'Invoice')] },
        async (request, reply) => {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const { id } = request.params;

            // Fetch the adjustment first to check invoice access
            const [adjustment] = await db.select().from(invoiceAdjustments)
                .where(eq(invoiceAdjustments.id, id)).limit(1);
            if (!adjustment) {
                return reply.code(404).send({ success: false, error: 'Корректировка не найдена' });
            }

            const access = await ensureInvoiceAccess(adjustment.invoiceId, user);
            if (access.error) {
                return reply.code(access.error.status).send(access.error.body);
            }

            try {
                const result = await financeService.deleteAdjustment(id, user.userId);
                return { success: true, data: result };
            } catch (error: any) {
                return reply.code(400).send({ success: false, error: error.message });
            }
        }
    );

};

export default financeRoutes;




