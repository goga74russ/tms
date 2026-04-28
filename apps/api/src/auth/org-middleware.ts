import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Organization Middleware — Sprint 14 Multitenancy
 * 
 * Extracts organizationId from authenticated user and attaches to request.
 * When orgId is present, data queries should filter by it.
 * When null (single-tenant deploy), no filtering is applied.
 * 
 * Usage in routes:
 *   const orgId = (request as any).orgId as string | null;
 *   if (orgId) query = query.where(eq(table.organizationId, orgId));
 */

declare module 'fastify' {
    interface FastifyRequest {
        orgId?: string | null;
    }
}

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
