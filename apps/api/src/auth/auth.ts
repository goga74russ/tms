// ============================================================
// Auth module — JWT + httpOnly cookies + rate limiting
// ============================================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, randomInt } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';
import cookie from '@fastify/cookie';
import { db } from '../db/connection.js';
import { users, drivers, tariffs, contracts, contractors, checklistTemplates, organizations, emailVerifications } from '../db/schema.js';
import { eq, desc, and, gt, or, isNull, sql } from 'drizzle-orm';
import { LoginSchema } from '@tms/shared';
import { z } from 'zod';
import { selectAdapter, getDefaultRegistry } from '../providers/index.js';
import { APP_ROLES } from './rbac.js';
import { escapeHtml } from '../utils/html.js';
import { redisConnectionConfig } from '../integrations/redis.js';
import { recordEvent } from '../events/journal.js';

// --- Password reset (Redis-backed one-time tokens) ---
// Lazy ioredis singleton — only constructed when /forgot-password is hit.
// Avoids paying connection cost in environments where Redis isn't configured
// at boot time, and matches the pattern used by testRedisConnection().
let _resetRedis: import('ioredis').Redis | null = null;
async function getResetRedis(): Promise<import('ioredis').Redis> {
    if (_resetRedis) return _resetRedis;
    const { Redis } = await import('ioredis');
    _resetRedis = new Redis({
        host: redisConnectionConfig.host,
        port: redisConnectionConfig.port,
        password: redisConnectionConfig.password,
        // Reasonable defaults — these keys are tiny and short-lived (TTL 1h).
        maxRetriesPerRequest: 2,
        lazyConnect: false,
    });
    return _resetRedis;
}
const PWRESET_PREFIX = 'pwreset:';
const PWRESET_TTL_SECONDS = 3600; // 1 hour

function resolveWebPublicUrl(): string {
    // Prefer an explicit override; otherwise fall back to the production host.
    // Used to build the reset link inside the email — must be the user-facing
    // origin, not the API origin.
    const explicit = process.env.WEB_PUBLIC_URL;
    if (explicit) return explicit.replace(/\/+$/, '');
    return 'https://transpult.ru';
}

// --- CRITICAL (C-1): No hardcoded fallback. Fail-fast if not set. ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
    process.exit(1);
}

// TODO: 24h JWT with no refresh/revocation is acceptable for pilot scale
// but should be replaced with access + refresh token pair before scaling.
// Tracked in audit-2026-05-12-deep.md P2.
const JWT_EXPIRES_IN = '24h';
const COOKIE_NAME = 'tms_token';
const COOKIE_MAX_AGE = 86400; // 24h in seconds
const LOGIN_RATE_LIMIT_MAX = Math.max(
    1,
    Number.parseInt(process.env.LOGIN_RATE_LIMIT_MAX ?? '5', 10) || 5,
);
const LOGIN_RATE_LIMIT_WINDOW = process.env.LOGIN_RATE_LIMIT_WINDOW ?? '1 minute';

type AuthenticatedUser = { userId: string; roles: string[]; organizationId?: string | null };

function isOutsideActorOrganization(actor: AuthenticatedUser, organizationId?: string | null) {
    return Boolean(actor.organizationId && organizationId !== actor.organizationId);
}

// bcrypt-примитивы вынесены в ./password.ts (без JWT/db сайд-эффектов) и
// ре-экспортируются здесь для обратной совместимости со старыми импортами.
export { hashPassword, verifyPassword };

/**
 * A-P0-3: CSPRNG-backed 6-digit code for email verification. Math.random is
 * predictable; V8 PRNG state can be recovered, making 6-digit codes brute-
 * forceable when combined with a known signup window. randomInt() pulls from
 * the OS CSPRNG. Exported so unit tests can hit the helper directly.
 */
export function generateCode(): string {
    return String(randomInt(100000, 1000000));
}

/**
 * A-P0-3: CSPRNG-backed temp password for invited teammates (~96 bits
 * entropy, 16-char base64url). Email-only delivery — never returned via API.
 * Lives here so onboarding/routes.ts and unit tests share the same primitive.
 */
export function generateTempPassword(): string {
    return randomBytes(12).toString('base64url');
}


