// ============================================================
// Password primitives — bcrypt hash/verify
// ============================================================
// Вынесено из auth.ts намеренно: auth.ts на уровне модуля делает
// process.exit(1) при отсутствии JWT_SECRET и тянет db/fastify/providers.
// Любой импорт из auth.ts ради verifyPassword платил бы этим сайд-эффектом
// (ломая, например, unit-тесты inspections/service без JWT_SECRET).
// Здесь — только bcryptjs, без сайд-эффектов. auth.ts ре-экспортирует это.
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}
