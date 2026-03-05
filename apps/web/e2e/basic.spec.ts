import { test, expect } from '@playwright/test';

test.describe('TMS Web Application - E2E flows', () => {

    test('Logist should be able to create a new order', async ({ page }) => {
        // 1. Navigate to Logist page
        await page.goto('/logist');

        // 2. Click on "Новая заявка" to open the form
        await page.click('button:has-text("Новая заявка")');

        // 3. Fill the order details
        await page.fill('input[placeholder="Например: ООО Ромашка"]', 'ООО Тест Клиент');
        await page.fill('input[placeholder="Откуда"]', 'Москва, ул. Ленина, 1');
        await page.fill('input[placeholder="Куда"]', 'Санкт-Петербург, Невский пр-т');
        await page.fill('input[placeholder="Вес, т"]', '2.5');
        await page.fill('input[placeholder="Объем, м³"]', '10');

        // 4. Click Submit
        await page.click('button:has-text("Создать")');

        // 5. Verify that it was created (e.g., success toast appears or queue increments)
        // Wait for the UI to update
        const toast = page.locator('text=Заявка создана успешно');
        if (await toast.isVisible()) {
            await expect(toast).toBeVisible();
        } else {
            // Fallback: check if the new order is present in the table or list
            await expect(page.locator('text=Тест Клиент').first()).toBeVisible({ timeout: 5000 });
        }
    });

});
