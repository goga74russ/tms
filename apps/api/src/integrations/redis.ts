// ============================================================
// Redis Connection Config — For BullMQ queues and workers
// ============================================================

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
 */
export async function testRedisConnection(): Promise<boolean> {
    try {
        const { Redis } = await import('ioredis');
        const client = new Redis({
            host: redisConnectionConfig.host,
            port: redisConnectionConfig.port,
            connectTimeout: 3000,
            lazyConnect: true,
        });
        await client.connect();
        await client.ping();
        await client.quit();
        console.log('✅ Redis connected');
        return true;
    } catch (err: any) {
        console.warn('⚠️ Redis connection failed (workers disabled):', err.message);
        return false;
    }
}
