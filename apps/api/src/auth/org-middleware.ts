import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Organization Middleware — Sprint 14 Multitenancy
 *
 * The `FastifyRequest.orgId` module augmentation and the `getOrgId(request)`
 * helper below remain the canonical way to read the current org from a route.
 *
 * Usage in routes:
 *   const orgId = getOrgId(request);
 *   if (orgId) query = query.where(eq(table.organizationId, orgId));
 */

declare module 'fastify' {
    interface FastifyRequest {
        orgId?: string | null;
    }
}

/**
 * @deprecated Superseded by the `authenticate` decorator in `auth.ts`, which
 * sets `request.orgId` after `jwtVerify` succeeds. This `onRequest` hook fires
 * before the JWT preHandler runs, so `request.user` is undefined here. Kept
 * exported for backward compatibility but should not be wired up.
 */
export function registerOrgMiddleware(app: FastifyInstance) {
    app.addHook('onRequest', async (request: FastifyRequest) => {
        const user = (request as any).user;
        // Only set if user is authenticated and has an organizationId
        if (user?.organizationId) {
            request.orgId = user.organizationId;
        } else {
            request.orgId = null;
        }
    });
}

/**
 * Helper: returns a WHERE clause fragment for org scoping.
 * Use in any route handler:
 * 
 *   import { orgScope } from '../../auth/org-middleware.js';
 *   const where = orgScope(request, table.organizationId);
 *   // if where is not null: query.where(and(existingWhere, where))
 */
export function getOrgId(request: FastifyRequest): string | null {
    return request.orgId ?? null;
}
