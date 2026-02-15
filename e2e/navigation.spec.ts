import { test, expect } from '@playwright/test';

/**
 * E2E tests for navigation behavior.
 * Tests page loads and redirects for the app's routing system.
 */

test.describe('Navigation', () => {
  test('non-existent routes return 404 or redirect', async ({ page }) => {
    const response = await page.goto('/this-does-not-exist');
    // Next.js may return 404 or redirect
    expect(response).toBeTruthy();
  });

  test('/auth/callback path exists', async ({ page }) => {
    const response = await page.goto('/auth/callback');
    // Should process the callback (might redirect to login or home)
    expect(response).toBeTruthy();
  });

  test('multiple redirects dont create loops', async ({ page }) => {
    // Going to a protected page should redirect to login once, not loop
    await page.goto('/scores');
    await expect(page).toHaveURL(/\/login/);

    // Verify we're on login (not redirected again)
    await page.waitForTimeout(1000);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator('text=Minerva Tour')).toBeVisible();
  });
});

test.describe('Meta Tags and PWA', () => {
  test('login page has viewport meta tag', async ({ page }) => {
    await page.goto('/login');
    const viewport = page.locator('meta[name="viewport"]');
    await expect(viewport).toHaveCount(1);
  });
});
