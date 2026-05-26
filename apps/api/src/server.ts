// ============================================================
// TMS — Fastify Server Entry Point
// ============================================================
import 'dotenv/config';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import metricsPlugin from 'fastify-metrics';
import { registerAuthRoutes } from './auth/auth.js';
import { testRedisConnection } from './integrations/redis.js';
import { setupRepeatableJobs } from './integrations/queues.js';
import { startWialonWorker, stopWialonWorker } from './integrations/workers/wialon.worker.js';
import { startFinesWorker, stopFinesWorker } from './integrations/workers/fines.worker.js';
import { startNotificationWorker, stopNotificationWorker } from './integrations/workers/notification.worker.js';
import { startBillingWorker, stopBillingWorker } from './integrations/workers/billing.worker.js';
import { startEdiWorker, stopEdiWorker } from './integrations/workers/edi.worker.js';
import { startPositionBroadcast, stopPositionBroadcast } from './integrations/websocket.js';
import { sql as rawSql } from './db/connection.js';
import { APPEND_ONLY_TRIGGER_SQL } from './db/triggers.js';

// --- Required env var validation (M-7) ---
if (!process.env.DATABASE_URL) {
    console.error('\u274c FATAL: DATABASE_URL environment variable is not set. Refusing to start.');
    process.exit(1);
}
if (!process.env.REDIS_URL) {
    console.error('\u274c FATAL: REDIS_URL environment variable is not set. Refusing to start.');
    process.exit(1);
}

const RATE_LIMIT_MAX = Math.max(
    1,
    Number.parseInt(process.env.RATE_LIMIT_MAX ?? '500', 10) || 500,
);
const RATE_LIMIT_WINDOW = process.env.RATE_LIMIT_WINDOW ?? '1 minute';

const app = Fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        // A-P1-1: redact sensitive headers + bodies. Without this, login bodies
        // (with plaintext passwords) and /integrations/credentials POSTs (with
        // API keys) end up in log files.
        redact: {
            paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                // B5.2: webhook-secret заголовки от провайдеров (ЮKassa, Госключ, …)
                'req.headers["x-api-key"]',
                'req.headers["x-webhook-signature"]',
                'req.headers["x-yookassa-signature"]',
                'res.headers["set-cookie"]',
                'req.body.password',
                'req.body.passwordHash',
                'req.body.credentials',
                'req.body.credentials.*',
                'req.body.apiKey',
                'req.body.token',
                'req.body.tempPassword',
                // B5.2: 6-значные verification codes (signup, password-reset) —
                // не должны попадать в logs (account-takeover risk).
                'req.body.code',
                'req.body.verificationCode',
                'req.body.refreshToken',
                // B5.2: signedXml в Госключ callback — большой и содержит подпись.
                'req.body.signature',
                'req.body.signedXml',
                'req.body.signerCertificate',
                // T-3 (sprint W1): driver/contractor PII — 152-ФЗ.
                // POST/PUT /drivers, /contractors, /users принимают эти поля
                // в body. Без redact они уходят в pino-логи и попадают в
                // grafana/loki/файлы → нарушение принципа минимизации
                // (152-ФЗ ст. 5 ч. 2). Любая корреляция (phone↔name) уже
                // даёт PII-категорию.
                'req.body.phone',
                'req.body.passport',
                'req.body.passportNumber',
                'req.body.passportSeries',
                'req.body.inn',
                'req.body.snils',
                'req.body.driverLicense',
                'req.body.driverLicenseNumber',
                'req.body.licenseNumber',
                'req.body.medCertificate',
                'req.body.medCertificateNumber',
                // Array body shapes (bulk import / signup with nested user[])
                'req.body.users[*].phone',
                'req.body.users[*].passport',
                'req.body.users[*].inn',
                'req.body.drivers[*].phone',
                'req.body.drivers[*].passport',
                'req.body.drivers[*].inn',
                'req.body.drivers[*].driverLicense',
                'request.body.password',
                'request.body.credentials',
                'response.body.token',
            ],
            censor: '[REDACTED]',
        },
        ...(process.env.NODE_ENV !== 'production' ? {
            transport: {
                target: 'pino-pretty',
                options: { colorize: true },
            },
        } : {}),
    },
    // A-P0-7: stable request-id helps correlate logs <-> client-side reports.
    genReqId: (req) => (req.headers['x-request-id'] as string) || crypto.randomUUID(),
});

