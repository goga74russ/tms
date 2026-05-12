/**
 * export-openapi.ts
 * ---------------------------------------------------------------------------
 * Boots the Fastify app in "spec-only" mode (no listen, no workers, no Redis),
 * registers every route plugin in the same order as `src/server.ts`, then
 * dumps the resulting OpenAPI document to disk.
 *
 * Outputs (relative to repo root):
 *   - docs/api/openapi.json — pretty-printed OpenAPI 3.1 spec
 *   - docs/api/openapi.md   — human-readable route index grouped by tag
 *
 * Usage:
 *   pnpm --filter @tms/api openapi:export
 *
 * Notes:
 *   - We set fake env vars at the very top of execution, BEFORE any project
 *     module is imported. To preserve that ordering under ESM (where static
 *     `import` is hoisted), every project import is done dynamically inside
 *     main(). Static imports here are limited to third-party modules + node
 *     stdlib that don't transitively pull in our env-sensitive code paths.
 *   - We deliberately do NOT import src/server.ts because that file calls
 *     app.listen() and starts BullMQ workers at module-load time. Instead we
 *     re-create the plugin sequence here.
 */

// --- Fake env vars (must happen before any project import) ---
process.env.NODE_ENV ??= 'development';
process.env.JWT_SECRET ??= 'export-dummy-secret-32-chars-long-aaaa';
process.env.DATABASE_URL ??= 'postgres://localhost:5432/tms_export';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.CREDENTIALS_KEY ??= 'a'.repeat(64); // 64 hex chars = 32 bytes
process.env.CORS_ORIGIN ??= 'http://localhost:3000';
process.env.LOG_LEVEL ??= 'silent';

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Build the Fastify instance with swagger enabled.
// ---------------------------------------------------------------------------
async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });

    await app.register(import('@fastify/swagger'), {
        openapi: {
            info: {
                title: 'TMS API — Управление транспортом',
                description:
                    'REST API для системы управления грузоперевозками (TMS). Включает управление заявками, рейсами, автопарком, водителями, финансами, аналитикой и импортом данных.',
                version: '1.0.0',
                contact: { name: 'TMS Team', email: 'admin@tms.local' },
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
                        description: 'JWT токен в httpOnly cookie',
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

    await app.register(import('@fastify/multipart'));

    // Auth (no prefix — /auth/login etc.)
    const { registerAuthRoutes } = await import('../src/auth/auth.js');
    registerAuthRoutes(app);

    // Module routes — kept in lock-step with src/server.ts.
    // Dynamic imports preserve the env-vars-first ordering above.
    // We pass the resolved module's default export to app.register, matching
    // what `await app.register(import('...'))` does in server.ts.
    const moduleSpecs: string[] = [
        '../src/modules/orders/routes.js',
        '../src/modules/trips/routes.js',
        '../src/modules/inspections/routes.js',
        '../src/modules/waybills/routes.js',
        '../src/modules/fleet/routes.js',
        '../src/modules/repairs/routes.js',
        '../src/modules/finance/routes.js',
        '../src/modules/sync/routes.js',
        '../src/modules/geo/routes.js',
        '../src/integrations/routes.js',
        '../src/modules/notifications/routes.js',
        '../src/modules/import/routes.js',
        '../src/modules/analytics/routes.js',
        '../src/modules/settings/routes.js',
        '../src/modules/operations/routes.js',
        '../src/modules/documents/routes.js',
        '../src/modules/sprint9/routes.js',
        '../src/modules/claims/routes.js',
        '../src/modules/uploads/routes.js',
        '../src/modules/cold-chain/routes.js',
        '../src/modules/rto/routes.js',
        '../src/modules/carriers/routes.js',
        '../src/modules/adr/routes.js',
        '../src/modules/edi/routes.js',
        '../src/modules/scoring/routes.js',
        '../src/modules/copilot/routes.js',
        '../src/modules/integrations/credentials/routes.js',
        '../src/modules/onboarding/routes.js',
        '../src/modules/billing/routes.js',
        '../src/modules/compliance/routes.js',
        '../src/modules/demo/routes.js',
        '../src/modules/audit/routes.js',
    ];

    // Pre-load all module specs so static analysis sees them.
    // We use the module-relative resolver via dynamic import().
    // Each module's default export is its Fastify plugin.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loaded: any[] = [];
    for (const spec of moduleSpecs) {
        // @vite-ignore — variable specifier is intentional
        loaded.push(await import(spec));
    }
    for (let i = 0; i < loaded.length; i++) {
        const mod = loaded[i];
        const plugin = mod.default ?? mod;
        try {
            await app.register(plugin, { prefix: '/api' });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`[skipped] ${moduleSpecs[i]}: ${(err as Error).message}`);
        }
    }

    app.get('/api/health', { schema: { tags: ['Здоровье'], summary: 'Health check' } }, async () => ({ status: 'ok' }));
    app.get('/api/health/ready', { schema: { tags: ['Здоровье'], summary: 'Readiness check' } }, async () => ({ status: 'ok' }));

    await app.ready();
    return app;
}

// ---------------------------------------------------------------------------
// Render markdown index from the spec.
// ---------------------------------------------------------------------------
type OASpec = {
    info: { title: string; version: string; description?: string };
    tags?: Array<{ name: string; description?: string }>;
    paths: Record<string, Record<string, { tags?: string[]; summary?: string; description?: string }>>;
};

function renderMarkdown(spec: OASpec): string {
    const lines: string[] = [];
    lines.push(`# ${spec.info.title}`);
    lines.push('');
    lines.push('> Auto-generated from `apps/api/scripts/export-openapi.ts` — do not edit by hand.');
    lines.push('> Regenerate with: `pnpm --filter @tms/api openapi:export`');
    lines.push('');
    lines.push(`**Version:** ${spec.info.version}`);
    if (spec.info.description) {
        lines.push('');
        lines.push(spec.info.description);
    }
    lines.push('');

    const byTag = new Map<string, Array<{ method: string; path: string; summary: string }>>();
    const UNTAGGED = '_untagged';
    for (const [path, methods] of Object.entries(spec.paths || {})) {
        for (const [method, op] of Object.entries(methods)) {
            const tag = (op.tags && op.tags[0]) || UNTAGGED;
            const entry = { method: method.toUpperCase(), path, summary: op.summary || '' };
            if (!byTag.has(tag)) byTag.set(tag, []);
            byTag.get(tag)!.push(entry);
        }
    }

    const declared = (spec.tags || []).map((t) => t.name);
    const seen = new Set<string>();
    const orderedTags: string[] = [];
    for (const t of declared) {
        if (byTag.has(t)) {
            orderedTags.push(t);
            seen.add(t);
        }
    }
    for (const t of byTag.keys()) {
        if (!seen.has(t) && t !== UNTAGGED) {
            orderedTags.push(t);
            seen.add(t);
        }
    }
    if (byTag.has(UNTAGGED)) orderedTags.push(UNTAGGED);

    let totalRoutes = 0;
    for (const tag of orderedTags) totalRoutes += byTag.get(tag)!.length;

    lines.push(`**Total routes:** ${totalRoutes} across ${orderedTags.length} tag(s).`);
    lines.push('');
    lines.push('## Tag index');
    lines.push('');
    // GitHub-flavored anchor slugs: lowercase, keep unicode letters/numbers,
    // collapse whitespace/punctuation to "-".
    const slugify = (s: string): string =>
        s
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, '')
            .trim()
            .replace(/\s+/g, '-');
    for (const tag of orderedTags) {
        const label = tag === UNTAGGED ? '(untagged)' : tag;
        lines.push(`- [${label}](#${slugify(label)}) — ${byTag.get(tag)!.length} route(s)`);
    }
    lines.push('');

    for (const tag of orderedTags) {
        const label = tag === UNTAGGED ? '(untagged)' : tag;
        const tagMeta = (spec.tags || []).find((t) => t.name === tag);
        lines.push(`## ${label}`);
        if (tagMeta?.description) {
            lines.push('');
            lines.push(`_${tagMeta.description}_`);
        }
        lines.push('');
        lines.push('| Method | Path | Summary |');
        lines.push('| --- | --- | --- |');
        const rows = byTag.get(tag)!.slice().sort((a, b) =>
            a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path),
        );
        for (const r of rows) {
            lines.push(`| \`${r.method}\` | \`${r.path}\` | ${r.summary || ''} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // scripts/ → apps/api → apps → repo root
    const repoRoot = resolve(__dirname, '..', '..', '..');
    const outDir = resolve(repoRoot, 'docs', 'api');
    mkdirSync(outDir, { recursive: true });

    const app = await buildApp();
    try {
        const spec = app.swagger() as OASpec;
        const jsonPath = resolve(outDir, 'openapi.json');
        const mdPath = resolve(outDir, 'openapi.md');
        writeFileSync(jsonPath, JSON.stringify(spec, null, 2) + '\n', 'utf8');
        writeFileSync(mdPath, renderMarkdown(spec), 'utf8');
        const routeCount = Object.values(spec.paths || {}).reduce((n, m) => n + Object.keys(m).length, 0);
        // eslint-disable-next-line no-console
        console.log(`OpenAPI export: ${routeCount} routes`);
        // eslint-disable-next-line no-console
        console.log(`  → ${jsonPath}`);
        // eslint-disable-next-line no-console
        console.log(`  → ${mdPath}`);
    } finally {
        await app.close();
    }
}

main().then(
    () => process.exit(0),
    (err) => {
        // eslint-disable-next-line no-console
        console.error('OpenAPI export failed:', err);
        process.exit(1);
    },
);
