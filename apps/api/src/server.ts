// ============================================================
// TMS — Fastify Server Entry Point
// ============================================================
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { registerAuthRoutes } from './auth/auth.js';
import { testRedisConnection } from './integrations/redis.js';
import { setupRepeatableJobs } from './integrations/queues.js';
import { startWialonWorker, stopWialonWorker } from './integrations/workers/wialon.worker.js';
import { startFinesWorker, stopFinesWorker } from './integrations/workers/fines.worker.js';
import { startNotificationWorker, stopNotificationWorker } from './integrations/workers/notification.worker.js';
import { startPositionBroadcast, stopPositionBroadcast } from './integrations/websocket.js';
import { sql as rawSql } from './db/connection.js';
import { APPEND_ONLY_TRIGGER_SQL } from './db/triggers.js';

const app = Fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        ...(process.env.NODE_ENV !== 'production' ? {
            transport: {
                target: 'pino-pretty',
                options: { colorize: true },
            },
        } : {}),
    },
});

// --- Plugins ---
// H-1: Security headers
await app.register(helmet, {
    contentSecurityPolicy: false, // disable CSP for API-only server
});

// H-2: CORS — multi-origin support for production
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map(s => s.trim());
await app.register(cors, {
    origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
    credentials: true, // Required for httpOnly cookies
});

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
await app.register(import('./integrations/websocket.js'), { prefix: '/api' });

// --- Health check ---
app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
}));

// --- Readiness check (DB + Redis) ---
app.get('/api/health/ready', async () => {
    let dbOk = false;
    let redisOk = false;
    try {
        await rawSql`SELECT 1`;
        dbOk = true;
    } catch { }
    redisOk = await testRedisConnection();
    const status = dbOk && redisOk ? 'ok' : 'degraded';
    return { status, db: dbOk, redis: redisOk, timestamp: new Date().toISOString() };
});

// --- Request-ID correlation ---
app.addHook('onRequest', (request, reply, done) => {
    const reqId = (request.headers['x-request-id'] as string) || request.id;
    reply.header('x-request-id', reqId);
    done();
});

// --- BullMQ Workers ---
const redisOk = await testRedisConnection();
if (redisOk) {
    startWialonWorker();
    startFinesWorker();
    startNotificationWorker();
    await setupRepeatableJobs();
    app.log.info('🔄 BullMQ workers started (wialon, fines, notifications)');
    startPositionBroadcast(10000); // Broadcast vehicle positions every 10s
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
