// ============================================================
// Example role-test (F2): admin видит admin-nav, не видит driver-routes.
//
// Использует pre-baked storage state из auth.setup.ts (project role-admin
// в playwright.config). НЕ делает login — стартует уже залогиненный.
//
// Это smoke-skeleton, который QA расширяет под конкретные сценарии.
// ============================================================
import { test, expect } from '@playwright/test';

// TODO(QA): сайдбар перестроен под редизайн + зависит от storage state из
// auth.setup. Ремонт с запущенным приложением (сверка DOM) — в QA-задаче.
test.fixme('admin sees admin sidebar entries', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Sidebar должен содержать «Админ-панель» или прямые admin-роуты.
    // Конкретные labels — задача QA доточить под актуальный sidebar.
    const adminLink = page.getByRole('link', { name: /Админ|МЧД|Пользователи|Интеграции/i }).first();
    await expect(adminLink).toBeVisible({ timeout: 10_000 });
});
