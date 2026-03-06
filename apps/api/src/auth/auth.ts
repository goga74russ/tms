// ============================================================
// Auth module — JWT + httpOnly cookies + rate limiting
// ============================================================
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcryptjs';
import cookie from '@fastify/cookie';
import { db } from '../db/connection.js';
import { users, tariffs, checklistTemplates } from '../db/schema.js';
import { eq } from 'drizzle-orm';
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

    // --- CRITICAL (C-2): Rate limiting on login ---
    app.register(import('@fastify/rate-limit'), {
        max: 500,
        timeWindow: '1 minute',
        keyGenerator: (request: FastifyRequest) => {
            return request.ip;
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
                max: 5,
                timeWindow: '1 minute',
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
            { userId: user.id, roles: user.roles },
            { expiresIn: JWT_EXPIRES_IN },
        );

        // H-15: Set httpOnly cookie instead of returning token in body
        reply.setCookie(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
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
                max: 5,
                timeWindow: '1 minute',
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
            { userId: user.id, roles: user.roles },
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
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        reply.clearCookie(COOKIE_NAME, { path: '/' });
        return { success: true };
    });

    // Get current user
    app.get('/api/auth/me', {
        schema: { tags: ['Авторизация'], summary: 'Текущий пользователь', description: 'Информация об авторизованном пользователе (без passwordHash).' },
        preHandler: [app.authenticate],
    }, async (request) => {
        const payload = request.user as { userId: string; roles: string[] };
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

        return { success: true, data: user };
    });

    // Short-lived token for WebSocket connections (browser can't send cookies over WS)
    app.get('/api/auth/ws-token', {
        schema: { tags: ['Авторизация'], summary: 'WS токен', description: 'Короткоживущий JWT (5 мин) для WebSocket подключения.' },
        preHandler: [app.authenticate],
    }, async (request) => {
        const payload = request.user as { userId: string; roles: string[] };
        const token = app.jwt.sign(
            { userId: payload.userId, roles: payload.roles },
            { expiresIn: '5m' }, // short-lived for WS handshake only
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
        const { roles } = request.user as { userId: string; roles: string[] };
        if (!roles.includes('admin')) {
            return reply.status(403).send({ success: false, error: 'Admin access required' });
        }

        const { page = '1', limit = '50' } = request.query as Record<string, string>;
        const pageNum = parseInt(page, 10);
        const limitNum = Math.min(parseInt(limit, 10), 200); // cap at 200
        const offset = (pageNum - 1) * limitNum;

        const allUsers = await db
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
        const { roles } = request.user as { userId: string; roles: string[] };
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
        const { userId, roles } = request.user as { userId: string; roles: string[] };
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
        const { roles } = request.user as { userId: string; roles: string[] };
        if (!roles.includes('admin') && !roles.includes('accountant') && !roles.includes('manager')) {
            return reply.status(403).send({ success: false, error: 'Access denied' });
        }

        const allTariffs = await db
            .select()
            .from(tariffs)
            .orderBy(tariffs.createdAt);

        return { success: true, data: allTariffs };
    });

    // POST /api/auth/tariffs — create tariff (admin only)
    app.post('/api/auth/tariffs', {
        schema: { tags: ['Администрирование'], summary: 'Создать тариф', description: 'Новый тариф с модификаторами (ночь, выходные, НДС).' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const { roles } = request.user as { userId: string; roles: string[] };
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

        const [created] = await db.insert(tariffs).values(parseResult.data).returning();
        return reply.status(201).send({ success: true, data: created });
    });

    // PUT /api/auth/tariffs/:id — update tariff
    app.put<{ Params: { id: string } }>('/api/auth/tariffs/:id', {
        schema: { tags: ['Администрирование'], summary: 'Обновить тариф', description: 'Обновление тарифа и коэффициентов.' },
        preHandler: [app.authenticate],
    }, async (request, reply) => {
        const { roles } = request.user as { userId: string; roles: string[] };
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
        payload: { userId: string; roles: string[] };
        user: { userId: string; roles: string[] };
    }
}