// A-P0-7: global error handler. Default Fastify echoes err.message to clients,
// which leaks PG constraint names + stack traces + internal error text. We
// hide all 5xx detail in production while keeping a server-side log with the
// request-id for tracing.
app.setErrorHandler((error: import('fastify').FastifyError, request, reply) => {
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : undefined;
    const isClientError = statusCode !== undefined && statusCode >= 400 && statusCode < 500;
    const message = error.message ?? 'Unknown error';
    if (isClientError) {
        // 4xx — caller's fault, original message is generally safe (Zod errors,
        // 404s, rate-limit). Forward as-is.
        return reply.status(statusCode).send({
            success: false,
            error: message,
            requestId: request.id,
        });
    }
    // 5xx — log full detail server-side, return generic message to caller.
    request.log.error({ err: error, reqId: request.id }, 'Unhandled server error');
    return reply.status(500).send({
        success: false,
        error: process.env.NODE_ENV === 'production'
            ? 'Внутренняя ошибка сервера'
            : message,
        requestId: request.id,
    });
});

// --- Plugins ---
// H-1: Security headers (D15 — proper CSP that still lets Swagger UI run).
// Swagger UI inlines its own bootstrap script and styles, so we keep
// 'unsafe-inline' for those two directives. All other directives are
// locked down to 'self'. If CSP ever causes issues for Swagger, gate it
// to non-/api/docs paths via a request hook.
await app.register(helmet, {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // swagger-ui needs inline
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
        },
    },
});

// H-2: CORS — multi-origin support for production.
// A-P2: refuse to start in production if no valid origins survive the
// filter. The old code silently fell back to `'http://localhost:3000'`
// when CORS_ORIGIN was malformed (typo, missing scheme, accidentally
// empty), which in prod meant cookies+credentials only worked from a
// dev URL nobody was on. Fail-fast surfaces the misconfig at boot,
// not at first user request.
const rawCorsOrigin = process.env.CORS_ORIGIN;
const corsOrigins = (rawCorsOrigin || 'http://localhost:3000')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.startsWith('http://') || s.startsWith('https://'));

if (corsOrigins.length === 0) {
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ FATAL: CORS_ORIGIN is set but contains no valid http(s) origins. Refusing to start.');
        process.exit(1);
    }
    // Dev: warn and fall back to localhost so the server still boots.
    console.warn('⚠️  CORS_ORIGIN has no valid http(s) origins; falling back to http://localhost:3000 (dev only).');
    corsOrigins.push('http://localhost:3000');
}

// ============================================================
// Госключ callback secret — production must have it set, иначе
// эндпоинт принимает любую подпись без HMAC-проверки externalId
// и становится открытым каналом инъекции поддельных подписей.
// ============================================================
if (process.env.NODE_ENV === 'production' && !process.env.GOSKLYUCH_CALLBACK_SECRET) {
    console.error('❌ FATAL: GOSKLYUCH_CALLBACK_SECRET is required in production. Refusing to start.');
    process.exit(1);
}
await app.register(multipart, {
    limits: {
        fileSize: 15 * 1024 * 1024,
        files: 5,
    },
});

await app.register(cors, {
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true, // Required for httpOnly cookies
});

// H-3: Rate limiting — brute-force protection.
// D22: keyed per-user when authenticated (separate bucket from anon IP).
// SSE co-pilot stream is a single long-lived connection per user, so we
// skip it via allowList to avoid eating their entire bucket on one chat.
await app.register(rateLimit, {
    global: true,
    max: RATE_LIMIT_MAX,
    timeWindow: RATE_LIMIT_WINDOW,
    keyGenerator: (request) => {
        const user = (request as { user?: { userId?: string } }).user;
        return user?.userId ? `user:${user.userId}` : `ip:${request.ip}`;
    },
    allowList: (request, _key) => {
        if (request.ip === '127.0.0.1' || request.ip === '::1') return true;
        // SSE co-pilot stream — long-lived connection.
        if (request.url.startsWith('/api/copilot/chat')) return true;
        return false;
    },
});

