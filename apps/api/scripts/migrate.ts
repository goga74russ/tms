// ============================================================
// P0-INFRA1 — надёжный мигратор (raw), не зависящий от drizzle journal.
//
// Проблема: meta/_journal.json отставал от файлов 0029–0037, а
// `drizzle-kit migrate` применяет ТОЛЬКО то, что в журнале → CI-джобы
// (playwright/smoke-chain) и `db:migrate` у разработчиков накатывали
// устаревшую схему (без invoice rebuild и пр.). Прод не страдал, т.к.
// scripts/deploy.sh использует свой раннер по `ls *.sql`.
//
// Этот скрипт делает то же, что test/integration/setup.ts:applyMigrationsRaw —
// единый источник истины для миграций. Идемпотентен (трекинг в
// drizzle.__drizzle_migrations). Снимает BOM, бьёт по statement-breakpoint.
// ============================================================
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, '../drizzle');

async function main() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        console.error('DATABASE_URL is required');
        process.exit(1);
    }
    const client = postgres(url, { max: 1, onnotice: () => { /* silence "already exists" */ } });
    try {
        await client.unsafe(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
        await client.unsafe(`
            CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL,
                created_at bigint
            )
        `);

        const files = readdirSync(MIGRATIONS_DIR)
            .filter((f) => /^\d{4}_.+\.sql$/.test(f))
            .sort();

        const appliedRows = await client<{ hash: string }[]>`
            SELECT hash FROM "drizzle"."__drizzle_migrations"
        `;
        const applied = new Set(appliedRows.map((r) => r.hash));

        let count = 0;
        for (const file of files) {
            const tag = file.replace(/\.sql$/, '');
            if (applied.has(tag)) continue;

            let body = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');
            if (body.charCodeAt(0) === 0xFEFF) body = body.slice(1); // strip BOM

            const statements = body
                .split('--> statement-breakpoint')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);

            for (const stmt of statements) {
                await client.unsafe(stmt);
            }
            await client`
                INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
                VALUES (${tag}, ${Date.now()})
            `;
            count += 1;
            console.log(`✓ applied ${tag}`);
        }

        // Append-only триггеры (как server.ts на старте).
        const { APPEND_ONLY_TRIGGER_SQL } = await import('../src/db/triggers.js');
        await client.unsafe(APPEND_ONLY_TRIGGER_SQL);

        console.log(count === 0 ? 'No pending migrations.' : `Applied ${count} migration(s).`);
    } finally {
        await client.end({ timeout: 5 });
    }
}

main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
