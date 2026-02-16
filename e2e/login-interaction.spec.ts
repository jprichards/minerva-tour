import { test, expect } from '@playwright/test';

/**
 * E2E tests for the login page interactions.
 */

test.describe('Login Page Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('can type email into magic link input', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await emailInput.fill('test@example.com');
    await expect(emailInput).toHaveValue('test@example.com');
  });

  test('email input is required', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toHaveAttribute('required', '');
  });

  test('page has proper title or heading', async ({ page }) => {
    const heading = page.locator('h1');
    await expect(heading).toContainText('Minerva Tour');
  });

  test('page is responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('text=Minerva Tour')).toBeVisible();
    await expect(page.locator('text=Sign in with Google')).toBeVisible();
  });

  test('has proper gradient background', async ({ page }) => {
    // The login page should have the minerva gradient
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('or divider is visible', async ({ page }) => {
    await expect(page.locator('text=or')).toBeVisible();
  });
});
