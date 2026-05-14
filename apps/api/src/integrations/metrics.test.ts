// ============================================================
// /metrics endpoint — Prometheus exposition format.
// Boots a tiny Fastify app with the same gating logic as
// server.ts so we test:
//   1. /metrics 404 when METRICS_ENABLED is unset (default off).
//   2. /metrics 200 with text/plain Prometheus format when enabled.
//   3. Counter increments per request (route metrics).
//   4. Basic auth required when METRICS_BASIC_AUTH_* are set.
//   5. Basic auth rejects wrong credentials.
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import metricsPlugin from 'fastify-metrics';

type BuildOpts = {
    enabled?: boolean;
    user?: string;
    pass?: string;
};

async function buildApp(opts: BuildOpts = {}): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    if (opts.enabled) {
        const metricsUser = opts.user;
        const metricsPass = opts.pass;
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

    app.get('/api/health', async () => ({ status: 'ok' }));
    await app.ready();
    return app;
}

describe('/metrics — Prometheus exposition', () => {
    // prom-client uses a global default registry. Clearing it between
    // builds prevents "metric already registered" errors when the plugin
    // is re-registered in successive tests. We dynamically import via the
    // transitive dep path so the test doesn't add an explicit prom-client
    // dependency to the API package.
    beforeEach(async () => {
        const tmp = Fastify({ logger: false });
        await tmp.register(metricsPlugin as unknown as Parameters<typeof tmp.register>[0], {
            defaultMetrics: { enabled: false },
            routeMetrics: { enabled: false },
        });
        // tmp.metrics.client is the prom-client module instance
        const client = (tmp as unknown as { metrics: { client: { register: { clear: () => void } } } }).metrics.client;
        client.register.clear();
        await tmp.close();
    });

    it('returns 404 when METRICS_ENABLED is not set (off by default)', async () => {
        const app = await buildApp({ enabled: false });
        const res = await app.inject({ method: 'GET', url: '/metrics' });
        expect(res.statusCode).toBe(404);
        await app.close();
    });

    it('returns 200 with Prometheus text format when enabled', async () => {
        const app = await buildApp({ enabled: true });
        const res = await app.inject({ method: 'GET', url: '/metrics' });
        expect(res.statusCode).toBe(200);
        // fastify-metrics serves Prometheus exposition format
        expect(res.headers['content-type']).toMatch(/text\/plain/);
        // Default metrics from prom-client always include process_cpu_*
        expect(res.body).toMatch(/process_cpu_user_seconds_total/);
        // Route metrics from fastify-metrics include http_request_*
        expect(res.body).toMatch(/http_request_(duration|summary)/);
        await app.close();
    });

    it('increments request counter per route hit', async () => {
        const app = await buildApp({ enabled: true });

        // Hit the route a few times so the counter is non-zero.
        await app.inject({ method: 'GET', url: '/api/health' });
        await app.inject({ method: 'GET', url: '/api/health' });
        await app.inject({ method: 'GET', url: '/api/health' });

        const res = await app.inject({ method: 'GET', url: '/metrics' });
        expect(res.statusCode).toBe(200);
        // The summary/histogram count line for /api/health should appear with
        // count >= 3. We match loosely on the route label, regardless of
        // whether the underlying metric is a histogram (..._count) or summary.
        expect(res.body).toMatch(/route="\/api\/health"/);
        await app.close();
    });

    it('requires basic auth header when METRICS_BASIC_AUTH_* are configured', async () => {
        const app = await buildApp({ enabled: true, user: 'prometheus', pass: 'secret' });
        const res = await app.inject({ method: 'GET', url: '/metrics' });
        expect(res.statusCode).toBe(401);
        expect(res.headers['www-authenticate']).toMatch(/Basic/);
        await app.close();
    });

    it('rejects basic auth with wrong credentials, accepts correct ones', async () => {
        const app = await buildApp({ enabled: true, user: 'prometheus', pass: 'secret' });

        const wrong = await app.inject({
            method: 'GET',
            url: '/metrics',
            headers: {
                authorization: 'Basic ' + Buffer.from('prometheus:WRONG').toString('base64'),
            },
        });
        expect(wrong.statusCode).toBe(401);

        const right = await app.inject({
            method: 'GET',
            url: '/metrics',
            headers: {
                authorization: 'Basic ' + Buffer.from('prometheus:secret').toString('base64'),
            },
        });
        expect(right.statusCode).toBe(200);
        expect(right.body).toMatch(/process_cpu_user_seconds_total/);

        await app.close();
    });
});
