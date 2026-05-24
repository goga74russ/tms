// ============================================================
// F2 — Auth fixtures для Playwright multi-role смок-тестов.
//
// Зачем: вместо full-login в каждом тесте, мы один раз залогиниваем
// каждую роль через `auth.setup.ts` (см. playwright.config projects)
// и сохраняем cookies/storage в файлы под tests/.auth/<role>.json.
// Тесты потом подключают готовое состояние через:
//
//   import { storageStateFor, ROLE_USERS } from '../fixtures/auth';
//   test.use({ storageState: storageStateFor('admin') });
//
// Или через project-уровень в playwright.config:
//   { name: 'admin-tests', use: { storageState: storageStateFor('admin') } }
//
// Источник аккаунтов — apps/api/src/db/seed-demo.ts (F1).
// ============================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Корневой каталог для storage state файлов (gitignored). */
export const AUTH_DIR = path.resolve(__dirname, '..', '.auth');

/** Пароль ставится через env, дефолт совпадает с seed-demo.ts. */
export const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? 'demo1234';

/** Реестр ролей, для каждой — email из seed-demo + краткое описание. */
export interface RoleUser {
    /** Имя роли — используется как ключ в storage-state файле. */
    role: string;
    email: string;
    /** Какой organization принадлежит — для cross-org-leak тестов. */
    orgScope: 'org-a' | 'org-b' | 'super-admin';
    /** Куда пользователь приземляется по дефолту после login. */
    expectedLanding?: string;
}

export const ROLE_USERS: RoleUser[] = [
    { role: 'super', email: 'super@tms.local', orgScope: 'super-admin' },
    { role: 'admin', email: 'admin@tms.local', orgScope: 'org-a', expectedLanding: '/admin' },
    { role: 'logist', email: 'logist@tms.local', orgScope: 'org-a', expectedLanding: '/logist' },
    { role: 'dispatcher', email: 'dispatcher@tms.local', orgScope: 'org-a', expectedLanding: '/dispatcher' },
    { role: 'mechanic', email: 'mechanic@tms.local', orgScope: 'org-a', expectedLanding: '/mechanic' },
    { role: 'medic', email: 'medic@tms.local', orgScope: 'org-a', expectedLanding: '/medic' },
    { role: 'manager', email: 'manager@tms.local', orgScope: 'org-a' },
    { role: 'accountant', email: 'accountant@tms.local', orgScope: 'org-a', expectedLanding: '/finance' },
    { role: 'repair', email: 'repair@tms.local', orgScope: 'org-a', expectedLanding: '/repair' },
    { role: 'driver1', email: 'driver1@tms.local', orgScope: 'org-a' },
    // Org-B для cross-org-leak тестов
    { role: 'admin_org_b', email: 'admin@org-b.local', orgScope: 'org-b', expectedLanding: '/admin' },
    { role: 'logist_org_b', email: 'logist@org-b.local', orgScope: 'org-b' },
];

/** Путь до сохранённого storage state для конкретной роли. */
export function storageStateFor(role: string): string {
    return path.join(AUTH_DIR, `${role}.json`);
}

/**
 * Найти RoleUser по короткому имени роли. Бросает если не нашёл —
 * чтобы тесты не пропускали опечатки в названии.
 */
export function findRole(role: string): RoleUser {
    const found = ROLE_USERS.find((r) => r.role === role);
    if (!found) throw new Error(`Unknown role for storage state: ${role}. См. fixtures/auth.ts`);
    return found;
}
