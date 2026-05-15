// ============================================================
// Auth module — JWT + httpOnly cookies + rate limiting
// ============================================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'node:crypto';
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
const SALT_ROUNDS = 12;
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

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

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

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
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
            // Try cookie first (web browser)
            const cookieToken = request.cookies?.[COOKIE_NAME];
            if (cookieToken) {
                await request.jwtVerify({ onlyCookie: true });
                {
                    const payload = request.user as { organizationId?: string };
                    (request as FastifyRequest).orgId = payload?.organizationId ?? null;
                }
                return;
            }

            // Fallback to Authorization header (mobile app)
            const authHeader = request.headers.authorization;
            if (authHeader?.startsWith('Bearer ')) {
                await request.jwtVerify();
                {
                    const payload = request.user as { organizationId?: string };
                    (request as FastifyRequest).orgId = payload?.organizationId ?? null;
                }
                return;
            }

            reply.status(401).send({ success: false, error: 'Требуется авторизация' });
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
            { userId: user.id, roles: user.roles, organizationId: user.organizationId ?? undefined },
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
            { userId: user.id, roles: user.roles, organizationId: user.organizationId ?? undefined },
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

        return { success: true, data: { ...user, driverId, isSuperAdmin } };
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
        const token = app.jwt.sign(
            { userId: payload.userId, roles: payload.roles, organizationId: payload.organizationId },
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
        phone: z.string().optional(),
        roles: z.array(z.enum(APP_ROLES)).min(1),
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
        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(parseInt(limit, 10), 200); // cap at 200
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
            phone: body.phone,
            roles: body.roles,
            organizationId: actor.organizationId ?? undefined,
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

        const [targetUser] = await db.select({ id: users.id, organizationId: users.organizationId })
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

        if (existing?.emailVerifiedAt) {
            // A-P2: enumeration-safe. Don't tell the caller the email is
            // taken — that lets a probe enumerate registered accounts.
            // Instead, send a notice to the address itself ("you already
            // have an account") and return the same 201 success shape as
            // a fresh signup. Rate-limit on the route prevents flooding.
            try {
                await sendAlreadyRegisteredNotice(email, existing.organizationId ?? null);
            } catch (err) {
                request.log.error({ err }, 'Failed to send already-registered notice');
            }
            return reply.status(201).send({
                success: true,
                data: { signupId: existing.id, status: 'pending' as const },
            });
        }

        let organizationId: string;
        let userId: string;

        if (existing) {
            // Reuse the unverified record — let the user retry signup with
            // the same email (e.g. they lost the code).
            userId = existing.id;
            organizationId = existing.organizationId!;
            const passwordHash = await hashPassword(password);
            await db.update(users)
                .set({ passwordHash, fullName, phone, updatedAt: new Date() })
                .where(eq(users.id, userId));
            if (companyName) {
                await db.update(organizations)
                    .set({ name: companyName })
                    .where(eq(organizations.id, organizationId));
            }
        } else {
            // Fresh signup: create organization + admin user.
            const [org] = await db.insert(organizations).values({
                name: companyName ?? `Компания (${email})`,
            }).returning({ id: organizations.id });
            organizationId = org!.id;

            const passwordHash = await hashPassword(password);
            const [user] = await db.insert(users).values({
                email,
                passwordHash,
                fullName,
                phone,
                roles: ['admin'],
                isActive: false,
                organizationId,
            }).returning({ id: users.id });
            userId = user!.id;
        }

        // Generate fresh code, invalidate any older outstanding ones.
        const code = generateCode();
        const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MIN * 60_000);
        await db.insert(emailVerifications).values({
            email, code, expiresAt,
        });

        try {
            await sendVerificationCode(email, code, organizationId);
        } catch (err) {
            request.log.error({ err }, 'Failed to send verification code');
            // We still return success — user can hit /resend-code.
        }

        return reply.status(201).send({
            success: true,
            data: { signupId: userId, status: 'pending' as const },
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
            { userId: user.id, roles: user.roles, organizationId: user.organizationId ?? undefined },
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
        // verified). Returning the same shape on the same status code
        // prevents timing- and content-based enumeration.
        if (!user || user.emailVerifiedAt) {
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
        await db.insert(emailVerifications).values({ email, code, expiresAt });

        try {
            await sendVerificationCode(email, code, user.organizationId!);
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
            .set({ passwordHash, updatedAt: new Date() })
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
        payload: { userId: string; roles: string[]; organizationId?: string };
        user: { userId: string; roles: string[]; organizationId?: string };
    }
}

