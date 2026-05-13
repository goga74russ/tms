// ============================================================
// Redis Connection Config — For BullMQ queues and workers
// ============================================================
import type { FastifyBaseLogger } from 'fastify';

/**
 * Redis connection options for BullMQ.
 * BullMQ bundles its own ioredis, so we pass raw config
 * instead of an IORedis instance to avoid version mismatches.
 */
const redisUrl = process.env.REDIS_URL ? new URL(process.env.REDIS_URL) : null;

export const redisConnectionConfig = {
    host: redisUrl?.hostname || process.env.REDIS_HOST || 'localhost',
    port: parseInt(redisUrl?.port || process.env.REDIS_PORT || '6379', 10),
    password: redisUrl?.password || process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null as null, // Required by BullMQ
};

/**
 * Test Redis connectivity by attempting a simple ping.
 *
 * @param logger Optional pino logger (FastifyBaseLogger). When provided, all
 *               connectivity messages are routed through it. When omitted (e.g.
 *               during very early bootstrap before `app.log` exists) we fall
 *               back to `console` — this is the only acceptable use of console
 *               in this file.
 */
export async function testRedisConnection(logger?: FastifyBaseLogger): Promise<boolean> {
    try {
        const { Redis } = await import('ioredis');
        const client = new Redis({
            host: redisConnectionConfig.host,
            port: redisConnectionConfig.port,
            password: redisConnectionConfig.password,
            connectTimeout: 3000,
            lazyConnect: true,
        });
        await client.connect();
        await client.ping();
        await client.quit();
        if (logger) {
            logger.info('Redis connected');
        } else {
            // Bootstrap-only fallback (pre-logger).
            console.info('✅ Redis connected');
        }
        return true;
    } catch (err: any) {
        if (logger) {
            logger.warn({ err }, 'Redis connection failed (workers disabled)');
        } else {
            // Bootstrap-only fallback (pre-logger).
            console.warn('⚠️ Redis connection failed (workers disabled):', err.message);
        }
        return false;
    }
}
