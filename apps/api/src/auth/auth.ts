// ============================================================
// Auth module — JWT + httpOnly cookies + rate limiting
// ============================================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import cookie from '@fastify/cookie';
import { db } from '../db/connection.js';
import { users, drivers, tariffs, contracts, contractors, checklistTemplates } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { LoginSchema } from '@tms/shared';
import { z } from 'zod';

// --- CRITICAL (C-1): No hardcoded fallback. Fail-fast if not set. ---
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('❌ FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
    process.exit(1);
}

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
                return;
            }

            // Fallback to Authorization header (mobile app)
            const authHeader = request.headers.authorization;
            if (authHeader?.startsWith('Bearer ')) {
                await request.jwtVerify();
                return;
            }

            reply.status(401).send({ success: false, error: 'Unauthorized' });
        } catch (err) {
            reply.status(401).send({ success: false, error: 'Unauthorized' });
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
                error: 'Validation failed',
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
            return reply.status(401).send({ success: false, error: 'Invalid credentials' });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            return reply.status(401).send({ success: false, error: 'Invalid credentials' });
        }

        const token = app.jwt.sign(
            { userId: user.id, roles: user.roles, organizationId: user.organizationId ?? undefined },
            { expiresIn: JWT_EXPIRES_IN },
        );

        // H-15: Set httpOnly cookie (still useful for direct API access)
        // COOKIE_SECURE: set to 'false' when running without HTTPS
        const isSecure = process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production';
        reply.setCookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'lax',
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
                error: 'Validation failed',
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
            return reply.status(401).send({ success: false, error: 'Invalid credentials' });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
            return reply.status(401).send({ success: false, error: 'Invalid credentials' });
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

        return { success: true, data: { ...user, driverId } };
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

    const UserCreateSchema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
        fullName: z.string().min(1),
        phone: z.string().optional(),
        roles: z.array(z.string()).min(1),
    });

    const UserUpdateSchema = z.object({
        fullName: z.string().min(1).optional(),
        phone: z.string().optional(),
        roles: z.array(z.string()).min(1).optional(),
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
                error: 'Validation failed',
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
                error: 'Validation failed',
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
                error: 'Validation failed',
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
                error: 'Validation failed',
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
        const { roles } = request.user as { userId: string; roles: string[] };
        if (!roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        const templates = await db
            .select()
            .from(checklistTemplates)
            .orderBy(checklistTemplates.createdAt);

        return { success: true, data: templates };
    });

    // POST /api/auth/checklist-templates
    app.post('/api/auth/checklist-templates', {
        schema: { tags: ['Администрирование'], summary: 'Создать шаблон', description: 'Новый шаблон чек-листа для осмотров.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const { roles } = request.user as { userId: string; roles: string[] };
        if (!roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        const parseResult = ChecklistCreateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation failed',
                details: parseResult.error.flatten(),
            });
        }

        const [created] = await db.insert(checklistTemplates).values(parseResult.data).returning();
        return reply.status(201).send({ success: true, data: created });
    });

    // PUT /api/auth/checklist-templates/:id
    app.put<{ Params: { id: string } }>('/api/auth/checklist-templates/:id', {
        schema: { tags: ['Администрирование'], summary: 'Обновить шаблон чек-листа', description: 'Обновление шаблона чек-листа.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const { roles } = request.user as { userId: string; roles: string[] };
        if (!roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        const parseResult = ChecklistUpdateSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({
                success: false,
                error: 'Validation failed',
                details: parseResult.error.flatten(),
            });
        }

        const [updated] = await db.update(checklistTemplates)
            .set(parseResult.data)
            .where(eq(checklistTemplates.id, request.params.id))
            .returning();

        if (!updated) {
            return reply.status(404).send({ success: false, error: 'Template not found' });
        }

        return { success: true, data: updated };
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

