// ============================================================
// H6 — Logist /orders smoke (full access).
//
// Проверяет что:
//   • logist видит "Новая заявка" на /orders (квик-акшен для logist+admin);
//   • в sidebar есть и "Заявки" (→ /orders), и "Канбан логиста" (→ /logist);
//
// Использует pre-baked storage state из auth.setup.ts
// (project role-logist в playwright.config).
// ============================================================
import { test, expect } from '@playwright/test';

// TODO(QA): зависит от storage state (auth.setup) + селекторы /orders + sidebar
// под редизайн. Ремонт с запущенным приложением — в QA-задаче.
test.fixme('logist sees create-order CTA on /orders and both nav entries', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/orders/);
    await expect(page.getByRole('heading', { name: /Заявки/i })).toBeVisible();

    // 1) Кнопка "Новая заявка" видна для logist
    await expect(page.getByRole('button', { name: /Новая заявка/i })).toBeVisible();

    // 2) Sidebar содержит обе ссылки — /orders (table) и /logist (kanban)
    await expect(page.getByRole('link', { name: 'Заявки' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Канбан логиста/i })).toBeVisible();
});
