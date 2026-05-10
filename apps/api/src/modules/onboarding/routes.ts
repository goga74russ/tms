// ============================================================
// Round 1B — Onboarding wizard routes.
// Six steps: ИНН lookup → company profile → scenario pick →
// EDI choice → signature choice → invite teammates → complete.
// All routes require auth — they're called after /verify-email.
// ============================================================
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/connection.js';
import { organizations, users, providerCredentials } from '../../db/schema.js';
import { encryptCredentials } from '../../providers/base.js';
import { hashPassword } from '../../auth/auth.js';
import { findByInn } from '../../integrations/mocks/dadata.mock.js';
import {
    ONBOARDING_SCENARIOS,
    type OnboardingScenario,
    type OnboardingStatus,
    type ProviderType,
    type ProviderName,
} from '@tms/shared';
import { selectAdapter, getDefaultRegistry } from '../../providers/index.js';

interface AuthUser {
    userId: string;
    roles: string[];
    organizationId?: string | null;
}

const PROVIDER_TYPES: ProviderType[] = [
    'signature', 'edi', 'telematics', 'fuel_card',
    'fines', 'marking', 'payment', 'email',
];

// Provider names accepted on the wizard. Mirrors `ProviderName` in shared/.
const PROVIDER_NAMES: ProviderName[] = [
    'gosklyuch', 'kontur_sign', 'sbis_sign', 'cadesplugin',
    'diadoc', 'sbis', 'kontur', 'taxcom', 'kaluga_astral',
    'wialon', 'omnicomm', 'glonasssoft',
    'lukoil', 'rosneft', 'gazpromneft',
    'autocode', 'fssp', 'gibdd', 'crpt',
    'yookassa', 'tinkoff', 'cloudpayments',
    'mailru_smtp', 'unisender', 'console', 'mock',
];

const InnLookupSchema = z.object({
    inn: z.string().regex(/^\d{10}(\d{2})?$/, 'ИНН: 10 или 12 цифр'),
});

const ProfileSchema = z.object({
    inn: z.string().regex(/^\d{10}(\d{2})?$/),
    name: z.string().min(1).max(500),
    kpp: z.string().nullish(),
    ogrn: z.string().nullish(),
    legalAddress: z.string().nullish(),
    bankBik: z.string().nullish(),
    bankAccount: z.string().nullish(),
});

const ScenarioSchema = z.object({
    scenario: z.enum(ONBOARDING_SCENARIOS as [OnboardingScenario, ...OnboardingScenario[]]),
});

const IntegrationChoiceSchema = z.object({
    providerType: z.enum(PROVIDER_TYPES as [ProviderType, ...ProviderType[]]),
    providerName: z.enum(PROVIDER_NAMES as [ProviderName, ...ProviderName[]]),
    defer: z.boolean(),
    credentials: z.record(z.unknown()).optional(),
});

const InviteSchema = z.object({
    invites: z.array(z.object({
        email: z.string().email(),
        fullName: z.string().min(1),
        roles: z.array(z.string()).min(1),
    })).min(1).max(50),
});

function requireOrg(user: AuthUser | undefined): string | null {
    return user?.organizationId ?? null;
}

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
    // GET /api/onboarding/status
    fastify.get('/onboarding/status', {
        schema: { tags: ['Онбординг'], summary: 'Состояние мастера', description: 'Текущий шаг, выбранный сценарий и список настроенных интеграций.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });

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
        const company = findByInn(parsed.data.inn);
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
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });

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
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });

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
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });

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

        return { success: true };
    });

    // POST /api/onboarding/invite-team
    fastify.post('/onboarding/invite-team', {
        schema: { tags: ['Онбординг'], summary: 'Пригласить сотрудников', description: 'Создаёт пользователей с временным паролем и отправляет приглашения по email.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });

        const parsed = InviteSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({ success: false, error: parsed.error.flatten() });
        }

        const registry = getDefaultRegistry();
        const adapter = await selectAdapter(registry.email, orgId, 'email');

        const created: Array<{ email: string; tempPassword: string }> = [];
        for (const invite of parsed.data.invites) {
            // Skip if email already exists (idempotent).
            const [existing] = await db.select({ id: users.id })
                .from(users)
                .where(eq(users.email, invite.email))
                .limit(1);
            if (existing) continue;

            // 12-char temp password — they reset on first login.
            const tempPassword = Math.random().toString(36).slice(2, 14);
            const passwordHash = await hashPassword(tempPassword);
            await db.insert(users).values({
                email: invite.email,
                passwordHash,
                fullName: invite.fullName,
                roles: invite.roles,
                organizationId: orgId,
                isActive: true,
            });
            created.push({ email: invite.email, tempPassword });

            try {
                await adapter.send(
                    invite.email,
                    'TMS — приглашение в систему',
                    `<p>Здравствуйте, ${invite.fullName}!</p>
                     <p>Вас пригласили в TMS. Временный пароль: <strong>${tempPassword}</strong></p>
                     <p>После входа смените пароль в профиле.</p>`,
                    `Временный пароль для входа в TMS: ${tempPassword}`,
                );
            } catch (err) {
                request.log.error({ err, email: invite.email }, 'Failed to send invite email');
            }
        }

        await db.update(organizations).set({ onboardingStep: 6 }).where(eq(organizations.id, orgId));
        return { success: true, data: { invitedCount: created.length } };
    });

    // POST /api/onboarding/complete
    fastify.post('/onboarding/complete', {
        schema: { tags: ['Онбординг'], summary: 'Завершить онбординг', description: 'Помечает организацию как прошедшую онбординг.' },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const user = request.user as AuthUser;
        const orgId = requireOrg(user);
        if (!orgId) return reply.status(400).send({ success: false, error: 'no organization in token' });

        await db.update(organizations).set({
            onboardingCompletedAt: new Date(),
            onboardingStep: 6,
        }).where(eq(organizations.id, orgId));
        return { success: true };
    });
};

export default onboardingRoutes;
