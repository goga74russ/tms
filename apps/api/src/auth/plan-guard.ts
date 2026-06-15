// ============================================================
// Round 2B — Plan / paywall guard middleware factories.
// ============================================================
//
// `requireFeature(name)`     — 402 unless the org's plan has features[name]=true.
//                              Apply to copilot, EDI, marking, custom-integrations routes.
// `requireWithinLimit(type)` — 402 if the org has hit a limit (vehicles/orders/copilot).
//                              Use _before_ the create endpoint so we don't half-create rows.
//
// Wiring: owners of feature-gated modules can attach these as `preHandler`.
// We deliberately don't touch other modules in this round — Round 2B only
// ships the infrastructure. Limit enforcement gets wired by a follow-up round.
// ============================================================
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import {
    checkLimit,
    getActiveSubscription,
} from '../modules/billing/service.js';
import type {
    PlanFeature,
    PlanFeatureLockedResponse,
    PlanLimitExceededResponse,
    UsageType,
} from '@tms/shared';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

export const PLAN_UPGRADE_URL = '/billing';

/**
 * Block the request unless the caller's plan has the named feature flag enabled.
 *
 *   app.post('/copilot/chat', { preHandler: [app.authenticate, requireFeature('ai_copilot')] }, ...)
 */
export function requireFeature(name: PlanFeature | string): preHandlerHookHandler {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = request.user as AuthUser | undefined;
        const orgId = user?.organizationId ?? null;
        // B-14: seed-data users (admin@tms.local, super@tms.local) have no
        // organization_id. Don't 401 them — admins/super-admins effectively
        // see all features in dev. For regular roles without an org we fall
        // through to the normal feature check (returns 402 on Free).
        if (!orgId) {
            const roles = user?.roles ?? [];
            // P3 (код-аудит 2026-06-14): убрана мёртвая ветка 'super_admin' (такой роли
            // нет в APP_ROLES; платформенный super-admin = роль 'admin' без org).
            if (roles.includes('admin')) {
                return;
            }
        }
        const { plan } = await getActiveSubscription(orgId);
        const enabled = (plan.features as Record<string, boolean | undefined>)[name];
        if (!enabled) {
            const body: PlanFeatureLockedResponse = {
                success: false,
                error: 'PLAN_FEATURE_LOCKED',
                feature: name,
                currentPlan: plan.id,
                upgradeUrl: PLAN_UPGRADE_URL,
            };
            return reply.status(402).send(body);
        }
    };
}

/**
 * Block the request when the org has reached the plan's quota for `type`.
 * Free tier copilot=0 means even the first message is blocked with 402.
 *
 *   app.post('/orders', { preHandler: [app.authenticate, requireWithinLimit('orders')] }, ...)
 */
export function requireWithinLimit(type: UsageType): preHandlerHookHandler {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = request.user as AuthUser | undefined;
        const orgId = user?.organizationId ?? null;
        if (!orgId) {
            // B-14: admins/super-admins without org bypass limit checks.
            // Other roles without org effectively hit no limit (no data
            // to count). Either way, don't blanket-401 seed users.
            return;
        }
        const result = await checkLimit(orgId, type);
        if (!result.allowed) {
            const body: PlanLimitExceededResponse = {
                success: false,
                error: 'PLAN_LIMIT_EXCEEDED',
                limit: type,
                current: result.current,
                cap: result.limit ?? 0,
                currentPlan: result.plan,
                upgradeUrl: PLAN_UPGRADE_URL,
            };
            return reply.status(402).send(body);
        }
    };
}

/**
 * Suggested wiring (for downstream rounds — _not_ enforced here):
 *
 *   modules/copilot/routes.ts:
 *     preHandler: [app.authenticate, requireFeature('ai_copilot'), requireWithinLimit('copilot_messages')]
 *
 *   modules/orders/routes.ts (POST only):
 *     preHandler: [app.authenticate, requireWithinLimit('orders')]
 *
 *   modules/fleet/routes.ts (POST vehicle):
 *     preHandler: [app.authenticate, requireWithinLimit('vehicles')]
 *
 *   modules/integrations/credentials/routes.ts (PUT EDI providers):
 *     preHandler: [app.authenticate, requireFeature('edi')]
 *
 *   modules/cold-chain or marking-related routes:
 *     preHandler: [app.authenticate, requireFeature('marking')]
 */
