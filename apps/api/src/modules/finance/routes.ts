import { FastifyPluginAsync } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { resolveContractorId } from '../../auth/guards.js';
import { tarificationService } from './tarification.service.js';
import { financeService } from './finance.service.js';
import { InvoiceCreateSchema, FuelAnalysisQuerySchema, Export1CQuerySchema } from './schemas.js';
import { db } from '../../db/connection.js';
import { invoices } from '../../db/schema.js';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';

const financeRoutes: FastifyPluginAsync = async (fastify) => {

    // 1. GET /finance/trips/:id/cost — Расчёт стоимости рейса
    fastify.get<{ Params: { id: string } }>(
        '/finance/trips/:id/cost',
        { preHandler: [fastify.authenticate, requireAbility('read', 'Trip')] },
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
        { preHandler: [fastify.authenticate, requireAbility('read', 'Invoice')] },
        async (request, reply) => {
            const user = request.user as { userId: string; roles: string[] };
            const page = parseInt(request.query.page || '1', 10);
            const limit = parseInt(request.query.limit || '50', 10);
            const offset = (page - 1) * limit;

            // RLS: client can only see invoices for their contractor
            if (user.roles.includes('client')) {
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
                return { success: true, data: list };
            }

            const list = await db.query.invoices.findMany({
                orderBy: [desc(invoices.createdAt)],
                limit,
                offset,
            });
            return { success: true, data: list };
        }
    );

    // 3. POST /finance/invoices — Генерация счёта
    fastify.post(
        '/finance/invoices',
        { preHandler: [fastify.authenticate, requireAbility('create', 'Invoice')] },
        async (request, reply) => {
            const parsed = InvoiceCreateSchema.safeParse(request.body);
            if (!parsed.success) {
                return reply.code(422).send({ success: false, error: parsed.error.flatten() });
            }
            try {
                const invoice = await financeService.generateInvoices(parsed.data, request.user.userId, request.user.roles[0]);
                return reply.code(201).send({ success: true, data: invoice });
            } catch (error: any) {
                return reply.code(400).send({ success: false, error: error.message });
            }
        }
    );

    // 4. PUT /finance/invoices/:id/status — Смена статуса счёта
    fastify.put<{ Params: { id: string } }>(
        '/finance/invoices/:id/status',
        { preHandler: [fastify.authenticate, requireAbility('update', 'Invoice')] },
        async (request, reply) => {
            try {
                const parseResult = z.object({ status: z.string().min(1) }).safeParse(request.body);
                if (!parseResult.success) {
                    return reply.code(400).send({ success: false, error: 'Validation failed', details: parseResult.error.flatten() });
                }

                const updated = await financeService.updateInvoiceStatus(
                    request.params.id,
                    parseResult.data.status,
                    request.user.userId,
                    request.user.roles[0]
                );
                return { success: true, data: updated };
            } catch (error: any) {
                return reply.code(400).send({ success: false, error: error.message });
            }
        }
    );

    // 5. GET /finance/fuel-analysis — План-факт ГСМ
    fastify.get(
        '/finance/fuel-analysis',
        { preHandler: [fastify.authenticate, requireAbility('read', 'Vehicle')] },
        async (request, reply) => {
            const q = request.query as any;
            const start = q.startDate ? new Date(q.startDate) : undefined;
            const end = q.endDate ? new Date(q.endDate) : undefined;
            const vehicleId = q.vehicleId || undefined;
            const data = await financeService.analyzeFuel(start, end, vehicleId);
            return { success: true, data };
        }
    );

    // 6. GET /finance/kpi — KPI метрики
    fastify.get<{ Querystring: { startDate?: string; endDate?: string } }>(
        '/finance/kpi',
        { preHandler: [fastify.authenticate, requireAbility('read', 'KPI')] },
        async (request, reply) => {
            const q = request.query;
            const start = new Date(q.startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)));
            const end = new Date(q.endDate || new Date());
            const metrics = await financeService.getKpiMetrics(start, end);
            return { success: true, data: metrics };
        }
    );

    // 7. GET /finance/export/1c — Экспорт в 1С (RLS: client sees only own)
    fastify.get<{ Querystring: { startDate?: string; endDate?: string; format?: string } }>(
        '/finance/export/1c',
        { preHandler: [fastify.authenticate, requireAbility('read', 'Invoice')] },
        async (request, reply) => {
            const user = request.user as { userId: string; roles: string[] };
            const q = request.query;
            const start = new Date(q.startDate || new Date(new Date().setMonth(new Date().getMonth() - 1)));
            const end = new Date(q.endDate || new Date());

            // RLS: clients cannot export all data
            if (user.roles.includes('client')) {
                return reply.code(403).send({
                    success: false,
                    error: 'Клиентам доступен только просмотр своих счетов',
                });
            }

            // Legacy JSON format (for backward compatibility)
            if (q.format === 'json') {
                const data = await financeService.get1CExportData(start, end);
                return { success: true, data };
            }

            // Default: XML (CommerceML 2.x)
            try {
                const xml = await financeService.export1CXml(start, end);
                const filename = `1c_export_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.xml`;
                reply.header('Content-Type', 'application/xml; charset=utf-8');
                reply.header('Content-Disposition', `attachment; filename="${filename}"`);
                return reply.send(xml);
            } catch (error: any) {
                return reply.code(500).send({ success: false, error: error.message });
            }
        }
    );
};

export default financeRoutes;