// --- Prometheus /metrics endpoint (OBS-1) ---
// Gated behind METRICS_ENABLED so we don't accidentally expose internal
// timings + queue depths in production. When enabled with basic-auth env
// vars set, the endpoint also requires the Prometheus scraper to send
// `Authorization: Basic ...`; without those vars it serves unauthenticated
// (assumes Prometheus and the API live on the same internal docker network).
const metricsEnabled = process.env.METRICS_ENABLED === 'true';
if (metricsEnabled) {
    const metricsUser = process.env.METRICS_BASIC_AUTH_USER;
    const metricsPass = process.env.METRICS_BASIC_AUTH_PASS;
    const metricsAuthRequired = Boolean(metricsUser && metricsPass);

    if (metricsAuthRequired) {
        app.addHook('onRequest', (request, reply, done) => {
            if (request.url !== '/metrics' && !request.url.startsWith('/metrics?')) {
                return done();
            }
            const header = request.headers.authorization;
            if (!header || !header.startsWith('Basic ')) {
                reply.header('WWW-Authenticate', 'Basic realm="metrics"');
                reply.status(401).send({ success: false, error: 'Требуется авторизация' });
                return;
            }
            try {
                const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
                const sep = decoded.indexOf(':');
                const user = sep >= 0 ? decoded.slice(0, sep) : decoded;
                const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
                if (user !== metricsUser || pass !== metricsPass) {
                    reply.header('WWW-Authenticate', 'Basic realm="metrics"');
                    reply.status(401).send({ success: false, error: 'Требуется авторизация' });
                    return;
                }
            } catch {
                reply.status(401).send({ success: false, error: 'Требуется авторизация' });
                return;
            }
            done();
        });
    }

    // The package exports its plugin via a CJS-style default whose TS
    // signature confuses fastify@5's overload resolution; cast around it.
    await app.register(metricsPlugin as unknown as Parameters<typeof app.register>[0], {
        endpoint: '/metrics',
        defaultMetrics: { enabled: true },
        routeMetrics: {
            enabled: true,
            registeredRoutesOnly: false,
            methodBlacklist: ['HEAD', 'OPTIONS'],
        },
    });
}

// --- Swagger / OpenAPI (русский) ---
const apiDocsEnabled = process.env.ENABLE_API_DOCS === 'true' || process.env.NODE_ENV !== 'production';
if (apiDocsEnabled) {
await app.register(import('@fastify/swagger'), {
    openapi: {
        info: {
            title: 'ТрансПульт API — Управление транспортом',
            description: 'REST API для системы управления грузоперевозками (ТрансПульт). Включает управление заявками, рейсами, автопарком, водителями, финансами, аналитикой и импортом данных.',
            version: '1.0.0',
            contact: { name: 'ТрансПульт Team', email: 'admin@tms.local' },
        },
        servers: [
            { url: 'http://localhost:4000', description: 'Локальная разработка' },
            { url: process.env.API_PUBLIC_URL || 'http://localhost:4000', description: 'Production API' },
        ],
        tags: [
            { name: 'Авторизация', description: 'Вход, выход, обновление токенов' },
            { name: 'Заявки', description: 'CRUD заявок на перевозку' },
            { name: 'Рейсы', description: 'Управление рейсами и маршрутами' },
            { name: 'Автопарк', description: 'Транспортные средства и водители' },
            { name: 'Осмотры', description: 'Технические и медицинские осмотры' },
            { name: 'Путевые листы', description: 'Формирование и учёт путевых листов' },
            { name: 'Ремонты', description: 'Обслуживание и ремонт ТС' },
            { name: 'Финансы', description: 'Счета, тарифы, KPI' },
            { name: 'Аналитика', description: 'Предиктивное ТО и маржинальность' },
            { name: 'Импорт', description: 'Массовый импорт данных (JSON/CSV)' },
            { name: 'Геозоны', description: 'Ограничительные зоны (МКАД, ТТК)' },
            { name: 'Синхронизация', description: 'Офлайн-синхронизация мобильного приложения' },
            { name: 'Уведомления', description: 'Push-уведомления и WebSocket' },
            { name: 'Аудит', description: 'Журнал событий append-only' },
            { name: 'Здоровье', description: 'Health check и readiness' },
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'tms_token',
                    description: 'JWT токен в httpOnly cookie (устанавливается при /auth/login)',
                },
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Bearer токен (для мобильного приложения)',
                },
            },
        },
    },
});
await app.register(import('@fastify/swagger-ui'), {
    routePrefix: '/api/docs',
    uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
        defaultModelsExpandDepth: 3,
        persistAuthorization: process.env.NODE_ENV !== 'production',
    },
});
}

