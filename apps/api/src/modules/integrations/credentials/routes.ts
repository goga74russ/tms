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
    decryptCredentials,
    invalidateCredentialsCache,
    type ProviderType,
} from '../../../providers/base.js';
import {
    getAdaptersForType,
    instantiateRealAdapter,
    invalidateAdapterCache,
    hasRealAdapter,
} from '../../../providers/index.js';
import { CredentialsCreateSchema as CreateSchema } from './validators.js';
import { assertDpaAccepted, DpaNotAcceptedError } from '../../dpa/guard.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

function isAdmin(user: AuthUser | undefined): boolean {
    return Boolean(user?.roles?.includes('admin'));
}

// P3 (код-аудит 2026-06-14, finding 664): providerName должен принадлежать
// допустимому набору для данного providerType. Иначе создаётся строка-сирота,
// которую selectAdapter()/instantiateRealAdapter() не может инстанцировать
// (фабрика по ключу `${type}:${name}` не найдена), и DPA-гейт обходится
// бессмысленным именем. Источник правды — те же реестры, что использует runtime:
// статические адаптеры из getAdaptersForType() (mock/console/env-SMTP) +
// реальные фабрики realAdapterFactories (через hasRealAdapter()).
function isProviderNameAllowed(providerType: ProviderType, providerName: string): boolean {
    if (hasRealAdapter(providerType, providerName)) return true;
    return getAdaptersForType(providerType).some(a => a.name === providerName);
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

        // P3 (код-аудит 2026-06-14, finding 664): валидируем согласованность
        // providerType ↔ providerName ДО DPA-гейта и шифрования. Иначе строка-
        // сирота с неизвестным именем сохранялась, но адаптер из неё никогда не
        // инстанцировался (DPA-bypass + мёртвая запись).
        if (!isProviderNameAllowed(providerType, providerName)) {
            return reply.status(422).send({
                success: false,
                error: `Провайдер «${providerName}» недоступен для типа «${providerType}»`,
            });
        }

        // P3 (код-аудит 2026-06-14, finding 665): нельзя выставить status='active'
        // напрямую через POST — это означало бы live-операции на непроверенных
        // кредах. Активация требует успешного health-check (POST :id/test), который
        // оператор запускает явно. На создании/upsert понижаем входящий 'active' до
        // 'sandbox'; промоут в 'active' остаётся ручным решением после /test.
        const requestedStatus = status === 'active' ? 'sandbox' : status;

        // C9 (security): серверный DPA-гейт. Клиентская проверка fail-open и
        // обходится прямым POST. Блокируем сохранение, если согласие требуется,
        // но не дано. DPA providerId === providerName (как в UI /dpa/:name).
        try {
            await assertDpaAccepted(providerName, user);
        } catch (err) {
            if (err instanceof DpaNotAcceptedError) {
                return reply.status(403).send({ success: false, error: err.message, code: err.code });
            }
            throw err;
        }

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
                    status: requestedStatus ?? 'sandbox',
                    lastError: null,
                    updatedAt: new Date(),
                })
                .where(eq(providerCredentials.id, id));
            invalidateCredentialsCache(user.organizationId, providerType);
            invalidateAdapterCache(user.organizationId, providerType);
            return { success: true, data: { id, providerType, providerName, status: requestedStatus ?? 'sandbox' } };
        }

        const inserted = await db
            .insert(providerCredentials)
            .values({
                organizationId: user.organizationId,
                providerType,
                providerName,
                status: requestedStatus ?? 'sandbox',
                encryptedCredentials: encrypted,
            })
            .returning({ id: providerCredentials.id });

        invalidateCredentialsCache(user.organizationId, providerType);
            invalidateAdapterCache(user.organizationId, providerType);
        return reply.status(201).send({
            success: true,
            data: { id: inserted[0]!.id, providerType, providerName, status: requestedStatus ?? 'sandbox' },
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
        // C9: статический реестр содержит только mock. Реальные адаптеры
        // (wialon/diadoc/gosklyuch…) инстанцируются из кредов через фабрику —
        // иначе health-check всегда ложно репортил «Adapter not registered».
        let adapter = adapters.find(a => a.name === row.providerName);
        if (!adapter && row.encryptedCredentials) {
            try {
                const creds = decryptCredentials(row.encryptedCredentials);
                adapter = instantiateRealAdapter(row.providerType as ProviderType, row.providerName, creds) ?? undefined;
            } catch {
                // битые/нерасшифровываемые креды — adapter останется undefined,
                // ниже честный status='error'.
            }
        }
        if (!adapter) {
            const lastError = `Adapter not registered: ${row.providerName}`;
            // P3 (код-аудит 2026-06-14): НЕ затираем status строки на 'error' — это
            // инфраструктурный сбой /test (адаптер не зарегистрирован), а не проблема
            // самих кред. Корректный 'active'/'sandbox' сохраняем; пишем только lastError.
            await db
                .update(providerCredentials)
                .set({
                    lastHealthCheckAt: new Date(),
                    lastError,
                    updatedAt: new Date(),
                })
                .where(eq(providerCredentials.id, id));
            return reply.status(400).send({ success: false, error: lastError });
        }

        try {
            const health = await adapter.healthCheck();
            // P1 (код-аудит 2026-06-14): успешный health-check восстанавливает строку
            // из 'error' → 'sandbox', иначе провайдер навсегда оставался неактивным
            // в selectAdapter (status==='active'||'sandbox'). Авто-промоут в 'active'
            // НЕ делаем — для signature/payment go-live это решение оператора.
            const recoveredStatus = health.ok && row.status === 'error' ? 'sandbox' : row.status;
            await db
                .update(providerCredentials)
                .set({
                    lastHealthCheckAt: new Date(),
                    lastError: health.ok ? null : (health.detail ?? 'unknown'),
                    status: recoveredStatus,
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
