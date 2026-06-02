// ============================================================
// Inspections Routes — Tech + Med (§3.3, §3.4)
// ============================================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAbility } from '../../auth/rbac.js';
import { assertDriverAccess, assertTripAccess, assertVehicleAccess } from '../../auth/guards.js';
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
    createPostTripTechInspection,
    createPostTripMedInspection,
    updateTechInspectionDecision,
    updateMedInspectionDecision,
} from './service.js';

type AuthUser = { userId: string; roles: string[]; organizationId?: string | null };

function parsePage(value: string | undefined) {
    const parsed = Number.parseInt(value || '1', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value: string | undefined, max = 100) {
    const parsed = Number.parseInt(value || '20', 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return 20;
    return Math.min(parsed, max);
}

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
            const user = request.user as { organizationId?: string };
            const queue = await getTechInspectionQueue(user.organizationId);
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
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const { page = '1', limit = '20' } = request.query as Record<string, string>;
            const result = await listTechInspections(parsePage(page), parseLimit(limit), user.organizationId);
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
            const user = request.user as { organizationId?: string };
            const { id } = request.params as { id: string };
            const inspection = await getTechInspectionById(id, user.organizationId);
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

            await assertVehicleAccess(body.vehicleId, request.user as AuthUser);
            if (body.tripId) {
                await assertTripAccess(body.tripId, request.user as AuthUser);
            }
            const inspection = await createTechInspection(body, user.userId, user.roles[0]);
            return reply.status(201).send({ success: true, data: inspection });
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({
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
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const isMedic = user.roles.includes('medic');

            if (!isMedic) {
                return reply.status(403).send({
                    success: false,
                    error: 'Доступ к очереди медосмотра — только для медика',
                });
            }

            const queue = await getMedInspectionQueue(user.organizationId);
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
            const stats = await getMedRejectionStats(parseInt(days), (request.user as { organizationId?: string }).organizationId);
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
            const user = request.user as { roles: string[] };
            if (!user.roles.includes('medic')) {
                return reply.status(403).send({ success: false, error: '?????? ?????? ??? ??????' });
            }
            const { days = '30' } = request.query as Record<string, string>;
            const drivers = await getExpiringMedCertificates(parsePage(days), (request.user as { organizationId?: string }).organizationId);
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
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const isMedic = user.roles.includes('medic');
            const { page = '1', limit = '20' } = request.query as Record<string, string>;

            const result = await listMedInspections(
                parsePage(page),
                parseLimit(limit),
                isMedic,
                user.userId,
                user.organizationId,
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
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const isMedic = user.roles.includes('medic');
            const { id } = request.params as { id: string };

            const inspection = await getMedInspectionById(
                id,
                isMedic,
                user.userId,
                user.organizationId,
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

            await assertDriverAccess(body.driverId, request.user as AuthUser);
            if (body.tripId) {
                await assertTripAccess(body.tripId, request.user as AuthUser);
            }
            const inspection = await createMedInspection(body, user.userId, user.roles[0]);
            return reply.status(201).send({ success: true, data: inspection });
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.statusCode || (error.message.includes('Согласие') ? 403 : 500);
            return reply.status(statusCode).send({
                success: false,
                error: error.message || 'Ошибка при создании осмотра',
            });
        }
    });

    // ============================================================
    // PDF — акты техосмотра и медосмотра
    // ============================================================
    const { generateTechInspectionPdf } = await import('../documents/tech-inspection-pdf.js');
    const { generateMedInspectionPdf } = await import('../documents/med-inspection-pdf.js');

    app.get('/inspections/tech/:id/pdf', {
        schema: { tags: ['Осмотры'], summary: 'PDF акта техосмотра', description: 'Скачать акт предрейсового технического осмотра в PDF.' },
        preHandler: [app.authenticate, requireAbility('read', 'TechInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { organizationId?: string };
            const { id } = request.params as { id: string };
            const inspection = await getTechInspectionById(id, user.organizationId);
            if (!inspection) {
                return reply.status(404).send({ success: false, error: 'Осмотр не найден' });
            }
            const pdf = await generateTechInspectionPdf(id);
            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `inline; filename="tech-inspection-${id}.pdf"`);
            reply.header('Content-Length', pdf.length);
            return reply.send(pdf);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({ success: false, error: error.message || 'Ошибка генерации PDF' });
        }
    });

    app.get('/inspections/med/:id/pdf', {
        schema: { tags: ['Осмотры'], summary: 'PDF акта медосмотра', description: 'Скачать акт предрейсового медицинского осмотра в PDF (152-ФЗ — доступно только медику).' },
        preHandler: [app.authenticate, requireAbility('read', 'MedInspectionDetails')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string };
            const { id } = request.params as { id: string };
            const inspection = await getMedInspectionById(id, true, user.userId, user.organizationId, request.ip);
            if (!inspection) {
                return reply.status(404).send({ success: false, error: 'Осмотр не найден' });
            }
            const pdf = await generateMedInspectionPdf(id);
            reply.header('Content-Type', 'application/pdf');
            reply.header('Content-Disposition', `inline; filename="med-inspection-${id}.pdf"`);
            reply.header('Content-Length', pdf.length);
            return reply.send(pdf);
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({ success: false, error: error.message || 'Ошибка генерации PDF' });
        }
    });

    // ============================================================
    // POST-TRIP INSPECTIONS
    // ============================================================

    /**
     * POST /api/inspections/tech/post-trip
     * Create post-trip tech inspection (mechanic only)
     */
    app.post('/inspections/tech/post-trip', {
        schema: { tags: ['\u041e\u0441\u043c\u043e\u0442\u0440\u044b'], summary: '\u041f\u043e\u0441\u043b\u0435\u0440\u0435\u0439\u0441\u043e\u0432\u044b\u0439 \u0442\u0435\u0445\u043e\u0441\u043c\u043e\u0442\u0440', description: '\u0422\u0435\u0445\u043e\u0441\u043c\u043e\u0442\u0440 \u043f\u043e\u0441\u043b\u0435 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u0438\u044f \u0442\u0440\u0430\u043d\u0441\u043f\u043e\u0440\u0442\u043d\u043e\u0433\u043e \u0441\u0440\u0435\u0434\u0441\u0442\u0432\u0430. \u041f\u0440\u0438 \u043e\u0442\u043a\u0430\u0437\u0435 \u0441\u0442\u0430\u0442\u0443\u0441 \u0422\u0421 \u2014 maintenance.' },
        preHandler: [app.authenticate, requireAbility('create', 'TechInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as {
                vehicleId: string;
                tripId: string;
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

            if (!body.vehicleId || !body.tripId || !body.checklistVersion || !body.items || !body.decision || !body.signature) {
                return reply.status(400).send({
                    success: false,
                    error: '\u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f: vehicleId, tripId, checklistVersion, items, decision, signature',
                });
            }

            if (body.items.length === 0) {
                return reply.status(400).send({
                    success: false,
                    error: '\u0427\u0435\u043a-\u043b\u0438\u0441\u0442 \u043d\u0435 \u043c\u043e\u0436\u0435\u0442 \u0431\u044b\u0442\u044c \u043f\u0443\u0441\u0442\u044b\u043c',
                });
            }

            await assertVehicleAccess(body.vehicleId, request.user as AuthUser);
            await assertTripAccess(body.tripId, request.user as AuthUser);
            const inspection = await createPostTripTechInspection(body, user.userId, user.roles[0]);
            return reply.status(201).send({ success: true, data: inspection });
        } catch (error: any) {
            request.log.error(error);
            return reply.status(error.statusCode || 500).send({
                success: false,
                error: error.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0438 \u043e\u0441\u043c\u043e\u0442\u0440\u0430',
            });
        }
    });

    /**
     * POST /api/inspections/med/post-trip
     * Create post-trip med inspection (medic only, 152-ФЗ)
     */
    app.post('/inspections/med/post-trip', {
        schema: { tags: ['\u041e\u0441\u043c\u043e\u0442\u0440\u044b'], summary: '\u041f\u043e\u0441\u043b\u0435\u0440\u0435\u0439\u0441\u043e\u0432\u044b\u0439 \u043c\u0435\u0434\u043e\u0441\u043c\u043e\u0442\u0440', description: '\u041c\u0435\u0434\u043e\u0441\u043c\u043e\u0442\u0440 \u043f\u043e\u0441\u043b\u0435 \u0440\u0435\u0439\u0441\u0430 (152-\u0424\u0417). \u0410\u0414, \u043f\u0443\u043b\u044c\u0441, \u0442\u0435\u043c\u043f\u0435\u0440\u0430\u0442\u0443\u0440\u0430, \u0430\u043b\u043a\u043e\u0442\u0435\u0441\u0442. \u041f\u042d\u041f.' },
        preHandler: [app.authenticate, requireAbility('create', 'MedInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[] };
            const body = request.body as {
                driverId: string;
                tripId: string;
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

            if (!body.driverId || !body.tripId || !body.checklistVersion || !body.decision || !body.signature) {
                return reply.status(400).send({
                    success: false,
                    error: '\u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f: driverId, tripId, checklistVersion, decision, signature',
                });
            }

            if (body.systolicBp === undefined || body.diastolicBp === undefined ||
                body.heartRate === undefined || body.temperature === undefined ||
                !body.condition || !body.alcoholTest) {
                return reply.status(400).send({
                    success: false,
                    error: '\u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u0438: systolicBp, diastolicBp, heartRate, temperature, condition, alcoholTest',
                });
            }

            await assertDriverAccess(body.driverId, request.user as AuthUser);
            await assertTripAccess(body.tripId, request.user as AuthUser);
            const inspection = await createPostTripMedInspection(body, user.userId, user.roles[0]);
            return reply.status(201).send({ success: true, data: inspection });
        } catch (error: any) {
            request.log.error(error);
            const statusCode = error.statusCode || (error.message.includes('\u0421\u043e\u0433\u043b\u0430\u0441\u0438\u0435') ? 403 : 500);
            return reply.status(statusCode).send({
                success: false,
                error: error.message || '\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u0438 \u043e\u0441\u043c\u043e\u0442\u0440\u0430',
            });
        }
    });

    // ============================================================
    // D5 \u2014 Lightweight decision endpoints (queue UI quick-approve)
    // ============================================================
    app.post('/inspections/tech/:id/decision', {
        schema: { tags: ['\u041e\u0441\u043c\u043e\u0442\u0440\u044b'], summary: '\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u043f\u043e \u0442\u0435\u0445\u043e\u0441\u043c\u043e\u0442\u0440\u0443', description: '\u041b\u0451\u0433\u043a\u0430\u044f \u0441\u043c\u0435\u043d\u0430 \u0440\u0435\u0448\u0435\u043d\u0438\u044f approved/rejected \u0431\u0435\u0437 \u043f\u0435\u0440\u0435\u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f \u0447\u0435\u043a-\u043b\u0438\u0441\u0442\u0430.' },
        preHandler: [app.authenticate, requireAbility('manage', 'TechInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            const { id } = request.params as { id: string };
            const body = request.body as { decision?: string; notes?: string };
            if (body.decision !== 'approved' && body.decision !== 'rejected') {
                return reply.status(400).send({
                    success: false,
                    error: 'decision \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c approved \u0438\u043b\u0438 rejected',
                });
            }
            const result = await updateTechInspectionDecision(
                id,
                { decision: body.decision, notes: body.notes },
                { userId: user.userId, role: user.roles[0] ?? 'mechanic', organizationId: user.organizationId ?? null },
            );
            if (!result) {
                return reply.status(404).send({ success: false, error: '\u041e\u0441\u043c\u043e\u0442\u0440 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
            }
            return { success: true, data: result };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ success: false, error: error.message || '\u041e\u0448\u0438\u0431\u043a\u0430' });
        }
    });

    app.post('/inspections/med/:id/decision', {
        schema: { tags: ['\u041e\u0441\u043c\u043e\u0442\u0440\u044b'], summary: '\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u043f\u043e \u043c\u0435\u0434\u043e\u0441\u043c\u043e\u0442\u0440\u0443', description: '\u041b\u0451\u0433\u043a\u0430\u044f \u0441\u043c\u0435\u043d\u0430 \u0440\u0435\u0448\u0435\u043d\u0438\u044f approved/rejected \u0431\u0435\u0437 \u043f\u0435\u0440\u0435\u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0438\u044f \u043f\u043e\u043a\u0430\u0437\u0430\u0442\u0435\u043b\u0435\u0439. \u0422\u043e\u043b\u044c\u043a\u043e \u0434\u043b\u044f \u043c\u0435\u0434\u0438\u043a\u0430 (152-\u0424\u0417).' },
        preHandler: [app.authenticate, requireAbility('manage', 'MedInspection')],
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const user = request.user as { userId: string; roles: string[]; organizationId?: string | null };
            if (!user.roles.includes('medic') && !user.roles.includes('admin')) {
                return reply.status(403).send({ success: false, error: '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e \u0442\u043e\u043b\u044c\u043a\u043e \u043c\u0435\u0434\u0438\u043a\u0443' });
            }
            const { id } = request.params as { id: string };
            const body = request.body as { decision?: string; notes?: string };
            if (body.decision !== 'approved' && body.decision !== 'rejected') {
                return reply.status(400).send({
                    success: false,
                    error: 'decision \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c approved \u0438\u043b\u0438 rejected',
                });
            }
            const result = await updateMedInspectionDecision(
                id,
                { decision: body.decision, notes: body.notes },
                { userId: user.userId, role: user.roles[0] ?? 'medic', organizationId: user.organizationId ?? null },
            );
            if (!result) {
                return reply.status(404).send({ success: false, error: '\u041e\u0441\u043c\u043e\u0442\u0440 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d' });
            }
            return { success: true, data: result };
        } catch (error: any) {
            request.log.error(error);
            return reply.status(500).send({ success: false, error: error.message || '\u041e\u0448\u0438\u0431\u043a\u0430' });
        }
    });
}
