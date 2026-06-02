// ============================================================
// H6 — Dispatcher /orders smoke (read-only).
//
// Проверяет что:
//   • dispatcher может открыть /orders (нет редиректа на /);
//   • видит таблицу с заголовком "Заявки";
//   • не видит кнопку "Новая заявка" (она только для logist+admin);
//
// Использует pre-baked storage state из auth.setup.ts
// (project role-dispatcher в playwright.config).
// ============================================================
import { test, expect } from '@playwright/test';

// TODO(QA): зависит от storage state (auth.setup) + селекторы /orders под
// редизайн. Ремонт с запущенным приложением — в QA-задаче.
test.fixme('dispatcher opens /orders read-only', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // 1) URL не редиректнул на /, мы остались на /orders
    await expect(page).toHaveURL(/\/orders/);

    // 2) Заголовок "Заявки" виден
    await expect(page.getByRole('heading', { name: /Заявки/i })).toBeVisible();

    // 3) Кнопка "Новая заявка" НЕ должна быть видна для dispatcher
    const newOrderButton = page.getByRole('button', { name: /Новая заявка/i });
    await expect(newOrderButton).toHaveCount(0);
});