// --- Auth ---
registerAuthRoutes(app);

// --- Module routes ---
await app.register(import('./modules/orders/routes.js'), { prefix: '/api' });
await app.register(import('./modules/trips/routes.js'), { prefix: '/api' });
await app.register(import('./modules/inspections/routes.js'), { prefix: '/api' });
await app.register(import('./modules/waybills/routes.js'), { prefix: '/api' });
await app.register(import('./modules/fleet/routes.js'), { prefix: '/api' });
await app.register(import('./modules/repairs/routes.js'), { prefix: '/api' });
// M-1: Fixed — was prefix: '' (inconsistent), now '/api' like all others
await app.register(import('./modules/finance/routes.js'), { prefix: '/api' });
await app.register(import('./modules/sync/routes.js'), { prefix: '/api' });
await app.register(import('./modules/geo/routes.js'), { prefix: '/api' });
await app.register(import('./integrations/routes.js'), { prefix: '/api' });
await app.register(import('./modules/notifications/routes.js'), { prefix: '/api' });
await app.register(import('./modules/import/routes.js'), { prefix: '/api' });
await app.register(import('./modules/analytics/routes.js'), { prefix: '/api' });
await app.register(import('./modules/settings/routes.js'), { prefix: '/api' });
await app.register(import('./modules/operations/routes.js'), { prefix: '/api' });

await app.register(import('./modules/documents/routes.js'), { prefix: '/api' });
// Госключ public callback — mobile app POSTs signed XML back here.
await app.register(import('./modules/signatures/gosklyuch-callback.js'), { prefix: '/api' });
// POST /transport-documents/:id/sign + GET /transport-documents/:id (polling)
await app.register(import('./modules/signatures/sign-endpoint.js'), { prefix: '/api' });
await app.register(import('./modules/sprint9/routes.js'), { prefix: '/api' });
await app.register(import('./modules/claims/routes.js'), { prefix: '/api' });
await app.register(import('./modules/uploads/routes.js'), { prefix: '/api' });
await app.register(import('./modules/cold-chain/routes.js'), { prefix: '/api' });
await app.register(import('./modules/rto/routes.js'), { prefix: '/api' });
await app.register(import('./modules/carriers/routes.js'), { prefix: '/api' });
// Wave 5: ADR / EDI / Driver scoring
await app.register(import('./modules/adr/routes.js'), { prefix: '/api' });
await app.register(import('./modules/edi/routes.js'), { prefix: '/api' });
await app.register(import('./modules/scoring/routes.js'), { prefix: '/api' });
// Phase 7: AI dispatcher co-pilot MVP
// Hidden behind AI_COPILOT_ENABLED feature flag (default OFF).
// Rationale: AI calls Anthropic with PII; until Jurist J-3 (AI DPA) is signed
// off and partner explicitly enables, endpoints must not exist → Fastify 404.
if (process.env.AI_COPILOT_ENABLED === 'true') {
    await app.register(import('./modules/copilot/routes.js'), { prefix: '/api' });
    app.log.info('[copilot] AI_COPILOT_ENABLED=true → routes registered');
} else {
    app.log.info('[copilot] AI_COPILOT_ENABLED!=true → routes NOT registered (404)');
}
// Round 1C: provider framework — credential management
await app.register(import('./modules/integrations/credentials/routes.js'), { prefix: '/api' });
// Round 1B: self-serve signup + onboarding wizard
await app.register(import('./modules/onboarding/routes.js'), { prefix: '/api' });
// Round 2B: monetization — plans, subscriptions, payments, usage
await app.register(import('./modules/billing/routes.js'), { prefix: '/api' });
// Round 2A: compliance breadth — tachograph DDD, ОСАГО, ЦРПТ, ADR strict mode
await app.register(import('./modules/compliance/routes.js'), { prefix: '/api' });
// ЭТрН 01.09.2026: МЧД (Машиночитаемые Доверенности) — реестр для подписания
await app.register(import('./modules/mchd/routes.js'), { prefix: '/api' });
// DPA (Data Processing Acceptances) — 152-ФЗ ст. 9 согласия per-provider
await app.register(import('./modules/dpa/routes.js'), { prefix: '/api' });
// Round 3B: D8 demo data generator + D10 audit log
await app.register(import('./modules/demo/routes.js'), { prefix: '/api' });
await app.register(import('./modules/audit/routes.js'), { prefix: '/api' });
await app.register(import('./integrations/websocket.js'), { prefix: '/api' });