export function registerAuthRoutes(app: FastifyInstance) {
    // Register cookie plugin
    app.register(cookie);

    // Register JWT plugin
    app.register(import('@fastify/jwt'), {
        secret: JWT_SECRET!,
        cookie: {
            cookieName: COOKIE_NAME,
            signed: false,
        },
    });

    // H-15: authenticate decorator — cookie-first, header fallback (for mobile)
    app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            // Try cookie first (web browser), fallback to Authorization header (mobile).
            const cookieToken = request.cookies?.[COOKIE_NAME];
            const authHeader = request.headers.authorization;
            if (cookieToken) {
                await request.jwtVerify({ onlyCookie: true });
            } else if (authHeader?.startsWith('Bearer ')) {
                await request.jwtVerify();
            } else {
                return reply.status(401).send({ success: false, error: 'Требуется авторизация' });
            }

            // E6 (JWT revocation, Вариант A): сверяем с БД актуальность токена.
            // Деактивированный/перенастроенный юзер с валидной подписью, но старой
            // token_version отвергается сразу (не ждём истечения 24ч). Старые токены
            // без поля tv трактуются как версия 0 (= дефолт БД) → не ломаем сессии
            // при первом деплое, пока кому-то не бампнут версию.
            const payload = request.user as { userId?: string; organizationId?: string; tv?: number };
            const [u] = await db.select({ isActive: users.isActive, tokenVersion: users.tokenVersion })
                .from(users).where(eq(users.id, payload.userId ?? '')).limit(1);
            if (!u || !u.isActive || (payload.tv ?? 0) !== u.tokenVersion) {
                return reply.status(401).send({ success: false, error: 'Сессия недействительна, войдите снова' });
            }

            (request as FastifyRequest).orgId = payload?.organizationId ?? null;
        } catch (err) {
            reply.status(401).send({ success: false, error: 'Требуется авторизация' });
        }
    });

    // Login (web) — rate limited, cookie-based auth only
    app.post('/api/auth/login', {
        schema: { tags: ['Авторизация'], summary: 'Вход в систему', description: 'Аутентификация по email/password. Устанавливает httpOnly cookie. Rate limit: 5/мин.' },
        config: {
            rateLimit: {
                max: LOGIN_RATE_LIMIT_MAX,
                timeWindow: LOGIN_RATE_LIMIT_WINDOW,
            },
        },
    }, async (request, reply) => {
        // --- H-4: Zod validation ---
        const parseResult = LoginSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parseResult.error.flatten(),
            });
        }
        const { email, password } = parseResult.data;

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        if (!user || !user.isActive) {
            return reply.status(401).send({ success: false, error: 'Неверный email или пароль' });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            return reply.status(401).send({ success: false, error: 'Неверный email или пароль' });
        }

        const token = app.jwt.sign(
            { userId: user.id, roles: user.roles, organizationId: user.organizationId ?? undefined, tv: user.tokenVersion ?? 0 },
            { expiresIn: JWT_EXPIRES_IN },
        );

        // H-15: Set httpOnly cookie (still useful for direct API access)
        // COOKIE_SECURE: set to 'false' when running without HTTPS
        // A-P1-5: sameSite='strict' — TMS has no cross-site auth flows
        // (no OAuth callbacks, no magic links). Cookie+lax+no-CSRF-token =
        // exploitable CSRF on every state-changing endpoint. Strict closes
        // it without the complexity of double-submit tokens. The flows
        // checked: /login, /mobile/login, /logout, /signup, /verify-email,
        // /resend-code — all top-level same-origin form posts from the SPA.
        const isSecure = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
        reply.setCookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'strict',
            path: '/',
            maxAge: COOKIE_MAX_AGE,
        });

        return {
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    roles: user.roles,
                },
            },
        };
    });

    // Login (mobile) — explicit bearer token contract for native clients
    app.post('/api/auth/mobile/login', {
        schema: { tags: ['Авторизация'], summary: 'Вход (mobile)', description: 'Аутентификация для мобильного клиента. Возвращает Bearer token в body.' },
        config: {
            rateLimit: {
                max: LOGIN_RATE_LIMIT_MAX,
                timeWindow: LOGIN_RATE_LIMIT_WINDOW,
            },
        },
    }, async (request, reply) => {
        const parseResult = LoginSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parseResult.error.flatten(),
            });
        }
        const { email, password } = parseResult.data;

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        if (!user || !user.isActive) {
            return reply.status(401).send({ success: false, error: 'Неверный email или пароль' });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            return reply.status(401).send({ success: false, error: 'Неверный email или пароль' });
        }

        const token = app.jwt.sign(
            { userId: user.id, roles: user.roles, organizationId: user.organizationId ?? undefined, tv: user.tokenVersion ?? 0 },
            { expiresIn: JWT_EXPIRES_IN },
        );

        return {
            success: true,
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    roles: user.roles,
                },
            },
        };
    });

    // H-15: Logout — clear cookie
    app.post('/api/auth/logout', {
        schema: { tags: ['Авторизация'], summary: 'Выход', description: 'Очистка JWT cookie.' },
        // No auth required — must work even with expired/invalid token
    }, async (request, reply) => {
        reply.clearCookie(COOKIE_NAME, { path: '/' });
        return { success: true };
    });

    // Get current user
    app.get('/api/auth/me', {
        schema: { tags: ['Авторизация'], summary: 'Текущий пользователь', description: 'Информация об авторизованном пользователе (без passwordHash).' },
        preHandler: [app.authenticate],
    }, async (request) => {
        const payload = request.user as { userId: string; roles: string[]; organizationId?: string };
        const [user] = await db
            .select({
                id: users.id,
                email: users.email,
                fullName: users.fullName,
                phone: users.phone,
                roles: users.roles,
                organizationId: users.organizationId,
            })
            .from(users)
            .where(eq(users.id, payload.userId))
            .limit(1);

        // Resolve driverId for driver role (mobile needs it for trip filtering)
        let driverId: string | undefined;
        if (user && payload.roles.includes('driver')) {
            const [driver] = await db.select({ id: drivers.id })
                .from(drivers).where(eq(drivers.userId, user.id)).limit(1);
            driverId = driver?.id;
        }

        // isSuperAdmin = role=admin AND no organizationId. Frontend uses this
        // to hide cross-tenant admin views (e.g. /admin/billing) from tenant
        // admins who only see their own org.
        const isSuperAdmin = Array.isArray(user?.roles)
            && (user!.roles as string[]).includes('admin')
            && !user?.organizationId;

        // J1 + L4 — подтягиваем компактное представление организации (tax_regime + usnVatRate).
        let organization: {
            id: string;
            name: string;
            inn: string | null;
            taxRegime: string;
            usnVatRate: number | null;
        } | null = null;
        if (user?.organizationId) {
            const [org] = await db.select({
                id: organizations.id,
                name: organizations.name,
                inn: organizations.inn,
                taxRegime: organizations.taxRegime,
                usnVatRate: organizations.usnVatRate,
            }).from(organizations).where(eq(organizations.id, user.organizationId)).limit(1);
            organization = org ?? null;
        }

        return { success: true, data: { ...user, driverId, isSuperAdmin, organization } };
    });

    // ============================================================
    // POST /api/auth/me/organization
    // ------------------------------------------------------------
    // Создание организации для текущего пользователя, когда он
    // авторизован, но organizationId=null (например, seed-admin или
    // legacy-пользователь до multitenancy). После создания:
    //   • привязываем user.organizationId
    //   • выписываем новый JWT с organizationId и кладём в cookie
    //
    // Это one-way trip: super-admin превращается в tenant-admin своей
    // организации. Откатить можно только через прямое обновление БД.
    // ============================================================
    const CreateMyOrgSchema = z.object({
        name: z.string().min(1).max(255),
        inn: z.string().regex(/^\d{10}$|^\d{12}$/).optional(),
    });
    app.post('/api/auth/me/organization', {
        schema: {
            tags: ['Авторизация'],
            summary: 'Создать организацию для текущего пользователя',
            description: 'Доступно только если у пользователя ещё нет organizationId. После создания выписывается новый JWT. Только admin.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        // Симметрично DELETE-counterpart: orphan-driver не должен иметь
        // возможности создать org и стать tenant-admin своей. Только admin.
        if (!actor.roles.includes('admin')) {
            return reply.status(403).send({
                success: false,
                error: 'Только admin может создавать организацию',
            });
        }

        const [me] = await db.select({
            id: users.id,
            email: users.email,
            roles: users.roles,
            organizationId: users.organizationId,
            tokenVersion: users.tokenVersion,
        }).from(users).where(eq(users.id, actor.userId)).limit(1);

        if (!me) return reply.status(404).send({ success: false, error: 'Пользователь не найден' });
        if (me.organizationId) {
            return reply.status(409).send({
                success: false,
                error: 'У пользователя уже есть организация',
            });
        }

        const parsed = CreateMyOrgSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parsed.error.flatten(),
            });
        }
        const { name, inn } = parsed.data;

        // 7.18 SECURITY: self-service join существующей org по INN запрещён.
        // ИНН — публичная информация (ЕГРЮЛ), и старая «идемпотентность»
        // позволяла любому admin-аккаунту присоединиться к чужой
        // организации (получив доступ ко всем рейсам/документам/МЧД).
        // Теперь дубликат ИНН → 409. Чтобы присоединиться к существующей
        // org, нужно приглашение от её admin'а (future: invite flow).
        //
        // Race-guard: транзакция + UPDATE с WHERE organization_id IS NULL.
        // Второй параллельный запрос упадёт rowCount=0 → 409.
        const orgId = await db.transaction(async (tx) => {
            // C5: проверка уникальности ИНН — ВНУТРИ транзакции с advisory-lock по ИНН.
            // Раньше проверка была вне tx (TOCTOU: два параллельных запроса с одним
            // ИНН оба проходили и создавали дубль-орг с одинаковым ИНН). Lock сериализует.
            if (inn) {
                await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'org_inn:' + inn}))`);
                const [existing] = await tx.select({ id: organizations.id })
                    .from(organizations).where(eq(organizations.inn, inn)).limit(1);
                if (existing) throw new Error('ORG_INN_TAKEN');
            }

            const [created] = await tx.insert(organizations)
                .values({ name, inn: inn ?? null })
                .returning({ id: organizations.id });
            const resolvedOrgId = created!.id;

            const updated = await tx.update(users)
                .set({ organizationId: resolvedOrgId, updatedAt: new Date() })
                .where(and(
                    eq(users.id, me.id),
                    isNull(users.organizationId), // race-guard: только если ещё null
                ))
                .returning({ id: users.id });

            if (updated.length === 0) {
                // Параллельный запрос уже привязал пользователя к org.
                throw new Error('ALREADY_ASSIGNED');
            }
            return resolvedOrgId;
        }).catch((err) => {
            if (err instanceof Error && err.message === 'ALREADY_ASSIGNED') return null;
            if (err instanceof Error && err.message === 'ORG_INN_TAKEN') return 'INN_TAKEN' as const;
            throw err;
        });

        if (orgId === 'INN_TAKEN') {
            return reply.status(409).send({
                success: false,
                error: 'Организация с таким ИНН уже зарегистрирована в системе. Чтобы присоединиться, попросите её admin\'а пригласить вас.',
                code: 'ORG_INN_TAKEN',
            });
        }
        if (orgId === null) {
            return reply.status(409).send({
                success: false,
                error: 'Параллельный запрос уже привязал пользователя к организации — обновите страницу',
            });
        }

        // Перевыпускаем JWT с новым organizationId, чтобы клиент
        // не отлогинивался и сразу получил доступ к tenant-данным.
        const token = app.jwt.sign(
            // C7: tv ОБЯЗАТЕЛЕН — без него юзер с tokenVersion>0 получает 401 на
            // следующем запросе (authenticate: (undefined ?? 0) !== N).
            { userId: me.id, roles: me.roles, organizationId: orgId, tv: me.tokenVersion ?? 0 },
            { expiresIn: JWT_EXPIRES_IN },
        );
        const isSecure = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
        reply.setCookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'strict',
            path: '/',
            maxAge: COOKIE_MAX_AGE,
        });

        return { success: true, data: { id: orgId, name, inn: inn ?? null } };
    });

    // ============================================================
    // PATCH /api/auth/me/organization
    // ------------------------------------------------------------
    // J1.3 (Jurist Этап 1) — частичное обновление полей организации
    // текущего пользователя. Сейчас покрывает только tax_regime
    // (критичное юр-поле), но endpoint спроектирован под расширение.
    //
    // RBAC: только admin. tax_regime — критическое событие, изменение
    // логируется в events с severity=warning. Не разрешаем ставить
    // 'unspecified' обратно (это temporary default, не пользовательский
    // выбор) — было бы попыткой "размагнититься" от tax_regime.
    // ============================================================
    app.patch('/api/auth/me/organization', {
        schema: {
            tags: ['Авторизация'],
            summary: 'Обновить реквизиты организации (tax_regime и т.п.)',
            description: 'Частичное обновление организации. Только admin. tax_regime изменение логируется в events.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        if (!actor.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Только admin может менять реквизиты организации' });
        }

        const [me] = await db.select({
            id: users.id,
            roles: users.roles,
            organizationId: users.organizationId,
        }).from(users).where(eq(users.id, actor.userId)).limit(1);

        if (!me) return reply.status(404).send({ success: false, error: 'Пользователь не найден' });
        if (!me.organizationId) {
            return reply.status(409).send({
                success: false,
                error: 'У пользователя нет организации — нечего обновлять',
            });
        }

        const TaxRegimeSchema = z.enum([
            'osno', 'usn_income', 'usn_income_expense', 'usn_with_vat',
            'ausn', 'patent', 'npd',
            // 'unspecified' намеренно исключён — пользователь не может
            // вернуться к необъявленному состоянию. Это temporary default
            // только для существующих организаций до явного выбора.
        ]);
        // L4 (Этап 1.1) — usn_vat_rate допустимые значения: 5, 7, 20.
        const UsnVatRateSchema = z.union([z.literal(5), z.literal(7), z.literal(20)]);
        const PatchOrgSchema = z.object({
            taxRegime: TaxRegimeSchema.optional(),
            usnVatRate: UsnVatRateSchema.nullable().optional(),
        });
        const parsed = PatchOrgSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parsed.error.flatten(),
            });
        }

        if (parsed.data.taxRegime === undefined && parsed.data.usnVatRate === undefined) {
            return reply.status(400).send({ success: false, error: 'Нечего обновлять — передайте taxRegime или usnVatRate' });
        }

        // Считаем текущее значение чтобы залогировать дельту в audit.
        const [currentOrg] = await db.select({
            id: organizations.id,
            taxRegime: organizations.taxRegime,
            usnVatRate: organizations.usnVatRate,
        }).from(organizations).where(eq(organizations.id, me.organizationId)).limit(1);
        if (!currentOrg) return reply.status(404).send({ success: false, error: 'Организация не найдена' });

        const newRegime = parsed.data.taxRegime ?? currentOrg.taxRegime;
        const newUsnRate = parsed.data.usnVatRate !== undefined ? parsed.data.usnVatRate : currentOrg.usnVatRate;

        // L4 — кросс-валидация: usn_vat_rate допустим только при usn_with_vat.
        if (newUsnRate != null && newRegime !== 'usn_with_vat') {
            return reply.status(422).send({
                success: false,
                error: 'usnVatRate допустим только при tax_regime=usn_with_vat',
                code: 'USN_VAT_RATE_REGIME_MISMATCH',
            });
        }
        // Если переключаемся на usn_with_vat без явной ставки — требуем её.
        if (newRegime === 'usn_with_vat' && newUsnRate == null) {
            return reply.status(422).send({
                success: false,
                error: 'При выборе режима usn_with_vat нужно явно указать ставку НДС (5, 7 или 20)',
                code: 'USN_VAT_RATE_REQUIRED',
            });
        }

        const updates: { taxRegime?: typeof newRegime; usnVatRate?: number | null } = {};
        if (parsed.data.taxRegime !== undefined && parsed.data.taxRegime !== currentOrg.taxRegime) {
            updates.taxRegime = parsed.data.taxRegime;
        }
        if (newUsnRate !== currentOrg.usnVatRate) {
            updates.usnVatRate = newUsnRate;
        }
        if (Object.keys(updates).length === 0) {
            return { success: true, data: { id: currentOrg.id, taxRegime: newRegime, usnVatRate: newUsnRate, changed: false } };
        }

        await db.update(organizations)
            .set(updates)
            .where(eq(organizations.id, currentOrg.id));

        // Критическое юр-событие — severity=warning.
        await recordEvent({
            authorId: actor.userId,
            authorRole: actor.roles[0] ?? 'admin',
            eventType: 'organization.tax_regime_changed',
            entityType: 'organization',
            entityId: currentOrg.id,
            data: {
                oldRegime: currentOrg.taxRegime,
                newRegime,
                oldUsnRate: currentOrg.usnVatRate,
                newUsnRate,
                severity: 'warning',
            },
        });

        return { success: true, data: { id: currentOrg.id, taxRegime: newRegime, usnVatRate: newUsnRate, changed: true } };
    });

    // ============================================================
    // DELETE /api/auth/me/organization
    // ------------------------------------------------------------
    // Обратный путь: admin-пользователь возвращается в super-admin
    // (organizationId=NULL). Нужен, если случайно создал org через
    // POST /me/organization и потерял кросс-тенант видимость.
    // Доступно только при роли admin.
    //
    // Внимание: tenant-данные созданные под этой org остаются — это
    // detach пользователя, не удаление организации.
    // ============================================================
    app.delete('/api/auth/me/organization', {
        schema: {
            tags: ['Авторизация'],
            summary: 'Отвязать пользователя от организации (вернуть super-admin)',
            description: 'Сбрасывает organizationId=NULL для текущего admin-пользователя. Перевыпускает JWT.',
        },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        if (!actor.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Только admin может становиться super-admin' });
        }

        const [me] = await db.select({
            id: users.id,
            roles: users.roles,
            organizationId: users.organizationId,
            tokenVersion: users.tokenVersion,
        }).from(users).where(eq(users.id, actor.userId)).limit(1);

        if (!me) return reply.status(404).send({ success: false, error: 'Пользователь не найден' });
        if (!me.organizationId) {
            return reply.status(409).send({
                success: false,
                error: 'Пользователь и так не привязан к организации',
            });
        }

        await db.update(users)
            .set({ organizationId: null, updatedAt: new Date() })
            .where(eq(users.id, me.id));

        const token = app.jwt.sign(
            // C7: tv ОБЯЗАТЕЛЕН (иначе 401 для tokenVersion>0).
            { userId: me.id, roles: me.roles, organizationId: undefined, tv: me.tokenVersion ?? 0 },
            { expiresIn: JWT_EXPIRES_IN },
        );
        const isSecure = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
        reply.setCookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'strict',
            path: '/',
            maxAge: COOKIE_MAX_AGE,
        });

        return { success: true };
    });

    // Short-lived token for WebSocket connections (browser can't send cookies over WS)
    app.get('/api/auth/ws-token', {
        schema: { tags: ['Авторизация'], summary: 'WS токен', description: 'Краткосрочный JWT (5 минут) для WebSocket подключения.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const payload = request.user as { userId: string; roles: string[]; organizationId?: string };
        const allowedRoles = ['admin', 'dispatcher', 'logist', 'manager'];
        if (!payload.roles.some((role) => allowedRoles.includes(role))) {
            return reply.status(403).send({ success: false, error: 'Нет доступа к GPS-данным' });
        }

        // Re-read organizationId from DB instead of trusting the (potentially
        // stale) cookie JWT. После DELETE /me/organization открытая WS-вкладка
        // держала старый orgId в payload и получала кросс-tenant сообщения.
        // Source of truth — БД, не JWT.
        const [fresh] = await db.select({
            organizationId: users.organizationId,
            roles: users.roles,
            isActive: users.isActive,
            tokenVersion: users.tokenVersion,
        }).from(users).where(eq(users.id, payload.userId)).limit(1);

        if (!fresh || !fresh.isActive) {
            return reply.status(401).send({ success: false, error: 'Пользователь не найден или деактивирован' });
        }

        const token = app.jwt.sign(
            {
                userId: payload.userId,
                roles: fresh.roles,
                organizationId: fresh.organizationId ?? undefined,
                // C9 E6: tv в WS-токене — чтобы WS-хендлер мог сверить token_version
                // с БД и отвергать отозванные токены (как HTTP authenticate).
                tv: fresh.tokenVersion ?? 0,
            },
            { expiresIn: '5m' },
        );
        return { success: true, token };
    });

    // --- Admin: User Management ---

    // A-P1-6: roles must come from APP_ROLES — z.string() previously
    // accepted any junk string, which the RBAC layer silently ignored
    // (granting no abilities) but pollutes the users.roles array and
    // makes inventory queries unreliable.
    const UserCreateSchema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        fullName: z.string().min(1),
        // Симметрично UpdateSchema: допускаем null чтобы внешние клиенты
        // могли явно отправлять «нет телефона» без 400.
        phone: z.string().nullable().optional(),
        roles: z.array(z.enum(APP_ROLES)).min(1),
        // Super-admin (actor.organizationId=null) обязан указать target org
        // явно — иначе будет создан orphan super-admin (см. fix ниже).
        // Tenant-admin это поле игнорирует — используется его собственная org.
        organizationId: z.string().uuid().optional(),
    });

    const UserUpdateSchema = z.object({
        fullName: z.string().min(1).optional(),
        // phone — допускаем null (UI отправлял `phone: form.phone || null`,
        // что валило Zod на 400). После .nullable().optional() оба варианта
        // (null или отсутствие поля) трактуются как «не менять».
        phone: z.string().nullable().optional(),
        roles: z.array(z.enum(APP_ROLES)).min(1).optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(6).optional(),
    });

    // GET /api/auth/users — list all users (admin only, H-16: paginated)
    app.get('/api/auth/users', {
        schema: { tags: ['Администрирование'], summary: 'Список пользователей', description: 'Все пользователи системы (только admin). Пагинация.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        const { roles } = actor;
        if (!roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        const { page = '1', limit = '50' } = request.query as Record<string, string>;
        // P3 (код-аудит 2026-06-14): guard от NaN/отрицательных page|limit (parseInt
        // без проверки давал NaN/negative offset).
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200); // 1..200
        const offset = (pageNum - 1) * limitNum;

        let usersQuery = db
            .select({
                id: users.id,
                email: users.email,
                fullName: users.fullName,
                phone: users.phone,
                roles: users.roles,
                isActive: users.isActive,
                contractorId: users.contractorId,
                organizationId: users.organizationId,
                createdAt: users.createdAt,
            })
            .from(users)
            .$dynamic();
        if (actor.organizationId) {
            usersQuery = usersQuery.where(eq(users.organizationId, actor.organizationId));
        }
        const allUsers = await usersQuery
            .orderBy(users.fullName)
            .limit(limitNum)
            .offset(offset);

        return { success: true, data: allUsers };
    });

    // POST /api/auth/users — create user (admin only)
    app.post('/api/auth/users', {
        schema: { tags: ['Администрирование'], summary: 'Создать пользователя', description: 'Регистрация нового пользователя (admin). Валидация email, пароля, ролей.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        const { roles } = actor;
        if (!roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        const parseResult = UserCreateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parseResult.error.flatten(),
            });
        }
        const body = parseResult.data;

        // ============================================================
        // Защита от orphan super-admin (audit P0 D1):
        // Прежде `organizationId: actor.organizationId ?? undefined`
        // молча создавал пользователя без org, если actor — super-admin.
        // Новый user становился вторым super-admin → каскадная компромет.
        //
        // Новые правила:
        //   • Tenant-admin: organizationId всегда берётся от actor,
        //     body.organizationId игнорируется (он не вправе создавать
        //     в чужой org).
        //   • Super-admin: ОБЯЗАН передать body.organizationId.
        //   • Запрет lateral super-admin: создание admin-роли без
        //     organizationId блокируется в любом случае.
        // ============================================================
        let targetOrgId: string | null = null;
        if (actor.organizationId) {
            targetOrgId = actor.organizationId;
        } else {
            // actor — super-admin
            if (!body.organizationId) {
                return reply.status(400).send({
                    success: false,
                    error: 'Super-admin обязан указать organizationId в теле запроса',
                });
            }
            targetOrgId = body.organizationId;
        }

        if (!targetOrgId && body.roles.includes('admin')) {
            return reply.status(400).send({
                success: false,
                error: 'Нельзя создать admin-пользователя без организации (lateral super-admin запрещён)',
            });
        }

        // Check duplicate email
        const [existing] = await db.select({ id: users.id })
            .from(users).where(eq(users.email, body.email)).limit(1);
        if (existing) {
            return reply.status(409).send({ success: false, error: 'Email already exists' });
        }

        const passwordHash = await hashPassword(body.password);
        const [created] = await db.insert(users).values({
            email: body.email,
            passwordHash,
            fullName: body.fullName,
            phone: body.phone ?? null,
            roles: body.roles,
            organizationId: targetOrgId,
        }).returning({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            roles: users.roles,
            isActive: users.isActive,
            createdAt: users.createdAt,
        });

        return reply.status(201).send({ success: true, data: created });
    });

    // PUT /api/auth/users/:id — update user (admin only)
    app.put<{ Params: { id: string } }>('/api/auth/users/:id', {
        schema: { tags: ['Администрирование'], summary: 'Обновить пользователя', description: 'Обновление данных пользователя. Защита от self-escalation.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        const { userId, roles } = actor;
        if (!roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        const parseResult = UserUpdateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parseResult.error.flatten(),
            });
        }
        const body = parseResult.data;

        // --- S-2: Prevent self-escalation / demotion ---
        if (request.params.id === userId && (body.roles !== undefined || body.isActive !== undefined)) {
            return reply.status(403).send({
                success: false,
                error: 'Admins cannot change their own roles or active status'
            });
        }

        const [targetUser] = await db.select({ id: users.id, organizationId: users.organizationId, roles: users.roles })
            .from(users)
            .where(eq(users.id, request.params.id))
            .limit(1);
        if (!targetUser) {
            return reply.status(404).send({ success: false, error: 'User not found' });
        }
        if (isOutsideActorOrganization(actor, targetUser.organizationId)) {
            return reply.status(403).send({ success: false, error: 'Access denied' });
        }

        const updateData: Record<string, unknown> = { updatedAt: new Date() };
        if (body.fullName !== undefined) updateData.fullName = body.fullName;
        if (body.phone !== undefined) updateData.phone = body.phone;
        if (body.roles !== undefined) updateData.roles = body.roles;
        if (body.isActive !== undefined) updateData.isActive = body.isActive;
        if (body.password) updateData.passwordHash = await hashPassword(body.password);
        // E6/C7: смена пароля, деактивация ИЛИ СМЕНА РОЛЕЙ → бамп token_version,
        // чтобы старые токены пользователя сразу перестали действовать (демоушен
        // действует сразу, а не через 24ч). R-1 (регрессия): бампим ТОЛЬКО при
        // ФАКТИЧЕСКОЙ смене ролей (сравнение множеств), не при любой передаче roles.
        // Клиенты admin/users всегда шлют roles даже при правке ФИО → раньше любое
        // редактирование инвалидировало токен (force-logout на правку имени).
        const rolesChanged = body.roles !== undefined && (() => {
            const next = new Set(body.roles as string[]);
            const cur = new Set((targetUser.roles ?? []) as string[]);
            return next.size !== cur.size || [...next].some((r) => !cur.has(r));
        })();
        if (body.password || body.isActive === false || rolesChanged) {
            updateData.tokenVersion = sql`${users.tokenVersion} + 1`;
        }

        const [updated] = await db.update(users)
            .set(updateData)
            .where(eq(users.id, request.params.id))
            .returning({
                id: users.id,
                email: users.email,
                fullName: users.fullName,
                roles: users.roles,
                isActive: users.isActive,
            });

        if (!updated) {
            return reply.status(404).send({ success: false, error: 'User not found' });
        }

        return { success: true, data: updated };
    });

    // --- Admin: Tariff CRUD ---

    const TariffCreateSchema = z.object({
        contractId: z.string().uuid(),
        type: z.enum(['per_km', 'per_ton', 'per_hour', 'fixed_route', 'combined']),
        ratePerKm: z.number().min(0).optional().nullable(),
        ratePerTon: z.number().min(0).optional().nullable(),
        ratePerHour: z.number().min(0).optional().nullable(),
        fixedRate: z.number().min(0).optional().nullable(),
        combinedFixedRate: z.number().min(0).optional().nullable(),
        combinedKmThreshold: z.number().min(0).optional().nullable(),
        combinedRatePerKm: z.number().min(0).optional().nullable(),
        idleFreeLimitMinutes: z.number().min(0).optional(),
        idleRatePerHour: z.number().min(0).optional(),
        extraPointRate: z.number().min(0).optional(),
        nightCoefficient: z.number().min(0).optional(),
        urgentCoefficient: z.number().min(0).optional(),
        returnPercentage: z.number().min(0).optional(),
        cancellationFee: z.number().min(0).optional(),
        weekendCoefficient: z.number().min(0).optional(),
        vatIncluded: z.boolean().optional(),
        vatRate: z.number().min(0).optional(),
        minTripCost: z.number().min(0).optional(),
    });

    const TariffUpdateSchema = TariffCreateSchema.partial();

    // GET /api/auth/tariffs — list all tariffs (admin only)
    app.get('/api/auth/tariffs', {
        schema: { tags: ['Администрирование'], summary: 'Список тарифов', description: 'Все тарифы (admin). Для управления ценообразованием.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        const { roles } = actor;
        if (!roles.includes('admin') && !roles.includes('accountant') && !roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Access denied' });
        }
        // C3 (механизм «б»): org-less не-super-admin раньше получал тарифы ВСЕХ
        // тенантов (фильтр под `if (actor.organizationId)`). Платформенный super-admin
        // (admin && !org) — кросс-tenant по дизайну (видит все); прочий org-less → DENY.
        if (!actor.organizationId && !roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Учётная запись не привязана к организации' });
        }

        let tariffsQuery = db
            .select({
                id: tariffs.id,
                contractId: tariffs.contractId,
                contractNumber: contracts.number,
                contractorName: contractors.name,
                type: tariffs.type,
                ratePerKm: tariffs.ratePerKm,
                ratePerTon: tariffs.ratePerTon,
                ratePerHour: tariffs.ratePerHour,
                fixedRate: tariffs.fixedRate,
                nightCoefficient: tariffs.nightCoefficient,
                weekendCoefficient: tariffs.weekendCoefficient,
                urgentCoefficient: tariffs.urgentCoefficient,
                vatIncluded: tariffs.vatIncluded,
                vatRate: tariffs.vatRate,
                minTripCost: tariffs.minTripCost,
                createdAt: tariffs.createdAt,
            })
            .from(tariffs)
            .leftJoin(contracts, eq(tariffs.contractId, contracts.id))
            .leftJoin(contractors, eq(contracts.contractorId, contractors.id))
            .$dynamic();
        if (actor.organizationId) {
            tariffsQuery = tariffsQuery.where(eq(contractors.organizationId, actor.organizationId));
        }
        const rows = await tariffsQuery.orderBy(desc(tariffs.createdAt));

        const data = rows.map(r => {
            // compute human-readable rate
            let rate = '—';
            if (r.type === 'per_km' && r.ratePerKm) rate = `${Number(r.ratePerKm).toLocaleString('ru-RU')} ₽/км`;
            else if (r.type === 'per_ton' && r.ratePerTon) rate = `${Number(r.ratePerTon).toLocaleString('ru-RU')} ₽/т`;
            else if (r.type === 'per_hour' && r.ratePerHour) rate = `${Number(r.ratePerHour).toLocaleString('ru-RU')} ₽/ч`;
            else if (r.fixedRate) rate = `${Number(r.fixedRate).toLocaleString('ru-RU')} ₽`;
            // compute modifiers list
            const modifiers: string[] = [];
            if (r.nightCoefficient && Number(r.nightCoefficient) > 1) modifiers.push(`Ночь ×${r.nightCoefficient}`);
            if (r.weekendCoefficient && Number(r.weekendCoefficient) > 1) modifiers.push(`Выходные ×${r.weekendCoefficient}`);
            if (r.urgentCoefficient && Number(r.urgentCoefficient) > 1) modifiers.push(`Срочно ×${r.urgentCoefficient}`);
            return {
                id: r.id,
                contractId: r.contractId,
                contractName: r.contractNumber ?? '—',
                contractorName: r.contractorName ?? '—',
                type: r.type,
                rate,
                modifiers,
                // raw fields for admin panel
                ratePerKm: r.ratePerKm ? Number(r.ratePerKm) : null,
                ratePerTon: r.ratePerTon ? Number(r.ratePerTon) : null,
                ratePerHour: r.ratePerHour ? Number(r.ratePerHour) : null,
                fixedRate: r.fixedRate ? Number(r.fixedRate) : null,
                nightCoefficient: Number(r.nightCoefficient ?? 1),
                urgentCoefficient: Number(r.urgentCoefficient ?? 1),
                weekendCoefficient: Number(r.weekendCoefficient ?? 1),
                vatIncluded: r.vatIncluded,
                vatRate: Number(r.vatRate ?? 0),
                minTripCost: Number(r.minTripCost ?? 0),
                active: true,
            };
        });

        return { success: true, data };
    });

    // GET /api/auth/contracts — список договоров (для выбора при создании тарифа).
    // Org-scoped; admin/accountant/manager. Возвращает id + номер + контрагент.
    app.get('/api/auth/contracts', {
        schema: { tags: ['Администрирование'], summary: 'Список договоров', description: 'Для дропдауна при создании тарифа.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        const { roles } = actor;
        if (!roles.includes('admin') && !roles.includes('accountant') && !roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Access denied' });
        }
        let q = db.select({
            id: contracts.id,
            number: contracts.number,
            contractorName: contractors.name,
        })
            .from(contracts)
            .leftJoin(contractors, eq(contracts.contractorId, contractors.id))
            .$dynamic();
        if (actor.organizationId) {
            q = q.where(eq(contractors.organizationId, actor.organizationId));
        }
        const rows = await q.orderBy(desc(contracts.createdAt));
        return { success: true, data: rows };
    });

    // POST /api/auth/tariffs — create tariff (admin only)
    app.post('/api/auth/tariffs', {
        schema: { tags: ['Администрирование'], summary: 'Создать тариф', description: 'Новый тариф с модификаторами (ночь, выходные, НДС).' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        const { roles } = actor;
        if (!roles.includes('admin') && !roles.includes('accountant')) {
            return reply.status(403).send({ success: false, error: 'Access denied' });
        }

        const parseResult = TariffCreateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parseResult.error.flatten(),
            });
        }

        const [contract] = await db.select({ id: contracts.id, organizationId: contractors.organizationId })
            .from(contracts)
            .innerJoin(contractors, eq(contracts.contractorId, contractors.id))
            .where(eq(contracts.id, parseResult.data.contractId))
            .limit(1);
        if (!contract) {
            return reply.status(404).send({ success: false, error: 'Contract not found' });
        }
        if (isOutsideActorOrganization(actor, contract.organizationId)) {
            return reply.status(403).send({ success: false, error: 'Access denied' });
        }

        const [created] = await db.insert(tariffs).values(parseResult.data).returning();
        return reply.status(201).send({ success: true, data: created });
    });

    // PUT /api/auth/tariffs/:id — update tariff
    app.put<{ Params: { id: string } }>('/api/auth/tariffs/:id', {
        schema: { tags: ['Администрирование'], summary: 'Обновить тариф', description: 'Обновление тарифа и коэффициентов.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const actor = request.user as AuthenticatedUser;
        const { roles } = actor;
        if (!roles.includes('admin') && !roles.includes('accountant')) {
            return reply.status(403).send({ success: false, error: 'Access denied' });
        }

        const parseResult = TariffUpdateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parseResult.error.flatten(),
            });
        }

        const [existing] = await db.select({ id: tariffs.id, organizationId: contractors.organizationId })
            .from(tariffs)
            .innerJoin(contracts, eq(tariffs.contractId, contracts.id))
            .innerJoin(contractors, eq(contracts.contractorId, contractors.id))
            .where(eq(tariffs.id, request.params.id))
            .limit(1);
        if (!existing) {
            return reply.status(404).send({ success: false, error: 'Tariff not found' });
        }
        if (isOutsideActorOrganization(actor, existing.organizationId)) {
            return reply.status(403).send({ success: false, error: 'Access denied' });
        }
        if (parseResult.data.contractId) {
            const [newContract] = await db.select({ id: contracts.id, organizationId: contractors.organizationId })
                .from(contracts)
                .innerJoin(contractors, eq(contracts.contractorId, contractors.id))
                .where(eq(contracts.id, parseResult.data.contractId))
                .limit(1);
            if (!newContract) {
                return reply.status(404).send({ success: false, error: 'Contract not found' });
            }
            if (isOutsideActorOrganization(actor, newContract.organizationId)) {
                return reply.status(403).send({ success: false, error: 'Access denied' });
            }
        }

        const [updated] = await db.update(tariffs)
            .set(parseResult.data)
            .where(eq(tariffs.id, request.params.id))
            .returning();

        if (!updated) {
            return reply.status(404).send({ success: false, error: 'Tariff not found' });
        }

        return { success: true, data: updated };
    });

    // --- Admin: Checklist Templates CRUD ---

    const ChecklistItemSchema = z.object({
        name: z.string().min(1),
        responseType: z.enum(['ok_fault', 'number', 'text', 'boolean']),
        required: z.boolean(),
    });

    const ChecklistCreateSchema = z.object({
        type: z.string().min(1),
        version: z.string().min(1),
        name: z.string().min(1),
        items: z.array(ChecklistItemSchema).min(1),
        isActive: z.boolean().optional(),
    });

    const ChecklistUpdateSchema = ChecklistCreateSchema.partial();

    // GET /api/auth/checklist-templates
    app.get('/api/auth/checklist-templates', {
        schema: { tags: ['Администрирование'], summary: 'Шаблоны чек-листов', description: 'Все шаблоны чек-листов (техосмотр/медосмотр).' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const u = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        if (!u.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        // A-P0-12: tenant scoping. Tenant admins see system defaults
        // (org_id IS NULL) + their own org templates. Cross-tenant access is
        // blocked. Previously every admin saw every other org's templates.
        const orgScope = u.organizationId
            ? or(isNull(checklistTemplates.organizationId), eq(checklistTemplates.organizationId, u.organizationId))
            : isNull(checklistTemplates.organizationId);
        const templates = await db
            .select()
            .from(checklistTemplates)
            .where(orgScope)
            .orderBy(checklistTemplates.createdAt);

        return { success: true, data: templates };
    });

    // POST /api/auth/checklist-templates
    app.post('/api/auth/checklist-templates', {
        schema: { tags: ['Администрирование'], summary: 'Создать шаблон', description: 'Новый шаблон чек-листа для осмотров.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const u = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        if (!u.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        const parseResult = ChecklistCreateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parseResult.error.flatten(),
            });
        }

        // A-P0-12: stamp creator's org_id so this template is tenant-scoped.
        const [created] = await db.insert(checklistTemplates)
            .values({ ...parseResult.data, organizationId: u.organizationId ?? null })
            .returning();
        return reply.status(201).send({ success: true, data: created });
    });

    // PUT /api/auth/checklist-templates/:id
    app.put<{ Params: { id: string } }>('/api/auth/checklist-templates/:id', {
        schema: { tags: ['Администрирование'], summary: 'Обновить шаблон чек-листа', description: 'Обновление шаблона чек-листа.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const u = request.user as { userId: string; roles: string[]; organizationId?: string | null };
        if (!u.roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        const parseResult = ChecklistUpdateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parseResult.error.flatten(),
            });
        }

        // A-P0-12: only update templates the caller owns. System defaults
        // (org_id IS NULL) are read-only — a tenant admin can't edit them.
        const [updated] = await db.update(checklistTemplates)
            .set(parseResult.data)
            .where(and(
                eq(checklistTemplates.id, request.params.id),
                u.organizationId
                    ? eq(checklistTemplates.organizationId, u.organizationId)
                    : sql`false`,
            ))
            .returning();

        if (!updated) {
            return reply.status(404).send({ success: false, error: 'Template not found' });
        }

        return { success: true, data: updated };
    });

    // ====================================================================
    // Round 1B — Self-serve signup + email verification.
    // The flow: POST /signup → creates inactive user + organization +
    // 6-digit verification code (sent via email provider). POST /verify-email
    // consumes the code, marks the user active + email_verified, sets the
    // session cookie. POST /resend-code regenerates a code (rate limited).
    // ====================================================================

    const SignupSchema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
        fullName: z.string().min(1),
        phone: z.string().optional(),
        companyName: z.string().optional(),
    });

    const VerifyEmailSchema = z.object({
        email: z.string().email(),
        code: z.string().regex(/^\d{6}$/),
    });

    const ResendCodeSchema = z.object({
        email: z.string().email(),
    });

    const VERIFICATION_TTL_MIN = 15;
    const RESEND_COOLDOWN_MS = 60_000;

    async function sendVerificationCode(email: string, code: string, organizationId: string): Promise<void> {
        // Try the org's configured email adapter — fall back to the console
        // mock when nothing is configured. selectAdapter handles both.
        const registry = getDefaultRegistry();
        const adapter = await selectAdapter(registry.email, organizationId, 'email');
        const subject = 'ТрансПульт — код подтверждения';
        // A-P1-7: escape interpolated values. `code` is server-generated by
        // randomInt(100000, 1000000) so always 6 digits — but escape anyway
        // to keep the pattern uniform and immune to future refactors.
        const html = `<p>Здравствуйте!</p>
            <p>Ваш код подтверждения для входа в ТрансПульт: <strong style="font-size:24px">${escapeHtml(code)}</strong></p>
            <p>Код действителен в течение ${VERIFICATION_TTL_MIN} минут.</p>`;
        const text = `Код подтверждения ТрансПульт: ${code}\nКод действителен ${VERIFICATION_TTL_MIN} минут.`;
        await adapter.send(email, subject, html, text);
    }

    /**
     * A-P2: enumeration-safe "you already have an account" notice. Sent to
     * the address itself when someone re-attempts signup on a verified
     * email — closes the leak that lets an attacker probe which addresses
     * are registered. Best-effort send; we still return 201 on the public
     * endpoint regardless.
     */
    async function sendAlreadyRegisteredNotice(email: string, organizationId: string | null): Promise<void> {
        // organizationId may be null if the user was migrated without org —
        // selectAdapter accepts a fallback. Use the user's org when present.
        const registry = getDefaultRegistry();
        const adapter = await selectAdapter(registry.email, organizationId ?? '', 'email');
        const subject = 'ТрансПульт — учётная запись уже существует';
        const html = `<p>Здравствуйте!</p>
            <p>Кто-то попытался зарегистрировать новую учётную запись ТрансПульт с этим адресом, но он уже привязан к существующему аккаунту.</p>
            <p>Если это были вы — просто войдите по email и паролю. Если нет — никаких действий не требуется, регистрация не создана.</p>
            <p>Если вы забыли пароль, воспользуйтесь функцией восстановления при входе.</p>`;
        const text = `На ${email} уже зарегистрирован аккаунт ТрансПульт. Если это были вы — войдите. Если нет — игнорируйте письмо.`;
        await adapter.send(email, subject, html, text);
    }

    // POST /api/auth/signup — start self-serve registration.
    app.post('/api/auth/signup', {
        schema: { tags: ['Авторизация'], summary: 'Самостоятельная регистрация', description: 'Создаёт неактивного пользователя + организацию и отправляет 6-значный код подтверждения на email.' },
        config: {
            rateLimit: {
                max: LOGIN_RATE_LIMIT_MAX,
                timeWindow: LOGIN_RATE_LIMIT_WINDOW,
            },
        },
    }, async (request, reply) => {
        const parsed = SignupSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parsed.error.flatten(),
            });
        }
        const { email, password, fullName, phone, companyName } = parsed.data;

        // Idempotent: if a user with this email already exists AND is verified,
        // refuse. Otherwise (new or unverified) regenerate code.
        const [existing] = await db
            .select({
                id: users.id,
                isActive: users.isActive,
                emailVerifiedAt: users.emailVerifiedAt,
                organizationId: users.organizationId,
            })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        if (existing) {
            // A-P2 + C7: enumeration-safe И защита от захвата аккаунта.
            // Раньше только verified-аккаунт обрабатывался здесь, а НЕпроверенный
            // проваливался в ветку с перезаписью passwordHash (анонимный re-signup
            // чужим email + своим паролем → захват непроверенного аккаунта).
            // Теперь ЛЮБОЙ существующий аккаунт → enumeration-safe 201 БЕЗ изменения
            // записи. verified → notice «у вас уже есть аккаунт»; unverified →
            // владелец завершает регистрацию через /resend-code (пароль не трогаем).
            try {
                if (existing.emailVerifiedAt) {
                    await sendAlreadyRegisteredNotice(email, existing.organizationId ?? null);
                }
            } catch (err) {
                request.log.error({ err }, 'Failed to send already-registered notice');
            }
            return reply.status(201).send({
                success: true,
                data: { signupId: existing.id, status: 'pending' as const },
            });
        }

        // B3.2: signup-pipeline в транзакции. Раньше sequential await:
        // если INSERT users / emailVerifications падал, INSERT organizations
        // оставался orphan. На concurrent signup с одинаковым email
        // (race на unique-constraint) могли создаться две org-записи.
        //
        // P3 (код-аудит 2026-06-14): прежний security-TODO(P0-3) закрыт — уязвимая
        // ветка «reuse the unverified record» (overwrite passwordHash существующего
        // user-а) УДАЛЕНА; signup ниже создаёт только свежие org/user, существующий
        // email отклоняется на unique-constraint. TODO снят как устаревший.
        const code = generateCode();
        const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MIN * 60_000);

        // C7: только НОВЫЙ аккаунт (любой существующий обработан enumeration-safe выше,
        // без перезаписи — ветка `if (existing)` с overwrite удалена как уязвимая).
        const { organizationId, userId } = await db.transaction(async (tx) => {
            const [org] = await tx.insert(organizations).values({
                name: companyName ?? `Компания (${email})`,
            }).returning({ id: organizations.id });
            const orgId = org!.id;

            const passwordHash = await hashPassword(password);
            const [user] = await tx.insert(users).values({
                email,
                passwordHash,
                fullName,
                phone,
                roles: ['admin'],
                isActive: false,
                organizationId: orgId,
            }).returning({ id: users.id });

            // P2 (код-аудит 2026-06-14): инвалидируем прежние неиспользованные коды
            // этого email перед выдачей нового — иначе валидные коды накапливались,
            // расширяя поверхность брутфорса 6-значного кода (лимит попыток — через
            // per-route rateLimit ниже).
            await tx.update(emailVerifications).set({ usedAt: new Date() })
                .where(and(eq(emailVerifications.email, email), isNull(emailVerifications.usedAt)));
            await tx.insert(emailVerifications).values({ email, code, expiresAt });

            return { organizationId: orgId, userId: user!.id };
        });

        try {
            await sendVerificationCode(email, code, organizationId);
        } catch (err) {
            request.log.error({ err }, 'Failed to send verification code');
            // We still return success — user can hit /resend-code.
        }

        return reply.status(201).send({
            success: true,
            data: {
                signupId: userId,
                status: 'pending' as const,
                // F-01: на dev/демо-стенде код подтверждения уходит только в консоль
                // (реального SMTP нет) — показываем его в UI, иначе презентатор лезет
                // в логи api. В проде с настроенным SMTP код уходит в почту и в ответе
                // НЕ раскрывается (гейт по NODE_ENV + наличию SMTP_HOST).
                ...((process.env.NODE_ENV !== 'production' || !process.env.SMTP_HOST) ? { devCode: code } : {}),
            },
        });
    });

    // POST /api/auth/verify-email — consume the 6-digit code.
    app.post('/api/auth/verify-email', {
        schema: { tags: ['Авторизация'], summary: 'Подтверждение email', description: 'Проверяет 6-значный код, активирует пользователя и выставляет cookie.' },
        config: {
            rateLimit: {
                max: LOGIN_RATE_LIMIT_MAX,
                timeWindow: LOGIN_RATE_LIMIT_WINDOW,
            },
        },
    }, async (request, reply) => {
        const parsed = VerifyEmailSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten(),
            });
        }
        const { email, code } = parsed.data;

        // Latest unused, unexpired code for this email.
        const [verification] = await db
            .select()
            .from(emailVerifications)
            .where(and(
                eq(emailVerifications.email, email),
                eq(emailVerifications.code, code),
                gt(emailVerifications.expiresAt, new Date()),
            ))
            .orderBy(desc(emailVerifications.createdAt))
            .limit(1);

        if (!verification || verification.usedAt) {
            return reply.status(400).send({ success: false, error: 'Неверный или истёкший код' });
        }

        await db.update(emailVerifications)
            .set({ usedAt: new Date() })
            .where(eq(emailVerifications.id, verification.id));

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
        if (!user) {
            return reply.status(404).send({ success: false, error: 'Пользователь не найден' });
        }

        await db.update(users)
            .set({
                isActive: true,
                emailVerifiedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

        const token = app.jwt.sign(
            { userId: user.id, roles: user.roles, organizationId: user.organizationId ?? undefined, tv: user.tokenVersion ?? 0 },
            { expiresIn: JWT_EXPIRES_IN },
        );
        // A-P1-5: sameSite='strict' (see /login for rationale).
        const isSecure = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
        reply.setCookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'strict',
            path: '/',
            maxAge: COOKIE_MAX_AGE,
        });

        return {
            success: true,
            data: {
                user: {
                    id: user.id,
                    email: user.email,
                    fullName: user.fullName,
                    roles: user.roles,
                    organizationId: user.organizationId,
                },
            },
        };
    });

    // POST /api/auth/resend-code — regenerate the code, rate limited 1/min.
    app.post('/api/auth/resend-code', {
        schema: { tags: ['Авторизация'], summary: 'Повторная отправка кода', description: 'Регенерирует 6-значный код. Rate limit: 1 раз в минуту на email.' },
        config: {
            rateLimit: {
                max: LOGIN_RATE_LIMIT_MAX,
                timeWindow: LOGIN_RATE_LIMIT_WINDOW,
            },
        },
    }, async (request, reply) => {
        const parsed = ResendCodeSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false, error: 'Ошибка валидации данных', details: parsed.error.flatten(),
            });
        }
        const { email } = parsed.data;

        // A-P2: enumeration-safe. Always return the same generic message
        // regardless of whether the email exists, is verified, or is
        // within the cooldown window. Eligibility checks still happen
        // internally — we just don't tell the caller why nothing was
        // sent. The per-route rate limit + RESEND_COOLDOWN_MS guard the
        // mailbox; the unified response closes the enumeration leak.
        const eligibleResponse = {
            success: true,
            message: 'Если адрес зарегистрирован и ожидает подтверждения, код отправлен повторно.',
        };

        const [user] = await db
            .select({ id: users.id, organizationId: users.organizationId, emailVerifiedAt: users.emailVerifiedAt })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        // Bail silently on every non-eligible case (no user / already
        // verified / legacy user без организации). Returning the same shape
        // on the same status code prevents timing- and content-based
        // enumeration. organizationId колонки nullable — без организации
        // отправить код невозможно (адаптер требует orgId), поэтому
        // молча выходим вместо небезопасного non-null оператора.
        if (!user || user.emailVerifiedAt || !user.organizationId) {
            return eligibleResponse;
        }

        // Per-email cooldown — last code sent must be > RESEND_COOLDOWN_MS ago.
        const [latest] = await db
            .select({ createdAt: emailVerifications.createdAt })
            .from(emailVerifications)
            .where(eq(emailVerifications.email, email))
            .orderBy(desc(emailVerifications.createdAt))
            .limit(1);
        if (latest && Date.now() - new Date(latest.createdAt).getTime() < RESEND_COOLDOWN_MS) {
            // Still return the same shape — caller can't distinguish
            // "cooldown" from "not registered" / "already verified".
            return eligibleResponse;
        }

        const code = generateCode();
        const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MIN * 60_000);
        // P2 (код-аудит 2026-06-14): инвалидируем прежние неиспользованные коды email
        // перед выдачей нового (см. выше — против накопления валидных кодов).
        await db.update(emailVerifications).set({ usedAt: new Date() })
            .where(and(eq(emailVerifications.email, email), isNull(emailVerifications.usedAt)));
        await db.insert(emailVerifications).values({ email, code, expiresAt });

        try {
            await sendVerificationCode(email, code, user.organizationId);
        } catch (err) {
            request.log.error({ err }, 'Failed to resend verification code');
        }

        return eligibleResponse;
    });

    // ====================================================================
    // Password reset flow — Redis-backed, enumeration-safe, one-time token.
    // POST /forgot-password → if email maps to an active user, store
    // pwreset:<token> in Redis (TTL 1h) and email the reset link. Always
    // returns success regardless of whether the address exists.
    // POST /reset-password  → consume token, hash + persist new password,
    // delete the Redis key (one-time use).
    // ====================================================================

    const ForgotPasswordSchema = z.object({
        email: z.string().email(),
    });

    const ResetPasswordSchema = z.object({
        token: z.string().min(20).max(200),
        password: z.string().min(8),
    });

    async function sendPasswordResetEmail(
        email: string,
        resetUrl: string,
        organizationId: string | null,
    ): Promise<void> {
        // Same adapter pattern as sendVerificationCode — picks the org's
        // configured email provider or falls back to console mock.
        const registry = getDefaultRegistry();
        const adapter = await selectAdapter(registry.email, organizationId ?? '', 'email');
        const subject = 'ТрансПульт — сброс пароля';
        // escapeHtml on the URL is paranoid (we built it ourselves), but
        // mirrors the pattern in sendVerificationCode and is cheap.
        const safeUrl = escapeHtml(resetUrl);
        const html = `<p>Здравствуйте!</p>
            <p>Кто-то запросил сброс пароля для вашей учётной записи ТрансПульт.</p>
            <p><a href="${safeUrl}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Установить новый пароль</a></p>
            <p style="font-size:13px;color:#555">Или скопируйте ссылку в браузер:<br><span style="font-family:monospace">${safeUrl}</span></p>
            <p style="font-size:13px;color:#555">Ссылка действует 1 час. Если вы не запрашивали сброс — просто проигнорируйте письмо, пароль не изменится.</p>`;
        const text = `Сброс пароля ТрансПульт.\n\nПерейдите по ссылке, чтобы установить новый пароль:\n${resetUrl}\n\nСсылка действует 1 час. Если вы не запрашивали сброс — проигнорируйте письмо.`;
        await adapter.send(email, subject, html, text);
    }

    // POST /api/auth/forgot-password — request a reset link.
    app.post('/api/auth/forgot-password', {
        schema: {
            tags: ['Авторизация'],
            summary: 'Запрос сброса пароля',
            description: 'Отправляет ссылку для сброса пароля на email (если адрес зарегистрирован). Enumeration-safe: всегда возвращает success. Rate limit: 5/15min.',
        },
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '15 minutes',
            },
        },
    }, async (request, reply) => {
        const parsed = ForgotPasswordSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parsed.error.flatten(),
            });
        }
        const { email } = parsed.data;

        // Enumeration-safe response — same shape regardless of outcome.
        const okResponse = {
            success: true,
            message: 'Если адрес зарегистрирован, на него отправлена ссылка для сброса пароля.',
        };

        const [user] = await db
            .select({
                id: users.id,
                isActive: users.isActive,
                organizationId: users.organizationId,
            })
            .from(users)
            .where(eq(users.email, email))
            .limit(1);

        // Bail silently for missing / disabled accounts. Caller can't
        // distinguish from a successful send.
        if (!user || !user.isActive) {
            return reply.send(okResponse);
        }

        // 256-bit token, URL-safe (base64url is 43 chars for 32 bytes).
        const token = randomBytes(32).toString('base64url');
        try {
            const redis = await getResetRedis();
            await redis.set(`${PWRESET_PREFIX}${token}`, user.id, 'EX', PWRESET_TTL_SECONDS);
        } catch (err) {
            request.log.error({ err }, 'Failed to persist password reset token to Redis');
            // Still return success — exposing Redis outages to the caller
            // would let an attacker probe infrastructure state.
            return reply.send(okResponse);
        }

        const resetUrl = `${resolveWebPublicUrl()}/reset-password?token=${encodeURIComponent(token)}`;
        try {
            await sendPasswordResetEmail(email, resetUrl, user.organizationId ?? null);
        } catch (err) {
            request.log.error({ err }, 'Failed to send password reset email');
        }

        return reply.send(okResponse);
    });

    // POST /api/auth/reset-password — consume token, persist new password.
    app.post('/api/auth/reset-password', {
        schema: {
            tags: ['Авторизация'],
            summary: 'Сброс пароля по токену',
            description: 'Валидирует одноразовый токен из письма, сохраняет новый пароль (bcrypt), удаляет токен.',
        },
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '15 minutes',
            },
        },
    }, async (request, reply) => {
        const parsed = ResetPasswordSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.status(400).send({
                success: false,
                error: 'Ошибка валидации данных',
                details: parsed.error.flatten(),
            });
        }
        const { token, password } = parsed.data;

        let userId: string | null = null;
        try {
            const redis = await getResetRedis();
            userId = await redis.get(`${PWRESET_PREFIX}${token}`);
        } catch (err) {
            request.log.error({ err }, 'Failed to read password reset token from Redis');
            return reply.status(503).send({
                success: false,
                error: 'Сервис временно недоступен. Попробуйте позже.',
            });
        }

        if (!userId) {
            return reply.status(400).send({
                success: false,
                error: 'Ссылка недействительна или истекла. Запросите новую.',
            });
        }

        // Confirm the user still exists and is active before mutating.
        const [user] = await db
            .select({ id: users.id, isActive: users.isActive })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
        if (!user || !user.isActive) {
            // Clean up the dead token so it can't be retried.
            try {
                const redis = await getResetRedis();
                await redis.del(`${PWRESET_PREFIX}${token}`);
            } catch { /* best-effort */ }
            return reply.status(400).send({
                success: false,
                error: 'Учётная запись недоступна. Обратитесь к администратору.',
            });
        }

        const passwordHash = await hashPassword(password);
        await db.update(users)
            // E6: смена пароля → бамп token_version (старые токены мертвы).
            .set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
            .where(eq(users.id, user.id));

        // One-time use — invalidate immediately.
        try {
            const redis = await getResetRedis();
            await redis.del(`${PWRESET_PREFIX}${token}`);
        } catch (err) {
            request.log.warn({ err }, 'Failed to delete consumed password reset token');
        }

        return reply.send({ success: true });
    });
}

// Type augmentation for Fastify
declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    }
}

declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: { userId: string; roles: string[]; organizationId?: string; tv?: number };
        user: { userId: string; roles: string[]; organizationId?: string; tv?: number };
    }
}

