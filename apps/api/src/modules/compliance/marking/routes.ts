// ============================================================
// Marking (Честный знак / ЦРПТ) compliance routes.
//   POST /api/compliance/marking/verify
//   POST /api/compliance/marking/scan-batch
//   GET  /api/compliance/marking/by-shipment/:lotId
//   GET  /api/compliance/marking/recent
//   GET  /api/compliance/marking/categories
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
    verifyCodes,
    listVerificationsByLot,
    listRecentVerifications,
    categorySummary,
} from './service.js';
import { requireFeature } from '../../../auth/plan-guard.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

// T-7: операции маркировки, которые пишут в БД и дёргают внешний ЦРПТ, должны
// быть за role-гейтом (а не только за requireFeature). Read-роуты остаются
// доступны всем членам орг (org-scoped). Чтение — любой; запись — рабочие роли.
const MARKING_WRITE_ROLES = ['admin', 'manager', 'dispatcher', 'logist'];
function canWriteMarking(user: AuthUser): boolean {
    return Boolean(user.roles?.some((r) => MARKING_WRITE_ROLES.includes(r)));
}

const VerifySchema = z.object({
    codes: z.array(z.string().min(1).max(255)).min(1).max(500),
});

const ScanBatchSchema = z.object({
    lotId: z.string().uuid(),
    codes: z.array(z.string().min(1).max(255)).min(1).max(1000),
});

const LotParamsSchema = z.object({ lotId: z.string().uuid() });

const markingRoutes: FastifyPluginAsync = async (app) => {
    app.post('/compliance/marking/verify', {
        schema: {
            tags: ['Compliance'],
            summary: 'Проверить коды маркировки (Честный знак)',
            description: 'Bulk-verify через активный провайдер ЦРПТ. Сохраняет результаты в marking_verifications.',
        },
        preHandler: [app.authenticate, requireFeature('marking')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!canWriteMarking(user)) {
            return reply.status(403).send({ success: false, error: 'Недостаточно прав для проверки маркировки' });
        }
        const parsed = VerifySchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Невалидный список кодов',
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const out = await verifyCodes({
            organizationId: user.organizationId ?? null,
            codes: parsed.data.codes,
        });
        return {
            success: true,
            data: {
                providerName: out.providerName,
                results: out.results,
                total: out.results.length,
                valid: out.results.filter(r => r.valid).length,
            },
        };
    });

    app.post('/compliance/marking/scan-batch', {
        schema: {
            tags: ['Compliance'],
            summary: 'Привязать партию кодов к отгрузке',
            description: 'Bulk-verifies коды и связывает их с указанной shipment_lot.',
        },
        preHandler: [app.authenticate, requireFeature('marking')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!canWriteMarking(user)) {
            return reply.status(403).send({ success: false, error: 'Недостаточно прав для сканирования маркировки' });
        }
        const parsed = ScanBatchSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Невалидные параметры',
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const out = await verifyCodes({
            organizationId: user.organizationId ?? null,
            lotId: parsed.data.lotId,
            codes: parsed.data.codes,
        });
        return {
            success: true,
            data: {
                providerName: out.providerName,
                lotId: parsed.data.lotId,
                total: out.results.length,
                valid: out.results.filter(r => r.valid).length,
                invalid: out.results.filter(r => !r.valid).length,
            },
        };
    });

    app.get('/compliance/marking/by-shipment/:lotId', {
        schema: {
            tags: ['Compliance'],
            summary: 'Коды маркировки по отгрузке',
        },
        preHandler: [app.authenticate, requireFeature('marking')],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const params = LotParamsSchema.safeParse(request.params);
        if (!params.success) {
            return reply.status(400).send({ success: false, error: 'Некорректный lotId' });
        }
        const rows = await listVerificationsByLot(params.data.lotId, user.organizationId ?? null);
        return { success: true, data: rows };
    });

    app.get('/compliance/marking/recent', {
        schema: {
            tags: ['Compliance'],
            summary: 'Недавние проверки маркировки',
        },
        preHandler: [app.authenticate, requireFeature('marking')],
    }, async (request) => {
        const user = request.user as AuthUser;
        if (!user.organizationId) return { success: true, data: [] };
        const rows = await listRecentVerifications(user.organizationId);
        return { success: true, data: rows };
    });

    app.get('/compliance/marking/categories', {
        schema: {
            tags: ['Compliance'],
            summary: 'Сводка по категориям маркировки',
        },
        preHandler: [app.authenticate, requireFeature('marking')],
    }, async (request) => {
        const user = request.user as AuthUser;
        if (!user.organizationId) return { success: true, data: [] };
        const rows = await categorySummary(user.organizationId);
        return { success: true, data: rows };
    });
};

export default markingRoutes;