// --- Health check ---
app.get('/api/health', { schema: { tags: ['Здоровье'], summary: 'Health check', description: 'Базовая проверка: API работает.' } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
}));

// --- Readiness check (DB + Redis) ---
app.get('/api/health/ready', { schema: { tags: ['Здоровье'], summary: 'Readiness check', description: 'Проверка готовности: БД + Redis.' } }, async (request) => {
    let dbOk = false;
    let redisOk = false;
    try {
        await rawSql`SELECT 1`;
        dbOk = true;
    } catch { }
    redisOk = await testRedisConnection(request.log);
    const status = dbOk && redisOk ? 'ok' : 'degraded';
    return { status, db: dbOk, redis: redisOk, timestamp: new Date().toISOString() };
});

// --- Local uploads static serving (dev only — in prod, MinIO serves files directly) ---
if (!process.env.S3_ENDPOINT && process.env.NODE_ENV !== 'production') {
    const { createReadStream } = await import('fs');
    const { resolve, relative } = await import('path');
    const { existsSync } = await import('fs');
    const uploadsDir = resolve(process.env.UPLOADS_DIR || './uploads');
    app.get('/uploads/*', async (request, reply) => {
        const requestedPath = (request.params as Record<string, string>)['*'] ?? '';
        const filePath = resolve(uploadsDir, requestedPath);
        const relativePath = relative(uploadsDir, filePath);
        if (relativePath.startsWith('..') || relativePath === '' || relativePath.includes('..\\') || relativePath.includes('../')) {
            return reply.status(403).send({ success: false, error: 'Доступ запрещён' });
        }
        if (!existsSync(filePath)) return reply.status(404).send({ success: false, error: 'Ресурс не найден' });
        return reply.send(createReadStream(filePath));
    });
}

// --- Request-ID correlation ---
app.addHook('onRequest', (request, reply, done) => {
    const reqId = (request.headers['x-request-id'] as string) || request.id;
    reply.header('x-request-id', reqId);
    done();
});

// --- BullMQ Workers ---
const redisOk = await testRedisConnection(app.log);
if (redisOk) {
    startWialonWorker(app.log);
    startFinesWorker(app.log);
    startNotificationWorker(app.log);
    startBillingWorker(app.log);
    startEdiWorker(app.log);
    await setupRepeatableJobs(app.log);
    app.log.info('🔄 BullMQ workers started (wialon, fines, notifications, billing, edi)');
    startPositionBroadcast(app.log, 10000); // Broadcast vehicle positions every 10s
    app.log.info('📡 Vehicle position WebSocket broadcast started');
} else {
    app.log.warn('⚠️ Redis unavailable — BullMQ workers disabled');
}

// --- Graceful Shutdown (L-1) ---
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
    process.on(signal, async () => {
        app.log.info(`Received ${signal}, shutting down gracefully...`);
        await stopWialonWorker();
        await stopFinesWorker();
        await stopNotificationWorker();
        await stopBillingWorker();
        await stopEdiWorker();
        stopPositionBroadcast();
        await app.close();
        process.exit(0);
    });
}

// --- Start ---
const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

try {
    // Ensure append-only triggers are applied (idempotent — uses CREATE OR REPLACE)
    await rawSql.unsafe(APPEND_ONLY_TRIGGER_SQL);
    app.log.info('🔒 Append-only triggers verified');

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`🚛 TMS API running at http://${HOST}:${PORT}`);
} catch (err) {
    app.log.error(err);
    process.exit(1);
}

export default app;
