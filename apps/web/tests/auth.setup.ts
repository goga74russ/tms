// ============================================================
// F2 — Playwright setup project: логинит каждую роль и сохраняет
// storage state. Запускается один раз перед всеми тестами через
// projects.dependencies в playwright.config.ts.
//
// На каждом запуске пересоздаёт .auth/<role>.json — это намеренно,
// чтобы тесты не использовали устаревшую сессию (например после
// смены JWT_SECRET на сервере).
// ============================================================
import { promises as fs } from 'node:fs';
import { test as setup } from '@playwright/test';
import { ROLE_USERS, SEED_PASSWORD, AUTH_DIR, storageStateFor } from './fixtures/auth';

setup('authenticate all roles', async ({ browser }) => {
    await fs.mkdir(AUTH_DIR, { recursive: true });

    for (const ru of ROLE_USERS) {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
            await page.goto('/login');
            await page.getByPlaceholder('admin@tms.local').fill(ru.email);
            await page.locator('input[type="password"]').fill(SEED_PASSWORD);
            await page.getByRole('button', { name: /Войти в систему/i }).click();
            await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });

            // Save cookies + localStorage в файл — Playwright переиспользует его
            // при test.use({ storageState }) или project.use.storageState.
            await context.storageState({ path: storageStateFor(ru.role) });
            console.log(`  ✅ ${ru.role.padEnd(16)} (${ru.email}) → ${storageStateFor(ru.role)}`);
        } catch (err) {
            // Не валим весь setup из-за одной роли — пишем error и идём дальше.
            // Тесты для упавшей роли упадут на запросе storageState.
            console.error(`  ❌ ${ru.role}: ${(err as Error).message}`);
        } finally {
            await context.close();
        }
    }
});
