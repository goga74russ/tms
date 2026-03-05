import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://tms:tms@localhost:5433/tms';

const sql = postgres(connectionString, {
    max: 20,
    idle_timeout: 20,       // Close idle connections after 20s
    connect_timeout: 10,    // Fail connection attempt after 10s
    max_lifetime: 60 * 30,  // Recycle connections every 30 min
});
export const db = drizzle(sql, { schema });
export { sql };
