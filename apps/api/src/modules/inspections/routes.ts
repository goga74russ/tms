// ============================================================
// Inspections Routes — Tech + Med (§3.3, §3.4)
// ============================================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import {
    getTechInspectionQueue,
    createTechInspection,
    listTechInspections,
    getTechInspectionById,
    getTechChecklistTemplate,
    getMedInspectionQueue,
    createMedInspection,
    listMedInspections,
    getMedInspectionById,
    getMedChecklistTemplate,
    getMedRejectionStats,
    getExpiringMedCertificates,
} from './service.js';

export default async function inspectionRoutes(app: FastifyInstance) {

    // ============================================================
    // TECH INSPECTIONS
    // ============================================================

    /**
     * GET /api/inspections/tech/queue
     * Queue of vehicles awaiting tech inspection today
     */
    app.get('/inspections/tech/queue', {
        schema: { tags: ['Осмотры'], summary: 'Очередь техосмотров', description: 'Список рейсов, ожидающих техосмотр (статус inspection).' },
        preHandler: [app.authenticate, requireAbility('read', 'TechInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const queue = await getTechInspectionQueue();
            return { success: true, data: queue };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка при получении очереди',
            });
        }
    });

    /**
     * GET /api/inspections/tech/checklist
     * Active tech checklist template
     */
    app.get('/inspections/tech/checklist', {
        schema: { tags: ['Осмотры'], summary: 'Чек-лист техосмотра', description: 'Актуальный шаблон чек-листа техосмотра.' },
        preHandler: [app.authenticate, requireAbility('read', 'ChecklistTemplate')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const template = await getTechChecklistTemplate();
            if (!template) {
                return reply.status(404).send({
                    success: false,
                    error: 'Шаблон чек-листа не найден',
                });
            }
            return { success: true, data: template };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * GET /api/inspections/tech
     * List tech inspections (paginated)
     */
    app.get('/inspections/tech', {
        schema: { tags: ['Осмотры'], summary: 'Все техосмотры', description: 'Список всех проведённых техосмотров с пагинацией.' },
        preHandler: [app.authenticate, requireAbility('read', 'TechInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { page = '1', limit = '20' } = request.query as Record<string, string>;
            const result = await listTechInspections(parseInt(page), parseInt(limit));
            return { success: true, ...result };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * GET /api/inspections/tech/:id
     * Single tech inspection
     */
    app.get('/inspections/tech/:id', {
        schema: { tags: ['Осмотры'], summary: 'Получить техосмотр', description: 'Детальная информация о техосмотре по ID.' },
        preHandler: [app.authenticate, requireAbility('read', 'TechInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { id } = request.params as { id: string };
            const inspection = await getTechInspectionById(id);
            if (!inspection) {
                return reply.status(404).send({
                    success: false,
                    error: 'Осмотр не найден',
                });
            }
            return { success: true, data: inspection };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * POST /api/inspections/tech
     * Create tech inspection (mechanic only)
     */
    app.post('/inspections/tech', {
        schema: { tags: ['Осмотры'], summary: 'Провести техосмотр', description: 'Создание акта техосмотра. ПЭП (подпись). Допуск/отказ ТС.' },
        preHandler: [app.authenticate, requireAbility('create', 'TechInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as {
                vehicleId: string;
                tripId?: string;
                inspectionType?: 'pre_trip' | 'periodic';
                checklistVersion: string;
                items: Array<{
                    name: string;
                    result: 'ok' | 'fault';
                    comment?: string;
                    photoUrl?: string;
                }>;
                decision: 'approved' | 'rejected';
                comment?: string;
                signature: string;
            };

            // Validate required fields
            if (!body.vehicleId || !body.checklistVersion || !body.items || !body.decision || !body.signature) {
                return reply.status(400).send({
                    success: false,
                    error: 'Обязательные поля: vehicleId, checklistVersion, items, decision, signature',
                });
            }

            if (body.items.length === 0) {
                return reply.status(400).send({
                    success: false,
                    error: 'Чек-лист не может быть пустым',
                });
            }

            const inspection = await createTechInspection(body, user.userId, user.roles[0]);
            return reply.status(201).send({ success: true, data: inspection });
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка при создании осмотра',
            });
        }
    });

    // ============================================================
    // MED INSPECTIONS (152-ФЗ)
    // ============================================================

    /**
     * GET /api/inspections/med/queue
     * Queue of drivers awaiting med inspection today
     */
    app.get('/inspections/med/queue', {
        schema: { tags: ['Осмотры'], summary: 'Очередь медосмотров', description: 'Список водителей, ожидающих медосмотр.' },
        preHandler: [app.authenticate, requireAbility('read', 'MedInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const isMedic = user.roles.includes('medic');

            if (!isMedic) {
                return reply.status(403).send({
                    success: false,
                    error: 'Доступ к очереди медосмотра — только для медика',
                });
            }

            const queue = await getMedInspectionQueue();
            return { success: true, data: queue };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * GET /api/inspections/med/checklist
     * Active med checklist template
     */
    app.get('/inspections/med/checklist', {
        schema: { tags: ['Осмотры'], summary: 'Чек-лист медосмотра', description: 'Актуальный шаблон чек-листа медосмотра.' },
        preHandler: [app.authenticate, requireAbility('read', 'ChecklistTemplate')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const template = await getMedChecklistTemplate();
            if (!template) {
                return reply.status(404).send({
                    success: false,
                    error: 'Шаблон чек-листа не найден',
                });
            }
            return { success: true, data: template };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * GET /api/inspections/med/stats
     * Rejection statistics (medic only)
     */
    app.get('/inspections/med/stats', {
        schema: { tags: ['Осмотры'], summary: 'Статистика медосмотров', description: 'Агрегированная статистика: среднее АД, пульс, температура, % допуска.' },
        preHandler: [app.authenticate, requireAbility('read', 'MedInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const isMedic = user.roles.includes('medic');
            const isManager = user.roles.includes('manager');

            if (!isMedic && !isManager) {
                return reply.status(403).send({
                    success: false,
                    error: 'Статистика доступна только медику и руководителю',
                });
            }

            const { days = '30' } = request.query as Record<string, string>;
            const stats = await getMedRejectionStats(parseInt(days));
            return { success: true, data: stats };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * GET /api/inspections/med/expiring-certificates
     * Drivers with expiring med certificates
     */
    app.get('/inspections/med/expiring-certificates', {
        schema: { tags: ['Осмотры'], summary: 'Истекающие медсправки', description: 'Водители с истекающими медицинскими справками (< 60 дней).' },
        preHandler: [app.authenticate, requireAbility('read', 'MedInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const { days = '30' } = request.query as Record<string, string>;
            const drivers = await getExpiringMedCertificates(parseInt(days));
            return { success: true, data: drivers };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * GET /api/inspections/med
     * List med inspections (152-ФЗ filtered)
     */
    app.get('/inspections/med', {
        schema: { tags: ['Осмотры'], summary: 'Все медосмотры', description: 'Список всех медосмотров. Без чувствительных медданных для нечувсвительных ролей.' },
        preHandler: [app.authenticate, requireAbility('read', 'MedInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const isMedic = user.roles.includes('medic');
            const { page = '1', limit = '20' } = request.query as Record<string, string>;

            const result = await listMedInspections(
                parseInt(page),
                parseInt(limit),
                isMedic,
                user.userId,
            );

            return { success: true, ...result };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * GET /api/inspections/med/:id
     * Single med inspection (152-ФЗ filtered)
     */
    app.get('/inspections/med/:id', {
        schema: { tags: ['Осмотры'], summary: 'Получить медосмотр', description: 'Детальная информация. Медики видят все данные, остальные — только решение.' },
        preHandler: [app.authenticate, requireAbility('read', 'MedInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const isMedic = user.roles.includes('medic');
            const { id } = request.params as { id: string };

            const inspection = await getMedInspectionById(
                id,
                isMedic,
                user.userId,
                request.ip,
            );

            if (!inspection) {
                return reply.status(404).send({
                    success: false,
                    error: 'Осмотр не найден',
                });
            }

            return { success: true, data: inspection };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({
                success: false,
                error: error.message || 'Ошибка',
            });
        }
    });

    /**
     * POST /api/inspections/med
     * Create med inspection (medic only, 152-ФЗ)
     */
    app.post('/inspections/med', {
        schema: { tags: ['Осмотры'], summary: 'Провести медосмотр', description: 'Создание акта медосмотра (152-ФЗ). АД, пульс, температура, алкотест. ПЭП.' },
        preHandler: [app.authenticate, requireAbility('create', 'MedInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as {
                driverId: string;
                tripId?: string;
                checklistVersion: string;
                systolicBp: number;
                diastolicBp: number;
                heartRate: number;
                temperature: number;
                condition: string;
                alcoholTest: 'negative' | 'positive';
                complaints?: string;
                decision: 'approved' | 'rejected';
                comment?: string;
                signature: string;
            };

            // Validate required fields
            if (!body.driverId || !body.checklistVersion || !body.decision || !body.signature) {
                return reply.status(400).send({
                    success: false,
                    error: 'Обязательные поля: driverId, checklistVersion, decision, signature',
                });
            }

            if (body.systolicBp === undefined || body.diastolicBp === undefined ||
                body.heartRate === undefined || body.temperature === undefined ||
                !body.condition || !body.alcoholTest) {
                return reply.status(400).send({
                    success: false,
                    error: 'Обязательные показатели: systolicBp, diastolicBp, heartRate, temperature, condition, alcoholTest',
                });
            }

            const inspection = await createMedInspection(body, user.userId, user.roles[0]);
            return reply.status(201).send({ success: true, data: inspection });
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.message.includes('Согласие') ? 403 : 500;
            return reply.status(statusCode).send({
                success: false,
                error: error.message || 'Ошибка при создании осмотра',
            });
        }
    });
}
