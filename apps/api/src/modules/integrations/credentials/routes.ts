// ============================================================
// Credential management routes for the provider framework.
// Admin-only — manage encrypted API keys per organization.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../../../db/connection.js';
import { providerCredentials } from '../../../db/schema.js';
import {
    encryptCredentials,
    invalidateCredentialsCache,
    type ProviderType,
} from '../../../providers/base.js';
import {
    getAdaptersForType,
    invalidateAdapterCache,
} from '../../../providers/index.js';
import { CredentialsCreateSchema as CreateSchema } from './validators.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

function isAdmin(user: AuthUser | undefined): boolean {
    return Boolean(user?.roles?.includes('admin'));
}

const credentialsRoutes: FastifyPluginAsync = async (fastify) => {
    // GET — list configured providers (status only; never return decrypted creds).
    fastify.get('/integrations/credentials', {
        schema: {
            tags: ['Интеграции'],
            summary: 'Список настроенных провайдеров',
            description: 'Возвращает список провайдеров текущей организации (только метаданные, без расшифровки ключей).',
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!isAdmin(user)) {
            return reply.status(403).send({ success: false, error: 'admin only' });
        }
        if (!user.organizationId) {
            // Super-admin / no-org tokens: return empty list with a note instead
            // of a hard 4xx so the UI can render a neutral info banner.
            return {
                success: true,
                data: [],
                note: 'no_organization_in_token',
            };
        }

        const rows = await db
            .select({
                id: providerCredentials.id,
                providerType: providerCredentials.providerType,
                providerName: providerCredentials.providerName,
                status: providerCredentials.status,
                lastHealthCheckAt: providerCredentials.lastHealthCheckAt,
                lastError: providerCredentials.lastError,
                createdAt: providerCredentials.createdAt,
                updatedAt: providerCredentials.updatedAt,
            })
            .from(providerCredentials)
            .where(eq(providerCredentials.organizationId, user.organizationId));

        return { success: true, data: rows };
    });

    // POST — create or upsert a credential set.
    fastify.post('/integrations/credentials', {
        schema: {
            tags: ['Интеграции'],
            summary: 'Сохранить ключи провайдера',
            description: 'Шифрует и сохраняет ключи провайдера. Перезаписывает существующую запись с тем же (providerType, providerName).',
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!isAdmin(user)) {
            return reply.status(403).send({ success: false, error: 'admin only' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        }

        const parsed = CreateSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(422).send({ success: false, error: parsed.error.flatten() });
        }

        const { providerType, providerName, credentials, status } = parsed.data;
        const encrypted = encryptCredentials(credentials);

        const existing = await db
            .select({ id: providerCredentials.id })
            .from(providerCredentials)
            .where(and(
                eq(providerCredentials.organizationId, user.organizationId),
                eq(providerCredentials.providerType, providerType),
                eq(providerCredentials.providerName, providerName),
            ))
            .limit(1);

        if (existing.length > 0) {
            const id = existing[0]!.id;
            await db
                .update(providerCredentials)
                .set({
                    encryptedCredentials: encrypted,
                    status: status ?? 'sandbox',
                    lastError: null,
                    updatedAt: new Date(),
                })
                .where(eq(providerCredentials.id, id));
            invalidateCredentialsCache(user.organizationId, providerType);
            invalidateAdapterCache(user.organizationId, providerType);
            return { success: true, data: { id, providerType, providerName, status: status ?? 'sandbox' } };
        }

        const inserted = await db
            .insert(providerCredentials)
            .values({
                organizationId: user.organizationId,
                providerType,
                providerName,
                status: status ?? 'sandbox',
                encryptedCredentials: encrypted,
            })
            .returning({ id: providerCredentials.id });

        invalidateCredentialsCache(user.organizationId, providerType);
            invalidateAdapterCache(user.organizationId, providerType);
        return reply.status(201).send({
            success: true,
            data: { id: inserted[0]!.id, providerType, providerName, status: status ?? 'sandbox' },
        });
    });

    // DELETE — remove a credential record.
    fastify.delete('/integrations/credentials/:id', {
        schema: {
            tags: ['Интеграции'],
            summary: 'Удалить ключи провайдера',
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!isAdmin(user)) {
            return reply.status(403).send({ success: false, error: 'admin only' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        }

        const { id } = request.params as { id: string };
        // Need the providerType to invalidate the right cache key, so
        // read-then-delete instead of a single returning() clause.
        const [existingRow] = await db
            .select({
                id: providerCredentials.id,
                providerType: providerCredentials.providerType,
            })
            .from(providerCredentials)
            .where(and(
                eq(providerCredentials.id, id),
                eq(providerCredentials.organizationId, user.organizationId),
            ))
            .limit(1);
        if (!existingRow) {
            return reply.status(404).send({ success: false, error: 'not found' });
        }

        const result = await db
            .delete(providerCredentials)
            .where(and(
                eq(providerCredentials.id, id),
                eq(providerCredentials.organizationId, user.organizationId),
            ))
            .returning({ id: providerCredentials.id });

        if (result.length === 0) {
            return reply.status(404).send({ success: false, error: 'not found' });
        }
        invalidateCredentialsCache(user.organizationId, existingRow.providerType as ProviderType);
        invalidateAdapterCache(user.organizationId, existingRow.providerType as ProviderType);
        return { success: true };
    });

    // POST :id/test — run healthCheck on the adapter for that record.
    fastify.post('/integrations/credentials/:id/test', {
        schema: {
            tags: ['Интеграции'],
            summary: 'Проверка соединения провайдера',
            description: 'Вызывает healthCheck() адаптера и записывает результат в last_health_check_at / last_error.',
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        if (!isAdmin(user)) {
            return reply.status(403).send({ success: false, error: 'admin only' });
        }
        if (!user.organizationId) {
            return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        }

        const { id } = request.params as { id: string };
        const rows = await db
            .select()
            .from(providerCredentials)
            .where(and(
                eq(providerCredentials.id, id),
                eq(providerCredentials.organizationId, user.organizationId),
            ))
            .limit(1);

        const row = rows[0];
        if (!row) {
            return reply.status(404).send({ success: false, error: 'not found' });
        }

        const adapters = getAdaptersForType(row.providerType as ProviderType);
        const adapter = adapters.find(a => a.name === row.providerName);
        if (!adapter) {
            const lastError = `Adapter not registered: ${row.providerName}`;
            await db
                .update(providerCredentials)
                .set({
                    lastHealthCheckAt: new Date(),
                    lastError,
                    status: 'error',
                    updatedAt: new Date(),
                })
                .where(eq(providerCredentials.id, id));
            return reply.status(400).send({ success: false, error: lastError });
        }

        try {
            const health = await adapter.healthCheck();
            await db
                .update(providerCredentials)
                .set({
                    lastHealthCheckAt: new Date(),
                    lastError: health.ok ? null : (health.detail ?? 'unknown'),
                    updatedAt: new Date(),
                })
                .where(eq(providerCredentials.id, id));
            return { success: true, data: health };
        } catch (err) {
            const message = (err as Error).message;
            await db
                .update(providerCredentials)
                .set({
                    lastHealthCheckAt: new Date(),
                    lastError: message,
                    status: 'error',
                    updatedAt: new Date(),
                })
                .where(eq(providerCredentials.id, id));
            return reply.status(500).send({ success: false, error: message });
        }
    });
};

export default credentialsRoutes;
