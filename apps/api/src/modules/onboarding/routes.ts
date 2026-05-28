// ============================================================
// Round 1B — Onboarding wizard routes.
// Six steps: ИНН lookup → company profile → scenario pick →
// EDI choice → signature choice → invite teammates → complete.
// All routes require auth — they're called after /verify-email.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { organizations, users, providerCredentials } from '../../db/schema.js';
import { encryptCredentials, invalidateCredentialsCache } from '../../providers/base.js';
import { generateTempPassword, hashPassword } from '../../auth/auth.js';
import { findByInn } from '../../integrations/mocks/dadata.mock.js';
import {
    type OnboardingScenario,
    type OnboardingStatus,
    type ProviderType,
    type ProviderName,
} from '@tms/shared';
import { selectAdapter, getDefaultRegistry } from '../../providers/index.js';
import { escapeHtml } from '../../utils/html.js';
import {
    InnLookupSchema,
    ProfileSchema,
    ScenarioSchema,
    IntegrationChoiceSchema,
    InviteSchema,
    buildInviteResponse,
} from './validators.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

function requireOrg(user: AuthUser | undefined): string | null {
    return user?.organizationId ?? null;
}

// T-7: онбординг-визард запускает создатель организации (signup присваивает
// roles:['admin'], см. auth.ts). Мутирующие шаги меняют реквизиты ЮЛ, ключи
// интеграций и создают пользователей — это admin-операции. Без гейта любой
// член орг (driver/accountant/…) мог переписать реквизиты или создать нового
// admin'а через invite-team (privilege escalation).
function isAdmin(user: AuthUser | undefined): boolean {
    return Boolean(user?.roles?.includes('admin'));
}

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
    // GET /api/onboarding/status
    fastify.get('/onboarding/status', {
        schema: { tags: ['Онбординг'], summary: 'Состояние мастера', description: 'Текущий шаг, выбранный сценарий и список настроенных интеграций.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });

        const [org] = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, orgId))
            .limit(1);
        if (!org) return reply.status(404).send({ success: false, error: 'organization not found' });

        const creds = await db
            .select({
                providerType: providerCredentials.providerType,
                providerName: providerCredentials.providerName,
                status: providerCredentials.status,
                hasCredentials: providerCredentials.encryptedCredentials,
            })
            .from(providerCredentials)
            .where(eq(providerCredentials.organizationId, orgId));

        const status: OnboardingStatus = {
            organizationId: org.id,
            step: org.onboardingStep ?? 0,
            scenario: (org.onboardingScenario ?? null) as OnboardingScenario | null,
            completed: !!org.onboardingCompletedAt,
            completedAt: org.onboardingCompletedAt ? new Date(org.onboardingCompletedAt).toISOString() : null,
            profile: {
                inn: org.inn ?? null,
                name: org.name ?? null,
                kpp: org.kpp ?? null,
                ogrn: org.ogrn ?? null,
                legalAddress: org.legalAddress ?? null,
                bankBik: org.bankBik ?? null,
                bankAccount: org.bankAccount ?? null,
            },
            integrations: creds.map(c => ({
                providerType: c.providerType as ProviderType,
                providerName: c.providerName as ProviderName,
                deferred: c.status === 'disabled',
                hasCredentials: !!c.hasCredentials,
            })),
        };
        return { success: true, data: status };
    });

    // POST /api/onboarding/inn-lookup — proxy to DaData mock.
    fastify.post('/onboarding/inn-lookup', {
        schema: { tags: ['Онбординг'], summary: 'Поиск компании по ИНН', description: 'Использует DaData (mock) для поиска реквизитов.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const parsed = InnLookupSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: parsed.error.flatten() });
        }
        const company = await findByInn(parsed.data.inn);
        if (!company) {
            return reply.status(404).send({ success: false, error: 'Компания не найдена' });
        }
        return { success: true, data: company };
    });

    // POST /api/onboarding/profile
    fastify.post('/onboarding/profile', {
        schema: { tags: ['Онбординг'], summary: 'Сохранить реквизиты', description: 'ИНН, КПП, ОГРН, юр. адрес, банковские реквизиты.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        if (!isAdmin(user)) return reply.status(403).send({ success: false, error: 'admin only' });

        const parsed = ProfileSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: parsed.error.flatten() });
        }
        const data = parsed.data;
        await db.update(organizations).set({
            inn: data.inn,
            name: data.name,
            kpp: data.kpp ?? null,
            ogrn: data.ogrn ?? null,
            legalAddress: data.legalAddress ?? null,
            bankBik: data.bankBik ?? null,
            bankAccount: data.bankAccount ?? null,
            onboardingStep: Math.max(2, 0),
        }).where(eq(organizations.id, orgId));
        return { success: true };
    });

    // POST /api/onboarding/select-scenario
    fastify.post('/onboarding/select-scenario', {
        schema: { tags: ['Онбординг'], summary: 'Выбор сценария', description: 'Малый ИП / Средний с Контуром / Средний с СБИС / Крупный.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        if (!isAdmin(user)) return reply.status(403).send({ success: false, error: 'admin only' });

        const parsed = ScenarioSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: parsed.error.flatten() });
        }
        await db.update(organizations).set({
            onboardingScenario: parsed.data.scenario,
            onboardingStep: 3,
        }).where(eq(organizations.id, orgId));
        return { success: true };
    });

    // POST /api/onboarding/save-integration-choice
    // Wizard step 4 (EDI) and step 5 (signature) both call this. When `defer`
    // is true we save a `disabled` placeholder so the cabinet shows "позже".
    fastify.post('/onboarding/save-integration-choice', {
        schema: { tags: ['Онбординг'], summary: 'Сохранить выбор интеграции', description: 'Сохраняет выбор провайдера; если есть credentials — шифрует и сохраняет в provider_credentials.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        if (!isAdmin(user)) return reply.status(403).send({ success: false, error: 'admin only' });

        const parsed = IntegrationChoiceSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: parsed.error.flatten() });
        }
        const { providerType, providerName, defer, credentials } = parsed.data;

        const status = defer ? 'disabled' : (credentials ? 'sandbox' : 'mock');
        const encrypted = credentials ? encryptCredentials(credentials) : null;

        const [existing] = await db
            .select({ id: providerCredentials.id })
            .from(providerCredentials)
            .where(and(
                eq(providerCredentials.organizationId, orgId),
                eq(providerCredentials.providerType, providerType),
                eq(providerCredentials.providerName, providerName),
            ))
            .limit(1);

        if (existing) {
            await db.update(providerCredentials).set({
                status,
                encryptedCredentials: encrypted ?? null,
                lastError: null,
                updatedAt: new Date(),
            }).where(eq(providerCredentials.id, existing.id));
        } else {
            await db.insert(providerCredentials).values({
                organizationId: orgId,
                providerType,
                providerName,
                status,
                encryptedCredentials: encrypted,
            });
        }

        // Bump step pointer based on provider type — EDI = 4, signature = 5.
        if (providerType === 'edi') {
            await db.update(organizations).set({ onboardingStep: 4 }).where(eq(organizations.id, orgId));
        } else if (providerType === 'signature') {
            await db.update(organizations).set({ onboardingStep: 5 }).where(eq(organizations.id, orgId));
        }

        // A-P1-2: drop cached creds so the next selectAdapter() call sees the new row.
        invalidateCredentialsCache(orgId, providerType);
        return { success: true };
    });

    // POST /api/onboarding/invite-team
    fastify.post('/onboarding/invite-team', {
        schema: { tags: ['Онбординг'], summary: 'Пригласить сотрудников', description: 'Создаёт пользователей с временным паролем и отправляет приглашения по email.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        // T-7 (HIGH): InviteSchema принимает любые APP_ROLES, включая 'admin'.
        // Без admin-гейта любой член орг мог создать нового admin'а →
        // privilege escalation. Создавать пользователей может только admin.
        if (!isAdmin(user)) return reply.status(403).send({ success: false, error: 'admin only' });

        const parsed = InviteSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: parsed.error.flatten() });
        }

        const registry = getDefaultRegistry();
        const adapter = await selectAdapter(registry.email, orgId, 'email');

        const created: Array<{ email: string }> = [];
        const failedToEmail: string[] = [];
        for (const invite of parsed.data.invites) {
            // Skip if email already exists (idempotent).
            const [existing] = await db.select({ id: users.id })
                .from(users)
                .where(eq(users.email, invite.email))
                .limit(1);
            if (existing) continue;

            // A-P0-3/A-P0-13: CSPRNG temp password (16-char base64url, ~96 bits).
            // NEVER include in API response — admin browser history + monitoring
            // proxies would retain plaintext. Email-only delivery.
            const tempPassword = generateTempPassword();
            const passwordHash = await hashPassword(tempPassword);
            await db.insert(users).values({
                email: invite.email,
                passwordHash,
                fullName: invite.fullName,
                roles: invite.roles,
                organizationId: orgId,
                isActive: true,
            });
            created.push({ email: invite.email });

            try {
                // A-P1-7: escape user-controlled values before HTML
                // interpolation. fullName is admin-supplied (still untrusted —
                // admin in another org could craft a payload), tempPassword
                // is base64url so currently safe but escape on principle so
                // a future entropy-source change can't introduce XSS.
                await adapter.send(
                    invite.email,
                    'ТрансПульт — приглашение в систему',
                    `<p>Здравствуйте, ${escapeHtml(invite.fullName)}!</p>
                     <p>Вас пригласили в ТрансПульт. Временный пароль: <strong>${escapeHtml(tempPassword)}</strong></p>
                     <p>После входа смените пароль в профиле.</p>`,
                    `Временный пароль для входа в ТрансПульт: ${tempPassword}`,
                );
            } catch (err) {
                request.log.error({ err, email: invite.email }, 'Failed to send invite email');
                failedToEmail.push(invite.email);
            }
        }

        await db.update(organizations).set({ onboardingStep: 6 }).where(eq(organizations.id, orgId));
        return {
            success: true,
            data: buildInviteResponse(created, failedToEmail),
        };
    });

    // POST /api/onboarding/complete
    fastify.post('/onboarding/complete', {
        schema: { tags: ['Онбординг'], summary: 'Завершить онбординг', description: 'Помечает организацию как прошедшую онбординг.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'Организация не найдена в токене' });
        if (!isAdmin(user)) return reply.status(403).send({ success: false, error: 'admin only' });

        await db.update(organizations).set({
            onboardingCompletedAt: new Date(),
            onboardingStep: 6,
        }).where(eq(organizations.id, orgId));
        return { success: true };
    });
};

export default onboardingRoutes;
