import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL environment variable is required');

// B5.1: pool + timeouts.
//   • max=40 — было 20, под пилот 5-10 одновременных диспетчеров с тяжёлым
//     /dossier (12+ queries per click) пул упирался.
//   • statement_timeout=30s — каждая query имеет hard limit. Без этого
//     одна повисшая query держит соединение бесконечно → pool exhaust → 503.
//   • idle_in_transaction_session_timeout=60s — pre-commit транзакция,
//     которую забыли закрыть (например, после уронённого worker job),
//     не блокирует строки остальным.
// TODO(B5.3): HTTP keep-alive Agent для outbound fetch (Diadoc/Wialon/ФНС/Госключ).
// Требует `pnpm add undici` + `setGlobalDispatcher(new Agent({ keepAlive… }))` в
// server.ts перед регистрацией провайдеров. Сейчас каждый outbound вызов делает
// новый TLS handshake (~40-80ms overhead). Отложено до решения партнёра по deps.

const sql = postgres(connectionString, {
    max: 40,
    idle_timeout: 20,
    connect_timeout: 10,
    max_lifetime: 60 * 30,
    connection: {
        // milliseconds — postgres-js передаёт сразу в startup-параметры PG.
        statement_timeout: 30_000,
        idle_in_transaction_session_timeout: 60_000,
    },
});
export const db = drizzle(sql, { schema });
export { sql };
